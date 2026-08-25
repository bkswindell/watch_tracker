# Watch Tracker Phase 1 Status

## TL;DR

Autonomous execution is authorized. Milestones M0, M1, and M3 are complete. M2 remains in progress and is the next dependency-ready lane; its Canon Pack hostile-input, security, and determinism foundation is complete in the Template. The Core API, PostgreSQL migrations through `0.11` (with the live database intentionally retained at `0.10` pending additive migration), one-shot migration, health/readiness, hardened Compose, responsive React shell, CI, image scanning, SBOM generation, and persistence verification are implemented. Setup, hardened authentication and host-admin recovery, Pack import, catalog behavior, viewing workflows, and authenticated prerequisite inspection are implemented in the current vertical slice.

## Authorization boundary

- Repositories: existing Core and Canon Pack Template only.
- Git: changes, versions, signed commits, pushes, reviewed PR merges, and releases are authorized.
- Deployment: local Docker instance on this host only for this pass.
- Excluded: new repositories, paid infrastructure, and remote/public deployment.

## Milestones

| Milestone | Status | Evidence | Blockers |
|---|---|---|---|
| M0 Durable plan and baselines | Complete | Plan/status commit `e32af8c`; draft PR #1; three independent planning reviews | None |
| M1 Reduced complete Phase 1 ERD | Complete | Reproducible 48-table/95-relationship/9-view model; DrawDB, DDB, and DBML validation; independent review passed | None |
| M2 Canon Pack contract 0.2.x | In progress | Declarative Watchable Types slice merged in Template PR #6 at `2df3818`; hostile-input foundation merged in PRs #7/#9 at `99a885e`/`f3212a8`; 61 tests and final CI passed | Accepted `0.2.1` structures, normalized 26-table release projection, independent verifier, full Lantern Vale fixture, and contract ERD/docs/gates |
| M3 Core/PostgreSQL/Docker foundation | Complete | Core PR #1 merged as `c4a6a07`; PR CI `32658514890` and post-merge CI `32658626306` passed; 25/25 tests; deterministic build; hardened Compose; zero high/critical final-image findings; SBOM; persistence | None |
| M4 Setup/auth/import/activation | Complete (current slice) | Setup, Argon2id authentication/session protections, host-admin one-use recovery, validated Pack import, and activation are implemented and covered by the Core gate | Broader M2 contract closeout remains separate |
| M5 MVP UX and viewing loop | Complete (current slice) | Responsive workspace, Catalog, Focus Map, dependency inspection, viewing lifecycle, feedback, and persisted personal records are implemented and covered by the Core gate | M6 final browser matrix/closeout |
| M6 MVP deployed verification/release | In progress | Trusted-LAN app-only deployment is healthy; recovery invalid-token behavior and authenticated workspace were previously certified | Exact final browser matrix and overall Phase 1 audit |
| M7 Remaining accepted Phase 1 | Pending | ADR/requirements corpus exists | M6 |
| M8 Final Phase 1 closeout | Pending | — | M7 |

## Latest verified environment

- GitHub authentication: active `bkswindell` account with repository/workflow scopes.
- Docker client/server: 29.5.2.
- Docker Compose: 5.1.4.
- Disk free at preflight: approximately 59 GB.
- Core branch at start: `docs/phase-1-data-model` from `3bdbdd8`.
- Template at start: clean `main` at `6b15a0b6ed53b333238418b7ac56453fdfcbe6e2`.

## Progress log

### 2026-08-25 — Focus Map local-filter reset

- Added an explicit **Reset map filters** command for the Focus Map. It remains disabled at default state and restores local search, type/state, watched/beyond-target toggles, relationship selection, and collapsed Series groups in one action, while deliberately retaining the active target, Focus mode, manual layout, and durable viewing/Canon data.
- The focused surface regression asserts all reset boundaries and target preservation. `npm run check` passed **135 portable tests**; deterministic verification passed **29 artifacts**; production high-severity audit, Compose validation, and `git diff --check` passed. App-only deployment rebuilt `watch-tracker:verify`, recreated only `watch-tracker-lan-foundation-app-1`, reached healthy, and returned HTTP 200 from in-container `/ready`. Database `9167a92718aa2107daa710f998156cc6b4ed47d9e513828bbc70a13d172955d5` retained its `2026-08-24T16:08:34.899650189Z` creation time and healthy state. The cron browser harness cannot start a supported Chromium-family browser, so no browser certification is claimed. Core PR #4 validation is queued for this documentation update (the deployed implementation is `5f8ffcd7b6b2ca43b02c974ed134b1949b384e1a`); historical Phase 1 audit remains **FAIL** pending exact-final browser certification and broader closeout.

