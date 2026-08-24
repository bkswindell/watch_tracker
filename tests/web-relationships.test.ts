import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const appSource = readFileSync(
  new URL("../apps/web/src/App.tsx", import.meta.url),
  "utf8",
);

test("catalog detail UI presents relationship lists and an explicit empty state", () => {
  assert.match(
    appSource,
    /<section\s+className="relationships"\s+aria-labelledby="relationships-title"\s*>/,
  );
  assert.match(
    appSource,
    /<h3 id="relationships-title">\s*Prerequisites and relationships\s*<\/h3>/,
  );
  assert.match(appSource, /selected\.relationships\.length\s*>\s*0/);
  assert.match(
    appSource,
    /<ul>\s*\{selected\.relationships\.map\(\(relationship\) => \(/,
  );
  assert.match(
    appSource,
    /<p className="empty-relationships">\s*No prerequisites or relationships recorded\.\s*<\/p>/,
  );
});
