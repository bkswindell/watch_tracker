# Phase 1 builder status

**Checkpoint:** `671d54b01d5b53b178953724f8fc4e821db8e1d7` — green progress head for `fix(security): align session cookie idle lifetime`

- **Delivered:** The authentication cookie now has a 30-day `Max-Age`, exactly matching the enforced 30-day sliding idle session lifetime. It remains `HttpOnly`, `SameSite=Strict`, and path-scoped; the server-side immutable 90-day absolute expiry remains authoritative. This prevents the browser from silently discarding an otherwise-valid session after seven days.
- **Validation:** focused auth/SQL suite passed (9 tests); `npm run check` passed (105 portable tests); deterministic build passed (25 artifacts); production audit found 0 vulnerabilities; production image `watch-tracker:verify` built successfully. The host-only PostgreSQL integration command correctly failed closed because `TEST_DATABASE_URL` is not supplied; isolated PostgreSQL integration remains required in CI.
- **Live:** only the app service was recreated from image `sha256:04686d7d2b73e07455bc949079c59342ba7cba83021b113d1c47d3058bb79519`; the database container, volume, and credentials were unchanged. App and database are healthy; `http://10.18.0.201:3100/ready` returns ready.
- **Runtime proof:** API-level cookie issuance is covered by the focused authentication test without accessing a deployment credential. Authenticated browser proof remains unavailable because no deployment credential was accessed; no evidence was fabricated.
- **Independent verification:** the focused authentication/SQL set passed again (9/9). Credential-free live API proof rejected the opposite-scheme Origin with `403 csrf.invalid` and accepted the exact Origin through CSRF validation to the existing `409 setup.unavailable` guard.
- **Remote/CI:** Core progress head `671d54b01d5b53b178953724f8fc4e821db8e1d7` passed Validate Core run `32789245504`, including isolated PostgreSQL integration, image scan, SBOM, and Compose smoke. Core PR #4 is clean; Template PR #10 remains green at `ec5bcc16517809acce74a1b876dc105c50f3f431`.
- **Remaining accepted auth gate:** host-controlled recovery. Provider and UX delivery details require the host delivery channel to be specified; do not access or change credentials to infer it.
- **Historical audit:** remains **FAIL** until host-controlled recovery and all accepted gates pass.
