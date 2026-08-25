import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { promisify } from "node:util";

import { buildApp } from "../apps/api/src/app.js";
import { MemorySliceStore } from "../apps/api/src/slice.js";
import {
  passwordResetLink,
  resetLinkBase,
} from "../scripts/password-recovery.js";
import { passwordResetTokenFromFragment } from "../apps/web/src/passwordResetToken.js";

const OLD_PASSWORD = "correct-password";
const NEW_PASSWORD = "a-new-password-long-enough";
const execFileAsync = promisify(execFile);

async function configuredStore(now?: () => number) {
  const store = new MemorySliceStore({
    initialPassword: OLD_PASSWORD,
    ...(now ? { now } : {}),
  });
  assert.equal(await store.setup(), true);
  return store;
}

test("password reset tokens are high-entropy, expiring, one-use, and superseded", async () => {
  let now = Date.parse("2026-08-25T00:00:00Z");
  const store = await configuredStore(() => now);
  const first = await store.issuePasswordResetToken();
  const second = await store.issuePasswordResetToken();

  assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.token, second.token);
  assert.equal(Date.parse(second.expiresAt) - now, 15 * 60_000);
  assert.equal(
    await store.completePasswordReset(first.token, NEW_PASSWORD),
    false,
  );

  const sessions = await Promise.all([
    store.createSession(),
    store.createSession(),
    store.createSession(),
  ]);
  for (const session of sessions)
    assert.ok(await store.getSession(session.token));
  const concurrent = await Promise.all([
    store.completePasswordReset(second.token, NEW_PASSWORD),
    store.completePasswordReset(second.token, NEW_PASSWORD),
  ]);
  assert.deepEqual(concurrent.sort(), [false, true]);
  for (const session of sessions)
    assert.equal(await store.getSession(session.token), undefined);
  assert.equal(await store.authenticate(OLD_PASSWORD), false);
  assert.equal(await store.authenticate(NEW_PASSWORD), true);

  const expired = await store.issuePasswordResetToken();
  now += 15 * 60_000;
  assert.equal(
    await store.completePasswordReset(
      expired.token,
      "another-password-long-enough",
    ),
    false,
  );
});

test("password reset consumes a valid token after five policy failures", async () => {
  const store = await configuredStore();
  const reset = await store.issuePasswordResetToken();
  for (let attempt = 0; attempt < 4; attempt += 1)
    assert.equal(
      await store.completePasswordReset(reset.token, "too-short"),
      false,
    );
  assert.equal(
    await store.completePasswordReset(reset.token, NEW_PASSWORD),
    true,
  );

  const exhausted = await store.issuePasswordResetToken();
  assert.deepEqual(
    await Promise.all(
      Array.from({ length: 5 }, () =>
        store.completePasswordReset(exhausted.token, "too-short"),
      ),
    ),
    [false, false, false, false, false],
  );
  assert.equal(
    await store.completePasswordReset(exhausted.token, NEW_PASSWORD),
    false,
  );
});

