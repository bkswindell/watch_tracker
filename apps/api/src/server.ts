import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Pool } from "pg";

import { buildApp, type ReadinessProbe } from "./app.js";
import { loadMigrations, verifySchema } from "./migrations.js";
import { SqlSliceStore } from "./slice.js";

export const SHUTDOWN_DEADLINE_MS = 10_000;

export interface ServerEnvironment {
  databaseUrl: string;
  host: string;
  port: number;
  migrationsDirectory: string;
  initialAdminPasswordFile?: string;
}

const HOSTNAME =
  /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

export function parseServerEnvironment(
  environment: NodeJS.ProcessEnv,
): ServerEnvironment {
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  let parsedDatabaseUrl: URL;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)) {
    throw new Error("DATABASE_URL must use PostgreSQL");
  }
  if (!parsedDatabaseUrl.hostname || parsedDatabaseUrl.pathname.length <= 1) {
    throw new Error("DATABASE_URL must include a host and database name");
  }

  const host =
    environment.HOST === undefined ? "127.0.0.1" : environment.HOST.trim();
  if (
    !host ||
    (isIP(host) === 0 && host !== "localhost" && !HOSTNAME.test(host))
  ) {
    throw new Error("HOST is invalid");
  }

  const portText =
    environment.PORT === undefined ? "3000" : environment.PORT.trim();
  if (!/^\d+$/.test(portText)) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const migrationsDirectory =
    environment.MIGRATIONS_DIR === undefined
      ? "db/migrations"
      : environment.MIGRATIONS_DIR.trim();
  if (!migrationsDirectory) throw new Error("MIGRATIONS_DIR is invalid");
  const initialAdminPasswordFile =
    environment.INITIAL_ADMIN_PASSWORD_FILE?.trim();
  if (
    environment.INITIAL_ADMIN_PASSWORD_FILE !== undefined &&
    !initialAdminPasswordFile
  ) {
    throw new Error("INITIAL_ADMIN_PASSWORD_FILE is invalid");
  }
  return {
    databaseUrl,
    host,
    port,
    migrationsDirectory,
    ...(initialAdminPasswordFile ? { initialAdminPasswordFile } : {}),
  };
}

export interface ShutdownApp {
  close(): Promise<void>;
  server: {
    closeAllConnections(): void;
  };
}

export interface ShutdownPool {
  end(): Promise<void>;
}

export async function closeApiResources(
  app: ShutdownApp,
  pool: ShutdownPool,
  deadlineMs = SHUTDOWN_DEADLINE_MS,
): Promise<void> {
  let deadlineTimer: NodeJS.Timeout | undefined;
  let appCloseFailed = false;
  let appCloseError: unknown;

  try {
    await new Promise<void>((resolveClose, rejectClose) => {
      deadlineTimer = setTimeout(() => {
        const deadlineError = new Error(
          `API shutdown deadline exceeded after ${deadlineMs}ms`,
        );

        try {
          app.server.closeAllConnections();
          rejectClose(deadlineError);
        } catch (forceCloseError) {
          rejectClose(
            new AggregateError(
              [deadlineError, forceCloseError],
              "API shutdown deadline exceeded and force-close failed",
            ),
          );
        }
      }, deadlineMs);

      void app.close().then(resolveClose, rejectClose);
    });
  } catch (error) {
    appCloseFailed = true;
    appCloseError = error;
  } finally {
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
  }

  let poolEndFailed = false;
  let poolEndError: unknown;
  try {
    await pool.end();
  } catch (error) {
    poolEndFailed = true;
    poolEndError = error;
  }

  if (appCloseFailed && poolEndFailed) {
    throw new AggregateError(
      [appCloseError, poolEndError],
      "API and database cleanup both failed",
    );
  }
  if (appCloseFailed) throw appCloseError;
  if (poolEndFailed) throw poolEndError;
}

export async function startServer(): Promise<void> {
  const environment = parseServerEnvironment(process.env);
  const pool = new Pool({
    connectionString: environment.databaseUrl,
    connectionTimeoutMillis: 5_000,
    query_timeout: 5_000,
    statement_timeout: 5_000,
  });
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  try {
    const migrations = await loadMigrations(environment.migrationsDirectory);
    const initialAdminPassword = environment.initialAdminPasswordFile
      ? (await readFile(environment.initialAdminPasswordFile, "utf8")).trim()
      : undefined;
    if (environment.initialAdminPasswordFile && !initialAdminPassword) {
      throw new Error("INITIAL_ADMIN_PASSWORD_FILE is empty");
    }
    const databaseReadinessProbe: ReadinessProbe = async () => {
      try {
        await pool.query("SELECT 1");
        return verifySchema(pool, migrations);
      } catch {
        return { ready: false, reason: "database unavailable" };
      }
    };

    const builtWebRoot = fileURLToPath(
      new URL("../../../web/", import.meta.url),
    );
    app = await buildApp({
      readinessProbe: databaseReadinessProbe,
      sliceStore: new SqlSliceStore(pool, initialAdminPassword),
      ...(existsSync(builtWebRoot) ? { webRoot: builtWebRoot } : {}),
    });
    await app.listen({ host: environment.host, port: environment.port });

    let shuttingDown = false;
    async function shutdown(signal: NodeJS.Signals): Promise<void> {
      if (shuttingDown || app === undefined) return;
      shuttingDown = true;

      app.log.info({ signal }, "shutting down");
      try {
        await closeApiResources(app, pool);
        process.exitCode = 0;
      } catch (error) {
        app.log.error(error, "graceful shutdown failed");
        process.exitCode = 1;
      }
    }

    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
  } catch (error) {
    if (app === undefined) {
      console.error("failed to start API", error);
      try {
        await pool.end();
      } catch (cleanupError) {
        console.error("failed to clean up database pool", cleanupError);
      }
    } else {
      app.log.error(error, "failed to start API");
      try {
        await closeApiResources(app, pool);
      } catch (cleanupError) {
        app.log.error(
          cleanupError,
          "failed to clean up after API start failure",
        );
      }
    }
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  import.meta.url === pathToFileURL(resolve(entrypoint)).href
) {
  await startServer();
}
