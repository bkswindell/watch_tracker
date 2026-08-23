import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Pool, PoolClient, QueryResult } from "pg";

import type { ReadinessResult } from "./app.js";

export const EXPECTED_SCHEMA_VERSION = "0.01";
const MIGRATION_FILE = /^(0\.\d{2})_([a-z0-9-]+)\.sql$/;
const MIGRATION_VERSION = /^0\.\d{2}$/;
const MIGRATION_LOCK_KEY = 873_214_019;
const UNDEFINED_TABLE = "42P01";

const REQUIRED_FOUNDATION_COLUMNS = [
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
  ["schema_migration", "applied_at", "timestamptz", "NO", "CURRENT_TIMESTAMP"],
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
  ["tracker_instance", "created_at", "timestamptz", "NO", "CURRENT_TIMESTAMP"],
  ["tracker_instance", "updated_at", "timestamptz", "NO", "CURRENT_TIMESTAMP"],
] as const;

const REQUIRED_FOUNDATION_CONSTRAINTS = [
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
] as const;

export interface Migration {
  version: string;
  name: string;
  sha256: string;
  sql: string;
}

export interface Queryable {
  query: (
    text: string,
    values?: readonly unknown[],
  ) => Promise<Pick<QueryResult, "rows">>;
}

interface MigrationRecord {
  migrationVersion: string;
  migrationName: string;
  migrationSha256: string;
}

function isUndefinedTable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === UNDEFINED_TABLE
  );
}

async function readMigrationRecords(
  database: Queryable,
): Promise<MigrationRecord[]> {
  let result: Pick<QueryResult, "rows">;
  try {
    result = await database.query(
      `SELECT migration_version, migration_name, migration_sha256
         FROM schema_migration
        ORDER BY migration_version`,
    );
  } catch (error) {
    if (isUndefinedTable(error)) return [];
    throw error;
  }

  return result.rows.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      migrationVersion: String(record.migration_version),
      migrationName: String(record.migration_name),
      migrationSha256: String(record.migration_sha256),
    };
  });
}

function assessMigrationRecords(
  records: readonly MigrationRecord[],
  migrations: readonly Migration[],
): { appliedCount: number; error?: string } {
  const versions = new Set(records.map((record) => record.migrationVersion));
  if (versions.size !== records.length) {
    return { appliedCount: 0, error: "database migration inventory mismatch" };
  }

  for (const [index, record] of records.entries()) {
    const expected = migrations[index];
    if (expected === undefined) {
      return {
        appliedCount: index,
        error: "database schema is newer than this application",
      };
    }
    if (record.migrationVersion !== expected.version) {
      const terminalVersion = migrations.at(-1)?.version ?? "";
      return {
        appliedCount: index,
        error:
          record.migrationVersion > terminalVersion
            ? "database schema is newer than this application"
            : "database migration inventory mismatch",
      };
    }
    if (record.migrationName !== expected.name) {
      return {
        appliedCount: index,
        error: "database migration identity mismatch",
      };
    }
    if (record.migrationSha256 !== expected.sha256) {
      return {
        appliedCount: index,
        error: "database migration checksum mismatch",
      };
    }
  }

  return { appliedCount: records.length };
}

function rowsMatchExactly(
  rows: readonly Record<string, unknown>[],
  fields: readonly string[],
  expected: readonly (readonly string[])[],
): boolean {
  if (rows.length !== expected.length) return false;
  const actualKeys = new Set(
    rows.map((row) =>
      JSON.stringify(fields.map((field) => String(row[field] ?? "<none>"))),
    ),
  );
  const expectedKeys = new Set(
    expected.map((values) => JSON.stringify(values)),
  );
  return (
    actualKeys.size === expectedKeys.size &&
    [...expectedKeys].every((key) => actualKeys.has(key))
  );
}

