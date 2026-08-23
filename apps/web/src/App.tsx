import { useEffect, useState } from "react";

import { isApiHealthResponse } from "../../../packages/contracts/src/health";

type ApiState = "checking" | "connected" | "unavailable";

const API_TIMEOUT_MS = 5_000;

const apiStatus: Record<ApiState, { label: string; detail: string }> = {
  checking: {
    label: "Checking API",
    detail: "Checking for the expected Watch Tracker API.",
  },
  connected: {
    label: "API connected",
    detail: "The expected Watch Tracker API is responding.",
  },
  unavailable: {
    label: "API unavailable",
    detail: "The expected service could not be confirmed. Try again shortly.",
  },
};

export default function App() {
  const [apiState, setApiState] = useState<ApiState>("checking");

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;
    let didTimeout = false;
    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, API_TIMEOUT_MS);

    async function checkApi() {
      try {
        const response = await fetch("/health", {
          headers: { accept: "application/json" },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("API health check failed");
        }

        const health: unknown = await response.json();

        if (didTimeout || !isApiHealthResponse(health)) {
          throw new Error("Unexpected API health response");
        }

        if (!isMounted) return;
        setApiState("connected");
      } catch {
        if (!isMounted) return;
        setApiState("unavailable");
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    void checkApi();
    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  const status = apiStatus[apiState];

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
        <section className="hero" aria-labelledby="page-title">
          <p className="eyebrow">Watch Tracker foundation</p>
          <h1 id="page-title">A focused watchlist is on the way.</h1>
          <p className="hero-copy">
            This runnable foundation checks its connection to the Watch Tracker
            API while watchlist features are being built.
          </p>
        </section>

        <section className="status-card" aria-labelledby="api-status-title">
          <div className="status-heading">
            <p className="card-label">System status</p>
            <h2 id="api-status-title">Watch Tracker API</h2>
          </div>

          <div
            className="status-region"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <p className="status-detail">{status.detail}</p>

            <p className={`status-pill status-pill--${apiState}`}>
              <span className="status-dot" aria-hidden="true" />
              {status.label}
            </p>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <p>Watch Tracker</p>
      </footer>
    </div>
  );
}
