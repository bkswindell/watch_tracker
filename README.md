# Watch Tracker

Watch Tracker is an open-source, self-hosted application for tracking progress through rich media franchises using versioned Canon Packs and explainable viewing paths.

## Why Watch Tracker

Most media trackers answer whether something was watched. Watch Tracker is designed to also explain:

- what should be watched next;
- which earlier stories are required, recommended, sequential, or optionally connected;
- why an item appears in a generated viewing path; and
- how viewing history remains durable when a Canon Pack evolves.

The Core Tracker is franchise-independent. Franchise-specific catalogs, relationships, provenance, and presentation metadata belong to separately maintained Canon Packs.

## Planned Phase 1 experience

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

The accepted lean logical model defines 48 persisted tables, 95 relationships, and nine derived views across immutable Canon data, mutable Core state, one rebuildable Focus projection, and operational records. See the [editable Phase 1 data model](docs/data-model/README.md), generated data dictionary, and Canon Pack/PostgreSQL crosswalk.

## Canon Packs

A Canon Pack defines one franchise or canon without changing the Core Tracker. Each Pack has its own owner, repository, release history, license, provenance policy, and copyright contact.

The standard authoring foundation is the [Watch Tracker Canon Pack Template](https://github.com/bkswindell/watch_tracker_canon_pack_template).

Watch Tracker does not endorse or certify the legality or accuracy of an independently maintained Pack merely because the application can import it.

## Project status

Watch Tracker is in Phase 1 data-model and contract work. Historical Canon Pack contract `0.1.0` is executable and validated; contract `0.2.0` and the Core application are under development. No Core application release or deployment is available yet.

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
