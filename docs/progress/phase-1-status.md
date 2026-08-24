# Watch Tracker Phase 1 Status

## TL;DR

Autonomous execution is authorized. Milestones M0, M1, and M3 are complete. M2 remains in progress and is the next dependency-ready lane; its Canon Pack hostile-input, security, and determinism foundation is complete in the Template. The Core API, PostgreSQL migration `0.01`, one-shot migration, health/readiness, hardened Compose, responsive React shell, CI, image scanning, SBOM generation, and persistence verification are implemented. Setup, authentication, Pack import, catalog behavior, viewing workflows, and authenticated prerequisite inspection are implemented in the current vertical slice.

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
| M4 Setup/auth/import/activation | Pending | Design requirements only | M2 Canon contract completion |
| M5 MVP UX and viewing loop | Pending | Design requirements only | M4 |
| M6 MVP deployed verification/release | Pending | Docker access preflight passed | M5 |
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
