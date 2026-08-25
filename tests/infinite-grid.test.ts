import assert from "node:assert/strict";
import { test } from "node:test";

import { createInfiniteDatasource } from "../apps/web/src/infiniteGrid.js";

async function block(
  datasource: ReturnType<typeof createInfiniteDatasource>,
  options = {},
) {
  return await new Promise<{ rows: unknown[]; lastRow: number }>((resolve) => {
    datasource.getRows({
      startRow: 0,
      endRow: 2,
      filterModel: {},
      sortModel: [],
      ...options,
      successCallback: (rows: unknown[], lastRow: number) =>
        resolve({ rows, lastRow }),
    });
  });
}

test("infinite datasource applies bounded blocks, filters, and sorting deterministically", async () => {
  const datasource = createInfiniteDatasource([
    { id: "a", title: "Alpha", order: 2 },
    { id: "b", title: "Bravo", order: 1 },
    { id: "c", title: "Cinder", order: 3 },
  ]);
  assert.deepEqual(
    await block(datasource, { sortModel: [{ colId: "order", sort: "asc" }] }),
    {
      rows: [
        { id: "b", title: "Bravo", order: 1 },
        { id: "a", title: "Alpha", order: 2 },
      ],
      lastRow: -1,
    },
  );
  assert.deepEqual(
    await block(datasource, {
      filterModel: {
        title: { filterType: "text", type: "contains", filter: "ind" },
      },
    }),
    { rows: [{ id: "c", title: "Cinder", order: 3 }], lastRow: 1 },
  );
});

test("next-up datasource retains server queue order even when sort is requested", async () => {
  const datasource = createInfiniteDatasource(
    [
      { id: "first", order: 2 },
      { id: "second", order: 1 },
    ],
    { allowSort: false },
  );
  assert.deepEqual(
    await block(datasource, { sortModel: [{ colId: "order", sort: "asc" }] }),
    {
      rows: [
        { id: "first", order: 2 },
        { id: "second", order: 1 },
      ],
      lastRow: 2,
    },
  );
});
