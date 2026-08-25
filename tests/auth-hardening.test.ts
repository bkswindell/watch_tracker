import assert from "node:assert/strict";
import { test } from "node:test";

import { buildApp } from "../apps/api/src/app.js";
import {
  ARGON2ID_OPTIONS,
  MemorySliceStore,
  PASSWORD_POLICY,
  SESSION_ABSOLUTE_LIFETIME_MS,
  SESSION_IDLE_LIFETIME_MS,
  passwordPolicyError,
} from "../apps/api/src/slice.js";

async function configuredApp(loginThrottle?: {
  maxFailures: number;
  windowMs: number;
  maxEntries?: number;
}) {
  const app = await buildApp({
    readinessProbe: async () => ({ ready: true }),
    sliceStore: new MemorySliceStore({ initialPassword: "correct-password" }),
    ...(loginThrottle ? { loginThrottle } : {}),
  });
  const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap" });
  assert.equal(bootstrap.headers["cache-control"], "no-store");
  const csrf = bootstrap.json().csrfToken as string;
  const setup = await app.inject({
    method: "POST",
    url: "/api/setup",
    headers: { "x-csrf-token": csrf },
  });
  assert.equal(setup.statusCode, 204);
  return { app, csrf };
}

test("unsafe requests reject a mismatched Origin even with a valid CSRF token", async (t) => {
  const { app, csrf } = await configuredApp();
  t.after(() => app.close());

  const rejectedLogin = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { password: "correct-password" },
    headers: {
      origin: "https://attacker.example",
      "x-csrf-token": csrf,
    },
  });
  assert.equal(rejectedLogin.statusCode, 403);
  assert.equal(rejectedLogin.json().error.code, "csrf.invalid");
});

test("unsafe requests require the Origin scheme as well as the host to match", async (t) => {
  const { app, csrf } = await configuredApp();
  t.after(() => app.close());

  const rejectedLogin = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { password: "correct-password" },
    headers: {
      host: "localhost",
      origin: "https://localhost",
      "x-csrf-token": csrf,
    },
  });
  assert.equal(rejectedLogin.statusCode, 403);
  assert.equal(rejectedLogin.json().error.code, "csrf.invalid");

  const acceptedLogin = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { password: "correct-password" },
    headers: {
      host: "localhost",
      origin: "http://localhost",
      "x-csrf-token": csrf,
    },
  });
  assert.equal(acceptedLogin.statusCode, 204);
});

test("login failures are rate limited and a successful login resets the limit", async (t) => {
  const { app, csrf } = await configuredApp({
    maxFailures: 2,
    windowMs: 60_000,
  });
  t.after(() => app.close());
  const login = (password: string) =>
    app.inject({
      method: "POST",
      url: "/api/login",
      payload: { password },
      headers: { "x-csrf-token": csrf },
    });

  assert.equal((await login("wrong")).statusCode, 401);
  assert.equal((await login("correct-password")).statusCode, 204);
  assert.equal((await login("wrong")).statusCode, 401);
  assert.equal((await login("wrong")).statusCode, 401);
  const throttled = await login("correct-password");
  assert.equal(throttled.statusCode, 429);
  assert.equal(throttled.json().error.code, "auth.throttled");
  assert.match(String(throttled.headers["retry-after"]), /^\d+$/);
});

test("the default login throttle is ten failures per 15-minute window", async (t) => {
  const { app, csrf } = await configuredApp();
  t.after(() => app.close());
  const login = () =>
    app.inject({
      method: "POST",
      url: "/api/login",
      payload: { password: "wrong" },
      headers: { "x-csrf-token": csrf },
    });

  for (let attempt = 0; attempt < 10; attempt += 1)
    assert.equal((await login()).statusCode, 401);
  const throttled = await login();
  assert.equal(throttled.statusCode, 429);
  assert.equal(throttled.json().error.code, "auth.throttled");
});