### 2026-08-25 — Focus Map broken-poster resilience

- Focus Map cards now replace an approved poster that fails to load with the established compact type-labelled unavailable-artwork treatment. The replacement resets for a changed node and preserves the dependency-first layout, target/Next Up distinction, dragging, and context actions without fabricating media or adding a persistence/API surface.
- A focused web-surface regression covers the failure recovery. `npm run check` passed **134 portable tests**; deterministic production verification passed **29 artifacts**; the production high-severity dependency audit, Compose validation, and `git diff --check` passed. Direct `npm run test:postgres` failed closed before connecting because `TEST_DATABASE_URL` is not configured.
- App-only deployment rebuilt `watch-tracker:phase1-focus-artwork` and recreated only `watch-tracker-lan-foundation-app-1`; its replacement reached `running healthy`. Database container `9167a92718aa2107daa710f998156cc6b4ed47d9e513828bbc70a13d172955d5` retained its creation time `2026-08-24T16:08:34.899650189Z` and healthy state. GitHub Validate Core run `32834048822` is green for exact implementation commit `d27a1518f1acfa5522e58fb435ce3391a43f2131`. A fresh browser-harness attempt could not start a supported Chromium-family browser, so no browser certification is claimed. Historical Phase 1 audit remains **FAIL** pending the exact-final browser matrix and broader closeout.

### 2026-08-25 — optional Focus target can return to the full timeline

- Added a compact **Clear target** command to the Focus Map title actions. It appears only with an active target and returns the workspace to its normal full Release Timeline without touching viewing activity or Canon data.
- The protected `DELETE /api/focus` route requires the existing authenticated exact-Origin/CSRF boundary. Memory and PostgreSQL stores both clear only the Focus selection; API coverage proves the workspace reports `targetSlug: null` after clearing, and the UI regression verifies the command and client contract.
- `npm run check` passed all 133 portable tests; deterministic verification passed 29 artifacts; `npm audit --omit=dev --audit-level=high`, Compose validation, and `git diff --check` passed. Direct `npm run test:postgres` failed closed before connection because `TEST_DATABASE_URL` is not configured. The local Docker daemon has no Watch Tracker stack, so no deployment action is claimed. No migration, credential, recovery token, volume, backup, user, or durable record has been changed by this source checkpoint. Historical Phase 1 audit remains **FAIL** pending the exact-final browser matrix and broader closeout.

### 2026-08-25 — per-client concurrent login verification gate

- Added a per-remote-address in-flight guard around the existing expensive credential verification. Concurrent attempts from the same address now receive the existing generic throttle response rather than starting parallel Argon2id hashes; the guard releases in `finally`, so the original request's normal success/failure accounting is preserved. A deterministic regression proves a held first verification blocks a second one before it invokes the store.
- Focused auth coverage passed 12/12; complete `npm run check` passed 132 portable tests; deterministic production verification passed 29 artifacts; production and complete high-severity dependency audits, Compose validation, and `git diff --check` passed. Direct `npm run test:postgres` failed closed before connection because `TEST_DATABASE_URL` is not configured.
- App-only deployment rebuilt `watch-tracker:phase1-throttle` and recreated only `watch-tracker-lan-foundation-app-1`; the app is healthy on image `sha256:ba2f4c59d7b612f43ae2ff1424de662700f0f44ac94374aadf56710ee881cf82` and its in-container `/ready` returned HTTP 200. The retained PostgreSQL container is healthy and retains creation time `2026-08-24T16:08:34.899650189Z`. Exact Core PR #4 head `98a947b7cbd7da1aeac54cfbb0bb5980bf557f54` has queued Validate Core run `32831653292`. No migration, credential, recovery token, volume, backup, user, or durable record was changed. The cron browser harness cannot launch a supported Chromium-family browser, so no new browser certification is claimed. Historical Phase 1 audit remains **FAIL** pending the exact-final browser matrix and broader closeout.

### 2026-08-25 — recovery duplicate-submit guard

