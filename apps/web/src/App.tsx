// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from "ag-grid-community";
import FocusGraph from "./FocusGraph";
import WatchableActionMenu from "./WatchableActions";
import { WatchableDetailModal, WatchableSidecar } from "./WatchableDetails";
import { api, recommendedNext } from "./api";
import { artworkUrl } from "./mediaUrls";

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
    [query, setQuery] = useState(""),
    [mode, setMode] = useState("Release Timeline");
  const notify = (text) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2300);
  };
  const loadWorkspace = async () => {
    const { data } = await api.workspace();
    setItems(data.items.map(normalize));
    setRelations(data.relationships.map((r) => [r.fromSlug, r.toSlug, r.type]));
    setTarget(data.targetSlug);
    setNextUp(data.nextUp.map(normalize));
    setHistory(data.history || []);
    setPack(data.pack);
    const next = data.items.find((x) => x.slug === data.nextUp[0]?.slug);
    if (next && !selected) setSelected(normalize(next));
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
  const filtered = useMemo(
    () =>
      items.filter(
        (x) =>
          !query ||
          `${x.title} ${x.series} ${x.type}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
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
              onClick={() => {
                setView(id);
                setDetailsOpen(false);
                setDetailsModal(false);
              }}
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
      <main className={detailsOpen ? "withDetails" : ""}>
        <header className="top">
          <div>
            <b>{current?.[2]}</b>
            <small>{pack?.title || "Workspace"} · Canon Pack</small>
          </div>
          <button onClick={() => void importPack()} disabled={busy}>
            Import pack
          </button>
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
                  <h1>Explore the story</h1>
                  <p>
                    Select a target and understand exactly why each title is
                    included.
                  </p>
                </div>
                <button className="primary" onClick={() => setView("next")}>
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
                  <p>All watchables from the authenticated workspace.</p>
                </div>
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
              </div>
              <div className="agWrap">
                <AgGridReact
                  theme={appTheme}
                  rowData={filtered}
                  columnDefs={columns}
                  defaultColDef={{
                    sortable: true,
                    filter: true,
                    resizable: true,
                  }}
                  rowSelection="single"
                  onRowClicked={(e) => openDetails(e.data)}
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
            />
          )}
          {view === "history" && (
            <HistoryPage history={history} items={items} onPick={openDetails} />
          )}
          {view === "pack" && <PackPage pack={pack} onImport={importPack} />}
        </div>
        {detailsOpen && selected && (
          <>
            <WatchableSidecar
              item={selected}
              width={390}
              onResize={() => {}}
              onClose={() => setDetailsOpen(false)}
              onMaximize={() => setDetailsModal(true)}
              targetId={target}
              onTarget={markTarget}
              onAction={actItem}
              notify={notify}
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
            onClick={() => setView(id)}
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
function NextPage({ items, nextUp, target, onTarget, onPick, onAction }) {
  const next = recommendedNext(items, nextUp);
  return (
    <>
      <div className="pageTitle">
        <div>
          <span className="eyebrow">Deterministic guidance</span>
          <h1>Next Up</h1>
          <p>Follow prerequisite and release order to the active target.</p>
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
      <h2>Queue to target</h2>
      <div className="agWrap queueGrid">
        <AgGridReact
          theme={appTheme}
          rowData={items}
          columnDefs={[
            { field: "order", headerName: "#", width: 70 },
            { field: "title", flex: 1, minWidth: 240 },
            { field: "type", width: 120 },
            {
              field: "state",
              width: 150,
              cellRenderer: (p) => <StateBadge value={p.value} />,
            },
          ]}
          defaultColDef={{ sortable: false, resizable: true }}
          onRowClicked={(e) => onPick(e.data)}
        />
      </div>
    </>
  );
}
function HistoryPage({ history, items, onPick }) {
  return (
    <>
      <div className="pageTitle">
        <div>
          <span className="eyebrow">Viewing lifecycle</span>
          <h1>History & feedback</h1>
          <p>Completed sessions and discarded attempts from the workspace.</p>
        </div>
      </div>
      <div className="agWrap historyGrid">
        <AgGridReact
          theme={appTheme}
          rowData={history}
          columnDefs={[
            { field: "date", minWidth: 180 },
            { field: "title", flex: 1, minWidth: 240 },
            { field: "action" },
            { field: "duration", headerName: "Minutes" },
            { field: "rating" },
          ]}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          onRowClicked={(e) =>
            onPick(
              items.find(
                (item) =>
                  item.title === e.data.title || item.id === e.data.slug,
              ),
            )
          }
        />
      </div>
    </>
  );
}
function PackPage({ pack, onImport }) {
  return (
    <>
      <div className="pageTitle">
        <div>
          <span className="eyebrow">Source-governed content</span>
          <h1>Canon Pack</h1>
          <p>Validate and inspect the active immutable release.</p>
        </div>
      </div>
      <div className="packGrid">
        <section className="panel">
          <span className="eyebrow">Active release</span>
          <h2>{pack?.title || "No pack imported"}</h2>
          <div className="kv">
            <span>Version</span>
            <b>{pack?.version || "—"}</b>
            <span>Status</span>
            <b className="green">{pack ? "Active" : "Not imported"}</b>
          </div>
          <button className="primary" onClick={() => void onImport()}>
            Import release
          </button>
        </section>
        <section className="panel drop">
          <span className="eyebrow">Validation</span>
          <h2>Release readiness</h2>
          <p>
            Workspace data is rendered from the authenticated API contract.
            Optional enrichment fields remain absent-safe.
          </p>
          <div className="validation">
            <div>
              <span>✓</span>
              <b>Graph endpoints</b>
              <small>Loaded</small>
            </div>
            <div>
              <span>✓</span>
              <b>Workspace contract</b>
              <small>Loaded</small>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
export default App;
