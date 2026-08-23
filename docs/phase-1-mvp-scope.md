# Phase 1 MVP Scope

## Status

**Proposed.** This document is a public planning baseline, not a released commitment. It becomes the implementation baseline only after explicit owner approval.

## Goal

Prove one complete, durable personal-use loop:

1. deploy Watch Tracker and PostgreSQL with Docker Compose;
2. create the deployment password;
3. import one validated fake Canon Pack release artifact;
4. browse Movies, Episodes, Specials, and Shorts;
5. select a target and receive deterministic Next Up guidance;
6. inspect prerequisites through a list and basic graph;
7. start, complete, discard, and repeat viewings; and
8. restart both containers without losing data.

## Included

### Canon Pack contract and import

- One active Pack per deployment
- Versioned manifest, compatibility declaration, inventory, and checksums
- Immutable UUIDv7 Pack and entity identities
- Movie, Episode, Special, and Short
- Series and Season primary membership
- First Public Release, runtime, spoiler-safe summary, and provenance
- Required, Recommended, Sequence, and Optional Connection relationships
- Deterministic validation, normalized JSON compilation, and transactional import

### Application foundation

- TypeScript, React, Vite, and a compact Node.js backend
- PostgreSQL as the only database
- Docker Compose application and database services
- Versioned pre-production schema below `1.0`
- Health, readiness, environment validation, and fail-closed migrations
- One deployment-wide password, secure sessions, CSRF protection, throttling, and host-controlled recovery

### User journey

- List and poster-grid catalog views
- Search and basic Type, Series, and Viewing State filters
- Watchable details with prerequisites and provenance summary
- Default Release Timeline Focus, optional target, generated queue, Next Up, and inclusion explanations
- Accessible dependency list and basic graph
- Not Started, In Progress, and Watched states
- Start Watching, Mark Watched, Discard Attempt, Watch Again, and Clear Watch History
- Rewatch history, rating, favorite, Would Rewatch, notes, and basic spoiler protection

### Quality gate

A clean machine must build and start the Compose stack, initialize PostgreSQL, complete setup, import the fixture Pack, exercise the full browser journey, restart both containers, and recover identical durable state. Domain, PostgreSQL integration, browser, security, and persistence checks must pass with actual tested versions recorded.

## Deferred

The MVP does not include automatic Pack updates, rollback and reconciliation UI, multiple saved Focuses, Custom Order editing, full Watch Guide execution, general Local Overrides, personal prerequisite editing, provider enrichment, media-server synchronization, multi-Pack deployments, or formal accessibility conformance.

These remain possible later milestones; deferral is not rejection.

## Planned implementation milestones

1. **Canon Pack vertical slice:** minimal schema, validator, compiler, fake valid and invalid fixtures, and deterministic artifact.
2. **Durable foundation:** TypeScript workspace, PostgreSQL Compose stack, migrations, setup password, and sessions.
3. **Import and catalog:** transactional import, normalized projection, browse, search, filters, and details.
4. **Viewing lifecycle:** attempts, sessions, feedback, spoilers, and derived states.
5. **Focus and dependencies:** queue, target, ranking, explanations, list, and graph.
6. **Hardening:** browser matrix, security, migrations, persistence, backup, recovery, and release validation.

## Scope guard

New ideas enter a later milestone unless required to satisfy an existing acceptance criterion, prevent data loss, close a security defect, or keep an accepted interface implementable.
