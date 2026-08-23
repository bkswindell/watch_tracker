# Canon Pack 0.1 ERD shortcut audit

## TL;DR

The published 15-table Canon Pack `0.1` diagram remains a valid historical projection of the first executable contract. It is not the complete Phase 1 Core schema. The accepted lean Phase 1 replacement has **48 persisted tables, 95 relationships, and 9 derived views** while preserving explicit Phase 2 boundaries.

## Why the historical model remains

Contract `0.1.0` proved deterministic authoring, validation, compilation, checksums, provenance, Containers, Watchables, Memberships, and directed Relationships. Its diagram must remain tied to that released contract rather than being silently rewritten.

## Corrected Phase 1 representation

| Historical `0.1` shortcut | Lean Phase 1 correction |
|---|---|
| Fixed `WATCHABLE.kind` values | Pack-defined declarative Watchable Types in `canon_term_revision`; `watchable_revision` references the selected Type. |
| Pack identity and release metadata in one row | Stable `canon_pack` plus immutable `canon_pack_release`; cohesive governance remains governed release JSON. |
| Current entity values stand in for identity | Stable `canon_entity` plus release-scoped `canon_entity_revision`. |
| Series/Season and Watchables represented only by fixed discriminators | Structural `container_revision` and typed `watchable_revision` subtype rows. |
| Minimal source joins | First-class `provenance_claim` and `provenance_claim_source`, backed by `source_revision`. |
| No identity transitions | `canon_entity_identity_link` for governed replacement/equivalence semantics. |
| No reusable metadata | Declarative Terms and bounded organization/classification associations without a table for every enum. |
| Minimal Membership ordering | Immutable `container_membership_revision` with role Term and bounded position. |
| Fixed relationship kinds | `watch_relationship_revision` references a declarative relationship Type Term. |
| No Guides | Optional `watch_guide_revision`, `guide_stage_revision`, and `guide_entry_revision`. |
| No Core state | Separate mutable, projection, authentication/import/migration, and portability tables. |

## Deliberately collapsed from the rejected prototype

The following do not receive dedicated table families:

- Pack maintainers, contacts, policies, license, and presentation documents;
- one table per Watchable Type capability;
- one stable/revision pair for every typed or association record;
- separate decision-option, import-issue, release-file, queue-item, queue-explanation, filter, weight, and preference-value tables;
- persisted copies of Next Up, Viewing State, Guide satisfaction, or aggregate progress;
- normalized historical copies of every inactive artifact file;
- tables for closed status vocabularies.

These are represented by governed JSON, columns/check constraints, importer rules, verified artifacts, or derived views according to their integrity and query needs.

## Missing Core systems now represented

- deployment setup, hashed sessions, and host-controlled recovery;
- verified release source, import, activation, and update-check history;
- Viewing Attempts, timed Sessions, feedback, preferences, and spoiler reveals;
- Local Overrides and personal Watch Relationships;
- saved/active/completed Focuses, rules, reconciliation Change Sets, and one rebuildable projection;
- guarded migrations and checksums;
- versioned portable export/restore operations.

## Intentional Phase 1 boundaries

- one active Canon Pack per Tracker Instance;
- immutable imported Pack records and separate mutable overlays;
- canonical UUIDv7 identity independent of title, slug, Type, and providers;
- one First Public Release fact per Watchable;
- Viewing State and aggregate progress remain derived;
- Watch Guides remain distinct from prerequisites and Container placement;
- PostgreSQL is the only database;
- no Pack executable code, authentication, custom tables, custom watch states, or arbitrary UI components;
- no Phase 2 users/profiles, multi-Pack composition, regional Release Events, providers, or playback progress.

## Physical follow-up

The Generic DrawDB model records logical identities, columns, cardinalities, and ownership. PostgreSQL migrations add partial uniqueness, deferred/recursive graph validation, indexes, JSON Schema enforcement at import boundaries, append-only application behavior, advisory migration locking, and transactional activation.
