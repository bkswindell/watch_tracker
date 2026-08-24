import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("approved details sidecar remains statefully resizable", async () => {
  const source = await readFile("apps/web/src/App.tsx", "utf8");
  assert.match(source, /\[sidecarWidth, setSidecarWidth\] = useState\(390\)/);
  assert.match(source, /width=\{sidecarWidth\}/);
  assert.match(source, /onResize=\{setSidecarWidth\}/);
  assert.doesNotMatch(source, /onResize=\{\(\) => \{\}\}/);
});

test("Core loads the official XYFlow structural stylesheet", async () => {
  const source = await readFile("apps/web/src/main.tsx", "utf8");
  assert.match(source, /import "@xyflow\/react\/dist\/style\.css"/);
});

test("Focus Map refits settled top-level series bounds rather than child-local bounds", async () => {
  const source = await readFile("apps/web/src/FocusGraph.tsx", "utf8");
  assert.match(source, /flowInstance\.current = instance/);
  assert.match(source, /graph\.nodes\.filter\(\(node\) => !node\.parentId\)/);
  assert.match(source, /window\.setTimeout\(\(\) => \{/);
  assert.match(source, /instance\.fitBounds\(/);
  assert.doesNotMatch(source, /^\s+fitView$/m);
});

test("approved workspace grids use bounded Infinite Row Model datasources", async () => {
  const source = await readFile("apps/web/src/App.tsx", "utf8");
  assert.equal((source.match(/rowModelType="infinite"/g) || []).length, 3);
  assert.match(source, /datasource=\{catalogDatasource\}/);
  assert.match(source, /datasource=\{queueDatasource\}/);
  assert.match(source, /datasource=\{historyDatasource\}/);
  assert.match(
    source,
    /createInfiniteDatasource\(nextUp, \{ allowSort: false \}\)/,
  );
  assert.doesNotMatch(
    source,
    /rowData=\{filtered\}|rowData=\{items\}|rowData=\{history\}/,
  );
});