- The fragment-only recovery form now ignores a duplicate submit while its first completion request is in flight. This covers an Enter-key/scripted repeat before React can repaint the disabled action and avoids showing a false generic reused-token failure after an accepted first request. It does not change token format, API, password policy, persistence, or server atomicity.
- Focused recovery coverage passed 9/9; full `npm run check` passed 131 portable tests; deterministic production verification passed 29 artifacts; production and complete high-severity dependency audits, Compose validation, and `git diff --check` passed. The direct PostgreSQL suite failed closed before connecting because `TEST_DATABASE_URL` is not configured. Exact Core PR #4 head `ca69eaad6f8796444b53d1d8b756a09deebd8cc9` passed Validate Core run `32830582953`, including the isolated PostgreSQL/migration and Compose smoke gates.
- App-only deployment rebuilt `watch-tracker:phase1-ca69eaa` and recreated only `watch-tracker-lan-foundation-app-1`; it is healthy on image `sha256:538d04416e5cf20ac0e50233478e3be46563f7beca0f7568716c7951447bef89` and its in-container `/ready` returned HTTP 200. A cron browser attempt cannot start a supported Chromium-family browser, so no new browser certification is claimed. No migration, credential, recovery token, volume, backup, user, or durable record was changed. Historical Phase 1 audit remains **FAIL** pending the exact-final browser matrix and broader closeout.

### 2026-08-25 — recovery document no-referrer defense

- Added a document-level `no-referrer` meta policy to the reset shell. The server already sends `Referrer-Policy: no-referrer` and strips the fragment before React renders; this provides a pre-bootstrap defense for any navigation initiated while the fragment-only reset link is first loading. A focused regression protects the markup.
- Focused recovery coverage passed 9/9 and complete `npm run check` passed all 131 portable tests. Deterministic production verification passed 29 artifacts; production and complete high-severity dependency audits, Compose validation, and `git diff --check` passed. `npm run test:postgres` failed closed before connection because `TEST_DATABASE_URL` is not configured.
- GitHub Validate Core run `32829773816` is green at exact Core PR #4 head `d4066a67551f7ecb2a3f64db48874ab2efd1f809`, matching `origin/automation/phase1`; this includes the isolated PostgreSQL/migration identity gate. Template PR #10 remains open and green at `ec5bcc16517809acce74a1b876dc105c50f3f431`.
- App-only deployment rebuilt `watch-tracker:phase1-4feec1b` and recreated only `watch-tracker-lan-foundation-app-1`; it became healthy and its in-container `/ready` returned HTTP 200. Database container `9167a92718aa2107daa710f998156cc6b4ed47d9e513828bbc70a13d172955d5` retained its creation time and healthy state. The cron browser harness still cannot start a supported Chromium-family browser, so no new browser certification is claimed. Historical Phase 1 audit remains **FAIL** pending the exact-final browser matrix and broader closeout.

### 2026-08-25 — recovery completion sign-out clarification

- Successful recovery now clearly tells the administrator that the password change signs out all existing sessions before offering the normal sign-in continuation. It documents the actual server-side behavior without changing any recovery token, credential, migration, database, browser-storage, or logging behavior.
- Focused recovery coverage and the complete `npm run check` gate passed all 130 portable tests; deterministic production verification passed 29 artifacts; high-severity dependency audit, Compose validation, and `git diff --check` passed. `npm run test:postgres` failed closed before connection because `TEST_DATABASE_URL` is not configured.
- App-only deployment rebuilt `watch-tracker:phase1-9e78d16` and recreated only `watch-tracker-lan-foundation-app-1`; it is healthy and its in-container `/ready` returned HTTP 200. Database container `9167a92718aa2107daa710f998156cc6b4ed47d9e513828bbc70a13d172955d5` retained its creation time and healthy state. The cron browser harness cannot start a supported Chromium-family browser, so no new browser certification is claimed. Historical Phase 1 audit remains **FAIL** pending the exact-final browser matrix and broader closeout.

### 2026-08-25 — History filtered CSV export

