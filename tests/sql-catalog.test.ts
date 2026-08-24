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

test("SQL catalog filters use parameterized case-insensitive predicates", async () => {
  let catalogQuery = "";
  let catalogValues: unknown[] = [];
  const pool = {
    async query<T>(query: string, values?: unknown[]): Promise<{ rows: T[] }> {
      catalogQuery = query;
      catalogValues = values ?? [];
      return { rows: [] };
    },
  };

  await new SqlSliceStore(pool as never).catalog({
    search: "First Light",
    type: "movie",
  });

  assert.match(catalogQuery, /watchable\.title ILIKE \$1/i);
  assert.match(catalogQuery, /watchable\.summary ILIKE \$1/i);
  assert.match(catalogQuery, /type\.code = \$2/i);
  assert.deepEqual(catalogValues, ["%First Light%", "movie"]);
});

test("SQL catalog search treats LIKE metacharacters as literal text", async () => {
  let catalogQuery = "";
  let catalogValues: unknown[] = [];
  const pool = {
    async query<T>(query: string, values?: unknown[]): Promise<{ rows: T[] }> {
      catalogQuery = query;
      catalogValues = values ?? [];
      return { rows: [] };
    },
  };

  await new SqlSliceStore(pool as never).catalog({ search: "%_\\" });

  assert.match(catalogQuery, /ILIKE \$1 ESCAPE '\\'/i);
  assert.deepEqual(catalogValues, ["%\\%\\_\\\\%"]);
});

test("SQL catalog detail maps prerequisite relationship context", async () => {
  const queries: string[] = [];
  const pool = {
    async query<T>(query: string): Promise<{ rows: T[] }> {
      queries.push(query);
      if (
        /FROM active_canon_pack_registry active/i.test(query) &&
        /ORDER BY watchable.release_order/i.test(query)
      ) {
        return {
          rows: [
            {
              slug: "midwinter-signal",
              title: "Midwinter Signal",
              type: "Special",
              summary: "summary",
              releaseOrder: 4,
              state: "not-started",
            } as T,
          ],
        };
      }
      return {
        rows: [
          {
            relationship_type: "required",
            direction: "requires",
            referenced_id: "watchable-id",
            referenced_slug: "lantern-vale-first-light",
            referenced_title: "Lantern Vale: First Light",
            summary:
              "First Light establishes the restored beacon network used by the Special.",
          } as T,
        ],
      };
    },
  };

  const item = await new SqlSliceStore(pool as never).item("midwinter-signal");
  assert.equal(item?.relationships[0]?.referencedWatchable.id, "watchable-id");
  assert.match(queries.at(-1) ?? "", /canon_pack_relationship/i);
  assert.match(queries.at(-1) ?? "", /prerequisite_id|watchable_id/i);
});
