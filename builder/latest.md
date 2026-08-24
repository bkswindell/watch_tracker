# Phase 1 builder status

**Checkpoint:** pending commit — `fix(security): align session cookie with idle lifetime`

- **Delivered:** The authentication cookie now has a 30-day `Max-Age`, exactly matching the enforced 30-day sliding idle session lifetime. It remains `HttpOnly`, `SameSite=Strict`, and path-scoped; the server-side immutable 90-day absolute expiry remains authoritative. This prevents the browser from silently discarding an otherwise-valid session after seven days.
- **Validation:** focused auth/SQL suite passed (9 tests); `npm run check` passed (105 portable tests); deterministic build passed (25 artifacts); production audit found 0 vulnerabilities; production image `watch-tracker:verify` built successfully. The host-only PostgreSQL integration command correctly failed closed because `TEST_DATABASE_URL` is not supplied; isolated PostgreSQL integration remains required in CI.
- **Live:** only the app service was recreated from image `sha256:04686d7d2b73e07455bc949079c59342ba7cba83021b113d1c47d3058bb79519`; the database container, volume, and credentials were unchanged. App and database are healthy; `http://10.18.0.201:3100/ready` returns ready.
- **Runtime proof:** API-level cookie issuance is covered by the focused authentication test without accessing a deployment credential. Authenticated browser proof remains unavailable because no deployment credential was accessed; no evidence was fabricated.
- **Remote/CI:** implementation and progress commits will be pushed and their remote SHA/Validate Core result recorded in the progress log before this checkpoint is reported complete.
- **Remaining accepted auth gate:** host-controlled recovery. Provider and UX delivery details require the host delivery channel to be specified; do not access or change credentials to infer it.
- **Historical audit:** remains **FAIL** until host-controlled recovery and all accepted gates pass.
