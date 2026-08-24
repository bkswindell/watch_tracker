import { useCallback, useEffect, useState } from "react";

import { api, type CatalogItem, type CatalogResponse } from "./api";

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

  const refreshCatalog = useCallback(async () => {
    const result = await api.catalog();
    setCatalog(result.data);
  }, []);

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
        if (data.authenticated)
          return refreshCatalog().catch((cause: unknown) =>
            setError(
              cause instanceof Error ? cause.message : "Unable to load catalog",
            ),
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
  }, [refreshCatalog]);

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
      await refreshCatalog();
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
