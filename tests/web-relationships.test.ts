import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { csvSafeValue, graphRelationship } from "../apps/web/src/App.js";

const appSource = readFileSync(
  new URL("../apps/web/src/App.tsx", import.meta.url),
  "utf8",
);

test("Catalog CSV export neutralizes spreadsheet formulas", () => {
  for (const value of ["=1+1", "+cmd", "-2+3", "@SUM(A1)", "  =1", "\t@x"])
    assert.equal(csvSafeValue(value), `'${value}`);
  assert.equal(csvSafeValue("Lantern Vale"), "Lantern Vale");
  assert.equal(csvSafeValue(42), 42);
  assert.match(
    appSource,
    /processCellCallback: \(\{ value \}\) => csvSafeValue\(value\)/,
  );
});

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

test("catalog detail dependency graph has accessible semantics and an explicit empty state", () => {
  assert.match(
    appSource,
    /<section\s+className="dependency-graph"\s+aria-labelledby="dependency-graph-title"\s+aria-describedby="dependency-graph-description"\s+role="region"\s*>/,
  );
  assert.match(
    appSource,
    /<h3 id="dependency-graph-title">\s*Dependency graph\s*<\/h3>/,
  );
  assert.match(
    appSource,
    /<p id="dependency-graph-description">\s*Directed relationships between this item and related catalog\s+items\.\s*<\/p>/,
  );
  assert.match(appSource, /className="graph-node"\s+role="img"/);
  assert.match(appSource, /className="graph-edge"\s+role="listitem"/);
  assert.match(
    appSource,
    /aria-label=\{`Relationship: \$\{relationship\.type\}; \$\{graph\.label\}`/,
  );
  assert.match(
    appSource,
    /<p className="empty-dependency-graph">\s*No dependencies or relationships to graph\.\s*<\/p>/,
  );
});

test("dependency graph reverses required-by edges and labels their direction", () => {
  assert.deepEqual(
    graphRelationship("Selected", {
      type: "optional-connection",
      direction: "required-by",
      referencedWatchable: {
        id: "referenced-id",
        slug: "referenced",
        title: "Referenced",
      },
      summary: "Referenced depends on Selected.",
    }),
    {
      source: "Referenced",
      destination: "Selected",
      label: "Referenced is required by Selected",
    },
  );
});

test("dependency graph maps normal requires edges from selected to referenced", () => {
  assert.deepEqual(
    graphRelationship("Selected", {
      type: "prerequisite",
      direction: "requires",
      referencedWatchable: {
        id: "referenced-id",
        slug: "referenced",
        title: "Referenced",
      },
      summary: "Selected requires Referenced.",
    }),
    {
      source: "Selected",
      destination: "Referenced",
      label: "Selected requires Referenced",
    },
  );
});
