# Watch Tracker

Watch Tracker is an open-source, self-hosted application for tracking progress through rich media franchises using versioned Canon Packs and explainable viewing paths.

## TL;DR

The current Core vertical slice is available for local development: a React shell, Fastify API, PostgreSQL migrations through `0.11`, one-shot migrator, hardened Docker Compose deployment, validated Canon Pack import, setup/authentication, catalog, dependency inspection, and viewing workflows. Host-admin password recovery is also implemented; Phase 1 remains in active development and is not a release.

## Why Watch Tracker

Most media trackers answer whether something was watched. Watch Tracker is designed to also explain:

- what should be watched next;
- which earlier stories are required, recommended, sequential, or optionally connected;
- why an item appears in a generated viewing path; and
- how viewing history remains durable when a Canon Pack evolves.

The Core Tracker is franchise-independent. Franchise-specific catalogs, relationships, provenance, and presentation metadata belong to separately maintained Canon Packs.

## Phase 1 experience

The proposed MVP proves one complete personal-use loop:

1. deploy Watch Tracker and PostgreSQL with Docker Compose;
2. create one deployment-wide password;
3. import one validated Canon Pack release artifact;
4. browse Movies, Episodes, Specials, and Shorts;
5. select a target and receive deterministic Next Up guidance;
6. inspect prerequisites through a list and basic graph;
7. start, complete, discard, and repeat viewings; and
8. restart the deployment without losing state.

See the [proposed Phase 1 MVP scope](docs/phase-1-mvp-scope.md) for the current implementation boundary.

## Architecture

- **Frontend:** React and TypeScript
- **Backend:** compact Node.js and TypeScript application
- **Database:** PostgreSQL in every environment
- **Deployment:** Docker Compose is the canonical deployment
- **Content:** one active, independently versioned Canon Pack per Phase 1 deployment
- **Durable state:** viewing attempts, sessions, ratings, feedback, and local preferences remain separate from imported Pack records

Tracker instances consume validated, versioned release artifacts. They do not execute Canon Pack code or import an arbitrary repository branch. See the [architecture overview](docs/architecture.md).

### Phase 1 data model

The accepted lean logical model defines 48 persisted tables, 95 relationships, and nine derived views across immutable Canon data, mutable Core state, one rebuildable Focus projection, and operational records. See the [generated Phase 1 data model](docs/data-model/README.md), generated data dictionary, and Canon Pack/PostgreSQL crosswalk. The Python model generator is authoritative; direct edits to generated artifacts are rejected as drift.

## Run the current local foundation

This deployment path is for local development and verification only. It does not publish Watch Tracker to a remote host.

1. Copy `.env.example` to `.env`.
2. Replace the password placeholder with a long random local PostgreSQL password.
3. Prepare the initial local admin password without displaying it:

   ```bash
   ./scripts/prepare-initial-admin-password.sh
   ```

   The script writes `.secrets/initial_admin_password` (or the path in
   `INITIAL_ADMIN_PASSWORD_FILE`) only when the file is absent or empty. It
   creates and checks a private parent directory, writes a strong random
   password with mode `0600`, never prints the password, and is safe to run
   repeatedly. Compose mounts this ignored file read-only and preserves its
   source UID, so the non-root application UID must match the local user that
   owns the file.

4. Start the stack:

   ```bash
   APP_USER_ID="$(id -u)" docker compose up --build -d
   ```

   `APP_USER_ID` defaults to `1000` for the image's normal non-root user. Set
   it to the owner UID of a mode-`0600` `INITIAL_ADMIN_PASSWORD_FILE` whenever
   that file is owned by a different local user; do not make the secret
   world-readable. `APP_USER_ID=0` is refused at application startup.

5. With the supplied `.env` file, open <http://127.0.0.1:3100/>. API liveness
   and readiness are available at `/health` and `/ready`.

PostgreSQL is not published to the host. Compose defaults to the approved
trusted-LAN publication `10.18.0.201:3100` when `APP_BIND_ADDRESS` and
`APP_PORT` are unset. `.env.example` deliberately overrides that default with
`APP_BIND_ADDRESS=127.0.0.1`, which is why the local-development steps above use
the loopback URL. To use the trusted-LAN default, remove that override (or set
`APP_BIND_ADDRESS=10.18.0.201`) and use that address in the URL; do not use
`0.0.0.0` unless exposure on every host interface is intentional. This changes
the deployment's access boundary, so use authentication before treating LAN
exposure as an MVP deployment.

### Host-admin password recovery

Password recovery does not use email or an external provider. An administrator
with direct database access can issue a short-lived link from the application
host:

```bash
DATABASE_URL='postgresql://…' \
WATCH_TRACKER_BASE_URL='https://tracker.example/' \
npm run password-recovery
```

The command writes the reset link exactly once to standard output. Deliver it
directly to the owner and do not paste it into tickets, chat logs, shell history,
analytics, or monitoring systems. The 256-bit token is carried in the URL
fragment, is stored only as a SHA-256 digest, expires after 15 minutes, and is
invalidated when another link is issued. Opening the link removes the fragment
from the address bar immediately. A successful reset consumes the token,
applies the normal Argon2id password policy, and revokes every existing session.
A valid link is also consumed after five policy-invalid submissions. Invalid,
expired, superseded, exhausted, and reused links return the same generic failure.

Run this command only from a trusted host-admin shell. Prefer a base URL using
HTTPS; HTTP is supported for loopback/local development only. The command does
not modify a password. Credentials change only when the owner explicitly
submits a valid token and policy-compliant new password through the reset page.

Compose builds a digest-pinned PostgreSQL derivative that runs directly as `postgres`, while the application and migrator run as non-root with read-only filesystems, dropped capabilities, and `no-new-privileges`. To validate the source independently, run:

```bash
npm ci
npm audit --omit=dev --audit-level=high
npm run check
```

## Canon Packs

A Canon Pack defines one franchise or canon without changing the Core Tracker. Each Pack has its own owner, repository, release history, license, provenance policy, and copyright contact.

The standard authoring foundation is the [Watch Tracker Canon Pack Template](https://github.com/bkswindell/watch_tracker_canon_pack_template).

Watch Tracker does not endorse or certify the legality or accuracy of an independently maintained Pack merely because the application can import it.

## Project status

Watch Tracker is in active Phase 1 implementation. Historical Canon Pack contract `0.1.0` remains preserved, the declarative Watchable Type contract `0.2.0` is implemented, and the Core vertical slice is verified in a trusted-LAN app-only deployment. This is not a production release or public hosted service; no Core release has been published yet.

## Contributing

Contributions are welcome. Before contributing, read:

- [Contributing](CONTRIBUTING.md)
- [Governance](GOVERNANCE.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)
- [Copyright Policy](COPYRIGHT_POLICY.md)

All commits must include a Developer Certificate of Origin sign-off.

## License

Licensed under the [Apache License 2.0](LICENSE).
