import assert from "node:assert/strict";
import { test } from "node:test";

import { buildApp } from "../apps/api/src/app.js";
import { MemorySliceStore, SqlSliceStore } from "../apps/api/src/slice.js";
import { parseWatchableFeedbackInput } from "../packages/contracts/src/feedback.js";

const feedback = {
  rating: 4.5,
  favorite: true,
  wouldRewatch: true,
  note: "  Best lantern reveal.  ",
};

async function authenticatedApp() {
  const store = new MemorySliceStore({ initialPassword: "password" });
  const app = await buildApp({
    readinessProbe: async () => ({ ready: true }),
    sliceStore: store,
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
    headers: { "x-csrf-token": setupCsrf },
    payload: { password: "password" },
  });
  const cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  const resumed = await app.inject({
    method: "GET",
    url: "/api/bootstrap",
    headers: { cookie },
  });
  const csrf = resumed.json().csrfToken as string;
  await app.inject({
    method: "POST",
    url: "/api/import-lantern-vale",
    headers: { cookie, "x-csrf-token": csrf },
  });
  return { app, store, cookie, csrf };
}

test("feedback contract is strict and accepts half-step ratings", () => {
  assert.deepEqual(parseWatchableFeedbackInput(feedback).value, {
    ...feedback,
    note: "Best lantern reveal.",
  });
  for (const invalid of [
    { ...feedback, rating: 0 },
    { ...feedback, rating: 4.25 },
    { ...feedback, rating: 6 },
    { ...feedback, favorite: "yes" },
    { ...feedback, note: "x".repeat(4001) },
    { ...feedback, review: "unknown" },
  ])
    assert.equal(parseWatchableFeedbackInput(invalid).value, undefined);
});

test("feedback API enforces auth, CSRF, strict validation, and Watched lifecycle", async (t) => {
  const { app, store, cookie, csrf } = await authenticatedApp();
  t.after(() => app.close());
  const url = "/api/catalog/lamp/feedback";

  assert.equal((await app.inject({ method: "GET", url })).statusCode, 401);
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url,
        headers: { cookie },
        payload: feedback,
      })
    ).statusCode,
    403,
  );
  const beforeWatched = await app.inject({
    method: "PUT",
    url,
    headers: { cookie, "x-csrf-token": csrf },
    payload: feedback,
  });
  assert.equal(beforeWatched.statusCode, 409);
  assert.equal(beforeWatched.json().error.code, "feedback.watch-required");

  const invalid = await app.inject({
    method: "PUT",
    url,
    headers: { cookie, "x-csrf-token": csrf },
    payload: { ...feedback, rating: 4.25 },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().error.code, "request.invalid");

  await app.inject({
    method: "POST",
    url: "/api/catalog/lamp/complete",
    headers: { cookie, "x-csrf-token": csrf },
  });
  const saved = await app.inject({
    method: "PUT",
    url,
    headers: { cookie, "x-csrf-token": csrf },
    payload: feedback,
  });
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(
    { ...saved.json().feedback, updatedAt: "<timestamp>" },
    {
      rating: 4.5,
      favorite: true,
      wouldRewatch: true,
      note: "Best lantern reveal.",
      updatedAt: "<timestamp>",
    },
  );
  const read = await app.inject({ method: "GET", url, headers: { cookie } });
  assert.equal(read.json().eligible, true);
  assert.equal(read.json().feedback.rating, 4.5);

  const owner = (await store.createSession()).trackerInstanceId;
  assert.equal(
    (await store.watchableFeedback(`${owner}-other`, "lamp"))?.feedback,
    null,
  );

  await app.inject({
    method: "POST",
    url: "/api/catalog/lamp/repeat",
    headers: { cookie, "x-csrf-token": csrf },
  });
  const afterRepeat = await app.inject({
    method: "PUT",
    url,
    headers: { cookie, "x-csrf-token": csrf },
    payload: { ...feedback, rating: 5 },
  });
  assert.equal(afterRepeat.statusCode, 409);
  const retained = await app.inject({
    method: "GET",
    url,
    headers: { cookie },
  });
  assert.equal(retained.json().eligible, false);
  assert.equal(retained.json().feedback.rating, 4.5);
});

test("PostgreSQL feedback SQL is owner-scoped, Pack-separated, and atomically watched-gated", async () => {
  const calls: { text: string; values: readonly unknown[] }[] = [];
  const pool = {
    async query<T>(text: string, values: readonly unknown[] = []) {
      calls.push({ text, values });
      if (/INSERT INTO watchable_feedback/.test(text))
        return {
          rows: [
            {
              rating: "4.5",
              favorite: true,
              wouldRewatch: true,
              note: "Best lantern reveal.",
              updatedAt: new Date().toISOString(),
            } as T,
          ],
          rowCount: 1,
        };
      return { rows: [], rowCount: 0 };
    },
  };
  const store = new SqlSliceStore(pool as never);
  const owner = "0198d9c4-7bd4-7000-8000-000000000099";
  await store.watchableFeedback(owner, "lamp");
  const result = await store.saveWatchableFeedback(owner, "lamp", {
    ...feedback,
    note: feedback.note.trim(),
  });
  assert.equal(result.status, "saved");
  for (const call of calls) {
    assert.equal(call.values[0], owner);
    assert.match(call.text, /tracker_instance_id/);
  }
  const mutation = calls.find((call) =>
    /INSERT INTO watchable_feedback/.test(call.text),
  );
  assert.ok(mutation);
  assert.match(
    mutation.text,
    /ORDER BY attempt\.created_at DESC LIMIT 1\) = 'completed'/,
  );
  assert.match(
    mutation.text,
    /ON CONFLICT \(tracker_instance_id, canon_pack_release_id, watchable_id\)/,
  );
  assert.doesNotMatch(
    mutation.text,
    /(?:UPDATE|DELETE FROM) canon_pack_watchable/,
  );
});
