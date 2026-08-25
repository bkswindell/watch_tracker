import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { Pool } from "pg";

import {
  EXPECTED_SCHEMA_VERSION,
  loadMigrations,
  runMigrations,
  verifySchema,
} from "../apps/api/src/migrations.js";
import { SqlSliceStore } from "../apps/api/src/slice.js";

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

test("PostgreSQL password recovery is digest-only, owner-bound, atomic, and revokes sessions", async () => {
  assert.ok(
    testDatabaseUrl,
    "TEST_DATABASE_URL is required for PostgreSQL integration tests",
  );
  const pool = new Pool({ connectionString: testDatabaseUrl });
  const oldPassword = "postgres-old-password";
  const newPassword = "postgres-new-password";
  let trackerInstanceId: string | undefined;
  try {
    const migrationsDirectory = fileURLToPath(
      new URL("../db/migrations/", import.meta.url),
    );
    await runMigrations(pool, await loadMigrations(migrationsDirectory));
    const store = new SqlSliceStore(pool, oldPassword);
    assert.equal(await store.setup(), true);
    const setup = await pool.query<{ tracker_instance_id: string }>(
      "SELECT tracker_instance_id FROM installation_setup WHERE singleton = true",
    );
    trackerInstanceId = setup.rows[0]?.tracker_instance_id;
    assert.ok(trackerInstanceId);

    const first = await store.issuePasswordResetToken();
    const second = await store.issuePasswordResetToken();
    const firstDigest = createHash("sha256").update(first.token).digest("hex");
    const secondDigest = createHash("sha256")
      .update(second.token)
      .digest("hex");
    const persisted = await pool.query<{
      token_sha256: string;
      consumed_at: Date | null;
    }>(
      "SELECT token_sha256, consumed_at FROM password_reset_token WHERE tracker_instance_id = $1 ORDER BY created_at",
      [trackerInstanceId],
    );
    assert.deepEqual(
      persisted.rows.map((row) => row.token_sha256.trim()),
      [firstDigest, secondDigest],
    );
    assert.ok(persisted.rows[0]?.consumed_at);
    assert.equal(persisted.rows[1]?.consumed_at, null);
    assert.equal(JSON.stringify(persisted.rows).includes(first.token), false);
    assert.equal(JSON.stringify(persisted.rows).includes(second.token), false);

    const session = await store.createSession();
    const attempts = await Promise.all([
      store.completePasswordReset(second.token, newPassword),
      store.completePasswordReset(second.token, newPassword),
    ]);
    assert.deepEqual(attempts.sort(), [false, true]);
    assert.equal(await store.getSession(session.token), undefined);
    assert.equal(await store.authenticate(oldPassword), false);
    assert.equal(await store.authenticate(newPassword), true);

    const otherOwner = randomUUID();
    await pool.query(
      "INSERT INTO tracker_instance (tracker_instance_id, display_name) VALUES ($1, 'Other owner')",
      [otherOwner],
    );
    const alienToken = "alien-owner-password-reset-token";
    await pool.query(
      "INSERT INTO password_reset_token (token_sha256, tracker_instance_id, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '15 minutes')",
      [createHash("sha256").update(alienToken).digest("hex"), otherOwner],
    );
    assert.equal(
      await store.completePasswordReset(alienToken, newPassword),
      false,
    );
    await pool.query(
      "DELETE FROM password_reset_token WHERE tracker_instance_id = $1",
      [otherOwner],
    );
    await pool.query(
      "DELETE FROM tracker_instance WHERE tracker_instance_id = $1",
      [otherOwner],
    );

    const expired = await store.issuePasswordResetToken();
    await pool.query(
      "UPDATE password_reset_token SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE token_sha256 = $1",
      [createHash("sha256").update(expired.token).digest("hex")],
    );
    assert.equal(
      await store.completePasswordReset(expired.token, newPassword),
      false,
    );
  } finally {
    await pool.query("DELETE FROM installation_setup").catch(() => undefined);
    if (trackerInstanceId) {
      await pool
        .query(
          "DELETE FROM password_reset_token WHERE tracker_instance_id = $1",
          [trackerInstanceId],
        )
        .catch(() => undefined);
      await pool
        .query("DELETE FROM app_session WHERE tracker_instance_id = $1", [
          trackerInstanceId,
        ])
        .catch(() => undefined);
      await pool
        .query("DELETE FROM tracker_instance WHERE tracker_instance_id = $1", [
          trackerInstanceId,
        ])
        .catch(() => undefined);
    }
    await pool.end();
  }
});
