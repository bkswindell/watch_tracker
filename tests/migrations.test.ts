import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import type { Pool } from "pg";

import {
  EXPECTED_SCHEMA_VERSION,
  loadMigrations,
  type Migration,
  type Queryable,
  runMigrations,
  verifySchema,
} from "../apps/api/src/migrations.js";

async function migrationDirectory(
  t: { after: (cleanup: () => Promise<void>) => void },
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const directory = await mkdtemp(
    path.join(tmpdir(), "watch-tracker-migrations-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  await Promise.all(
    Object.entries(files).map(([name, sql]) =>
      writeFile(path.join(directory, name), sql),
    ),
  );
  return directory;
}

function migration(version = "0.01", sha256 = "a".repeat(64)): Migration {
  return { version, name: "foundation", sha256, sql: "SELECT 1" };
}

test("loads the ordered foundation migration with a deterministic SHA-256 identity", async () => {
  const migrations = await loadMigrations("db/migrations");
  assert.equal(migrations.length, 1);
  assert.equal(migrations[0]?.version, "0.01");
  assert.equal(migrations[0]?.name, "foundation");
  assert.match(migrations[0]?.sha256 ?? "", /^[0-9a-f]{64}$/);
  assert.equal(EXPECTED_SCHEMA_VERSION, "0.01");
});

test("migration discovery rejects an empty inventory", async (t) => {
  const directory = await migrationDirectory(t, {
    "README.txt": "not a migration",
  });
  await assert.rejects(
    loadMigrations(directory),
    /Migration inventory is empty/,
  );
});

test("migration discovery inspects and rejects every incorrectly named SQL file", async (t) => {
  for (const invalidName of [
    "0.1_short-version.sql",
    "0.001_long-version.sql",
    "1.01_wrong-major.sql",
    "0.01_UPPERCASE.sql",
    "0.01_bad_name.sql",
    "notes.sql",
    "0.02_next.SQL",
  ]) {
    const directory = await migrationDirectory(t, {
      "0.01_foundation.sql": "SELECT 1;",
      [invalidName]: "SELECT 2;",
    });
    await assert.rejects(loadMigrations(directory), /Invalid migration name/);
  }
});

test("migration discovery rejects duplicate versions", async (t) => {
  const directory = await migrationDirectory(t, {
    "0.01_foundation.sql": "SELECT 1;",
    "0.01_duplicate.sql": "SELECT 2;",
  });
  await assert.rejects(
    loadMigrations(directory),
    /Duplicate migration version: 0\.01/,
  );
});

test("migration discovery rejects a terminal version that differs from the application contract", async (t) => {
  const directory = await migrationDirectory(t, {
    "0.01_foundation.sql": "SELECT 1;",
    "0.02_next.sql": "SELECT 2;",
  });
  await assert.rejects(
    loadMigrations(directory),
    /Migration terminal version 0\.02 does not match expected schema version 0\.01/,
  );
});

test("migration runner rejects nonmonotonic caller-provided versions before connecting", async () => {
  const pool = {
    connect: async () => {
      throw new Error("runner should validate before connecting");
    },
  } as unknown as Pool;

  await assert.rejects(
    runMigrations(pool, [migration("0.02"), migration("0.01")]),
    /Migration versions must be strictly increasing/,
  );
});

test("schema verification fails closed when the migration record is absent", async () => {
  const database: Queryable = {
    query: async () => ({ rows: [] }),
  };
  const result = await verifySchema(database, [migration()]);
  assert.deepEqual(result, {
    ready: false,
    reason: "database schema is not current",
  });
});

test("schema verification treats only PostgreSQL undefined-table as an absent inventory", async () => {
  const undefinedTable: Queryable = {
    query: async () => {
      throw Object.assign(new Error("missing relation"), { code: "42P01" });
    },
  };
  assert.deepEqual(await verifySchema(undefinedTable, [migration()]), {
    ready: false,
    reason: "database schema is not current",
  });

  const connectionFailure = Object.assign(new Error("connection lost"), {
    code: "08006",
  });
  const unavailable: Queryable = {
    query: async () => {
      throw connectionFailure;
    },
  };
  await assert.rejects(
    verifySchema(unavailable, [migration()]),
    connectionFailure,
  );
});

test("schema verification fails closed when a recorded checksum differs", async () => {
  const database: Queryable = {
    query: async () => ({
      rows: [
        {
          migration_version: "0.01",
          migration_name: "foundation",
          migration_sha256: "b".repeat(64),
        },
      ],
    }),
  };
  const result = await verifySchema(database, [migration()]);
  assert.deepEqual(result, {
    ready: false,
    reason: "database migration checksum mismatch",
  });
});

test("schema verification fails closed when a recorded migration name differs", async () => {
  const database: Queryable = {
    query: async () => ({
      rows: [
        {
          migration_version: "0.01",
          migration_name: "renamed-foundation",
          migration_sha256: "a".repeat(64),
        },
      ],
    }),
  };

  assert.deepEqual(await verifySchema(database, [migration()]), {
    ready: false,
    reason: "database migration identity mismatch",
  });
});

test("schema verification fails closed when the migration ledger is current but a required table is missing", async () => {
  const database: Queryable = {
    query: async (text) => {
      if (text.includes("ORDER BY migration_version")) {
        return {
          rows: [
            {
              migration_version: "0.01",
              migration_name: "foundation",
              migration_sha256: "a".repeat(64),
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  assert.deepEqual(await verifySchema(database, [migration()]), {
    ready: false,
    reason: "database schema integrity mismatch",
  });
});

test("migration runner rejects a newer ledger before applying pending SQL", async () => {
  const mutatingStatements: string[] = [];
  const client = {
    query: async (text: string) => {
      if (
        text.includes("pg_advisory_lock") ||
        text.includes("pg_advisory_unlock")
      ) {
        return { rows: [] };
      }
      if (text.includes("ORDER BY migration_version")) {
        return {
          rows: [
            {
              migration_version: "0.02",
              migration_name: "future",
              migration_sha256: "b".repeat(64),
            },
          ],
        };
      }
      if (text === "BEGIN" || text.includes("INSERT INTO schema_migration")) {
        mutatingStatements.push(text);
      }
      return { rows: [] };
    },
    release: () => undefined,
  };
  const pool = { connect: async () => client } as unknown as Pool;

  await assert.rejects(
    runMigrations(pool, [migration()]),
    /newer than this application/,
  );
  assert.deepEqual(mutatingStatements, []);
});

test("migration runner verifies the exact schema after applying migrations", async () => {
  const client = {
    query: async (text: string) => {
      if (
        text.includes("pg_advisory_lock") ||
        text.includes("pg_advisory_unlock")
      ) {
        return { rows: [] };
      }
      if (text.includes("ORDER BY migration_version")) return { rows: [] };
      if (
        text === "BEGIN" ||
        text === "COMMIT" ||
        text === "ROLLBACK" ||
        text === "SELECT 1" ||
        text.includes("INSERT INTO schema_migration")
      ) {
        return { rows: [] };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
    release: () => undefined,
  };
  const pool = { connect: async () => client } as unknown as Pool;

  await assert.rejects(
    runMigrations(pool, [migration()]),
    /Post-migration schema verification failed: database schema is not current/,
  );
});
