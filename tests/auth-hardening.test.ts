import assert from "node:assert/strict";
import { test } from "node:test";

import { buildApp } from "../apps/api/src/app.js";
import { MemorySliceStore } from "../apps/api/src/slice.js";

async function configuredApp(
  loginThrottle = { maxFailures: 5, windowMs: 60_000 },
) {
  const app = await buildApp({
    readinessProbe: async () => ({ ready: true }),
    sliceStore: new MemorySliceStore({ initialPassword: "correct-password" }),
    loginThrottle,
  });
  const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap" });
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

test("logout invalidates the server session and clears the browser cookie", async (t) => {
  const { app, csrf } = await configuredApp();
  t.after(() => app.close());
  const login = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { password: "correct-password" },
    headers: { "x-csrf-token": csrf },
  });
  const cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  const sessionCsrf = String(login.headers["x-csrf-token"]);
  const logout = await app.inject({
    method: "POST",
    url: "/api/logout",
    headers: { cookie, "x-csrf-token": sessionCsrf },
  });
  assert.equal(logout.statusCode, 204);
  assert.match(String(logout.headers["set-cookie"]), /Max-Age=0/);

  const workspace = await app.inject({
    method: "GET",
    url: "/api/workspace",
    headers: { cookie },
  });
  assert.equal(workspace.statusCode, 401);
});