test("password reset API is same-origin, generic, no-store, and revokes sessions", async (t) => {
  const store = await configuredStore();
  const app = await buildApp({
    readinessProbe: async () => ({ ready: true }),
    sliceStore: store,
  });
  t.after(() => app.close());
  const session = await store.createSession();
  const reset = await store.issuePasswordResetToken();

  const hostile = await app.inject({
    method: "POST",
    url: "/api/password-reset/complete",
    headers: { origin: "https://attacker.example" },
    payload: { token: reset.token, password: NEW_PASSWORD },
  });
  const originless = await app.inject({
    method: "POST",
    url: "/api/password-reset/complete",
    payload: { token: reset.token, password: NEW_PASSWORD },
  });
  const decoratedOrigin = await app.inject({
    method: "POST",
    url: "/api/password-reset/complete",
    headers: {
      host: "localhost",
      origin: "http://attacker.example@localhost/reset-password?token=ignored",
    },
    payload: { token: reset.token, password: NEW_PASSWORD },
  });
  const invalid = await app.inject({
    method: "POST",
    url: "/api/password-reset/complete",
    headers: { host: "localhost", origin: "http://localhost" },
    payload: { token: "not-a-token", password: NEW_PASSWORD },
  });
  assert.equal(hostile.statusCode, 400);
  assert.equal(originless.statusCode, 400);
  assert.equal(decoratedOrigin.statusCode, 400);
  assert.equal(invalid.statusCode, 400);
  assert.deepEqual(hostile.json().error, invalid.json().error);
  assert.deepEqual(originless.json().error, invalid.json().error);
  assert.deepEqual(decoratedOrigin.json().error, invalid.json().error);
  assert.equal(decoratedOrigin.headers["cache-control"], "no-store");
  assert.equal(decoratedOrigin.headers["referrer-policy"], "no-referrer");
  assert.equal(invalid.headers["cache-control"], "no-store");
  assert.equal(invalid.headers["referrer-policy"], "no-referrer");

  const malformed = await app.inject({
    method: "POST",
    url: "/api/password-reset/complete",
    headers: {
      host: "localhost",
      origin: "http://localhost",
      "content-type": "application/json",
    },
    payload: '{"token":',
  });
  assert.equal(malformed.statusCode, 400);
  assert.deepEqual(malformed.json().error, invalid.json().error);
  assert.equal(malformed.headers["cache-control"], "no-store");
  assert.equal(malformed.headers["referrer-policy"], "no-referrer");

  const constrainedApp = await buildApp({
    readinessProbe: async () => ({ ready: true }),
    sliceStore: store,
    bodyLimit: 64,
  });
  t.after(() => constrainedApp.close());
  const oversized = await constrainedApp.inject({
    method: "POST",
    url: "/api/password-reset/complete",
    headers: { host: "localhost", origin: "http://localhost" },
    payload: { token: "x".repeat(65), password: NEW_PASSWORD },
  });
  assert.equal(oversized.statusCode, 400);
  assert.deepEqual(oversized.json().error, invalid.json().error);
  assert.equal(oversized.headers["cache-control"], "no-store");
  assert.equal(oversized.headers["referrer-policy"], "no-referrer");

  const unexpectedField = await app.inject({
    method: "POST",
    url: "/api/password-reset/complete",
    headers: { host: "localhost", origin: "http://localhost" },
    payload: { token: reset.token, password: NEW_PASSWORD, ignored: true },
  });
  assert.equal(unexpectedField.statusCode, 400);
  assert.deepEqual(unexpectedField.json().error, invalid.json().error);

  const success = await app.inject({
    method: "POST",
    url: "/api/password-reset/complete",
    headers: { host: "localhost", origin: "http://localhost" },
    payload: { token: reset.token, password: NEW_PASSWORD },
  });
  assert.equal(success.statusCode, 204);
  assert.equal(success.headers["cache-control"], "no-store");
  assert.equal(success.headers["referrer-policy"], "no-referrer");
  assert.equal(
    success.headers["set-cookie"],
    "watch_tracker_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
  );
  assert.equal(await store.getSession(session.token), undefined);

  const reused = await app.inject({
    method: "POST",
    url: "/api/password-reset/complete",
    headers: { host: "localhost", origin: "http://localhost" },
    payload: { token: reset.token, password: NEW_PASSWORD },
  });
  assert.equal(reused.statusCode, 400);
  assert.deepEqual(reused.json().error, invalid.json().error);
});

test("expired and superseded reset API failures are indistinguishable from invalid tokens", async (t) => {
  let now = Date.parse("2026-08-25T00:00:00Z");
  const store = await configuredStore(() => now);
  const app = await buildApp({
    readinessProbe: async () => ({ ready: true }),
    sliceStore: store,
  });
  t.after(() => app.close());
  const expiredReset = await store.issuePasswordResetToken();
  now += 15 * 60_000;
  const supersededReset = await store.issuePasswordResetToken();
  await store.issuePasswordResetToken();
  const request = (token: string) =>
    app.inject({
      method: "POST",
      url: "/api/password-reset/complete",
      headers: { host: "localhost", origin: "http://localhost" },
      payload: { token, password: NEW_PASSWORD },
    });
  const [expired, superseded, invalid] = await Promise.all([
    request(expiredReset.token),
    request(supersededReset.token),
    request("A".repeat(43)),
  ]);
  for (const response of [expired, superseded]) {
    assert.equal(response.statusCode, invalid.statusCode);
    assert.deepEqual(response.json().error, invalid.json().error);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers["referrer-policy"], "no-referrer");
  }
});

test("host-admin CLI creates a fragment-only reset link and validates its base URL", () => {
  const token = "secret-token-value";
  const link = passwordResetLink("https://tracker.example/", token);
  const parsed = new URL(link);
  assert.equal(parsed.pathname, "/reset-password");
  assert.equal(parsed.search, "");
  assert.equal(parsed.hash, `#token=${token}`);
  assert.equal(
    resetLinkBase("http://localhost:3100").toString(),
    "http://localhost:3100/",
  );
  assert.equal(
    resetLinkBase("http://127.0.0.2:3100").toString(),
    "http://127.0.0.2:3100/",
  );
  assert.equal(
    resetLinkBase("http://[::1]:3100").toString(),
    "http://[::1]:3100/",
  );
  assert.throws(() => resetLinkBase("http://tracker.example"));
  assert.throws(() => resetLinkBase("http://127.999.999.999"));
  assert.throws(() => resetLinkBase("file:///tmp/watch-tracker"));
  assert.throws(() => resetLinkBase("https://user:pass@tracker.example"));
  assert.throws(() => resetLinkBase("https://tracker.example/?token=bad"));
  assert.throws(() => resetLinkBase("https://tracker.example/base/"));
});

