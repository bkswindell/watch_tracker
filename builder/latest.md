# Phase 1 builder status

**Checkpoint:** `a832a0dc3f6f86b807649ddd2dbc8f688dd0e67a` — `fix(security): bound login throttle state`

- **Delivered:** Per-client login-throttle bookkeeping is now bounded to 10,000 entries. Expired windows are pruned before admitting a new client and the oldest retained entry is evicted at capacity, preventing unbounded process-memory growth under distributed failed-login traffic. Existing five-attempt/15-minute throttling behavior is unchanged.
- **Validation:** focused auth/SQL suite passed (10 tests); `npm run check` passed (106 portable tests); deterministic build passed (25 artifacts); production audit found 0 vulnerabilities; production image `watch-tracker:verify` built successfully. The host-only PostgreSQL integration command correctly failed closed because `TEST_DATABASE_URL` is not supplied; isolated PostgreSQL integration remains required in CI.
- **Live:** only the app service was recreated from image `sha256:19f0a7c89eefacf20c3e84e04e9d633574301b2c952c9f2c0bc616b1ba3ae6ad`; the database container, volume, and credentials were unchanged. App and database are healthy; `http://10.18.0.201:3100/ready` returns ready.
- **Runtime proof:** the bounded-entry behavior is directly covered by a focused three-client regression test. The browser harness could not start because no supported Chromium-family browser is running; no deployment credential was accessed and no authenticated proof was fabricated.
- **Remote/CI:** Core implementation SHA `a832a0dc3f6f86b807649ddd2dbc8f688dd0e67a` and the progress/docs head `e8dc68dbce209d005e50c1dacb8b338b36866792` passed Validate Core run `32789911970`, including isolated PostgreSQL integration, migration identity, image scanning, SBOM, and Compose smoke. Template PR #10 remains green at `ec5bcc16517809acce74a1b876dc105c50f3f431`.
- **Remaining accepted auth gate:** host-controlled recovery. Provider and UX delivery details require the host delivery channel to be specified; do not access or change credentials to infer it.
- **Historical audit:** remains **FAIL** until host-controlled recovery and all accepted gates pass.
