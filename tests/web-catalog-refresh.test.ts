import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createLatestCatalogRequest,
  type CatalogFilters,
} from "../apps/web/src/catalog-refresh.js";

test("catalog filter refreshes do not bootstrap and stale responses cannot win", async () => {
  const requests: string[] = [];
  const applied: string[] = [];
  let resolveFirst!: (value: string) => void;
  let resolveSecond!: (value: string) => void;
  const first = new Promise<string>((resolve) => {
    resolveFirst = resolve;
  });
  const second = new Promise<string>((resolve) => {
    resolveSecond = resolve;
  });
  const refresh = createLatestCatalogRequest(
    async ({ search }: CatalogFilters) => {
      requests.push(search ?? "");
      return search === "first" ? first : second;
    },
    (result) => applied.push(result),
  );

  const firstRefresh = refresh({ search: "first" });
  const secondRefresh = refresh({ search: "second" });
  resolveSecond("newest result");
  await secondRefresh;
  resolveFirst("stale result");
  await firstRefresh;

  assert.deepEqual(requests, ["first", "second"]);
  assert.deepEqual(applied, ["newest result"]);
});
