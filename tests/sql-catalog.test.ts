import assert from "node:assert/strict";
import { test } from "node:test";

import { SqlSliceStore } from "../apps/api/src/slice.js";

test("SQL catalog latest viewing state is correlated to the active release and watchable", async () => {
  let catalogQuery = "";
  const pool = {
    async query<T>(query: string): Promise<{ rows: T[] }> {
      catalogQuery = query;
      return { rows: [] };
    },
  };

  const store = new SqlSliceStore(pool as never);
  await store.catalog();

  assert.match(
    catalogQuery,
    /WHERE\s+attempt\.canon_pack_release_id\s*=\s*active\.canon_pack_release_id/i,
  );
  assert.match(
    catalogQuery,
    /attempt\.watchable_id\s*=\s*watchable\.watchable_id/i,
  );
});