async function verifyFoundationIntegrity(
  database: Queryable,
): Promise<boolean> {
  const columns = await database.query(
    `SELECT table_name, column_name, udt_name, is_nullable,
            COALESCE(column_default, '<none>') AS column_default
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])`,
    [["schema_migration", "tracker_instance"]],
  );
  if (
    !rowsMatchExactly(
      columns.rows as Record<string, unknown>[],
      [
        "table_name",
        "column_name",
        "udt_name",
        "is_nullable",
        "column_default",
      ],
      REQUIRED_FOUNDATION_COLUMNS,
    )
  ) {
    return false;
  }

  const constraints = await database.query(
    `SELECT relation.relname AS table_name,
            constraint_record.conname AS constraint_name,
            constraint_record.contype AS constraint_type,
            pg_get_constraintdef(constraint_record.oid, true) AS constraint_definition
       FROM pg_constraint AS constraint_record
       JOIN pg_class AS relation ON relation.oid = constraint_record.conrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY($1::text[])`,
    [["schema_migration", "tracker_instance"]],
  );
  return rowsMatchExactly(
    constraints.rows as Record<string, unknown>[],
    [
      "table_name",
      "constraint_name",
      "constraint_type",
      "constraint_definition",
    ],
    REQUIRED_FOUNDATION_CONSTRAINTS,
  );
}

function validateMigrationInventory(migrations: readonly Migration[]): void {
  if (migrations.length === 0) throw new Error("Migration inventory is empty");

  const versions = new Set<string>();
  let previousVersion: string | undefined;
  for (const migration of migrations) {
    if (!MIGRATION_VERSION.test(migration.version)) {
      throw new Error(`Invalid migration version: ${migration.version}`);
    }
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }
    if (previousVersion !== undefined && migration.version <= previousVersion) {
      throw new Error(
        `Migration versions must be strictly increasing: ${migration.version} follows ${previousVersion}`,
      );
    }
    versions.add(migration.version);
    previousVersion = migration.version;
  }

  const terminalVersion = migrations.at(-1)?.version;
  if (terminalVersion !== EXPECTED_SCHEMA_VERSION) {
    throw new Error(
      `Migration terminal version ${terminalVersion ?? "<none>"} does not match expected schema version ${EXPECTED_SCHEMA_VERSION}`,
    );
  }
}

export async function loadMigrations(directory: string): Promise<Migration[]> {
  const sqlNames = (await readdir(directory))
    .filter((name) => name.toLowerCase().endsWith(".sql"))
    .sort();

  for (const fileName of sqlNames) {
    if (!MIGRATION_FILE.test(fileName))
      throw new Error(`Invalid migration name: ${fileName}`);
  }

  const migrations = await Promise.all(
    sqlNames.map(async (fileName) => {
      const match = MIGRATION_FILE.exec(fileName);
      if (!match?.[1] || !match[2])
        throw new Error(`Invalid migration name: ${fileName}`);
      const sql = await readFile(path.join(directory, fileName), "utf8");
      return {
        version: match[1],
        name: match[2],
        sha256: createHash("sha256").update(sql).digest("hex"),
        sql,
      };
    }),
  );

  validateMigrationInventory(migrations);
  return migrations;
}

export async function verifySchema(
  database: Queryable,
  migrations: readonly Migration[],
): Promise<ReadinessResult> {
  validateMigrationInventory(migrations);

  const records = await readMigrationRecords(database);
  const assessment = assessMigrationRecords(records, migrations);
  if (assessment.error !== undefined)
    return { ready: false, reason: assessment.error };
  if (assessment.appliedCount !== migrations.length) {
    return { ready: false, reason: "database schema is not current" };
  }
  if (!(await verifyFoundationIntegrity(database))) {
    return { ready: false, reason: "database schema integrity mismatch" };
  }
  return { ready: true };
}

async function applyMigration(
  client: PoolClient,
  migration: Migration,
): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(migration.sql);
    await client.query(
      `INSERT INTO schema_migration
        (migration_version, migration_name, migration_sha256)
       VALUES ($1, $2, $3)`,
      [migration.version, migration.name, migration.sha256],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function runMigrations(
  pool: Pool,
  migrations: readonly Migration[],
): Promise<void> {
  validateMigrationInventory(migrations);

  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    const records = await readMigrationRecords(client);
    const assessment = assessMigrationRecords(records, migrations);
    if (assessment.error !== undefined) {
      throw new Error(`Migration preflight failed: ${assessment.error}`);
    }

    for (const migration of migrations.slice(assessment.appliedCount)) {
      await applyMigration(client, migration);
    }

    const verification = await verifySchema(client, migrations);
    if (!verification.ready) {
      throw new Error(
        `Post-migration schema verification failed: ${verification.reason ?? "schema mismatch"}`,
      );
    }
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY])
      .catch(() => undefined);
    client.release();
  }
}
