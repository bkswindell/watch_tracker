import assert from "node:assert/strict";
import { test } from "node:test";

import { buildApp } from "../apps/api/src/app.js";
import { MemorySliceStore, SqlSliceStore } from "../apps/api/src/slice.js";
import {
  parseCatalogAdditionInput,
  type CatalogAdditionInput,
} from "../packages/contracts/src/catalog.js";

const input: CatalogAdditionInput = {
  slug: "local-feature",
  title: "Local Feature",
  type: "movie",
  summary: "A user-owned Catalog addition.",
  releaseDate: "2026-08-24",
  runtime: 92,
  series: "Local Library",
  aliases: ["Feature One"],
  why: "Added by the local administrator.",
};

async function authenticatedApp() {
  const app = await buildApp({
    readinessProbe: async () => ({ ready: true }),
    sliceStore: new MemorySliceStore({ initialPassword: "password" }),
  });
  const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap" });
  const setupCsrf = bootstrap.json().csrfToken as string;
  await app.inject({
    method: "POST",
    url: "/api/setup",
    headers: { "x-csrf-token": setupCsrf },
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/login",
    headers: { "content-type": "application/json", "x-csrf-token": setupCsrf },
    payload: { password: "password" },
  });
  const cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  const authenticated = await app.inject({
    method: "GET",
    url: "/api/bootstrap",
    headers: { cookie },
  });
  return { app, cookie, csrf: authenticated.json().csrfToken as string };
}

test("Catalog addition contracts reject unknown, malformed, and unapproved input", () => {
  assert.equal(parseCatalogAdditionInput(input).value?.slug, input.slug);
  for (const invalid of [
    { ...input, slug: "Not Safe" },
    { ...input, releaseDate: "2026-02-30" },
    { ...input, runtime: 0 },
    { ...input, aliases: ["duplicate", "duplicate"] },
    { ...input, posterUrl: "http://example.com/poster.jpg" },
    { ...input, unexpected: true },
  ]) {
    assert.equal(parseCatalogAdditionInput(invalid).value, undefined);
  }
});

test("authenticated and CSRF-protected Catalog addition CRUD is complete", async (t) => {
  const { app, cookie, csrf } = await authenticatedApp();
  t.after(() => app.close());

  assert.equal(
    (await app.inject({ method: "GET", url: "/api/catalog-additions" }))
      .statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/catalog-additions",
        headers: { cookie },
        payload: input,
      })
    ).statusCode,
    403,
  );
  const created = await app.inject({
    method: "POST",
    url: "/api/catalog-additions",
    headers: { cookie, "x-csrf-token": csrf },
    payload: input,
  });
  assert.equal(created.statusCode, 201);
  const item = created.json().item;
  assert.match(item.id, /^[0-9a-f-]{36}$/);
  assert.equal(item.slug, input.slug);

  const duplicate = await app.inject({
    method: "POST",
    url: "/api/catalog-additions",
    headers: { cookie, "x-csrf-token": csrf },
    payload: input,
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().error.code, "catalog-addition.slug-conflict");

  const listed = await app.inject({
    method: "GET",
    url: "/api/catalog-additions",
    headers: { cookie },
  });
  assert.deepEqual(
    listed.json().items.map((entry: { id: string }) => entry.id),
    [item.id],
  );

  const updatedInput = {
    ...input,
    title: "Updated Local Feature",
    runtime: 95,
  };
  const updated = await app.inject({
    method: "PUT",
    url: `/api/catalog-additions/${item.id}`,
    headers: { cookie, "x-csrf-token": csrf },
    payload: updatedInput,
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().item.title, updatedInput.title);
  assert.equal(updated.json().item.runtime, 95);

  const removed = await app.inject({
    method: "DELETE",
    url: `/api/catalog-additions/${item.id}`,
    headers: { cookie, "x-csrf-token": csrf },
  });
  assert.equal(removed.statusCode, 204);
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: `/api/catalog-additions/${item.id}`,
        headers: { cookie },
      })
    ).statusCode,
    404,
  );
});

test("PostgreSQL Catalog addition queries scope every operation to its session owner", async () => {
  const calls: { text: string; values: readonly unknown[] }[] = [];
  const pool = {
    async query<T>(text: string, values: readonly unknown[] = []) {
      calls.push({ text, values });
      if (/RETURNING catalog_addition_id AS id/.test(text))
        return {
          rows: [{ id: "0198d9c4-7bd4-7000-8000-000000000001" } as T],
          rowCount: 1,
        };
      if (/SELECT catalog_addition_id AS id/.test(text))
        return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
  };
  const store = new SqlSliceStore(pool as never);
  const owner = "0198d9c4-7bd4-7000-8000-000000000099";
  const id = "0198d9c4-7bd4-7000-8000-000000000001";
  await store.catalogAdditions(owner);
  await store.catalogAddition(owner, id);
  await assert.rejects(
    store.createCatalogAddition(owner, input),
    /not readable/,
  );
  await store.updateCatalogAddition(owner, id, input);
  await store.deleteCatalogAddition(owner, id);

  for (const call of calls.filter((call) =>
    /catalog_addition/.test(call.text),
  )) {
    assert.match(call.text, /tracker_instance_id/);
    assert.equal(call.values[0], owner);
  }
  assert.ok(calls.some((call) => /deleted_at IS NULL/.test(call.text)));
  assert.ok(
    calls.some((call) => /INSERT INTO catalog_addition/.test(call.text)),
  );
  assert.ok(
    calls.some((call) => /SET deleted_at = CURRENT_TIMESTAMP/.test(call.text)),
  );
});
