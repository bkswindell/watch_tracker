import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Pool, PoolClient, QueryResult } from "pg";

import type { ReadinessResult } from "./app.js";

export const EXPECTED_SCHEMA_VERSION = "0.07";
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

const REQUIRED_CORE_SLICE_COLUMNS = [
  ["installation_setup", "singleton", "bool", "NO"],
  ["installation_setup", "tracker_instance_id", "uuid", "NO"],
  ["app_session", "token_sha256", "bpchar", "NO"],
  ["app_session", "csrf_token", "bpchar", "NO"],
  ["app_session", "csrf_sha256", "bpchar", "NO"],
  ["app_session", "expires_at", "timestamptz", "NO"],
  ["app_session", "created_at", "timestamptz", "NO"],
  ["app_session", "tracker_instance_id", "uuid", "NO"],
  ["active_canon_pack", "singleton", "bool", "NO"],
  ["active_canon_pack", "title", "text", "NO"],
  ["active_canon_pack", "version", "varchar", "NO"],
  ["active_canon_pack", "imported_at", "timestamptz", "NO"],
  ["catalog_item", "slug", "varchar", "NO"],
  ["catalog_item", "title", "text", "NO"],
  ["catalog_item", "type", "varchar", "NO"],
  ["catalog_item", "summary", "text", "NO"],
  ["catalog_item", "release_order", "int4", "NO"],
  ["canon_pack_watchable", "canon_pack_release_id", "uuid", "NO"],
  ["canon_pack_watchable", "watchable_id", "uuid", "NO"],
  ["canon_pack_watchable", "slug", "varchar", "NO"],
  ["canon_pack_watchable", "title", "text", "NO"],
  ["canon_pack_watchable", "summary", "text", "NO"],
  ["canon_pack_watchable", "watchable_type_id", "uuid", "NO"],
  ["canon_pack_watchable", "release_date", "date", "NO"],
  ["canon_pack_watchable", "release_order", "int4", "NO"],
  ["canon_pack_watchable", "runtime_minutes", "int4", "NO"],
  ["canon_pack_watchable", "primary_series", "text", "NO"],
  ["canon_pack_watchable", "season_number", "int4", "YES"],
  ["canon_pack_watchable", "episode_number", "int4", "YES"],
  ["canon_pack_watchable", "aliases", "_text", "NO"],
  ["canon_pack_watchable", "generated_poster", "bool", "NO"],
  ["canon_pack_watchable", "queue_reason", "text", "NO"],
  ["canon_pack_watchable", "poster_url", "text", "YES"],

  ["watch_focus", "singleton", "bool", "NO"],
  ["watch_focus", "target_slug", "varchar", "NO"],
  ["watch_focus", "updated_at", "timestamptz", "NO"],
  ["viewing_attempt", "viewing_attempt_id", "uuid", "NO"],
  ["viewing_attempt", "catalog_slug", "varchar", "NO"],
  ["viewing_attempt", "status", "varchar", "NO"],
  ["viewing_attempt", "created_at", "timestamptz", "NO"],
] as const;

