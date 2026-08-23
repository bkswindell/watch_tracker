import assert from "node:assert/strict";
import test from "node:test";

import {
  WATCH_TRACKER_API_SERVICE,
  isApiHealthResponse,
} from "../packages/contracts/src/health.js";

test("shared API health contract accepts only the Watch Tracker identity shape", () => {
  assert.equal(
    isApiHealthResponse({
      status: "ok",
      service: WATCH_TRACKER_API_SERVICE,
      requestId: "req-1",
    }),
    true,
  );
  assert.equal(
    isApiHealthResponse({
      status: "ok",
      service: "another-service",
      requestId: "req-1",
    }),
    false,
  );
  assert.equal(
    isApiHealthResponse({
      status: "ok",
      service: WATCH_TRACKER_API_SERVICE,
    }),
    false,
  );
  assert.equal(isApiHealthResponse("<html>not the API</html>"), false);
});