- History now provides an **Export CSV** action alongside `Save view`. It serializes the exact current search/activity-filtered lifecycle projection with visible `date`, `title`, `action`, `duration`, and `rating` columns. Formula-leading values are neutralized before output and CSV punctuation is escaped, while the existing JSON envelope remains the format that carries timestamp, filters, and summary aggregates.
- The focused UI regression covers the filtered CSV command and source handling. Full `npm run check` passed 130 portable tests; deterministic production verification passed 29 artifacts; high-severity dependency audit, Compose validation, and `git diff --check` passed. The Vite oversized deferred-table advisory remains non-failing and unchanged.
- `npm run test:postgres` failed closed before connection because `TEST_DATABASE_URL` is not configured; no database, migration, credential, recovery token, volume, backup, user, or durable record was accessed or changed. An app-only deployment rebuilt `watch-tracker:phase1-7d5bf2e` and recreated only `watch-tracker-lan-foundation-app-1`; it became healthy and its in-container `/ready` returned HTTP 200. The retained database container was healthy and not recreated (creation time `2026-08-24T16:08:34.899650189Z`). Historical Phase 1 audit remains **FAIL** pending exact-final browser certification and broader closeout.

### 2026-08-25 — recovery form visibility control

- The approved fragment-only recovery page now has one explicit, accessible **Show passwords / Hide passwords** control for both new-password fields. It is a local React state toggle (`aria-pressed`), does not alter the token, request body, password policy, browser storage, referrer behavior, or recovery lifecycle, and defaults to concealed inputs.
- The focused recovery suite passed 8/8, including the existing token issuance, expiry, reuse, origin, no-store, no-referrer, session-revocation, and no-storage assertions plus the new visibility-control regression. Full `npm run check` passed 130 portable tests; deterministic production verification passed 29 artifacts; high-severity dependency audit, Compose validation, and `git diff --check` passed.
- Direct local PostgreSQL integration was intentionally not run against the trusted-LAN database because `TEST_DATABASE_URL` is not configured; the command failed closed before connecting. No recovery token, credential, migration, database, volume, backup, user, or durable record was changed. Historical Phase 1 audit remains **FAIL** pending exact-final browser certification and broader closeout.

### 2026-08-25 — current deployed Edge invalid-link browser proof