const REQUIRED_CORE_SLICE_CONSTRAINTS = [
  ["installation_setup", "installation_setup_pkey", "p"],
  ["installation_setup", "installation_setup_tracker_instance_id_key", "u"],
  ["installation_setup", "installation_setup_tracker_instance_id_fkey", "f"],
  ["installation_setup", "installation_setup_singleton_true", "c"],
  ["app_session", "app_session_pkey", "p"],
  ["app_session", "app_session_token_sha256_format", "c"],
  ["app_session", "app_session_csrf_token_format", "c"],
  ["app_session", "app_session_csrf_sha256_format", "c"],
  ["app_session", "app_session_tracker_instance_id_fkey", "f"],
  ["active_canon_pack", "active_canon_pack_pkey", "p"],
  ["active_canon_pack", "active_canon_pack_singleton_true", "c"],
  ["active_canon_pack", "active_canon_pack_title_not_blank", "c"],
  ["active_canon_pack", "active_canon_pack_version_not_blank", "c"],
  ["catalog_item", "catalog_item_pkey", "p"],
  ["catalog_item", "catalog_item_release_order_key", "u"],
  ["catalog_item", "catalog_item_slug_not_blank", "c"],
  ["catalog_item", "catalog_item_title_not_blank", "c"],
  ["catalog_item", "catalog_item_type_valid", "c"],
  ["catalog_item", "catalog_item_summary_not_blank", "c"],
  ["catalog_item", "catalog_item_release_order_positive", "c"],
  ["canon_pack_watchable", "canon_pack_watchable_pkey", "p"],
  [
    "canon_pack_watchable",
    "canon_pack_watchable_canon_pack_release_id_release_order_key",
    "u",
  ],
  [
    "canon_pack_watchable",
    "canon_pack_watchable_canon_pack_release_id_slug_key",
    "u",
  ],
  [
    "canon_pack_watchable",
    "canon_pack_watchable_canon_pack_release_id_fkey",
    "f",
  ],
  [
    "canon_pack_watchable",
    "canon_pack_watchable_canon_pack_release_id_watchable_type__fkey",
    "f",
  ],
  ["canon_pack_watchable", "canon_pack_watchable_release_order_positive", "c"],
  ["canon_pack_watchable", "canon_pack_watchable_runtime_positive", "c"],
  [
    "canon_pack_watchable",
    "canon_pack_watchable_primary_series_not_blank",
    "c",
  ],
  ["canon_pack_watchable", "canon_pack_watchable_season_positive", "c"],
  ["canon_pack_watchable", "canon_pack_watchable_episode_positive", "c"],
  ["canon_pack_watchable", "canon_pack_watchable_episode_identity_pair", "c"],
  ["canon_pack_watchable", "canon_pack_watchable_queue_reason_not_blank", "c"],
  ["canon_pack_watchable", "canon_pack_watchable_poster_url_approved", "c"],

  ["watch_focus", "watch_focus_pkey", "p"],
  ["watch_focus", "watch_focus_target_slug_fkey", "f"],
  ["watch_focus", "watch_focus_singleton_true", "c"],
  ["viewing_attempt", "viewing_attempt_pkey", "p"],
  ["viewing_attempt", "viewing_attempt_catalog_slug_fkey", "f"],
  ["viewing_attempt", "viewing_attempt_status_valid", "c"],
] as const;

const REQUIRED_TRUTHFUL_METADATA_COLUMNS = [
  ["canon_pack_release", "inventory_file_count", "int4", "YES"],
  ["canon_pack_release", "inventory_total_bytes", "int8", "YES"],
  ["canon_pack_release", "verification_status", "varchar", "YES"],
  ["canon_pack_release", "checksums_sha256", "bpchar", "YES"],
  ["canon_pack_viewing_attempt", "watched_minutes", "int4", "YES"],
  ["canon_pack_viewing_attempt", "completed_at", "timestamptz", "YES"],
] as const;

const REQUIRED_TRUTHFUL_METADATA_CONSTRAINTS = [
  [
    "canon_pack_release",
    "canon_pack_release_inventory_file_count_positive",
    "c",
  ],
  [
    "canon_pack_release",
    "canon_pack_release_inventory_total_bytes_positive",
    "c",
  ],
  ["canon_pack_release", "canon_pack_release_verification_status_valid", "c"],
  ["canon_pack_release", "canon_pack_release_checksums_sha256_format", "c"],
  [
    "canon_pack_viewing_attempt",
    "canon_pack_viewing_attempt_watched_minutes_positive",
    "c",
  ],
  [
    "canon_pack_viewing_attempt",
    "canon_pack_viewing_attempt_completed_at_consistent",
    "c",
  ],
] as const;

