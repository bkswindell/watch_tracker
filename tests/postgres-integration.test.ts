import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { Pool } from "pg";

import {
  EXPECTED_SCHEMA_VERSION,
  loadMigrations,
  runMigrations,
  verifySchema,
} from "../apps/api/src/migrations.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("foundation migration is usable against PostgreSQL", async () => {
  assert.ok(
    testDatabaseUrl,
    "TEST_DATABASE_URL is required for PostgreSQL integration tests",
  );

  const pool = new Pool({ connectionString: testDatabaseUrl });
  const trackerInstanceId = randomUUID();
  const displayName = `PostgreSQL integration test ${trackerInstanceId}`;

  try {
    const migrationsDirectory = fileURLToPath(
      new URL("../db/migrations/", import.meta.url),
    );
    const migrations = await loadMigrations(migrationsDirectory);
    await runMigrations(pool, migrations);
    await runMigrations(pool, migrations);

    assert.deepEqual(await verifySchema(pool, migrations), { ready: true });

    const identityClient = await pool.connect();
    try {
      await identityClient.query("BEGIN");
      await identityClient.query(
        `UPDATE schema_migration
            SET migration_name = 'renamed-foundation'
          WHERE migration_version = $1`,
        [EXPECTED_SCHEMA_VERSION],
      );
      assert.deepEqual(await verifySchema(identityClient, migrations), {
        ready: false,
        reason: "database migration identity mismatch",
      });
    } finally {
      await identityClient.query("ROLLBACK").catch(() => undefined);
      identityClient.release();
    }

    const migration = await pool.query<{
      migration_version: string;
      migration_sha256: string;
    }>(
      `SELECT migration_version, migration_sha256
         FROM schema_migration
        WHERE migration_version = $1`,
      [EXPECTED_SCHEMA_VERSION],
    );
    assert.deepEqual(migration.rows, [
      {
        migration_version: EXPECTED_SCHEMA_VERSION,
        migration_sha256: migrations.at(-1)?.sha256,
      },
    ]);

    const relation = await pool.query<{ relation_name: string | null }>(
      `SELECT to_regclass('public.tracker_instance')::text AS relation_name`,
    );
    assert.equal(relation.rows[0]?.relation_name, "tracker_instance");

    const integrityClient = await pool.connect();
    try {
      await integrityClient.query("BEGIN");
      await integrityClient.query(
        "ALTER TABLE tracker_instance DROP CONSTRAINT tracker_instance_display_name_not_blank",
      );
      assert.deepEqual(await verifySchema(integrityClient, migrations), {
        ready: false,
        reason: "database schema integrity mismatch",
      });
    } finally {
      await integrityClient.query("ROLLBACK").catch(() => undefined);
      integrityClient.release();
    }
    assert.deepEqual(await verifySchema(pool, migrations), { ready: true });

    await pool.query(
      `INSERT INTO tracker_instance (tracker_instance_id, display_name)
       VALUES ($1, $2)`,
      [trackerInstanceId, displayName],
    );

    const inserted = await pool.query<{
      tracker_instance_id: string;
      display_name: string;
    }>(
      `SELECT tracker_instance_id, display_name
         FROM tracker_instance
        WHERE tracker_instance_id = $1`,
      [trackerInstanceId],
    );
    assert.deepEqual(inserted.rows, [
      { tracker_instance_id: trackerInstanceId, display_name: displayName },
    ]);

    await pool.query(
      "DELETE FROM tracker_instance WHERE tracker_instance_id = $1",
      [trackerInstanceId],
    );
    const deleted = await pool.query(
      "SELECT 1 FROM tracker_instance WHERE tracker_instance_id = $1",
      [trackerInstanceId],
    );
    assert.equal(deleted.rowCount, 0);
  } finally {
    await pool
      .query("DELETE FROM tracker_instance WHERE tracker_instance_id = $1", [
        trackerInstanceId,
      ])
      .catch(() => undefined);
    await pool.end();
  }
});