- Started an isolated headless Microsoft Edge `151.0.0.0` CDP session solely for live UI certification; no persisted browser profile, credential, reset link, migration, database, volume, backup, user, or durable record was read or changed. The deployed exact reset route rendered the generic **Password reset unavailable** state for an absent fragment, with no form and empty `localStorage`/`sessionStorage`.
- A separate fresh browser page used a synthetic, non-secret 43-character token. The client removed its fragment before rendering, retained no browser storage, submitted only to same-origin `/api/password-reset/complete`, received HTTP `400`, and rendered the generic **Password reset could not be completed** state. The captured API response included `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and the self-only CSP; the resource URL contained no token.
- This establishes fresh deployed Edge coverage for absent and invalid token behavior at the current app deployment. It does **not** certify a valid-token password change, expired token, reused token, or authenticated workspace without intentionally issuing recovery material or changing a credential. Those acceptance cases remain covered by the deterministic API/PostgreSQL suites; the historical Phase 1 audit remains **FAIL** pending the full exact-final browser matrix and broader closeout.

### 2026-08-25 — recovery acceptance verification checkpoint

- Re-reviewed the approved host-admin recovery gate at exact Core PR #4 head `8960d68d1420ea87a8653d9b8e724f813410f71d`: fragment-only 256-bit links, digest-only instance-bound persistence, 15-minute expiry invariant, atomic single-use/supersession, generic failures, Argon2id policy enforcement, and session revocation remain covered by the focused recovery suite.
- `npm run check` passed 130 portable tests; deterministic production verification passed 29 artifacts; high-severity dependency audit, Compose validation, and `git diff --check` passed. GitHub API verified this exact source SHA is the open PR #4 head and its Validate Core run `32825616570` is green, including the isolated PostgreSQL migration/recovery gate.
- A new browser-harness launch still cannot start a supported Chromium-family browser in this cron environment. Therefore no new authenticated, expired, reused, or invalid-token browser certification is claimed, and the historical Phase 1 audit remains **FAIL** pending that exact-final browser matrix and broader closeout. No credential, migration, database, volume, backup, user, or durable-record operation occurred.

### 2026-08-25 — deferred table runtime narrowed to used modules

- Replaced the broad AG Grid community-module registration with the three modules actually used by the Phase 1 Catalog, Next Up, and History tables: infinite rows, text filtering, and row selection. The table runtime remains deferred behind its existing accessible loading states, while unused editors, CSV, pagination, grouping, and client-side row-model code no longer ships with a table visit.
- The production `WatchTrackerGrid` chunk decreased from 1,108.96 kB (308.32 kB gzip) to 836.36 kB (234.67 kB gzip), a 272.60 kB / 73.65 kB gzip reduction. The bootstrap chunk and all functional table props are unchanged. A surface regression prevents accidental restoration of the broad module registration.
- `npm run check` passed 130 portable tests; deterministic production verification passed 29 artifacts; high-severity dependency audit, Compose validation, and `git diff --check` passed. Core PR #4 exact source head `b480d187d6c10bc0b2270d1b84891d3b1e2e411e` passed Validate Core run `32825379033`.
- App-only deployment rebuilt `watch-tracker:phase1-b480d18` and recreated only `watch-tracker-lan-foundation-app-1`; its in-container `/ready` returned HTTP 200. Database container `9167a92718aa2107daa710f998156cc6b4ed47d9e513828bbc70a13d172955d5` retained its creation time and healthy state. The current cron browser harness still cannot start a Chromium-family browser, so no new browser certification is claimed. No migration, credential, volume, backup, user, or durable-record operation occurred. Historical Phase 1 audit remains **FAIL** pending exact-final browser certification and broader closeout.

### 2026-08-25 — public recovery migration contract reconciled

- Corrected the remaining public architecture overview reference from schema `0.10` to the actual required `0.11` recovery schema. A portable regression now reads both public architecture documents so the README and architecture overview cannot silently diverge on the migration contract.
- Focused API-foundation coverage passed 11/11; `npm run check` passed 130 portable tests; deterministic production verification passed 29 artifacts; high-severity dependency audit, Compose validation, and `git diff --check` passed. No app, PostgreSQL, migration, credential, volume, backup, user, or durable-record operation occurred. Historical Phase 1 audit remains **FAIL** pending exact-final browser certification and broader closeout.

### 2026-08-25 — fixture import control wired to its supported Phase 1 flow

- Replaced the inert Canon Pack archive chooser (which referenced an out-of-scope handler) with an explicit Lantern Vale fixture validation/import control. The control now invokes the existing authenticated, CSRF-protected transactional fixture importer, while accurately stating that arbitrary archive selection is not part of this Phase 1 workflow.
- Added a focused UI regression covering the supported action and the removal of the inert archive path. Full source validation passed with 130 portable tests; deterministic production build passed with 29 artifacts; production dependency audit and Compose configuration validation passed.
- App-only deployment rebuilt Core `9388581` as `watch-tracker:phase1-9388581`; the published app is healthy and in-container `/ready` returned HTTP 200. Database container `9167a92718aa2107daa710f998156cc6b4ed47d9e513828bbc70a13d172955d5` retained its creation time and healthy status; no migration, credential, user, volume, backup, or durable-record operation occurred. The exact-head GitHub validation is queued; historical Phase 1 audit remains **FAIL** pending that result, exact-final browser certification, and broader closeout.

### 2026-08-25 — recovery expiry invariant deployed to the trusted-LAN slice

- Applied the additive `0.11_password-recovery-expiry-bound.sql` migration with the canonical one-shot Compose migrator against the existing trusted-LAN Watch Tracker database. The migrator reported `PASS migrations=11 schema=0.11 checksum=aec5909642507434c049621143a8573e88b7dc0982f6de4ac84b40b3453779bb`.
- Read-back verified the complete `0.01`–`0.11` migration ledger and the `password_reset_token_expiry_within_15_minutes` database constraint. No credential, user, volume, backup, or existing durable record was changed by the additive constraint migration.
- Built and performed an app-only deployment of Core head `d092c1b` as `watch-tracker:phase1-d092c1b`; the trusted-LAN app container is healthy and its loopback `/ready` endpoint returned Watch Tracker readiness JSON. The PostgreSQL container was not recreated.
- Source validation passed: `npm run check` (129 tests), deterministic production build (29 artifacts), and production dependency audit (0 vulnerabilities). The Chrome browser harness could not start in this cron environment, so an exact latest-head authenticated browser matrix remains unavailable; historical Phase 1 audit remains **FAIL** pending that certification and broader closeout.

### 2026-08-25 — Catalog portable filtered-view export

- Catalog list and Posters now share a single all-column-search, Type/Series/viewing-state-filtered, release-ordered projection. `Save view` downloads that exact projection as `watch-tracker-catalog.json`, including generation time, filter metadata, truthful total, and displayed records; it does not claim server-side saved-view persistence.
- The table-specific CSV export is intentionally disabled in Posters mode while the portable JSON export stays available in both modes. Focused surface coverage and the full `npm run check` gate passed 128 portable tests; deterministic production build passed with 29 artifacts. High-severity dependency audit and Compose configuration validation passed.
- No migration, database, credential, volume, OxyGen service, release, tag, or default-branch merge occurred. Browser certification remains unavailable in the cron harness; historical Phase 1 audit remains **FAIL**.

### 2026-08-25 — recovery expiry invariant CI-certified

- Additive migration `0.11_password-recovery-expiry-bound.sql` enforces `password_reset_token.expires_at <= created_at + INTERVAL '15 minutes'`; runtime identity verifies the named constraint and terminal schema version. This protects the approved host-admin recovery lifetime against a future persistence writer extending a stored token.
- Exact Core PR #4 head `8b061263e5053bf5ecd4d68b490aaf90769dc6f9` passed Validate Core run `32818274725`, including isolated PostgreSQL migration/recovery identity. The host's direct PostgreSQL test command intentionally fails closed because `TEST_DATABASE_URL` is unavailable, so no live database operation occurred.
- The live database remains schema `0.10`; `0.11` is deliberately not applied and the application is not redeployed until that additive migration is explicitly performed. Historical Phase 1 audit remains **FAIL** pending broader closeout and exact-final browser certification.

### 2026-08-23 — M0 started

- Confirmed full maintenance authority for existing repositories.
- Confirmed release authority.
- Corrected deployment scope to local Docker only.
- Loaded TDD, planning, subagent-development, and PR workflows.
- Dispatched parallel schema, implementation-graph, and security/deployment audits.
- Created durable autonomous build plan.

### 2026-08-23 — M0 completed / M1 started

- Committed and pushed the autonomous plan and status ledger as `e32af8c`.
- Opened Core draft PR #1.
- Scheduled bounded autonomous job `71d829624c72` for 16 half-hour cycles.
- Independent implementation review mapped all 39 Phase 1 functional requirements: 25 MVP and 14 Later Phase 1.
- Independent security/deployment review defined hard gates for authentication, hostile Pack input, migration backup, Compose, persistence, CI, dependencies, and Chromium/Firefox/WebKit/Edge evidence.
- Schema review completed its analysis at the timeout boundary and recommended 48 persisted tables (26 Canon, 12 mutable Core, 1 persisted projection, 9 operational) plus 9 derived views, a 54.3% reduction from the rejected model.
- Dispatched a narrow recovery worker to return the exact 48-table/9-view inventory without repeating the source audit.

### 2026-08-23 — M1 completed / M2 next

- Replaced the rejected 105-table direction with the reviewed 48-table budget: 26 immutable Canon, 12 mutable Core, 1 rebuildable projection, and 9 operational tables.
- Generated and synchronized the logical JSON, native DrawDB JSON, byte-identical DDB, DBML fallback, table budget, data dictionary, semantic ownership documentation, and checksum manifest.
- Verified 95 foreign-key relationships, including 90 many-to-one and 5 one-to-one cardinalities, plus 9 non-persisted derived views.
- Passed deterministic regeneration, Python compilation, checksum, DrawDB Generic, DDB, DBML, and Git diff gates.
- Corrected viewing lifecycle ownership, optional per-session feedback, First Public Release Region/note seams, relationship cardinalities, and generator source-of-truth documentation during independent review.
- Final independent re-review passed with no remaining findings.

### 2026-08-23 — M2 declarative Watchable Types slice completed

- Confirmed both repositories were clean with no Git locks or overlapping repository writer; no Watch Tracker Docker resources were present.
- Terminated orphaned Watch Tracker test race process `252354`, which was still consuming CPU while mutating only its own `/tmp/canon-pack-final-race-*` fixture.
- Used TDD to replace fixed Watchable `kind` values with Pack-owned `watchableTypeId` references.
- Added built-in Movie, Episode, Special, and Short Type records plus the fictional custom Lantern Signal Type; Series and Season remain structural Containers.
- Added closed authoring/release schemas, TypeScript types, semantic reference/built-in/code/provenance checks, deterministic `data/watchable-types.json`, canonical URNs, checksums, inventory, independent payload verification, migration documentation, and the immutable Lantern Vale `0.2.0` example.
- RED evidence: the five initial Watchable Type tests failed before implementation; a later namespace-regression test reproduced `identity.duplicate-slug` before the correction.
- GREEN evidence: `npm run check` passed typecheck and 26/26 tests; validation, independent example verification, and byte-identical rebuild passed; `npm audit --audit-level=high` reported 0 vulnerabilities; `git diff --check` passed.
- Independent final specification review passed with no blockers. Independent final Template quality/security review passed with no findings after correcting the Type-code namespace and current-contract documentation links.
- Signed implementation commit `5fc4862` pushed; Template PR #6 merged as `2df381854a199facacfc21090622b96339866d02`.
- PR CI run `32650902631` passed. Post-merge `main` CI run `32650935326` passed.
- M2 remains in progress; this bounded slice is not the complete importer contract and no GitHub release was created.

### 2026-08-23 — First runnable Core foundation slice

- Added a strict TypeScript/Fastify API with fail-fast environment validation, structured request IDs and errors, finite connection/request/shutdown limits, bounded bodies, a local-HTTP-safe self-only CSP, `/health`, and schema-aware `/ready`.
- Added strict checksummed migration discovery, advisory-locked one-shot migration execution, migration-name/checksum/future-ledger preflight, migration `0.01`, exact table/column/default/constraint post-application integrity verification, and app startup gated on successful migration.
- Added hardened non-root/read-only application, migrator, and derived PostgreSQL images with loopback-only API publication, an internal PostgreSQL network, and no PostgreSQL host port.
- Upgraded Fastify within major version 5 after independent review found high-severity validation-bypass advisories; production dependency audit now reports zero vulnerabilities.
- Added a shared API health contract consumed by the Fastify and React applications, with focused identity-shape coverage.
- Added 25 tests, including mandatory real-PostgreSQL migration, transactional schema-damage detection, environment and ledger validation, pre-write future-version rejection, empty deterministic-build rejection, and targeted CRUD cleanup coverage; the final source gate has zero skipped tests.
- Added a responsive React dark shell with Watch Tracker API identity validation, bounded health checks, accessible status announcements, and pinned Core CI through parallel non-overlapping implementation lanes.
- CI now performs locked install, production and complete dependency audits, exact Node/npm pinning, formatting, typecheck, lint, all tests, deterministic production rebuild comparison, real image builds, pinned Trivy scans, CycloneDX generation, fresh Compose smoke, asset checks, and migration checksum verification.
- Removed vulnerable build-only npm tooling from the application runtime and the vulnerable root-only `gosu` helper from the deployable PostgreSQL derivative; pinned Trivy `0.74.0` reports zero high/critical findings in both final images.
- Verified clean-volume initialization and retained-volume migration, healthy containers, live Watch Tracker JSON, and Microsoft Edge desktop/mobile rendering.
- Verified a uniquely identified database row survived service restart and complete container recreation, then removed the fixture and confirmed cleanup.

### 2026-08-23 — M3 specification-review corrections

- At `2026-08-23T14:05:17-04:00`, both repository lock checks were clear; Template remained clean at merged `main` revision `2df381854a199facacfc21090622b96339866d02`, Core remained on `docs/phase-1-data-model`, Core draft PR #1 was the only open PR, and Template post-merge CI run `32650935326` remained green.
- The initial independent M3 specification review found three gaps: migration preflight could mutate before rejecting a newer ledger, `migration_name` was not verified as part of identity, and CI lacked an exact Node pin, formatting check, and deterministic rebuild comparison.
- RED evidence: focused migration tests failed 2/13 before implementation, reproducing both the accepted renamed migration and mutation-before-newer-ledger-rejection behaviors.
- Corrected migration handling to inspect the entire ordered version/name/checksum ledger under the advisory lock and reject identity, checksum, inventory, or newer-schema mismatches before applying pending SQL; added unit and real-PostgreSQL regression coverage.
- Pinned Node `22.22.3` and npm `10.9.8`, added Prettier `3.9.6` formatting enforcement, and added a clean two-build SHA-256 manifest comparison. The deterministic gate passed with 13 production artifacts.
- Final local source validation passed formatting, strict API/web typechecks, lint, 25/25 tests with zero skips against PostgreSQL 17, and production builds. Both production-only and complete npm audits reported zero vulnerabilities; both Git diff checks passed.
- Local Docker state contained only earlier Watch Tracker-owned review/smoke resources plus the authorized local M3 test PostgreSQL container; unrelated `oxygen_cms` resources were not touched.

### 2026-08-23 — M3 quality/security-review corrections

- Independent quality/security review found four non-blocking issues: the prior Node image digest contained `v22.23.2` rather than the pinned `v22.22.3`, CI audited only production dependencies, deterministic verification accepted an empty successful build, and the image health check ignored a valid non-default `PORT`.
- Corrected all three Node image stages to explicit `node:22.22.3-alpine@sha256:e58326d0d441090181ac150dc2078d3e2cf6a0d42e809aebba3ef5880935ffdd`; the rebuilt runtime reported `v22.22.3` without engine warnings.
- Added a complete dependency-graph audit to CI. Local production-only and complete audits both reported zero vulnerabilities.
- RED evidence: the empty-output deterministic-build test failed before the required-artifact gate. GREEN evidence: the verifier now requires the API server, migrator, and web entry point in both builds; 25/25 tests and the 13-artifact deterministic comparison passed.
- Made the image health check honor `PORT`. A hardened local container using non-default internal port `3210` reported Docker health `healthy`, and `/ready` returned HTTP 200 with Watch Tracker readiness JSON through loopback host port `32772`.
- `docker build --check`, Compose configuration validation, exact Node image build, formatting, typecheck, lint, full tests, production builds, deterministic comparison, audits, and both Git diff checks passed after the corrections.
- Final quality re-review confirmed those four corrections and found one low-severity stale lockfile engine field. Regenerated `package-lock.json` with Node `22.22.3`/npm `10.9.8` so its root engine metadata matches `package.json`, and added a CI lockfile-regeneration drift check.

### 2026-08-23 — M3 completed

- Final independent specification review passed with no findings on the exact implementation diff. Final independent code-quality/security review passed with no findings after all correction rounds.
- Signed implementation commit `6b2711a1215111f01259505fa93630b063f2d0cd` was pushed. Core PR #1 became review-ready only after local gates and both final reviews passed.
- Core PR #1 CI run `32658514890` passed every required step, including locked install, lockfile drift, both audits, formatting, strict typechecks, lint, 25 tests with PostgreSQL, deterministic build, Dockerfile/Compose checks, image builds and scans, SBOM generation, and Compose smoke.
- Core PR #1 merged as `c4a6a0751a52f9c2289bec46fa5b4590b74e58be`. Post-merge `main` CI run `32658626306` passed the same complete gate.
- Core `main` and Template `main` were clean after the merge. No remote deployment or GitHub release was performed. M2 remains the next dependency-ready milestone lane.

### 2026-08-23 — M2 Canon Pack hostile-input foundation completed

- Template PR #7, `feat: harden Canon Pack input boundaries`, merged as `99a885ec5c7c04f9559115bf7530cbeb42a4574c`; post-review correction PR #9 merged as `f3212a85f8cbb1dd79fb5332cec82e6ddc5fcc78`. PR #8 was closed and superseded because its branch contained an unsigned merge commit.
- Added strict duplicate-key JSON and malformed UTF-8 rejection; fixed file, byte, member, record, string, nesting, and graph budgets; and symlink, hardlink, FIFO, and socket rejection.
- Added descriptor-anchored bounded reads with mutation detection, locale-independent UTF-16 ordering (including numeric and reserved JSON keys), and iterative graph traversal. Documentation now accurately states that the directory verifier does not provide archive-extraction safety.
- Final local gates passed: strict typecheck, 61/61 tests, source validation, independent release verification, deterministic build comparison, production and complete npm audits with zero vulnerabilities, Git diff checks, and the historical `0.1.0` identity gate. Final independent specification and quality/security reviews passed.
- Exact-head PR #9 CI run `32670805634` passed, followed by passing post-merge `main` CI run `32670841686`.
- M2 remains in progress. Next are the accepted `0.2.1` structures, normalized 26-table release projection, independent verifier, full Lantern Vale fixture, and contract ERD/docs/gates. Historical `0.1.0` and `0.2.0` artifacts remain preserved; setup, authentication, Pack import, catalog behavior, and viewing workflows remain unimplemented.
