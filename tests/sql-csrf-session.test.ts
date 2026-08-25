import assert from "node:assert/strict";
import { test } from "node:test";

import type { Pool } from "pg";
import argon2 from "argon2";

import { SqlSliceStore } from "../apps/api/src/slice.js";

test("SQL setup persists a standards-conformant Argon2id credential", async () => {
  let credentialHash = "";
  const trackerInstanceId = "0198d9c4-7bd4-7000-8000-000000000099";
  const client = {
    query: async (sql: string, values?: readonly unknown[]) => {
      if (sql.includes("INSERT INTO tracker_instance")) {
        credentialHash = String(values?.[0] ?? "");
        return {
          rows: [{ tracker_instance_id: trackerInstanceId }],
          rowCount: 1,
        };
      }
      if (sql.startsWith("SELECT 1 FROM installation_setup"))
        return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    },
    release: () => undefined,
  };
  const pool = { connect: async () => client } as unknown as Pool;
  const password = "correct-horse-battery-staple";
  const store = new SqlSliceStore(pool, password);

  assert.equal(await store.setup(), true);
  assert.match(credentialHash, /^\$argon2id\$/);
  assert.match(credentialHash, /m=65536(?:,p=1,t=3|,t=3,p=1)/);
  assert.equal(await argon2.verify(credentialHash, password), true);
});

test("SQL session resume returns the stored CSRF token", async () => {
  let storedCsrfToken = "";
  const trackerInstanceId = "0198d9c4-7bd4-7000-8000-000000000099";
  const pool = {
    query: async (sql: string, values?: readonly unknown[]) => {
      if (sql.startsWith("SELECT tracker_instance_id FROM installation_setup"))
        return {
          rows: [{ tracker_instance_id: trackerInstanceId }],
          rowCount: 1,
        };
      if (sql.startsWith("INSERT INTO app_session")) {
        storedCsrfToken = String(values?.[1] ?? "");
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('csrf_token AS "csrfToken"')) {
        return {
          rows: [{ csrfToken: storedCsrfToken, trackerInstanceId }],
          rowCount: 1,
        };
      }
      if (sql.includes("SELECT 1 FROM app_session")) {
        return { rows: [{ csrf_token: storedCsrfToken }], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  } as unknown as Pool;

  const store = new SqlSliceStore(pool);
  const created = await store.createSession();
  const resumed = await store.getSession(created.token);

  assert.deepEqual(resumed, {
    csrfToken: created.csrfToken,
    trackerInstanceId,
  });
});
