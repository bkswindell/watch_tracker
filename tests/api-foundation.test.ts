import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  API_SERVER_LIMITS,
  buildApp,
  type ReadinessProbe,
} from "../apps/api/src/app.js";
import {
  closeApiResources,
  parseServerEnvironment,
  SHUTDOWN_DEADLINE_MS,
} from "../apps/api/src/server.js";

const unavailable: ReadinessProbe = async () => ({
  ready: false,
  reason: "database unavailable",
});

test("health is live while readiness reports an unavailable database", async (t) => {
  const app = await buildApp({ readinessProbe: unavailable });
  t.after(() => app.close());

  const health = await app.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), {
    status: "ok",
    service: "watch-tracker-api",
    requestId: health.headers["x-request-id"],
  });
  assert.equal(health.headers["x-content-type-options"], "nosniff");
  assert.equal(health.headers["x-frame-options"], "SAMEORIGIN");
  const contentSecurityPolicy = health.headers["content-security-policy"] ?? "";
  assert.match(contentSecurityPolicy, /default-src 'self'/);
  assert.doesNotMatch(contentSecurityPolicy, /upgrade-insecure-requests/);

  const ready = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(ready.statusCode, 503);
  assert.deepEqual(ready.json(), {
    status: "not-ready",
    reason: "database unavailable",
    requestId: ready.headers["x-request-id"],
  });
});

test("API server limits are finite and applied to Fastify", async (t) => {
  for (const [name, value] of Object.entries(API_SERVER_LIMITS)) {
    assert.ok(Number.isFinite(value), `${name} must be finite`);
    assert.ok(value > 0, `${name} must be positive`);
  }
  assert.ok(Number.isFinite(SHUTDOWN_DEADLINE_MS));
  assert.ok(SHUTDOWN_DEADLINE_MS > 0);

  const app = await buildApp({ readinessProbe: unavailable });
  t.after(() => app.close());

  assert.equal(app.server.timeout, API_SERVER_LIMITS.connectionTimeout);
  assert.equal(app.server.requestTimeout, API_SERVER_LIMITS.requestTimeout);
  assert.equal(app.server.keepAliveTimeout, API_SERVER_LIMITS.keepAliveTimeout);
  assert.equal(app.initialConfig.bodyLimit, API_SERVER_LIMITS.bodyLimit);
});

test("server environment validation fails closed for missing or malformed values", () => {
  assert.throws(() => parseServerEnvironment({}), /DATABASE_URL is required/);
  assert.throws(
    () =>
      parseServerEnvironment({
        DATABASE_URL: "https://database.example/watch_tracker",
      }),
    /DATABASE_URL must use PostgreSQL/,
  );
  assert.throws(
    () =>
      parseServerEnvironment({
        DATABASE_URL: "postgresql://user:password@database:5432/watch_tracker",
        HOST: "/tmp/api.sock",
      }),
    /HOST is invalid/,
  );
  assert.throws(
    () =>
      parseServerEnvironment({
        DATABASE_URL: "postgresql://user:password@database:5432/watch_tracker",
        PORT: "70000",
      }),
    /PORT must be an integer between 1 and 65535/,
  );
  assert.throws(
    () =>
      parseServerEnvironment({
        DATABASE_URL: "postgresql://user:password@database:5432/watch_tracker",
        HOST: " ",
      }),
    /HOST is invalid/,
  );
  assert.throws(
    () =>
      parseServerEnvironment({
        DATABASE_URL: "postgresql://user:password@database:5432/watch_tracker",
        MIGRATIONS_DIR: " ",
      }),
    /MIGRATIONS_DIR is invalid/,
  );
  assert.deepEqual(
    parseServerEnvironment({
      DATABASE_URL: "postgresql://user:password@database:5432/watch_tracker",
      HOST: "0.0.0.0",
      PORT: "3100",
      MIGRATIONS_DIR: "db/migrations",
    }),
    {
      databaseUrl: "postgresql://user:password@database:5432/watch_tracker",
      host: "0.0.0.0",
      port: 3100,
      migrationsDirectory: "db/migrations",
    },
  );
});

test("shutdown always ends the database pool when app close fails", async () => {
  let poolEnded = false;
  const closeError = new Error("app close failed");

  await assert.rejects(
    closeApiResources(
      {
        close: async () => Promise.reject(closeError),
        server: { closeAllConnections() {} },
      },
      {
        end: async () => {
          poolEnded = true;
        },
      },
      50,
    ),
    closeError,
  );
  assert.equal(poolEnded, true);
});

test("shutdown force-closes HTTP connections at its deadline", async () => {
  let forcedClosed = false;
  let poolEnded = false;

  await assert.rejects(
    closeApiResources(
      {
        close: async () => new Promise<void>(() => {}),
        server: {
          closeAllConnections() {
            forcedClosed = true;
          },
        },
      },
      {
        end: async () => {
          poolEnded = true;
        },
      },
      5,
    ),
    /shutdown deadline exceeded/,
  );
  assert.equal(forcedClosed, true);
  assert.equal(poolEnded, true);
});

test("unknown routes use the structured error contract", async (t) => {
  const app = await buildApp({ readinessProbe: unavailable });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/missing" });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: { code: "request.not-found", message: "Route not found" },
    requestId: response.headers["x-request-id"],
  });
});

test("readiness succeeds only when the database probe succeeds", async (t) => {
  const app = await buildApp({ readinessProbe: async () => ({ ready: true }) });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "ready");
  assert.equal(response.json().requestId, response.headers["x-request-id"]);
});

test("API rejects request bodies above the configured bound", async (t) => {
  const app = await buildApp({ readinessProbe: unavailable, bodyLimit: 64 });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/not-a-route",
    headers: { "content-type": "application/json" },
    payload: { value: "x".repeat(128) },
  });
  assert.equal(response.statusCode, 413);
  assert.equal(response.json().error.code, "request.body-too-large");
  assert.equal(response.json().requestId, response.headers["x-request-id"]);
});

test("serves the built Watch Tracker shell when a web root is configured", async (t) => {
  const webRoot = await mkdtemp(path.join(tmpdir(), "watch-tracker-web-"));
  await writeFile(
    path.join(webRoot, "index.html"),
    "<!doctype html><title>Watch Tracker</title>",
  );

  const app = await buildApp({ readinessProbe: unavailable, webRoot });
  t.after(async () => {
    await app.close();
    await rm(webRoot, { recursive: true, force: true });
  });

  const response = await app.inject({ method: "GET", url: "/" });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /^text\/html/);
  assert.match(response.body, /<title>Watch Tracker<\/title>/);
});
