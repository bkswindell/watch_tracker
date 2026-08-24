import assert from "node:assert/strict";
import { test } from "node:test";

import { recommendedNext, requestOptions } from "../apps/web/src/api.js";

test("browser API requests keep same-origin credentials and protect unsafe calls with CSRF", () => {
  assert.deepEqual(requestOptions("GET"), { credentials: "same-origin" });
  assert.deepEqual(requestOptions("POST", "csrf-123"), {
    credentials: "same-origin",
    method: "POST",
    headers: {
      "x-csrf-token": "csrf-123",
    },
  });
  assert.deepEqual(
    requestOptions("POST", "csrf-123", { password: "not asserted" }),
    {
      credentials: "same-origin",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": "csrf-123",
      },
      body: JSON.stringify({ password: "not asserted" }),
    },
  );
});

test("workspace next-up aggregate drives the recommended item rather than catalog order", () => {
  const items = [
    { slug: "first", title: "First" },
    { slug: "focused", title: "Focused" },
  ];
  assert.equal(recommendedNext(items, [{ slug: "focused" }])?.slug, "focused");
  assert.equal(recommendedNext(items, [])?.slug, "first");
});
