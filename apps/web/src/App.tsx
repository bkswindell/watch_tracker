import { useCallback, useEffect, useMemo, useState } from "react";

import {
  api,
  type CatalogItem,
  type CatalogResponse,
  type CatalogRelationship,
} from "./api.js";
import { createLatestCatalogRequest } from "./catalog-refresh.js";

export function graphRelationship(
  selectedTitle: string,
  relationship: CatalogRelationship,
) {
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

type Screen = "loading" | "setup" | "login" | "catalog";

function ErrorMessage({ message }: { message: string | undefined }) {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [csrf, setCsrf] = useState("");
  const [catalog, setCatalog] = useState<CatalogResponse>({ items: [] });
  const [selected, setSelected] = useState<CatalogItem | undefined>();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);

  const catalogRequest = useMemo(
    () =>
      createLatestCatalogRequest(
        (filters) => api.catalog(filters),
        (result) => {
          setCatalog(result.data);
          setAvailableTypes((knownTypes) => [
            ...new Set([
              ...knownTypes,
              ...result.data.items.map((item) => item.type),
            ]),
          ]);
        },
      ),
    [],
  );
  const refreshCatalog = useCallback(
    () => catalogRequest({ search, type }),
    [catalogRequest, search, type],
  );

  const loadedTypes = [
    ...new Set([...availableTypes, ...(type ? [type] : [])]),
  ];

  useEffect(() => {
    void api
      .bootstrap()
      .then(({ data }) => {
        setCsrf(data.csrfToken);
        setScreen(
          data.authenticated
            ? "catalog"
            : data.setupRequired
              ? "setup"
              : "login",
        );
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to connect to Watch Tracker",
        );
        setScreen("login");
      });
  }, []);

  useEffect(() => {
    if (screen !== "catalog") return;
    void refreshCatalog().catch((cause: unknown) =>
      setError(
        cause instanceof Error ? cause.message : "Unable to load catalog",
      ),
    );
  }, [refreshCatalog, screen]);

  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function completeSetup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform(async () => {
      await api.setup(csrf);
      setNotice("Setup complete. Sign in to continue.");
      setScreen("login");
    });
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform(async () => {
      const result = await api.login(password, csrf);
      const token = api.csrfFromLogin(result.response);
      if (!token) throw new Error("Sign-in did not provide a CSRF token");
      setCsrf(token);
      setPassword("");
      setScreen("catalog");
    });
  }

  async function importPack() {
    await perform(async () => {
      const result = await api.importPack(csrf);
      await refreshCatalog();
      setNotice(
        `${result.data.pack.title} ${result.data.pack.version} imported.`,
      );
    });
  }

  async function openItem(item: CatalogItem) {
    await perform(async () => {
      setSelected((await api.item(item.slug)).data);
    });
  }

  async function chooseFocus(slug: string) {
    await perform(async () => {
      await api.focus(slug, csrf);
      await refreshCatalog();
      setNotice("Watch Focus updated.");
    });
  }

  async function viewingAction(
    action: "start" | "complete" | "discard" | "repeat",
  ) {
    if (!selected) return;
    await perform(async () => {
      const item = (await api.action(selected.slug, action, csrf)).data;
      setSelected(item);
      await refreshCatalog();
    });
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Watch Tracker home">
          <span className="brand-mark" aria-hidden="true">
            W
          </span>
          <span>Watch Tracker</span>
        </a>
      </header>
      <main className="main-content">
        <p className="eyebrow">Lantern Vale / personal catalog</p>
        <h1>Choose what comes next.</h1>
        <ErrorMessage message={error} />
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {screen === "loading" && <p role="status">Loading your tracker…</p>}
        {screen === "setup" && (
          <section className="panel" aria-labelledby="setup-title">
            <h2 id="setup-title">Set up Watch Tracker</h2>
            <p>
              Complete the local setup, then sign in with the administrator
              password.
            </p>
            <form onSubmit={completeSetup}>
              <button disabled={busy} type="submit">
                {busy ? "Setting up…" : "Complete setup"}
              </button>
            </form>
          </section>
        )}
        {screen === "login" && (
          <section className="panel" aria-labelledby="login-title">
            <h2 id="login-title">Sign in</h2>
            <form onSubmit={signIn}>
              <label htmlFor="password">Administrator password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button disabled={busy} type="submit">
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </section>
        )}
        {screen === "catalog" && (
          <>
            <div className="toolbar">
              <div
                className="catalog-filters"
                role="group"
                aria-label="Catalog filters"
              >
                <label htmlFor="catalog-search">Search catalog</label>
                <input
                  id="catalog-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <label htmlFor="catalog-type">Type</label>
                <select
                  id="catalog-type"
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  <option value="">All types</option>
                  {loadedTypes.map((itemType) => (
                    <option key={itemType} value={itemType}>
                      {itemType}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void importPack()}
                disabled={busy}
              >
                Import Lantern Vale
              </button>
              {catalog.nextUp && (
                <p className="next-up">
                  <strong>Next Up:</strong> {catalog.nextUp.title}
                </p>
              )}
            </div>
            {selected ? (
              <section className="panel detail" aria-labelledby="detail-title">
                <button
                  className="back-button"
                  type="button"
                  onClick={() => setSelected(undefined)}
                >
                  ← Back to catalog
                </button>
                <p className="eyebrow">
                  {selected.type} · {selected.state}
                </p>
                <h2 id="detail-title">{selected.title}</h2>
                <p>{selected.summary}</p>
                <section
                  className="relationships"
                  aria-labelledby="relationships-title"
                >
                  <h3 id="relationships-title">
                    Prerequisites and relationships
                  </h3>
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
                </section>
                <section
                  className="dependency-graph"
                  aria-labelledby="dependency-graph-title"
                  aria-describedby="dependency-graph-description"
                  role="region"
                >
                  <h3 id="dependency-graph-title">Dependency graph</h3>
                  <p id="dependency-graph-description">
                    Directed relationships between this item and related catalog
                    items.
                  </p>
                  {selected.relationships.length > 0 ? (
                    <div className="graph-edges" role="list">
                      {selected.relationships.map((relationship) => {
                        const graph = graphRelationship(
                          selected.title,
                          relationship,
                        );
                        return (
                          <div
                            className="graph-edge"
                            role="listitem"
                            key={`graph-${relationship.direction}-${relationship.referencedWatchable.id}`}
                            aria-label={`Relationship: ${relationship.type}; ${graph.label}`}
                          >
                            <span
                              className="graph-node"
                              role="img"
                              aria-label={`Node: ${graph.source}`}
                            >
                              {graph.source}
                            </span>
                            <span className="graph-arrow" aria-hidden="true">
                              →
                            </span>
                            <span
                              className="graph-node"
                              role="img"
                              aria-label={`Node: ${graph.destination}`}
                            >
                              {graph.destination}
                            </span>
                            <span className="graph-edge-label">
                              {relationship.type} · {graph.label}
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
                <div className="actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void viewingAction("start")}
                  >
                    Start
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void viewingAction("complete")}
                  >
                    Complete
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void viewingAction("discard")}
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void viewingAction("repeat")}
                  >
                    Repeat
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void chooseFocus(selected.slug)}
                  >
                    Set Watch Focus
                  </button>
                </div>
              </section>
            ) : (
              <section aria-labelledby="catalog-title">
                <h2 id="catalog-title" className="sr-only">
                  Catalog
                </h2>
                <div className="catalog-grid">
                  {catalog.items.map((item) => (
                    <article className="catalog-card" key={item.slug}>
                      <button type="button" onClick={() => void openItem(item)}>
                        <span className="card-type">{item.type}</span>
                        <h2>{item.title}</h2>
                        <p>{item.summary}</p>
                        <span className={`state state--${item.state}`}>
                          {item.state.replace("-", " ")}
                        </span>
                      </button>
                      <button
                        className="focus-button"
                        type="button"
                        onClick={() => void chooseFocus(item.slug)}
                      >
                        Set Watch Focus
                      </button>
                    </article>
                  ))}
                </div>
                {catalog.items.length === 0 && (
                  <p className="panel">
                    No catalog items yet. Import Lantern Vale to begin.
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </main>
      <footer className="site-footer">
        <p>Watch Tracker</p>
      </footer>
    </div>
  );
}
