# Watch Tracker Autonomous Phase 1 Build Plan

> **For Hermes:** Execute this plan through milestone-sized, test-driven tasks with independent specification and quality review.

**Status:** Authorized for autonomous execution
**Authorized at:** 2026-08-23T10:20:15-04:00
**Goal:** Deliver a verified local-Docker Watch Tracker MVP, then complete the remaining accepted Phase 1 systems.

## TL;DR

Hermes owns implementation and maintenance of the existing Watch Tracker Core and Canon Pack Template repositories for this pass. Work proceeds autonomously through reviewable milestones. The Canon Pack contract and complete Phase 1 logical ERD are finalized before the importer and physical schema. The MVP is then built, deployed to local Docker, populated with the fictional sample Pack, and verified before remaining Phase 1 work begins.

Deployment is restricted to the local Docker instance on this host. GitHub branches, reviewed PR merges, version increments, and releases in the two existing repositories are authorized. New repositories, paid infrastructure, and remote/public deployment are excluded.

## Authorized repositories

- Core: `bkswindell/watch_tracker`
- Canon Pack Template: `bkswindell/watch_tracker_canon_pack_template`

## Product constraints

- PostgreSQL is the sole Core database in every environment.
- Docker Compose is the canonical provider-independent deployment.
- The Core is franchise-neutral.
- Canon Packs are independently owned, licensed, governed, versioned, validated, immutable release artifacts.
- The fictional Lantern Vale Pack remains the only sample fixture.
- Canon Pack source YAML, normalized release JSON, imported Canon rows, mutable Core records, and derived projections remain distinguishable.
- Primary keys repeat the entity name; foreign keys preserve that name. Bare `id` primary keys are prohibited.
- Schema and contract versions remain `0.x` before production.
- Imported Pack data is not locally edited; Local Overrides remain separate.
- One active Pack per Phase 1 Tracker Instance.
- No paid feature or service may be enabled.

## Execution rules

1. Use TDD for behavior changes: RED, GREEN, REFACTOR.
2. Use small, signed, reviewable commits.
3. Run specification review before code-quality/security review.
4. Do not merge a PR until required tests and CI are green.
5. Keep secrets out of source, logs, artifacts, exports, screenshots, and commits.
6. Stop on credential walls, paid-service prompts, unrelated infrastructure requirements, destructive host operations, or ambiguity that would cause irreversible data loss.
7. Conservative reversible design decisions are delegated to Hermes.
8. Generated artifacts must have deterministic regeneration/check modes.
9. Maintain `docs/progress/phase-1-status.md` after every milestone.
10. Local Docker cleanup is restricted to Watch Tracker project resources.

## Milestone graph

### M0 — Durable plan and clean baselines

**Deliverables**

- This plan and progress ledger committed and pushed.
- Exact Core and Template repository baselines recorded.
- Existing audit documents classified as retained, revised, or discarded.
- Autonomous runner/watchdog configured only after the plan is committed.

**Gate**

- Both repositories have known clean or intentionally documented state.
- `git diff --check` passes.
- No secrets are staged.

### M1 — Complete reduced Phase 1 logical model

**Deliverables**

- Exact accepted table inventory with a justified table budget.
- Editable DrawDB Generic native JSON as the canonical ERD.
- `.ddb` compatibility copy and DBML fallback.
- Data dictionary and semantic-constraint catalog.
- Explicit classifications:
  - persisted Phase 1 domain tables;
  - Phase 1 structures optional during MVP;
  - derived views/projections;
  - operational implementation tables;
  - deliberate Phase 2 exclusions.
- Authoring YAML → release JSON → immutable PostgreSQL → mutable Core crosswalk.

**Gate**

- No concept receives a table without identity/query/integrity/lifecycle/provenance justification.
- DrawDB artifacts validate against the pinned Generic importer.
- Independent schema review passes.
- The rejected 105-table maximum-normalization model is not published.

### M2 — Canon Pack contract 0.2.x

**Deliverables**

- Declarative Watchable Types replace fixed Watchable kind semantics.
- Series and Season remain structural Containers.
- Built-in Movie, Episode, Special, and Short Type records.
- Fictional Lantern Vale custom Type proving extensibility.
- Complete accepted Pack structures required by the reduced ERD.
- Updated authoring JSON Schema, TypeScript types, semantic validators, compiler, deterministic release files, checksums, verifier, fixtures, documentation, and ERD.
- Migration notes from `0.1.0`.

