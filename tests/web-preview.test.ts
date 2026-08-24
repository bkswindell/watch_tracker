import assert from "node:assert/strict";
import { test } from "node:test";

import { requestOptions } from "../apps/web/src/api.js";

test("browser API requests keep same-origin credentials and protect unsafe calls with CSRF", () => {
  assert.deepEqual(requestOptions("GET"), { credentials: "same-origin" });
  assert.deepEqual(
    requestOptions("POST", "csrf-123", { password: "not asserted" }),
    {
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": "csrf-123",
      },
      body: JSON.stringify({ password: "not asserted" }),
    },
  );
});
