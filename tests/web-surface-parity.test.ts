import * as assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = () => readFile("apps/web/src/App.tsx", "utf8");

test("Focus Map is loaded on demand with an accessible loading state", async () => {
  const app = await source();
  assert.match(
    app,
    /const FocusGraph = lazy\(\(\) => import\("\.\/FocusGraph"\)\)/,
  );
  assert.match(app, /<Suspense[\s\S]*Loading Focus Map…[\s\S]*<FocusGraph/);
  assert.match(app, /role="status"/);
});

test("workspace navigation has shareable routes and restores browser history", async () => {
  const app = await source();
  assert.match(app, /export function workspaceViewFromLocation/);
  assert.match(app, /viewIds\.has\(requested\) \? requested : "map"/);
  assert.match(app, /url\.searchParams\.set\("view", view\)/);
  assert.match(app, /window\.history\.pushState\(\s*\{ view: nextView \}/);
  assert.match(
    app,
    /window\.addEventListener\("popstate", restoreWorkspaceView\)/,
  );
  assert.match(app, /setDetailsOpen\(false\)/);
});

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

test("Catalog CRUD connects personal records while preserving Canon Pack immutability", async () => {
  const app = await source();
  const catalogDialog = await readFile(
    "apps/web/src/CatalogDialog.tsx",
    "utf8",
  );
  const frontendApi = await readFile("apps/web/src/api.ts", "utf8");
  assert.match(app, /api\.catalogAdditions\(\)/);
  assert.match(app, /normalizeAddition/);
  assert.match(app, /api\.createCatalogAddition/);
  assert.match(app, /api\.updateCatalogAddition/);
  assert.match(app, /api\.deleteCatalogAddition/);
  assert.match(app, /Canon Pack records are immutable/);
  assert.match(app, /disabled=\{!selected\?\.personal\}/);
  assert.match(catalogDialog, /personal catalog record/);
  assert.doesNotMatch(catalogDialog, /Not Implemented/);
  assert.match(frontendApi, /"PUT" \| "DELETE"/);
  assert.match(frontendApi, /catalog-additions/);
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

test("Watched feedback controls use durable typed APIs and truthful gating", async () => {
  const details = await readFile("apps/web/src/WatchableDetails.tsx", "utf8");
  const frontendApi = await readFile("apps/web/src/api.ts", "utf8");
  assert.match(details, /\.feedback\(item\.id\)/);
  assert.match(details, /api\.saveFeedback/);
  assert.match(details, /authoritative state is Watched/);
  assert.match(details, /Loading personal feedback/);
  assert.match(
    details,
    /Array\.from\(\{ length: 10 \}, \(_, index\) => \(index \+ 1\) \/ 2\)/,
  );
  assert.match(details, /aria-label=\{`Rate \$\{rating\} out of 5`\}/);
  assert.match(details, /Clear rating/);
  assert.match(details, /saving \? "Saving…" : "Save feedback"/);
  assert.doesNotMatch(details, /Feedback saved in mockup/);
  assert.match(frontendApi, /WatchableFeedbackInput/);
  assert.match(frontendApi, /\/feedback`/);
});