**Gate**

- Clean install.
- Typecheck, lint, unit tests, semantic validation, deterministic rebuild, verifier, dependency audit, and filesystem/concurrency tests pass.
- Independent contract and security reviews pass.
- Reviewed Template PR merges before Core importer implementation.

### M3 — Core application and PostgreSQL foundation

**Deliverables**

- TypeScript workspace with web, API, shared contracts, database migrations, and tests.
- React responsive dark UI foundation.
- Node.js API with structured errors, request IDs, health/readiness endpoints, security headers, bounded request bodies, and graceful shutdown.
- PostgreSQL schema using named PK/FK convention and pre-production schema versions.
- Dockerfiles, Compose, `.env.example`, persistent database volume, migration command, and CI.

**Gate**

- Unit and integration tests pass.
- Production builds pass.
- Compose builds from a clean checkout.
- Health and readiness distinguish API and database state.
- Dependency and container scans have no unresolved high/critical findings.

### M4 — Setup, authentication, Pack import, and activation

**Deliverables**

- First-run sequence: database/schema readiness → deployment password → Pack import → complete.
- Argon2id deployment credential, protected sessions, CSRF protection, rate limiting, host-only recovery workflow, and session invalidation.
- Transactional, fail-closed Canon Pack import from validated local artifact.
- Staging, validation, activation, rollback metadata, and one-active-Pack enforcement.
- Sample Pack import operation.

**Gate**

- Invalid/tampered/partial/path-unsafe artifacts do not alter active state.
- Successful import is atomic.
- Authentication, recovery, file handling, and new endpoints receive formal security review.
- Restart preserves setup, credential, Pack activation, and Canon data.

### M5 — MVP user experience

**Deliverables**

- Setup/sign-in UX.
- Catalog list and poster grid.
- Watchable details with safe/protected content handling.
- Container browsing and Membership ordering.
- Prerequisite list and basic directed graph.
- Default Watch Focus, deterministic route, Next Up, and explanations.
- Start, Complete, Discard, Mark Watched, and Repeat viewing lifecycle.
- Durable Viewing Attempts/Sessions and derived state.
- Mobile-responsive operation.

**MVP success gate**

A fresh local deployment can:

1. Start with Docker Compose.
2. Complete first-run setup.
3. Import and activate the verified Lantern Vale release.
4. Browse imported Containers and Watchables.
5. Select a target and receive deterministic Next Up.
6. Inspect prerequisites and explanations.
7. Start, complete, discard, mark watched, and repeat viewings.
8. Restart containers without losing setup, Pack, Focus, or history.
9. Reject unauthenticated protected requests.
10. Pass API, database, browser, security, dependency, and deterministic-import gates.

### M6 — MVP deployed verification and release

**Deliverables**

- Local Docker deployment using persistent Watch Tracker resources.
- Sample imported through the product path, not direct database seeding.
- Browser verification in Chromium, Firefox, WebKit/Safari proxy, and Edge/Chromium channel where available.
- API/database smoke evidence and restart/persistence evidence.
- Backup/restore proof for MVP-owned records.
- Versioned Core pre-release/release if all gates pass.

**Gate**

- The running site, API, and PostgreSQL instance are healthy.
- E2E tests cover the complete MVP loop.
- No high/critical dependency or security findings remain.
- PR and post-merge CI pass.

### M7 — Remaining accepted Phase 1 systems

Implement in dependency order:

1. Multiple, saved, archived, caught-up, and completed Watch Focuses.
2. Ordered Watch Guides, Stages, Entries, choices, and skip decisions.
3. Local Overrides with stable path vocabulary and reconciliation state.
4. Personal Watch Relationships and Canon-equivalence handling.
5. Pack update discovery/import, graph comparison, activation, and rollback.
6. Focus Change Sets, classified changes, decisions, and historical retention.
7. Deterministic ranking inputs, snapshots, and explanations.
8. Spoiler/reveal and display preferences.
9. Ratings, favorites, rewatch intent, notes/reviews, and per-session feedback where accepted.
10. Portable versioned export/import excluding credentials, sessions, recovery material, and disposable projections.
11. Guarded migrations and verified pre-migration backup.

**Gate**

- Every accepted Phase 1 functional requirement maps to implementation and tests or an explicit accepted exclusion.
- Export/import and update/reconciliation are atomic and receive formal security review.
- Existing viewing history and Focus completion remain stable across Pack update/rollback tests.