const REQUIRED_PERSONAL_CATALOG_COLUMNS = [
  ["catalog_addition_id", "uuid", "NO"],
  ["tracker_instance_id", "uuid", "NO"],
  ["slug", "varchar", "NO"],
  ["title", "text", "NO"],
  ["type", "varchar", "NO"],
  ["summary", "text", "NO"],
  ["release_date", "date", "NO"],
  ["runtime_minutes", "int4", "NO"],
  ["primary_series", "text", "NO"],
  ["aliases", "_text", "NO"],
  ["queue_reason", "text", "NO"],
  ["poster_url", "text", "YES"],
  ["created_at", "timestamptz", "NO"],
  ["updated_at", "timestamptz", "NO"],
  ["deleted_at", "timestamptz", "YES"],
] as const;

const REQUIRED_PERSONAL_CATALOG_CONSTRAINTS = [
  ["catalog_addition_pkey", "p"],
  ["catalog_addition_tracker_instance_id_fkey", "f"],
  ["catalog_addition_slug_format", "c"],
  ["catalog_addition_title_not_blank", "c"],
  ["catalog_addition_type_valid", "c"],
  ["catalog_addition_summary_not_blank", "c"],
  ["catalog_addition_runtime_valid", "c"],
  ["catalog_addition_series_not_blank", "c"],
  ["catalog_addition_queue_reason_not_blank", "c"],
  ["catalog_addition_aliases_limited", "c"],
  ["catalog_addition_poster_url_approved", "c"],
  ["catalog_addition_updated_after_created", "c"],
  ["catalog_addition_deleted_after_created", "c"],
] as const;

const REQUIRED_FEEDBACK_COLUMNS = [
  ["watchable_feedback_id", "uuid", "NO"],
  ["tracker_instance_id", "uuid", "NO"],
  ["canon_pack_release_id", "uuid", "NO"],
  ["watchable_id", "uuid", "NO"],
  ["rating", "numeric", "YES"],
  ["favorite", "bool", "NO"],
  ["would_rewatch", "bool", "NO"],
  ["note", "text", "YES"],
  ["created_at", "timestamptz", "NO"],
  ["updated_at", "timestamptz", "NO"],
] as const;

