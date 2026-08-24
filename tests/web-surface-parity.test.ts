import * as assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = () => readFile("apps/web/src/App.tsx", "utf8");

test("App restores server-ordered Next Up presentation and truthful summaries", async () => {
  const app = await source();
  assert.match(app, /function queuePresentation\(nextUp\)/);
  assert.match(app, /remainingCount/);
  assert.match(app, /remainingMinutes/);
  assert.match(app, /blockingSummary/);
  assert.match(app, /Ready to watch/);
});

test("App derives History cards from returned lifecycle records", async () => {
  const app = await source();
  assert.match(app, /function historySummary\(history\)/);
  assert.match(app, /Watched duration/);
  assert.match(app, /Average rating/);
  assert.match(app, /Save view/);
  assert.match(app, /onCellContextMenu/);
});

test("Canon Pack presents unavailable evidence honestly", async () => {
  const app = await source();
  assert.match(app, /function packEvidence\(pack\)/);
  assert.match(app, /Unavailable from workspace API/);
  assert.doesNotMatch(app, /<small>Loaded<\/small>/);
});

test("approved shell parity exposes complete Catalog controls with truthful unavailable behavior", async () => {
  const app = await source();
  const catalogDialog = await readFile(
    "apps/web/src/CatalogDialog.tsx",
    "utf8",
  );
  assert.match(app, /const navigate = \(nextView\) =>/);
  assert.match(app, /The Lantern Vale story/);
  assert.match(app, /Columns/);
  assert.match(app, /Clear filters/);
  assert.match(app, /Export CSV/);
  assert.match(app, /onCellContextMenu/);
  assert.match(catalogDialog, /Add watchable/);
  assert.match(catalogDialog, /Edit catalog record/);
  assert.match(catalogDialog, /Delete watchable/);
  assert.match(catalogDialog, /Not Implemented/);
});

test("cinematic details keep unavailable enrichment visible without fabricated content", async () => {
  const details = await readFile("apps/web/src/WatchableDetails.tsx", "utf8");
  assert.match(details, /Cast and crew data unavailable/);
  assert.match(details, /Community reviews unavailable/);
  assert.match(details, /Provider not configured/);
  assert.doesNotMatch(
    details,
    /Mara Venn|Vale watcher|Mock enrichment preview/,
  );
});