### M8 — Final Phase 1 closeout

**Deliverables**

- Requirements traceability and final status ledger.
- Architecture, operation, setup, backup/restore, security, data dictionary, OpenAPI, and contributor documentation.
- Final independent specification, code-quality, security, accessibility, and deployment reviews.
- Reviewed PR merges and green post-merge CI.
- Final local Docker deployment from released artifacts with sample Pack active.

**Final success gate**

- All accepted Phase 1 requirements are implemented or explicitly documented as out of Phase 1.
- Full automated suites and deployed smoke tests pass.
- Local deployment survives restart and restore.
- Git working trees are clean and local/remote release revisions match.

## Durable status artifacts

- Plan: `docs/plans/2026-08-23-autonomous-phase-1-build.md`
- Progress ledger: `docs/progress/phase-1-status.md`
- Local unattended logs/state: ignored under `reports/autonomous/`
- ERD and dictionary: `docs/data-model/`

## Non-negotiable release security baseline

These checks block an MVP or Phase 1 release; they are not deferred hardening:

1. **Access:** Argon2id uses 65,536 KiB memory, time cost 3, and parallelism 1. Session tokens are opaque and random, only hashes are persisted, idle lifetime is 30 days, and absolute lifetime is 90 days. Unsafe requests require a session-bound CSRF value and exact configured-origin validation. Ten failed logins per remote address in 15 minutes impose a 15-minute cooldown.
2. **Recovery:** host-generated recovery material has at least 128 random bits, expires after 15 minutes, is single-use, is consumed after five failures, and successful recovery atomically invalidates every session. Secrets never enter arguments, logs, artifacts, exports, or committed configuration.
3. **Pack input:** accept compiled declarative release data only. Reject duplicate JSON keys, absolute/traversal/backslash paths, unexpected or duplicate members, links, devices, sockets, FIFOs, noncanonical JSON, invalid inventory/checksums, incompatible contracts, unresolved IDs, and graph violations. Enforce explicit byte, member, record, graph, nesting, and time budgets before activation.
4. **Atomicity:** verify one immutable byte snapshot; stage the full normalized projection; activate in one transaction. Any parse, validation, budget, database, or injected failure must leave the active Pack and personal records unchanged.
5. **Compose:** PostgreSQL has no host-published port by default. The app binds to loopback by default, runs non-root with no Docker socket, drops capabilities, enables `no-new-privileges`, and uses a read-only root filesystem where practical. Secrets are injected, data and migration backups use separate persistent locations, and readiness remains false until database, migration, and integrity gates pass.
6. **Migrations:** acquire an advisory lock; verify migration identities/checksums; reject newer or mismatched schemas; create and verify a logical backup outside the database volume before pending migrations; run post-migration integrity checks; never downgrade automatically.
7. **CI:** lock Node and dependencies; run format/lint, strict typecheck, unit/property/PostgreSQL/migration/adversarial-import tests, deterministic builds, independent artifact verification, image/Compose smoke, secret/dependency/static/license scans, SBOM generation, and container vulnerability scanning. Unresolved high direct dependency advisories or fixable high/critical runtime image findings block release.
8. **Browsers:** record exact versions and run the product journey in Chromium, Firefox, Playwright WebKit, and the installed Microsoft Edge binary. WebKit is reported as a Safari proxy, never as native Safari. No required engine may be skipped, cancelled, stale, flaky, or replaced by a different engine.
9. **Persistence:** after representative setup/import/viewing/Focus state is created, verify it after Compose restart, container recreation without volume deletion, stopped-stack restart, logical dump, and restore into a fresh Watch Tracker stack.
10. **Governance:** independent review applies to the exact final diff; later edits invalidate the verdict. Required checks, DCO, resolved review findings, and post-merge CI must pass before release.

## Abort and escalation conditions

Stop autonomous execution and leave a durable blocker when any of these occurs:

- A required action crosses the two authorized repositories or local Docker deployment.
- A paid feature, purchase, billing change, or remote deployment is required.
- Required credentials are absent or rejected.
- A destructive operation could affect unrelated host/Docker resources.
- A security review finds an unresolved critical/high issue.
- Data-loss behavior cannot be made rollback-safe.
- CI or tests remain broken after bounded diagnosis and repair attempts.
- A source requirement is contradictory and the choice would be irreversible.