const REQUIRED_FEEDBACK_CONSTRAINTS = [
  ["watchable_feedback_pkey", "p"],
  ["watchable_feedback_tracker_instance_id_fkey", "f"],
  ["watchable_feedback_watchable_fkey", "f"],
  ["watchable_feedback_owner_watchable_key", "u"],
  ["watchable_feedback_rating_valid", "c"],
  ["watchable_feedback_note_limited", "c"],
  ["watchable_feedback_updated_after_created", "c"],
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

async function verifyCoreSliceIntegrity(database: Queryable): Promise<boolean> {
  const tables = [
    "installation_setup",
    "app_session",
    "active_canon_pack",
    "catalog_item",
    "canon_pack_watchable",
    "watch_focus",
    "viewing_attempt",
  ];
  const columns = await database.query(
    `SELECT table_name, column_name, udt_name, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])`,
    [tables],
  );
  if (
    !rowsMatchExactly(
      columns.rows as Record<string, unknown>[],
      ["table_name", "column_name", "udt_name", "is_nullable"],
      REQUIRED_CORE_SLICE_COLUMNS,
    )
  ) {
    return false;
  }

  const constraints = await database.query(
    `SELECT relation.relname AS table_name,
            constraint_record.conname AS constraint_name,
            constraint_record.contype AS constraint_type
       FROM pg_constraint AS constraint_record
       JOIN pg_class AS relation ON relation.oid = constraint_record.conrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY($1::text[])`,
    [tables],
  );
  return rowsMatchExactly(
    constraints.rows as Record<string, unknown>[],
    ["table_name", "constraint_name", "constraint_type"],
    REQUIRED_CORE_SLICE_CONSTRAINTS,
  );
}

async function verifyTruthfulMetadataIntegrity(
  database: Queryable,
): Promise<boolean> {
  const columns = await database.query(
    `SELECT table_name, column_name, udt_name, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'canon_pack_release'
            AND column_name = ANY($1::text[]))
          OR
          (table_name = 'canon_pack_viewing_attempt'
            AND column_name = ANY($2::text[]))
        )`,
    [
      [
        "inventory_file_count",
        "inventory_total_bytes",
        "verification_status",
        "checksums_sha256",
      ],
      ["watched_minutes", "completed_at"],
    ],
  );
  if (
    !rowsMatchExactly(
      columns.rows as Record<string, unknown>[],
      ["table_name", "column_name", "udt_name", "is_nullable"],
      REQUIRED_TRUTHFUL_METADATA_COLUMNS,
    )
  ) {
    return false;
  }

  const constraintNames = REQUIRED_TRUTHFUL_METADATA_CONSTRAINTS.map(
    ([, name]) => name,
  );
  const constraints = await database.query(
    `SELECT relation.relname AS table_name,
            constraint_record.conname AS constraint_name,
            constraint_record.contype AS constraint_type
       FROM pg_constraint AS constraint_record
       JOIN pg_class AS relation ON relation.oid = constraint_record.conrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND constraint_record.conname = ANY($1::text[])`,
    [constraintNames],
  );
  return rowsMatchExactly(
    constraints.rows as Record<string, unknown>[],
    ["table_name", "constraint_name", "constraint_type"],
    REQUIRED_TRUTHFUL_METADATA_CONSTRAINTS,
  );
}

async function verifyPersonalCatalogIntegrity(
  database: Queryable,
): Promise<boolean> {
  const columns = await database.query(
    `SELECT column_name, udt_name, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'catalog_addition'`,
  );
  if (
    !rowsMatchExactly(
      columns.rows as Record<string, unknown>[],
      ["column_name", "udt_name", "is_nullable"],
      REQUIRED_PERSONAL_CATALOG_COLUMNS,
    )
  )
    return false;
  const constraints = await database.query(
    `SELECT constraint_record.conname AS constraint_name,
            constraint_record.contype AS constraint_type
       FROM pg_constraint AS constraint_record
       JOIN pg_class AS relation ON relation.oid = constraint_record.conrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relname = 'catalog_addition'`,
  );
  return rowsMatchExactly(
    constraints.rows as Record<string, unknown>[],
    ["constraint_name", "constraint_type"],
    REQUIRED_PERSONAL_CATALOG_CONSTRAINTS,
  );
}

async function verifyFeedbackIntegrity(database: Queryable): Promise<boolean> {
  const columns = await database.query(
    `SELECT column_name, udt_name, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'watchable_feedback'`,
  );
  if (
    !rowsMatchExactly(
      columns.rows as Record<string, unknown>[],
      ["column_name", "udt_name", "is_nullable"],
      REQUIRED_FEEDBACK_COLUMNS,
    )
  )
    return false;
  const constraints = await database.query(
    `SELECT constraint_record.conname AS constraint_name,
            constraint_record.contype AS constraint_type
       FROM pg_constraint AS constraint_record
       JOIN pg_class AS relation ON relation.oid = constraint_record.conrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relname = 'watchable_feedback'`,
  );
  return rowsMatchExactly(
    constraints.rows as Record<string, unknown>[],
    ["constraint_name", "constraint_type"],
    REQUIRED_FEEDBACK_CONSTRAINTS,
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
  if (
    !(await verifyFoundationIntegrity(database)) ||
    !(await verifyCoreSliceIntegrity(database)) ||
    !(await verifyTruthfulMetadataIntegrity(database)) ||
    !(await verifyPersonalCatalogIntegrity(database)) ||
    !(await verifyFeedbackIntegrity(database))
  ) {
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
