import assert from "node:assert/strict";
import { test } from "node:test";

import type { Pool } from "pg";

import { SqlSliceStore } from "../apps/api/src/slice.js";

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
