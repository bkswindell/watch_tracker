import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

function migration(
  version = EXPECTED_SCHEMA_VERSION,
  sha256 = "a".repeat(64),
): Migration {
  return {
    version,
    name:
      version === "0.01"
        ? "foundation"
        : version === "0.02"
          ? "core-slice"
          : version === "0.03"
            ? "canon-pack-registry"
            : version === "0.04"
              ? "workspace-metadata"
              : "truthful-canon-metadata",
    sha256,
    sql: "SELECT 1",
  };
}

test("loads the ordered foundation and Core slice migrations with deterministic SHA-256 identities", async () => {
  const migrations = await loadMigrations("db/migrations");
  assert.equal(migrations.length, 5);
  assert.equal(migrations[0]?.version, "0.01");
  assert.equal(migrations[0]?.name, "foundation");
  assert.match(migrations[0]?.sha256 ?? "", /^[0-9a-f]{64}$/);
  assert.equal(migrations[1]?.version, "0.02");
  assert.equal(migrations[1]?.name, "core-slice");
  assert.match(migrations[1]?.sha256 ?? "", /^[0-9a-f]{64}$/);
  assert.equal(migrations[2]?.version, "0.03");
  assert.equal(migrations[2]?.name, "canon-pack-registry");
  assert.match(migrations[2]?.sha256 ?? "", /^[0-9a-f]{64}$/);
  assert.equal(migrations[3]?.version, "0.04");
  assert.equal(migrations[3]?.name, "workspace-metadata");
  assert.match(migrations[3]?.sha256 ?? "", /^[0-9a-f]{64}$/);
  assert.equal(migrations[4]?.version, "0.05");
  assert.equal(migrations[4]?.name, "truthful-canon-metadata");
  assert.match(migrations[4]?.sha256 ?? "", /^[0-9a-f]{64}$/);
  assert.equal(EXPECTED_SCHEMA_VERSION, "0.05");
});

test("0.05 backfills completed attempts before enforcing completion timestamps", async () => {
  const sql = await readFile(
    "db/migrations/0.05_truthful-canon-metadata.sql",
    "utf8",
  );
  const backfill = sql.indexOf("UPDATE canon_pack_viewing_attempt");
  const constraint = sql.indexOf(
    "canon_pack_viewing_attempt_completed_at_consistent",
  );
  assert.ok(backfill >= 0, "completed attempt backfill is required");
  assert.ok(constraint > backfill, "backfill must precede the constraint");
});

test("0.03 deterministically backfills a 0.02 active catalog, focus, and viewing history into the registry", async () => {
  const sql = await readFile(
    "db/migrations/0.03_canon-pack-registry.sql",
    "utf8",
  );
  assert.match(
    sql,
    /INSERT INTO canon_pack_release[\s\S]*FROM active_canon_pack/,
  );
  assert.match(sql, /INSERT INTO canon_pack_watchable[\s\S]*FROM catalog_item/);
  assert.match(
    sql,
    /INSERT INTO active_canon_pack_registry[\s\S]*SELECT true, legacy_release\.canon_pack_release_id, active\.imported_at[\s\S]*FROM active_canon_pack AS active[\s\S]*JOIN canon_pack_release AS legacy_release/,
  );
  assert.match(
    sql,
    /INSERT INTO canon_pack_watch_focus[\s\S]*FROM watch_focus/,
  );
  assert.match(
    sql,
    /INSERT INTO canon_pack_viewing_attempt[\s\S]*FROM viewing_attempt/,
  );
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
    "0.06_next.sql": "SELECT 2;",
  });
  await assert.rejects(
    loadMigrations(directory),
    /Migration terminal version 0\.06 does not match expected schema version 0\.05/,
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
          migration_version: "0.05",
          migration_name: "truthful-canon-metadata",
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
          migration_version: "0.05",
          migration_name: "renamed-truthful-canon-metadata",
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

test("schema verification fails closed when the migration ledger and foundation are current but a Core slice table is missing", async () => {
  const foundationColumns = [
    [
      "schema_migration",
      "schema_migration_id",
      "uuid",
      "NO",
      "gen_random_uuid()",
    ],
    ["schema_migration", "migration_version", "varchar", "NO", "<none>"],
    ["schema_migration", "migration_name", "varchar", "NO", "<none>"],
    ["schema_migration", "migration_sha256", "bpchar", "NO", "<none>"],
    [
      "schema_migration",
      "applied_at",
      "timestamptz",
      "NO",
      "CURRENT_TIMESTAMP",
    ],
    [
      "tracker_instance",
      "tracker_instance_id",
      "uuid",
      "NO",
      "gen_random_uuid()",
    ],
    ["tracker_instance", "display_name", "text", "NO", "<none>"],
    ["tracker_instance", "credential_hash", "text", "YES", "<none>"],
    ["tracker_instance", "setup_completed_at", "timestamptz", "YES", "<none>"],
    [
      "tracker_instance",
      "created_at",
      "timestamptz",
      "NO",
      "CURRENT_TIMESTAMP",
    ],
    [
      "tracker_instance",
      "updated_at",
      "timestamptz",
      "NO",
      "CURRENT_TIMESTAMP",
    ],
  ].map(([table_name, column_name, udt_name, is_nullable, column_default]) => ({
    table_name,
    column_name,
    udt_name,
    is_nullable,
    column_default,
  }));
  const foundationConstraints = [
    [
      "schema_migration",
      "schema_migration_migration_version_key",
      "u",
      "UNIQUE (migration_version)",
    ],
    [
      "schema_migration",
      "schema_migration_name_not_blank",
      "c",
      "CHECK (btrim(migration_name::text) <> ''::text)",
    ],
    [
      "schema_migration",
      "schema_migration_pkey",
      "p",
      "PRIMARY KEY (schema_migration_id)",
    ],
    [
      "schema_migration",
      "schema_migration_sha256_format",
      "c",
      "CHECK (migration_sha256 ~ '^[0-9a-f]{64}$'::text)",
    ],
    [
      "schema_migration",
      "schema_migration_version_not_blank",
      "c",
      "CHECK (btrim(migration_version::text) <> ''::text)",
    ],
    [
      "tracker_instance",
      "tracker_instance_display_name_not_blank",
      "c",
      "CHECK (btrim(display_name) <> ''::text)",
    ],
    [
      "tracker_instance",
      "tracker_instance_pkey",
      "p",
      "PRIMARY KEY (tracker_instance_id)",
    ],
    [
      "tracker_instance",
      "tracker_instance_updated_after_created",
      "c",
      "CHECK (updated_at >= created_at)",
    ],
  ].map(
    ([
      table_name,
      constraint_name,
      constraint_type,
      constraint_definition,
    ]) => ({
      table_name,
      constraint_name,
      constraint_type,
      constraint_definition,
    }),
  );
  const database: Queryable = {
    query: async (text) => {
      if (text.includes("ORDER BY migration_version")) {
        return {
          rows: [
            {
              migration_version: "0.05",
              migration_name: "truthful-canon-metadata",
              migration_sha256: "a".repeat(64),
            },
          ],
        };
      }
      if (text.includes("information_schema.columns"))
        return { rows: foundationColumns };
      if (text.includes("pg_constraint"))
        return { rows: foundationConstraints };
      throw new Error(`Unexpected query: ${text}`);
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
              migration_version: "0.06",
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
