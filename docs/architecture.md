# Architecture Overview

## Status

Accepted direction; implementation has not started.

## Core and Canon Pack seam

Watch Tracker separates behavior from franchise content:

- The **Core Tracker** owns setup, authentication, import, persistence, catalog presentation, recommendation, dependency traversal, and viewing history.
- A **Canon Pack** owns one canon's catalog, stable Pack and entity identities, memberships, relationships, guides, provenance, and presentation metadata.
- A **Canon Pack release artifact** is the small import interface between them.

Phase 1 supports exactly one active Canon Pack per deployment. Pack records are imported as immutable upstream content. Viewing activity, preferences, and later local overrides remain separate so Pack replacement does not rewrite personal history.

## Planned application shape

```text
Browser
  -> React + TypeScript frontend
  -> Node.js + TypeScript application
  -> PostgreSQL

Versioned Canon Pack release artifact
  -> validation and transactional import
  -> normalized immutable Pack projection in PostgreSQL
```

Docker Compose is the canonical deployment and runs the application and PostgreSQL as separate containers. PostgreSQL is the only supported database in every environment.

## Trust boundaries

- Canon Packs contain declarative data, not executable plugins.
- Production imports validated release artifacts, not moving branches or editable authoring files.
- Import fails closed before activation when compatibility, schema, identity, checksum, reference, provenance, or graph validation fails.
- Pack content does not own personal viewing state.
- Provider credentials and deployment secrets never belong in a Canon Pack.
- Technical compatibility does not certify a Pack's legality, accuracy, or endorsement.

## Durable concepts

The planned Core preserves:

- immutable viewing sessions and rewatch history;
- active viewing attempts;
- deterministic Watch Focus queues and Next Up explanations;
- Required, Recommended, Sequence, and Optional Connection relationships;
- Movies, Episodes, Specials, and Shorts; and
- accessible dependency lists alongside graph presentation.

## First implementation seam

The first vertical slice will define Canon Pack contract `0.1`, compile a small fake Pack deterministically, import it into PostgreSQL, and exercise it through the Core. Executable needs will deepen the contract without requiring the full future authoring system before the MVP.
