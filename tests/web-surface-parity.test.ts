import * as assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = () => readFile("apps/web/src/App.tsx", "utf8");

test("Focus Map and workspace tables load on demand with accessible states", async () => {
  const app = await source();
  const grid = await readFile("apps/web/src/WatchTrackerGrid.tsx", "utf8");
  const styles = await readFile("apps/web/src/styles.css", "utf8");
  assert.match(
    app,
    /const FocusGraph = lazy\(\(\) => import\("\.\/FocusGraph"\)\)/,
  );
  assert.match(app, /<Suspense[\s\S]*Loading Focus Map…[\s\S]*<FocusGraph/);
  assert.match(
    app,
    /const WatchTrackerGrid = lazy\(\(\) => import\("\.\/WatchTrackerGrid"\)\)/,
  );
  assert.match(app, /Loading Catalog table…/);
  assert.match(app, /Loading Next Up table…/);
  assert.match(app, /Loading History table…/);
  assert.match(app, /role="status"/);
  assert.match(grid, /from "ag-grid-react"/);
  assert.match(grid, /ModuleRegistry\.registerModules/);
  assert.match(styles, /\.gridLoading/);
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

test("Next Up exports its visible deterministic queue rather than a placeholder", async () => {
  const app = await source();
  assert.match(app, /export function queueViewSnapshot/);
  assert.match(app, /filters,/);
  assert.match(app, /remainingMinutes: queue\.remainingMinutes/);
  assert.match(app, /queueViewSnapshot\(\s*filtered,/);
  assert.match(app, /link\.download = "watch-tracker-next-up\.json"/);
  assert.doesNotMatch(app, /onNotImplemented\("Save queue view"\)/);
});

test("App derives History cards from returned lifecycle records", async () => {
  const app = await source();
  assert.match(app, /function historySummary\(history\)/);
  assert.match(
    app,
    /export function historyVisibleRecords\(history, query, action\)/,
  );
  assert.match(
    app,
    /export function historyViewSnapshot\(history, filters = undefined\)/,
  );
  assert.match(app, /exportedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(app, /summary: historySummary\(history\)/);
  assert.match(
    app,
    /historyViewSnapshot\(visibleHistory, \{ query, action \}\)/,
  );
  assert.match(app, /aria-label="Search viewing history"/);
  assert.match(app, /aria-label="Filter history by activity"/);
  assert.match(app, /createInfiniteDatasource\(visibleHistory\)/);
  assert.match(app, /Watched duration/);
  assert.match(app, /Average rating/);
  assert.match(app, /Save view/);
  assert.match(app, /onCellContextMenu/);
});

test("Canon Pack presents unavailable evidence honestly", async () => {
  const app = await source();
  assert.match(app, /function packEvidence\(pack\)/);
  assert.match(app, /Unavailable from workspace API/);
  assert.match(app, /function PackVerificationModal/);
  assert.match(
    app,
    /onViewVerification=\{\(\) => setVerificationOpen\(true\)\}/,
  );
  assert.match(app, /Download summary/);
  assert.match(app, /does not re-run Pack validation/);
  assert.doesNotMatch(app, /onNotImplemented\("Verification viewer"\)/);
  assert.doesNotMatch(app, /<small>Loaded<\/small>/);
});

test("Canon Pack shows its validated contract rather than repeating release version", async () => {
  const app = await source();
  const frontendApi = await readFile("apps/web/src/api.ts", "utf8");
  assert.match(
    app,
    /pack\?\.contractVersion \|\| "Unavailable from workspace API"/,
  );
  assert.match(frontendApi, /export type WorkspacePack/);
  assert.match(frontendApi, /contractVersion: string/);
});

test("Canon Pack fixture import surface invokes the supported transactional flow", async () => {
  const app = await source();
  const styles = await readFile("apps/web/src/styles.css", "utf8");
  assert.match(
    app,
    /function PackPage\(\{ pack, onImport, onViewVerification \}\)/,
  );
  assert.match(app, /Validate the Phase 1 fixture/);
  assert.match(app, /Lantern Vale fixture release/);
  assert.match(app, /Validate and import fixture/);
  assert.match(app, /onClick=\{\(\) => void onImport\(\)\}/);
  assert.doesNotMatch(app, /onNotImplemented\("Canon Pack archive upload"\)/);
  assert.doesNotMatch(app, /\.zip · release artifacts only · Not Implemented/);
  assert.match(styles, /\.fixtureImportSummary/);
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

test("Catalog provides a filterable poster grid without replacing the bounded list", async () => {
  const app = await source();
  const styles = await readFile("apps/web/src/styles.css", "utf8");
  assert.match(
    app,
    /function CatalogPosterGrid\(\{[\s\S]*items,[\s\S]*query,[\s\S]*type,[\s\S]*series,[\s\S]*state,[\s\S]*onPick,[\s\S]*onClearFilters,[\s\S]*\}\)/,
  );
  assert.match(app, /aria-label="Catalog poster grid"/);
  assert.match(app, /catalogDisplay === "posters"/);
  assert.match(app, /setCatalogDisplay\("posters"\)/);
  assert.match(app, /items=\{items\}/);
  assert.match(app, /aria-label="Filter catalog by type"/);
  assert.match(app, /aria-label="Filter catalog by series"/);
  assert.match(app, /aria-label="Filter catalog by viewing state"/);
  assert.match(app, /const filteredCatalogItems = useMemo/);
  assert.match(app, /createInfiniteDatasource\(filteredCatalogItems/);
  assert.match(app, /type=\{catalogType\}/);
  assert.match(app, /series=\{catalogSeries\}/);
  assert.match(app, /state=\{catalogState\}/);
  assert.match(app, /onClearFilters=\{\(\) => \{/);
  assert.match(app, /catalogPosterSummary/);
  assert.match(app, /Clear filters/);
  assert.match(app, /rowModelType="infinite"/);
  assert.match(app, /function CatalogPosterArtwork\(\{ item \}\)/);
  assert.match(app, /onError=\{\(\) => setImageAvailable\(false\)\}/);
  assert.match(app, /artwork unavailable/);
  assert.match(app, /<CatalogPosterArtwork item=\{item\} \/>/);
  assert.match(styles, /\.catalogPosterGrid/);
  assert.match(styles, /\.catalogPosterSummary/);
  assert.match(styles, /aspect-ratio: 2 \/ 3/);
});

test("Catalog saves the same filtered, release-ordered view shown in either display", async () => {
  const app = await source();
  assert.match(app, /export function catalogVisibleItems/);
  assert.match(app, /export function catalogViewSnapshot/);
  assert.match(app, /catalogVisibleItems\(\s*items,\s*query,\s*catalogType,/);
  assert.match(app, /catalogViewSnapshot\(filteredCatalogItems,/);
  assert.match(app, /link\.download = "watch-tracker-catalog\.json"/);
  assert.match(app, /<button onClick=\{saveCatalogView\}>Save view<\/button>/);
  assert.match(app, /disabled=\{catalogDisplay !== "list"\}/);
});

test("Next Up hero recovers from unavailable approved artwork", async () => {
  const app = await source();
  const styles = await readFile("apps/web/src/styles.css", "utf8");
  assert.match(
    app,
    /const \[nextPosterAvailable, setNextPosterAvailable\] = useState\(true\)/,
  );
  assert.match(app, /setNextPosterAvailable\(Boolean\(next\?\.posterUrl\)\)/);
  assert.match(app, /onError=\{\(\) => setNextPosterAvailable\(false\)\}/);
  assert.match(app, /artwork unavailable/);
  assert.match(styles, /\.nextHeroPosterFallback/);
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