test("host-admin CLI failure emits no token or detailed error", async () => {
  await assert.rejects(
    execFileAsync("npm", ["run", "--silent", "password-recovery"], {
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://unused.invalid/watch_tracker",
        WATCH_TRACKER_BASE_URL: "http://tracker.example/",
      },
    }),
    (error: unknown) => {
      const failure = error as { stdout?: string; stderr?: string };
      assert.equal(failure.stdout, "");
      assert.equal(failure.stderr, "password recovery failed\n");
      return true;
    },
  );
});

test("reset UI accepts only one well-formed fragment token", () => {
  const token = "A".repeat(43);
  assert.equal(passwordResetTokenFromFragment(`#token=${token}`), token);
  assert.equal(passwordResetTokenFromFragment(`token=${token}`), token);
  assert.equal(
    passwordResetTokenFromFragment(`#token=${token}&source=mail`),
    "",
  );
  assert.equal(
    passwordResetTokenFromFragment(`#token=${token}&token=${token}`),
    "",
  );
  assert.equal(passwordResetTokenFromFragment("#token=not-a-token"), "");
  assert.equal(passwordResetTokenFromFragment(`#other=${token}`), "");
});

test("recovery surfaces do not persist or log reset tokens", async () => {
  const [cli, app, resetUi, webApi, slice] = await Promise.all([
    readFile("scripts/password-recovery.ts", "utf8"),
    readFile("apps/web/src/App.tsx", "utf8"),
    readFile("apps/web/src/ResetPassword.tsx", "utf8"),
    readFile("apps/web/src/api.ts", "utf8"),
    readFile("apps/api/src/slice.ts", "utf8"),
  ]);
  assert.equal((cli.match(/process\.stdout\.write/g) ?? []).length, 1);
  assert.match(cli, /url\.hash = `token=/);
  assert.ok(
    cli.indexOf("const validatedBaseUrl = resetLinkBase(baseUrl).toString()") <
      cli.indexOf("const pool = new Pool"),
    "the delivery URL must be valid before token issuance can mutate state",
  );
  assert.doesNotMatch(
    `${app}\n${resetUi}`,
    /localStorage|sessionStorage|indexedDB|console\./,
  );
  assert.match(app, /history\.replaceState\(null, "", "\/reset-password"\)/);
  assert.match(app, /passwordResetTokenFromFragment\(location\.hash\)/);
  assert.match(resetUi, /autoComplete="new-password"/);
  assert.match(
    resetUi,
    /Password updated[\s\S]*all[\s\S]*existing sessions were signed out/,
  );
  assert.match(resetUi, /if \(!token\)[\s\S]*Password reset unavailable/);
  assert.match(
    resetUi,
    /Password reset unavailable[\s\S]*Request a new link from[\s\S]*host administrator/,
  );
  assert.ok(
    resetUi.indexOf("if (!token)") <
      resetUi.indexOf("await api.completePasswordReset(token, password)"),
    "an absent or malformed fragment must not render a submit path",
  );
  assert.match(
    resetUi,
    /password\.length < 15[\s\S]*password\.length > 1024[\s\S]*password\.includes\("\\0"\)/,
  );
  assert.match(
    resetUi,
    /const \[showPasswords, setShowPasswords\] = useState\(false\)[\s\S]*type=\{showPasswords \? "text" : "password"\}[\s\S]*aria-pressed=\{showPasswords\}[\s\S]*\{showPasswords \? "Hide passwords" : "Show passwords"\}/,
  );
  assert.match(
    resetUi,
    /event\.preventDefault\(\);[\s\S]*if \(busy \|\| complete\) return;[\s\S]*await api\.completePasswordReset/,
  );
  const resetRequest = resetUi.indexOf(
    "await api.completePasswordReset(token, password)",
  );
  const resetSuccess = resetUi.indexOf("onSucceeded()", resetRequest);
  const resetFailure = resetUi.indexOf("} catch {", resetRequest);
  assert.ok(resetRequest >= 0 && resetSuccess > resetRequest);
  assert.ok(
    resetSuccess < resetFailure,
    "the in-memory token must only be discarded after confirmed success",
  );
  assert.match(
    webApi,
    /call<void>\("\/api\/password-reset\/complete", "POST", undefined, \{/,
  );
  assert.doesNotMatch(webApi, /password-reset\/complete\?/);
  const sqlRecovery = slice.slice(slice.indexOf("export class SqlSliceStore"));
  const completion = sqlRecovery.slice(
    sqlRecovery.indexOf("async completePasswordReset"),
  );
  assert.ok(
    completion.indexOf("UPDATE password_reset_token") <
      completion.indexOf("credentialHash(password)"),
    "SQL must claim a valid token before performing Argon2id work",
  );
});

test("the reset document has a pre-bootstrap no-referrer defense", async () => {
  const document = await readFile("apps/web/index.html", "utf8");
  assert.match(
    document,
    /<meta\s+name="referrer"\s+content="no-referrer"\s*\/>/,
  );
});