test("login throttle retains a bounded number of client entries", async (t) => {
  const { app, csrf } = await configuredApp({
    maxFailures: 1,
    windowMs: 60_000,
    maxEntries: 2,
  });
  t.after(() => app.close());
  const failedLogin = (remoteAddress: string) =>
    app.inject({
      method: "POST",
      url: "/api/login",
      remoteAddress,
      payload: { password: "wrong" },
      headers: { "x-csrf-token": csrf },
    });

  assert.equal((await failedLogin("192.0.2.1")).statusCode, 401);
  assert.equal((await failedLogin("192.0.2.2")).statusCode, 401);
  assert.equal((await failedLogin("192.0.2.3")).statusCode, 401);
  assert.equal((await failedLogin("192.0.2.1")).statusCode, 401);
});

test("logout invalidates the server session and clears the browser cookie", async (t) => {
  const { app, csrf } = await configuredApp();
  t.after(() => app.close());
  const login = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { password: "correct-password" },
    headers: { "x-csrf-token": csrf },
  });
  assert.equal(login.headers["cache-control"], "no-store");
  const cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  const sessionCsrf = String(login.headers["x-csrf-token"]);
  assert.match(
    String(login.headers["set-cookie"]),
    new RegExp(`Max-Age=${SESSION_IDLE_LIFETIME_MS / 1_000}`),
  );
  const logout = await app.inject({
    method: "POST",
    url: "/api/logout",
    headers: { cookie, "x-csrf-token": sessionCsrf },
  });
  assert.equal(logout.statusCode, 204);
  assert.equal(logout.headers["cache-control"], "no-store");
  assert.match(String(logout.headers["set-cookie"]), /Max-Age=0/);

  const workspace = await app.inject({
    method: "GET",
    url: "/api/workspace",
    headers: { cookie },
  });
  assert.equal(workspace.statusCode, 401);
  assert.equal(workspace.headers["cache-control"], "no-store");
});

test("authenticated owner-scoped API responses are never cached", async (t) => {
  const { app, csrf } = await configuredApp();
  t.after(() => app.close());
  const login = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { password: "correct-password" },
    headers: { "x-csrf-token": csrf },
  });
  const cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";

  const workspace = await app.inject({
    method: "GET",
    url: "/api/workspace",
    headers: { cookie },
  });
  assert.equal(workspace.statusCode, 200);
  assert.equal(workspace.headers["cache-control"], "no-store");
});

test("sessions expire after 30 days without activity", async () => {
  let now = 0;
  const store = new MemorySliceStore({
    initialPassword: "correct-password",
    now: () => now,
  });
  assert.equal(await store.setup(), true);
  const session = await store.createSession();

  now = SESSION_IDLE_LIFETIME_MS;
  assert.equal(await store.getSession(session.token), undefined);
});

test("session activity slides idle expiry but never beyond 90 days", async () => {
  let now = 0;
  const store = new MemorySliceStore({
    initialPassword: "correct-password",
    now: () => now,
  });
  assert.equal(await store.setup(), true);
  const session = await store.createSession();

  for (const elapsed of [29, 58, 87]) {
    now = elapsed * 24 * 60 * 60_000;
    assert.ok(await store.getSession(session.token));
  }
  now = SESSION_ABSOLUTE_LIFETIME_MS;
  assert.equal(await store.getSession(session.token), undefined);
});

test("password policy rejects undersized, oversized, and NUL-containing values", () => {
  assert.match(
    passwordPolicyError("x".repeat(PASSWORD_POLICY.minLength - 1)) ?? "",
    /at least/,
  );
  assert.match(
    passwordPolicyError("x".repeat(PASSWORD_POLICY.maxLength + 1)) ?? "",
    /at most/,
  );
  assert.match(passwordPolicyError("x".repeat(14) + "\0") ?? "", /NUL/);
  assert.equal(
    passwordPolicyError("x".repeat(PASSWORD_POLICY.minLength)),
    undefined,
  );
  assert.deepEqual(ARGON2ID_OPTIONS, {
    type: 2,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });
});
