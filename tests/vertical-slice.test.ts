import assert from "node:assert/strict";
import { test } from "node:test";

import { buildApp } from "../apps/api/src/app.js";
import { MemorySliceStore } from "../apps/api/src/slice.js";

async function request(
  app: Awaited<ReturnType<typeof buildApp>>,
  options: {
    method: "GET" | "POST";
    url: string;
    payload?: string;
    headers?: Record<string, string>;
    cookies?: string;
  },
) {
  const { cookies, ...injection } = options;
  return app.inject({
    ...injection,
    headers: {
      ...(options.headers ?? {}),
      ...(cookies ? { cookie: cookies } : {}),
    },
  });
}

test("first-run setup, login, import, focus, and viewing actions form a protected vertical slice", async (t) => {
  const store = new MemorySliceStore({
    initialPassword: "correct-horse-battery-staple",
  });
  const app = await buildApp({
    readinessProbe: async () => ({ ready: true }),
    sliceStore: store,
  });
  t.after(() => app.close());

  const initial = await request(app, { method: "GET", url: "/api/bootstrap" });
  assert.equal(initial.statusCode, 200);
  assert.equal(initial.json().setupRequired, true);
  assert.match(initial.json().csrfToken, /^[a-f0-9]{64}$/);

  const setup = await request(app, {
    method: "POST",
    url: "/api/setup",
    headers: { "x-csrf-token": initial.json().csrfToken },
  });
  assert.equal(setup.statusCode, 204);

  const missingLoginCsrf = await request(app, {
    method: "POST",
    url: "/api/login",
    payload: JSON.stringify({ password: "correct-horse-battery-staple" }),
    headers: { "content-type": "application/json" },
  });
  assert.equal(missingLoginCsrf.statusCode, 403);
  assert.deepEqual(missingLoginCsrf.json().error, {
    code: "csrf.invalid",
    message: "A valid CSRF token is required",
  });

  const login = await request(app, {
    method: "POST",
    url: "/api/login",
    payload: JSON.stringify({ password: "correct-horse-battery-staple" }),
    headers: {
      "content-type": "application/json",
      "x-csrf-token": initial.json().csrfToken,
    },
  });
  assert.equal(login.statusCode, 204);
  const sessionCookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  assert.match(sessionCookie, /^watch_tracker_session=/);

  const authenticated = await request(app, {
    method: "GET",
    url: "/api/bootstrap",
    cookies: sessionCookie,
  });
  assert.equal(authenticated.statusCode, 200);
  assert.equal(authenticated.json().authenticated, true);

  const missingCsrf = await request(app, {
    method: "POST",
    url: "/api/import-lantern-vale",
    cookies: sessionCookie,
  });
  assert.equal(missingCsrf.statusCode, 403);

  const imported = await request(app, {
    method: "POST",
    url: "/api/import-lantern-vale",
    cookies: sessionCookie,
    headers: { "x-csrf-token": authenticated.json().csrfToken },
  });
  assert.equal(imported.statusCode, 201);
  assert.equal(imported.json().pack.version, "0.2.0");

  const catalog = await request(app, {
    method: "GET",
    url: "/api/catalog",
    cookies: sessionCookie,
  });
  assert.equal(catalog.statusCode, 200);
  assert.equal(catalog.json().items.length, 5);
  const first = catalog.json().items[0];
  const second = catalog.json().items[1];
  assert.equal(first.title, "Lantern Vale: First Light");
  assert.equal(second.state, "not-started");

  const focus = await request(app, {
    method: "POST",
    url: "/api/focus",
    payload: JSON.stringify({ targetSlug: first.slug }),
    cookies: sessionCookie,
    headers: {
      "content-type": "application/json",
      "x-csrf-token": authenticated.json().csrfToken,
    },
  });
  assert.equal(focus.statusCode, 200);
  assert.equal(focus.json().nextUp.slug, first.slug);

  const started = await request(app, {
    method: "POST",
    url: `/api/catalog/${first.slug}/start`,
    cookies: sessionCookie,
    headers: { "x-csrf-token": authenticated.json().csrfToken },
  });
  assert.equal(started.statusCode, 200);
  assert.equal(started.json().state, "in-progress");
  const afterStart = await request(app, {
    method: "GET",
    url: "/api/catalog",
    cookies: sessionCookie,
  });
  assert.equal(afterStart.json().items[0].state, "in-progress");
  assert.equal(afterStart.json().items[1].state, "not-started");

  const completed = await request(app, {
    method: "POST",
    url: `/api/catalog/${first.slug}/complete`,
    cookies: sessionCookie,
    headers: { "x-csrf-token": authenticated.json().csrfToken },
  });
  assert.equal(completed.statusCode, 200);
  assert.equal(completed.json().state, "watched");

  const repeat = await request(app, {
    method: "POST",
    url: `/api/catalog/${first.slug}/repeat`,
    cookies: sessionCookie,
    headers: { "x-csrf-token": authenticated.json().csrfToken },
  });
  assert.equal(repeat.statusCode, 200);
  assert.equal(repeat.json().state, "in-progress");

  const discarded = await request(app, {
    method: "POST",
    url: `/api/catalog/${first.slug}/discard`,
    cookies: sessionCookie,
    headers: { "x-csrf-token": authenticated.json().csrfToken },
  });
  assert.equal(discarded.statusCode, 200);
  assert.equal(discarded.json().state, "not-started");
});
