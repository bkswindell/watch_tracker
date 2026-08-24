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
  assert.equal(imported.json().pack.version, "0.2.3");

  const unauthenticatedWorkspace = await request(app, {
    method: "GET",
    url: "/api/workspace",
  });
  assert.equal(unauthenticatedWorkspace.statusCode, 401);

  const workspace = await request(app, {
    method: "GET",
    url: "/api/workspace",
    cookies: sessionCookie,
  });
  assert.equal(workspace.statusCode, 200);
  assert.equal(workspace.json().pack.version, "0.2.3");
  assert.equal(workspace.json().items.length, 31);
  assert.equal(workspace.json().relationships.length, 32);
  assert.equal(workspace.json().items[0].series, "Lantern Vale");
  assert.equal(workspace.json().items[0].runtime, 48);
  assert.equal(workspace.json().items[0].media, null);
  const relationshipKey = (relationship: {
    fromSlug: string;
    toSlug: string;
    type: string;
  }) => `${relationship.fromSlug}:${relationship.toSlug}:${relationship.type}`;
  const relationshipKeys = new Set(
    workspace.json().relationships.map(relationshipKey),
  );
  assert.equal(relationshipKeys.size, 32);
  assert.deepEqual(
    [
      "lamp:rain:required",
      "rain:orchard:sequence",
      "orchard:lowwater-film:required",
      "lowwater-film:green-lantern-2011:required",
      "green-lantern-2011:bell:required",
      "bell:ember:required",
    ].filter((key) => relationshipKeys.has(key)),
    [
      "lamp:rain:required",
      "rain:orchard:sequence",
      "orchard:lowwater-film:required",
      "lowwater-film:green-lantern-2011:required",
      "green-lantern-2011:bell:required",
      "bell:ember:required",
    ],
  );
  const itemSlugs = new Set(
    workspace.json().items.map((item: { slug: string }) => item.slug),
  );
  assert.ok(
    workspace
      .json()
      .relationships.every(
        (relationship: { fromSlug: string; toSlug: string }) =>
          itemSlugs.has(relationship.fromSlug) &&
          itemSlugs.has(relationship.toSlug),
      ),
  );

  const detail = await request(app, {
    method: "GET",
    url: "/api/catalog/ember",
    cookies: sessionCookie,
  });
  assert.equal(detail.statusCode, 200);
  assert.ok(
    detail
      .json()
      .relationships.some(
        (relationship: {
          direction: string;
          referencedWatchable: { slug: string };
        }) =>
          relationship.direction === "requires" &&
          relationship.referencedWatchable.slug === "bell",
      ),
  );

  const catalog = await request(app, {
    method: "GET",
    url: "/api/catalog",
    cookies: sessionCookie,
  });
  assert.equal(catalog.statusCode, 200);
  assert.equal(catalog.json().items.length, 31);
  const first = catalog.json().items[0];
  const second = catalog.json().items[1];
  assert.equal(first.title, "The Cartographer’s Lamp");
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

  const workspaceAfterLifecycle = await request(app, {
    method: "GET",
    url: "/api/workspace",
    cookies: sessionCookie,
  });
  assert.equal(workspaceAfterLifecycle.statusCode, 200);
  assert.deepEqual(
    workspaceAfterLifecycle
      .json()
      .history.map((entry: { action: string }) => entry.action),
    ["discarded", "completed"],
  );
});

test("catalog search and type filters compose and reject unknown types", async (t) => {
  const store = new MemorySliceStore({ initialPassword: "password" });
  const app = await buildApp({
    readinessProbe: async () => ({ ready: true }),
    sliceStore: store,
  });
  t.after(() => app.close());
  const bootstrap = await request(app, {
    method: "GET",
    url: "/api/bootstrap",
  });
  const csrf = bootstrap.json().csrfToken;
  await request(app, {
    method: "POST",
    url: "/api/setup",
    headers: { "x-csrf-token": csrf },
  });
  const login = await request(app, {
    method: "POST",
    url: "/api/login",
    payload: JSON.stringify({ password: "password" }),
    headers: { "content-type": "application/json", "x-csrf-token": csrf },
  });
  assert.equal(login.statusCode, 204);
  const cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  const authenticated = await request(app, {
    method: "GET",
    url: "/api/bootstrap",
    cookies: cookie,
  });
  const imported = await request(app, {
    method: "POST",
    url: "/api/import-lantern-vale",
    cookies: cookie,
    headers: { "x-csrf-token": authenticated.json().csrfToken },
  });
  assert.equal(imported.statusCode, 201);
  const catalog = (url: string) =>
    request(app, { method: "GET", url, cookies: cookie });
  const all = await catalog("/api/catalog");
  assert.equal(all.json().items.length, 31);
  assert.deepEqual(Object.keys(all.json().items[0]).sort(), [
    "aliases",
    "episodeNumber",
    "poster",
    "relationships",
    "releaseDate",
    "releaseOrder",
    "runtime",
    "seasonNumber",
    "series",
    "slug",
    "state",
    "summary",
    "title",
    "type",
    "why",
  ]);
  assert.equal(
    (await catalog("/api/catalog?search=%20%20&type=%20%20")).json().items
      .length,
    31,
  );
  assert.deepEqual(
    (await catalog("/api/catalog?search=  ORCHARD DOOR  "))
      .json()
      .items.map((item: { slug: string }) => item.slug),
    ["orchard"],
  );
  assert.deepEqual(
    (await catalog("/api/catalog?search=CARTOGRAPHER"))
      .json()
      .items.map((item: { slug: string }) => item.slug),
    ["lamp", "final-film"],
  );
  assert.equal(
    (await catalog("/api/catalog?search=does-not-exist")).json().items.length,
    0,
  );
  assert.deepEqual(
    (await catalog("/api/catalog?type=%20movie%20"))
      .json()
      .items.map((item: { slug: string; type: string }) => {
        assert.equal(item.type, "movie");
        return item.slug;
      }),
    [
      "lowwater-film",
      "green-lantern-2011",
      "winter-film",
      "roads",
      "convergence-film",
      "glass-film",
      "final-film",
    ],
  );
  assert.deepEqual(
    (await catalog("/api/catalog?search=glass&type=movie"))
      .json()
      .items.map((item: { slug: string; type: string; title: string }) => {
        assert.equal(item.type, "movie");
        assert.match(item.title, /glass/i);
        return item.slug;
      }),
    ["glass-film"],
  );
  const invalid = await catalog("/api/catalog?type=not-a-pack-type");
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().error.code, "request.invalid");
  const wrongCase = await catalog("/api/catalog?type=Movie");
  assert.equal(wrongCase.statusCode, 400);
  assert.equal(wrongCase.json().error.code, "request.invalid");
  const malformed = await catalog("/api/catalog?type=movie&type=episode");
  assert.equal(malformed.statusCode, 400);
  assert.equal(malformed.json().error.code, "request.invalid");
});
