import assert from "node:assert/strict";
import { test } from "node:test";

import type { Pool } from "pg";

import { SqlSliceStore } from "../apps/api/src/slice.js";

test("SQL session resume returns the stored CSRF token", async () => {
  let storedCsrfToken = "";
  const pool = {
    query: async (sql: string, values?: readonly unknown[]) => {
      if (sql.startsWith("INSERT INTO app_session")) {
        storedCsrfToken = String(values?.[1] ?? "");
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("SELECT csrf_token FROM app_session")) {
        return {
          rows: [{ csrf_token: storedCsrfToken }],
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

  assert.deepEqual(resumed, { csrfToken: created.csrfToken });
});
