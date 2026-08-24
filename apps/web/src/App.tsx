// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from "ag-grid-community";
import FocusGraph from "./FocusGraph";
import CatalogDialog from "./CatalogDialog";
import WatchableActionMenu from "./WatchableActions";
import { WatchableDetailModal, WatchableSidecar } from "./WatchableDetails";
import { api, recommendedNext } from "./api";
import type { CatalogAdditionInput } from "./api";
import { artworkUrl } from "./mediaUrls";
import { createInfiniteDatasource } from "./infiniteGrid";

ModuleRegistry.registerModules([AllCommunityModule]);
export function graphRelationship(selectedTitle, relationship) {
  const referencedTitle = relationship.referencedWatchable.title;
  const requiredBy = relationship.direction === "required-by";
  const source = requiredBy ? referencedTitle : selectedTitle;
  const destination = requiredBy ? selectedTitle : referencedTitle;
  return {
    source,
    destination,
    label: requiredBy
      ? `${source} is required by ${destination}`
      : `${source} requires ${destination}`,
  };
}
const appTheme = themeQuartz.withParams({
  accentColor: "#72e0b5",
  backgroundColor: "#101720",
  browserColorScheme: "dark",
  foregroundColor: "#edf3f9",
  headerBackgroundColor: "#151e29",
  headerTextColor: "#b8c5d4",
  oddRowBackgroundColor: "#121b25",
  rowHoverColor: "#1c2a38",
  borderColor: "#263445",
  wrapperBorderRadius: "12px",
});
const nav = [
  ["map", "⌘", "Focus Map"],
  ["catalog", "▦", "Catalog"],
  ["next", "→", "Next Up"],
  ["history", "↺", "History"],
  ["pack", "⬡", "Canon Pack"],
];
function normalize(item) {
  return {
    ...item,
    id: item.slug,
    type: item.type
      ? `${item.type.charAt(0).toUpperCase()}${item.type.slice(1)}`
      : item.type,
    order: item.releaseOrder,
    state:
      item.state === "watched"
        ? "Watched"
        : item.state === "in-progress"
          ? "In Progress"
          : "Not Started",
    series: item.series || item.collection || item.type,
    release: item.release || item.releaseDate,
    runtime: item.runtime || item.duration,
    why: item.why || item.summary,
    poster: item.poster === true,
    posterUrl: item.posterUrl || item.poster_url,
  };
}
function normalizeAddition(item) {
  return {
    ...normalize({
      ...item,
      releaseOrder: Number.MAX_SAFE_INTEGER,
      release: item.releaseDate,
      state: "not-started",
      relationships: [],
    }),
    id: `addition-${item.id}`,
    additionId: item.id,
    personal: true,
    relationships: [],
  };
}
export function queuePresentation(nextUp) {
  const rows = nextUp.map((item, index) => ({
    ...item,
    position: index + 1,
    identity:
      item.identity ||
      `${item.series || item.type}${
        item.seasonNumber && item.episodeNumber
          ? ` S${String(item.seasonNumber).padStart(2, "0")}:E${String(item.episodeNumber).padStart(2, "0")}`
          : ""
      }`,
    queueStatus: item.blockingSummary
      ? "Blocked"
      : index === 0
        ? "Ready"
        : "Queued",
    reason:
      item.blockingSummary ||
      item.why ||
      (item.reason === "focus" ? "Active target" : "Ready to watch"),
  }));
  rows.remainingCount = rows.filter((item) => item.state !== "Watched").length;
  rows.remainingMinutes = rows
    .filter((item) => item.state !== "Watched")
    .reduce((total, item) => total + (Number(item.runtime) || 0), 0);
  return rows;
}
export function historySummary(history) {
  const completed = history.filter((item) => item.action === "completed");
  const ratings = completed
    .map((item) => Number(item.rating))
    .filter(Number.isFinite);
  return {
    completed: completed.length,
    watchedMinutes: completed.reduce(
      (total, item) => total + (Number(item.duration) || 0),
      0,
    ),
    averageRating: ratings.length
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : null,
    discarded: history.filter((item) => item.action === "discarded").length,
  };
}
export function packEvidence(pack) {
  return [
    {
      label: "Active release",
      value: pack ? `${pack.title} ${pack.version}` : "No active release",
      status: pack ? "available" : "unavailable",
    },
    {
      label: "Inventory",
      value:
        pack?.inventoryFileCount == null
          ? "Unavailable from workspace API"
          : `${pack.inventoryFileCount} files · ${pack.inventoryTotalBytes ?? "unknown"} bytes`,
      status: pack?.inventoryFileCount == null ? "unavailable" : "available",
    },
    {
      label: "Manifest",
      value: pack?.manifestSha256 || "Unavailable from workspace API",
      status: pack?.manifestSha256 ? "available" : "unavailable",
    },
    {
      label: "Checksums",
      value: pack?.checksumsSha256 || "Unavailable from workspace API",
      status: pack?.checksumsSha256 ? "available" : "unavailable",
    },
    {
      label: "Validation",
      value: pack?.verificationStatus || "Unavailable from workspace API",
      status:
        pack?.verificationStatus === "verified" ? "available" : "unavailable",
    },
  ];
}
function ErrorMessage({ message }) {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}
function StateBadge({ value }) {
  return value ? (
    <span className={`state ${value.toLowerCase().replace(" ", "-")}`}>
      {value}
    </span>
  ) : null;
}
function App() {
  const [screen, setScreen] = useState("loading"),
    [csrf, setCsrf] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(),
    [toast, setToast] = useState("");
  const [view, setView] = useState(
      () => new URLSearchParams(location.search).get("view") || "map",
    ),
    [items, setItems] = useState([]),
    [relations, setRelations] = useState([]),
    [target, setTarget] = useState(),
    [nextUp, setNextUp] = useState([]),
    [history, setHistory] = useState([]),
    [pack, setPack] = useState();
  const [selected, setSelected] = useState(),
    [detailsOpen, setDetailsOpen] = useState(false),
    [detailsModal, setDetailsModal] = useState(false),
    [sidecarWidth, setSidecarWidth] = useState(390),
    [query, setQuery] = useState(""),
    [mode, setMode] = useState("Release Timeline"),
    [gridApi, setGridApi] = useState(),
    [colsOpen, setColsOpen] = useState(false),
    [gridContextMenu, setGridContextMenu] = useState(),
    [catalogDialog, setCatalogDialog] = useState();
  const navigate = (nextView) => {
    setView(nextView);
    setDetailsOpen(false);
    setDetailsModal(false);
    setGridContextMenu(undefined);
  };
  const notify = (text) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2300);
  };
  const notImplemented = (feature) => notify(`${feature} · Not Implemented`);
  const loadWorkspace = async () => {
    const [{ data }, { data: additions }] = await Promise.all([
      api.workspace(),
      api.catalogAdditions(),
    ]);
    const packItems = data.items.map(normalize);
    const personalItems = additions.items.map(normalizeAddition);
    setItems([...packItems, ...personalItems]);
    setRelations(data.relationships.map((r) => [r.fromSlug, r.toSlug, r.type]));
    setTarget(data.targetSlug);
    setNextUp(data.nextUp.map(normalize));
    setHistory(
      (data.history || []).map((entry) => ({
        ...entry,
        date: entry.completedAt || entry.date,
        action: entry.action || "completed",
      })),
    );
    setPack(data.pack);
    const next =
      data.items.find((x) => x.slug === data.nextUp[0]?.slug) || data.items[0];
    if (next && !selected) {
      setSelected(normalize(next));
      setDetailsOpen(true);
    }
  };
  useEffect(() => {
    api
      .bootstrap()
      .then(({ data }) => {
        setCsrf(data.csrfToken);
        setScreen(
          data.authenticated ? "app" : data.setupRequired ? "setup" : "login",
        );
        if (data.authenticated) return loadWorkspace();
      })
      .catch((c) => {
        setError(c.message);
        setScreen("login");
      });
  }, []);
  async function perform(work) {
    setBusy(true);
    setError(undefined);
    try {
      await work();
    } catch (c) {
      setError(c instanceof Error ? c.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }
  const openDetails = (item) => {
    if (!item) return;
    setSelected(item);
    setDetailsOpen(true);
  };
  const openCatalog = (mode, item) =>
    setCatalogDialog({
      mode,
      draft: item
        ? {
            additionId: item.additionId,
            personal: item.personal,
            title: item.title,
            slug: item.slug,
            type: item.type.toLowerCase(),
            series: item.series,
            release: item.release || "",
            runtime: item.runtime || 30,
            summary: item.summary || "",
            aliases: (item.aliases || []).join(", "),
            why: item.why || "",
          }
        : {
            title: "",
            slug: "",
            type: "episode",
            series: "",
            release: "",
            runtime: 30,
            summary: "",
            aliases: "",
            why: "",
          },
    });
  const catalogInput = (draft): CatalogAdditionInput => ({
    slug: draft.slug.trim(),
    title: draft.title.trim(),
    type: draft.type,
    summary: draft.summary.trim(),
    releaseDate: draft.release,
    runtime: Number(draft.runtime),
    series: draft.series.trim(),
    aliases: draft.aliases
      .split(",")
      .map((alias) => alias.trim())
      .filter(Boolean),
    why: draft.why.trim(),
  });
  const saveCatalog = async (dialog) => {
    await perform(async () => {
      const input = catalogInput(dialog.draft);
      if (dialog.mode === "create") {
        await api.createCatalogAddition(input, csrf);
        notify(`${input.title} · added to your personal Catalog`);
      } else if (dialog.mode === "edit" && dialog.draft.additionId) {
        await api.updateCatalogAddition(dialog.draft.additionId, input, csrf);
        notify(`${input.title} · personal Catalog record saved`);
      } else if (dialog.mode === "delete" && dialog.draft.additionId) {
        await api.deleteCatalogAddition(dialog.draft.additionId, csrf);
        notify(`${dialog.draft.title} · removed from your personal Catalog`);
      } else {
        throw new Error("Canon Pack records are immutable");
      }
      setCatalogDialog(undefined);
      setSelected(undefined);
      await loadWorkspace();
      gridApi?.refreshInfiniteCache();
    });
  };
  const openGridMenu = (params, surface) => {
    if (!params.data || !params.event) return;
    params.event.preventDefault();
    setSelected(params.data);
    setGridContextMenu({
      item: params.data,
      surface,
      x: params.event.clientX,
      y: params.event.clientY,
    });
  };
  const markTarget = (item) =>
    perform(async () => {
      setTarget(item.id);
      await api.focus(item.id, csrf);
      await loadWorkspace();
      openDetails(item);
      notify(`${item.title} · active target`);
    });
  const actItem = (item, state) =>
    perform(async () => {
      const action =
        state === "In Progress"
          ? "start"
          : state === "Watched"
            ? "complete"
            : "discard";
      const updated = normalize((await api.action(item.id, action, csrf)).data);
      setSelected(updated);
      await loadWorkspace();
      notify(`${item.title} · ${state}`);
    });
  async function signIn(e) {
    e.preventDefault();
    await perform(async () => {
      const result = await api.login(password, csrf);
      const token = api.csrfFromLogin(result.response);
      if (!token) throw new Error("Sign-in did not provide a CSRF token");
      setCsrf(token);
      setPassword("");
      setScreen("app");
      await loadWorkspace();
    });
  }
  async function setup(e) {
    e.preventDefault();
    await perform(async () => {
      await api.setup(csrf);
      setScreen("login");
      notify("Setup complete. Sign in to continue.");
    });
  }
  async function importPack() {
    await perform(async () => {
      const result = await api.importPack(csrf);
      await loadWorkspace();
      notify(`${result.data.pack.title} ${result.data.pack.version} imported.`);
    });
  }
  // Keep the full workspace as the grid's immutable datasource snapshot. The
  // Infinite Row Model applies its own column filters and requests bounded
  // blocks, while this remains the approved all-column command search.
  const catalogDatasource = useMemo(
    () => createInfiniteDatasource(items, { quickFilter: query }),
    [items, query],
  );
  const columns = useMemo(
    () => [
      { field: "order", headerName: "#", width: 70 },
      { field: "title", headerName: "Title", minWidth: 240, flex: 1 },
      { field: "type", width: 120 },
      { field: "series", width: 180 },
      { field: "release", headerName: "First release", width: 145 },
      { field: "runtime", headerName: "Minutes", width: 110 },
      {
        field: "state",
        width: 140,
        cellRenderer: (p) => <StateBadge value={p.value} />,
      },
      {
        field: "rating",
        headerName: "Rating",
        width: 100,
        valueFormatter: (p) => (p.value == null ? "—" : `${p.value}/10`),
      },
    ],
    [],
  );
  if (screen === "loading")
    return <div className="loadingScreen">Loading Watch Tracker…</div>;
  if (screen === "setup" || screen === "login")
    return (
      <div className="authShell">
        <div className="authCard">
          <div className="logo">WT</div>
          <span className="eyebrow">Canon-aware viewing</span>
          <h1>
            {screen === "setup" ? "Set up Watch Tracker" : "Welcome back"}
          </h1>
          <p>
            {screen === "setup"
              ? "Complete local setup, then sign in with the administrator password."
              : "Sign in to open your workspace."}
          </p>
          <ErrorMessage message={error} />
          {screen === "setup" ? (
            <form onSubmit={setup}>
              <button className="primary" disabled={busy}>
                {busy ? "Setting up…" : "Complete setup"}
              </button>
            </form>
          ) : (
            <form onSubmit={signIn}>
              <label htmlFor="password">Administrator password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button className="primary" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  const current = nav.find((x) => x[0] === view);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">WT</div>
          <div>
            <b>Watch Tracker</b>
            <small>Canon-aware viewing</small>
          </div>
        </div>
        <nav>
          {nav.map(([id, icon, label]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              <span className="navIcon">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sideBottom">
          <span className="avatar">AD</span>
          <div>
            <b>Administrator</b>
            <small>Local session</small>
          </div>
        </div>
      </aside>
      <main
        className={detailsOpen ? "withDetails" : ""}
        style={{ "--detail-width": `${sidecarWidth}px` }}
      >
        <header className="top">
          <div>
            <b>{current?.[2]}</b>
            <small>{pack?.title || "Workspace"} · Canon Pack</small>
          </div>
          <div className="topActions">
            <span className="mockBadge">MVP · POSTGRESQL</span>
            <button onClick={() => void importPack()} disabled={busy}>
              Import pack
            </button>
          </div>
        </header>
        <div
          className={`page ${view === "map" ? "mapPage" : `fullPage ${view}Page`}`}
        >
          <ErrorMessage message={error} />
          {view === "map" && (
            <>
              <div className="pageTitle">
                <div>
                  <span className="eyebrow">Active Watch Focus</span>
                  <h1>The Lantern Vale story</h1>
                  <p>
                    Explore the dependency path, select a target, and understand
                    exactly why each title is included.
                  </p>
                </div>
                <button className="primary" onClick={() => navigate("next")}>
                  View Next Up →
                </button>
              </div>
              <FocusGraph
                items={items}
                relations={relations}
                target={target || items[0]?.id}
                nextUpId={nextUp[0]?.id}
                selectedId={selected?.id}
                onTarget={(id) => markTarget(items.find((x) => x.id === id))}
                mode={mode}
                onMode={setMode}
                onPick={openDetails}
                onViewingAction={actItem}
              />
            </>
          )}
          {view === "catalog" && (
            <>
              <div className="pageTitle">
                <div>
                  <span className="eyebrow">Browse active Pack</span>
                  <h1>Catalog</h1>
                  <p>
                    Browse and inspect every watchable in the active Canon Pack.
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => openCatalog("create")}
                >
                  ＋ Add watchable
                </button>
              </div>
              <div className="gridTools catalogCommands">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search all columns…"
                />
                <button
                  disabled={!selected}
                  onClick={() => openDetails(selected)}
                >
                  View details
                </button>
                <button
                  disabled={!selected?.personal}
                  title={
                    selected && !selected.personal
                      ? "Canon Pack records are immutable"
                      : undefined
                  }
                  onClick={() => openCatalog("edit", selected)}
                >
                  Edit personal record
                </button>
                <button
                  className="danger"
                  disabled={!selected?.personal}
                  title={
                    selected && !selected.personal
                      ? "Canon Pack records are immutable"
                      : undefined
                  }
                  onClick={() => openCatalog("delete", selected)}
                >
                  Delete personal record
                </button>
                <button onClick={() => setColsOpen(!colsOpen)}>
                  ⚙ Columns
                </button>
                <button
                  onClick={() => {
                    setQuery("");
                    gridApi?.setFilterModel(null);
                    gridApi?.refreshInfiniteCache();
                  }}
                >
                  Clear filters
                </button>
                <button
                  onClick={() =>
                    gridApi?.exportDataAsCsv({ fileName: "watch-tracker.csv" })
                  }
                >
                  Export CSV
                </button>
                {colsOpen && (
                  <div className="columnMenu">
                    {columns.map((column) => (
                      <label key={column.field}>
                        <input
                          type="checkbox"
                          defaultChecked
                          onChange={(e) =>
                            gridApi?.setColumnsVisible(
                              [column.field],
                              e.target.checked,
                            )
                          }
                        />
                        {column.headerName || column.field}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="agWrap">
                <AgGridReact
                  theme={appTheme}
                  rowModelType="infinite"
                  datasource={catalogDatasource}
                  cacheBlockSize={50}
                  maxBlocksInCache={4}
                  columnDefs={columns}
                  defaultColDef={{
                    sortable: true,
                    filter: true,
                    resizable: true,
                  }}
                  rowSelection="single"
                  onGridReady={(event) => setGridApi(event.api)}
                  onRowClicked={(e) => openDetails(e.data)}
                  preventDefaultOnContextMenu
                  onCellContextMenu={(params) =>
                    openGridMenu(params, "catalog")
                  }
                  getRowId={(p) => p.data.id}
                />
              </div>
            </>
          )}
          {view === "next" && (
            <NextPage
              items={items}
              nextUp={nextUp}
              target={target}
              onTarget={markTarget}
              onPick={openDetails}
              onAction={actItem}
              onNotImplemented={notImplemented}
            />
          )}
          {view === "history" && (
            <HistoryPage
              history={history}
              items={items}
              target={target}
              onTarget={markTarget}
              onPick={openDetails}
              onAction={actItem}
            />
          )}
          {view === "pack" && (
            <PackPage
              pack={pack}
              onImport={importPack}
              onNotImplemented={notImplemented}
            />
          )}
        </div>
        {detailsOpen && selected && (
          <>
            <WatchableSidecar
              item={selected}
              width={sidecarWidth}
              onResize={setSidecarWidth}
              onClose={() => setDetailsOpen(false)}
              onMaximize={() => setDetailsModal(true)}
              targetId={target}
              onTarget={markTarget}
              onAction={actItem}
              notify={notify}
              csrf={csrf}
            />
            <RelationshipSummary selected={selected} />
          </>
        )}
      </main>
      <nav className="mobileNav">
        {nav.map(([id, icon, label]) => (
          <button
            key={id}
            className={view === id ? "active" : ""}
            onClick={() => navigate(id)}
          >
            <span>{icon}</span>
            {label.replace("Focus ", "")}
          </button>
        ))}
      </nav>
      {detailsModal && selected && (
        <WatchableDetailModal
          item={selected}
          onClose={() => setDetailsModal(false)}
          targetId={target}
          onTarget={markTarget}
          onAction={actItem}
          notify={notify}
          csrf={csrf}
        />
      )}
      {catalogDialog && (
        <CatalogDialog
          dialog={catalogDialog}
          setDialog={setCatalogDialog}
          onSubmit={saveCatalog}
          busy={busy}
          error={error}
        />
      )}
      {gridContextMenu && (
        <WatchableActionMenu
          className={`gridContextMenu ${gridContextMenu.surface}ContextMenu`}
          item={gridContextMenu.item}
          targetId={target}
          onTarget={markTarget}
          onViewingAction={actItem}
          onInspect={openDetails}
          onClose={() => setGridContextMenu(undefined)}
          style={{ left: gridContextMenu.x, top: gridContextMenu.y }}
        />
      )}
      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
function RelationshipSummary({ selected }) {
  return (
    <section className="relationships" aria-labelledby="relationships-title">
      <h3 id="relationships-title">Prerequisites and relationships</h3>
      {selected.relationships.length > 0 ? (
        <ul>
          {selected.relationships.map((relationship) => (
            <li
              key={`${relationship.direction}-${relationship.referencedWatchable.id}`}
            >
              <strong>{relationship.type}</strong> ·{" "}
              {relationship.direction.replace("-", " ")} ·{" "}
              {relationship.referencedWatchable.title}
              <span>{relationship.summary}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-relationships">
          No prerequisites or relationships recorded.
        </p>
      )}
      <section
        className="dependency-graph"
        aria-labelledby="dependency-graph-title"
        aria-describedby="dependency-graph-description"
        role="region"
      >
        <h3 id="dependency-graph-title">Dependency graph</h3>
        <p id="dependency-graph-description">
          Directed relationships between this item and related catalog items.
        </p>
        {selected.relationships.length > 0 ? (
          <div className="graph-edges" role="list">
            {selected.relationships.map((relationship) => {
              const graph = graphRelationship(selected.title, relationship);
              return (
                <div
                  className="graph-edge"
                  role="listitem"
                  key={`graph-${relationship.direction}-${relationship.referencedWatchable.id}`}
                  aria-label={`Relationship: ${relationship.type}; ${graph.label}`}
                >
                  <span className="graph-node" role="img">
                    {graph.source}
                  </span>
                  <span className="graph-arrow" aria-hidden="true">
                    →
                  </span>
                  <span className="graph-node" role="img">
                    {graph.destination}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="empty-dependency-graph">
            No dependencies or relationships to graph.
          </p>
        )}
      </section>
    </section>
  );
}
function NextPage({
  items,
  nextUp,
  target,
  onTarget,
  onPick,
  onAction,
  onNotImplemented,
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [state, setState] = useState("All");
  const [queueState, setQueueState] = useState("All");
  const [hideWatched, setHideWatched] = useState(false);
  const [context, setContext] = useState();
  const queue = useMemo(() => queuePresentation(nextUp), [nextUp]);
  const filtered = useMemo(
    () =>
      queue.filter(
        (item) =>
          (!query ||
            Object.values(item).some((value) =>
              String(value ?? "")
                .toLowerCase()
                .includes(query.toLowerCase()),
            )) &&
          (type === "All" || item.type === type) &&
          (state === "All" || item.state === state) &&
          (queueState === "All" || item.queueStatus === queueState) &&
          (!hideWatched || item.state !== "Watched"),
      ),
    [queue, query, type, state, queueState, hideWatched],
  );
  const queueDatasource = useMemo(
    () => createInfiniteDatasource(filtered, { allowSort: false }),
    [filtered],
  );
  const next = recommendedNext(items, nextUp);
  const targetItem = items.find((item) => item.id === target);
  const types = [...new Set(queue.map((item) => item.type))];
  return (
    <>
      <div className="pageTitle">
        <div>
          <span className="eyebrow">Deterministic guidance</span>
          <h1>Next Up</h1>
          <p>
            Ranked from your Focus, target, prerequisites, viewing state,
            release order, and Series Momentum.
          </p>
        </div>
      </div>
      {next && (
        <div
          className={`nextHero ${next.posterUrl || next.poster ? "hasPoster" : "noPoster"}`}
        >
          {next.posterUrl ? (
            <img
              className="nextHeroPoster"
              src={artworkUrl(next.posterUrl)}
              alt={`${next.title} poster`}
            />
          ) : next.poster ? (
            <div
              className="poster"
              aria-label={`Generated poster for ${next.title}`}
            >
              ✦
            </div>
          ) : null}
          <div>
            <span className="eyebrow">Recommended next</span>
            <h2>{next.title}</h2>
            <p>{next.why}</p>
            <small>
              Queue #{queue.findIndex((item) => item.id === next.id) + 1} ·{" "}
              {next.runtime} min · {queue.remainingCount} remaining
            </small>
            <div className="actions">
              <button
                className="primary"
                onClick={() => onAction(next, "In Progress")}
              >
                Start watching
              </button>
              <button onClick={() => onPick(next)}>Inspect details</button>
              <button onClick={() => onTarget(next)}>Set target</button>
            </div>
          </div>
        </div>
      )}
      <h2>Why this order?</h2>
      <div className="reasonGrid">
        <div>
          <b>✓ Eligibility</b>
          <p>Required and sequence prerequisites are evaluated.</p>
        </div>
        <div>
          <b>◎ Target path</b>
          <p>
            Only the dependency closure leading to the active target is queued.
          </p>
        </div>
        <div>
          <b>↗ Progress</b>
          <p>
            Completed titles remain visible while the first eligible title
            advances.
          </p>
        </div>
        <div>
          <b>≡ Tie-break</b>
          <p>
            Pack order resolves equally eligible branches deterministically.
          </p>
        </div>
      </div>
      <div className="queueHeading">
        <div>
          <span className="eyebrow">Active Focus playlist</span>
          <h2>Queue to {targetItem?.title || "target"}</h2>
        </div>
        <b>
          {queue.remainingCount} remaining · {queue.remainingMinutes} min
        </b>
      </div>
      <div className="gridTools queueFilters">
        <label>
          Watch target
          <select
            value={target || ""}
            onChange={(event) =>
              onTarget(items.find((item) => item.id === event.target.value))
            }
          >
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Title, Series, type…"
        />
        <select value={type} onChange={(event) => setType(event.target.value)}>
          <option>All</option>
          {types.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          value={state}
          onChange={(event) => setState(event.target.value)}
        >
          <option>All</option>
          <option>Not Started</option>
          <option>In Progress</option>
          <option>Watched</option>
        </select>
        <select
          value={queueState}
          onChange={(event) => setQueueState(event.target.value)}
          aria-label="Queue status"
        >
          <option>All</option>
          <option>Ready</option>
          <option>Queued</option>
          <option>Blocked</option>
        </select>
        <label className="checkFilter">
          <input
            type="checkbox"
            checked={hideWatched}
            onChange={(event) => setHideWatched(event.target.checked)}
          />
          Hide watched
        </label>
        <button
          onClick={() => {
            setQuery("");
            setType("All");
            setState("All");
            setQueueState("All");
            setHideWatched(false);
          }}
        >
          Clear filters
        </button>
        <button onClick={() => onNotImplemented("Save queue view")}>
          Save view
        </button>
        <span>
          {filtered.length} of {queue.length}
        </span>
      </div>
      <div className="agWrap queueGrid">
        <AgGridReact
          theme={appTheme}
          rowModelType="infinite"
          datasource={queueDatasource}
          cacheBlockSize={50}
          maxBlocksInCache={4}
          columnDefs={[
            {
              checkboxSelection: true,
              headerCheckboxSelection: true,
              width: 52,
            },
            { field: "position", headerName: "#", width: 70 },
            {
              field: "title",
              headerName: "Queue to target",
              flex: 1,
              minWidth: 220,
            },
            {
              field: "identity",
              headerName: "Series / episode",
              minWidth: 190,
            },
            { field: "type", width: 110 },
            { field: "runtime", headerName: "Minutes", width: 105 },
            {
              field: "state",
              headerName: "Viewing",
              width: 140,
              cellRenderer: (p) => <StateBadge value={p.value} />,
            },
            { field: "queueStatus", headerName: "Queue status", width: 125 },
            {
              field: "reason",
              headerName: "Why / prerequisite",
              minWidth: 240,
            },
          ]}
          defaultColDef={{ sortable: false, filter: true, resizable: true }}
          rowSelection="multiple"
          onRowClicked={(event) => onPick(event.data)}
          preventDefaultOnContextMenu
          onCellContextMenu={(params) => {
            params.event?.preventDefault();
            if (params.data && params.event)
              setContext({
                item: params.data,
                x: params.event.clientX,
                y: params.event.clientY,
              });
          }}
        />
      </div>
      {context && (
        <WatchableActionMenu
          item={context.item}
          targetId={target}
          onTarget={onTarget}
          onViewingAction={onAction}
          onInspect={onPick}
          onClose={() => setContext(undefined)}
          style={{ left: context.x, top: context.y }}
        />
      )}
    </>
  );
}
function HistoryPage({ history, items, target, onTarget, onPick, onAction }) {
  const [context, setContext] = useState();
  const summary = useMemo(() => historySummary(history), [history]);
  const historyDatasource = useMemo(
    () => createInfiniteDatasource(history),
    [history],
  );
  const saveView = () => {
    const blob = new Blob([JSON.stringify(history, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "watch-tracker-history.json";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <>
      <div className="pageTitle">
        <div>
          <span className="eyebrow">Viewing lifecycle</span>
          <h1>History & feedback</h1>
          <p>
            Immutable sessions, discarded attempts, rewatches, ratings,
            favorites, notes, and “would rewatch.”
          </p>
        </div>
        <button onClick={saveView}>Save view</button>
      </div>
      <div className="summaryCards">
        <div>
          <b>{summary.completed}</b>
          <span>Completed</span>
        </div>
        <div>
          <b>
            {Math.floor(summary.watchedMinutes / 60)}h{" "}
            {summary.watchedMinutes % 60}m
          </b>
          <span>Watched duration</span>
        </div>
        <div>
          <b>
            {summary.averageRating == null
              ? "—"
              : summary.averageRating.toFixed(1)}
          </b>
          <span>Average rating</span>
        </div>
        <div>
          <b>{summary.discarded}</b>
          <span>Discarded</span>
        </div>
      </div>
      <div className="agWrap historyGrid">
        <AgGridReact
          theme={appTheme}
          rowModelType="infinite"
          datasource={historyDatasource}
          cacheBlockSize={50}
          maxBlocksInCache={4}
          columnDefs={[
            { field: "date", minWidth: 180 },
            { field: "title", flex: 1, minWidth: 240 },
            { field: "action" },
            { field: "duration", headerName: "Minutes" },
            { field: "rating" },
          ]}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          onRowClicked={(event) =>
            onPick(
              items.find(
                (item) =>
                  item.title === event.data.title ||
                  item.id === event.data.slug,
              ),
            )
          }
          preventDefaultOnContextMenu
          onCellContextMenu={(params) => {
            params.event?.preventDefault();
            const item = items.find(
              (candidate) =>
                candidate.title === params.data?.title ||
                candidate.id === params.data?.slug,
            );
            if (item && params.event)
              setContext({
                item,
                x: params.event.clientX,
                y: params.event.clientY,
              });
          }}
        />
      </div>
      {context && (
        <WatchableActionMenu
          item={context.item}
          targetId={target}
          onTarget={onTarget}
          onViewingAction={onAction}
          onInspect={onPick}
          onClose={() => setContext(undefined)}
          style={{ left: context.x, top: context.y }}
        />
      )}
    </>
  );
}
function PackPage({ pack, onImport, onNotImplemented }) {
  const evidence = packEvidence(pack);
  return (
    <>
      <div className="pageTitle">
        <div>
          <span className="eyebrow">Source-governed content</span>
          <h1>Canon Pack</h1>
          <p>
            Validate, import, activate, and inspect one immutable Pack release.
          </p>
        </div>
      </div>
      <div className="packGrid">
        <section className="panel">
          <span className="eyebrow">Active release</span>
          <h2>{pack?.title || "No pack imported"}</h2>
          <div className="kv">
            <span>Version</span>
            <b>{pack?.version || "—"}</b>
            <span>Contract</span>
            <b>{pack?.version || "—"}</b>
            <span>Watchables</span>
            <b>{pack?.watchableCount ?? "—"}</b>
            <span>Relationships</span>
            <b>{pack?.relationshipCount ?? "—"}</b>
            <span>Status</span>
            <b className={pack ? "green" : ""}>
              {pack ? "Active" : "Not imported"}
            </b>
            <span>Manifest</span>
            <b title={pack?.manifestSha256}>
              {pack?.manifestSha256?.slice(0, 12) || "—"}
            </b>
            <span>Checksums</span>
            <b title={pack?.checksumsSha256}>
              {pack?.checksumsSha256?.slice(0, 12) || "—"}
            </b>
          </div>
          <button className="primary" onClick={() => void onImport()}>
            Import release
          </button>
          <button onClick={() => onNotImplemented("Verification viewer")}>
            View verification
          </button>
        </section>
        <section className="panel drop">
          <span className="eyebrow">Transactional import</span>
          <h2>Import a release artifact</h2>
          <p>
            Choose a Canon Pack archive. Nothing activates until schema,
            checksum, identity, provenance, compatibility, and graph validation
            pass.
          </p>
          <button
            className="dropzone"
            onClick={() => onNotImplemented("Canon Pack archive upload")}
          >
            <span>⬆</span>
            <b>Choose Canon Pack archive</b>
            <small>.zip · release artifacts only · Not Implemented</small>
          </button>
          <button className="primary" onClick={() => void onImport()}>
            Run validation
          </button>
        </section>
      </div>
      <h2>Validation report</h2>
      <div className="validation report">
        {evidence.slice(1).map((entry) => (
          <div key={`report-${entry.label}`}>
            <span>{entry.status === "available" ? "✓" : "—"}</span>
            <b>{entry.label}</b>
            <small>
              {entry.status === "available" ? "Reported" : "Unavailable"}
            </small>
          </div>
        ))}
      </div>
    </>
  );
}
export default App;
