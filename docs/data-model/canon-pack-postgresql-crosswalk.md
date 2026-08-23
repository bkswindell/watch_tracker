# Canon Pack to PostgreSQL crosswalk

## TL;DR

Canon Pack authors edit cohesive YAML records. Contract `0.2.0` compiles those records into deterministic, schema-closed JSON collections. Core verifies the complete artifact and transactionally imports immutable release-scoped records into the 26-table Canon domain. Mutable personal state, operational history, and derived views remain separate.

The authoritative table and column inventory is generated in `phase-1-data-dictionary.md`.

## Representation boundary

| Concern | Authoring / release representation | PostgreSQL representation |
|---|---|---|
| Pack governance, license, contacts, policies, presentation | Governed Pack/release metadata documents | `canon_pack`, `canon_pack_release.release_metadata` |
| Stable canonical identity | UUIDv7 and canonical URN | `canon_entity` |
| Release-specific labels and common metadata | Normalized entity collection | `canon_entity_revision` |
| Declarative Types, roles, and configurable vocabularies | `watchableTypes` and other term records | `canon_term_revision` |
| Containers | Structural Container records | `container_revision` |
| Watchables | Watchable records with `watchableTypeId` | `watchable_revision` |
| One First Public Release fact | Embedded/normalized release fact | `first_public_release` |
| Sources and claim evidence | Sources, claims, claim-source associations | `source_revision`, `source_relation`, `provenance_claim`, `provenance_claim_source` |
| External IDs and media | Normalized external-ID and media collections | `external_identifier`, `media_reference` |
| Reusable organizations/classifications | Canon Entities, Terms, associations, and hierarchy edges | `entity_organization`, `classification_value_revision`, `classification_value_parent`, `entity_classification` |
| Container placement | First-class Membership records | `container_membership_revision` |
| Prerequisites and ordering relationships | Typed directed Relationship records | `watch_relationship_revision` |
| Guides | Guide, Stage, and Entry collections | `watch_guide_revision`, `guide_stage_revision`, `guide_entry_revision` |
| Namespaced extensions | Declared schemas plus validated JSON documents | `extension_schema_version` plus bounded extension-document columns |
| Control files | Manifest, compatibility, inventory, checksums | Verified artifact digest and reports on `canon_pack_release` / `canon_pack_import`; not one row per release file |

## Contract `0.2.0` release collections

The exact filenames are owned by the executable Template contract, but the normalized release must cover:

- Pack/release metadata;
- Sources and provenance;
- stable Canon Entities and release revisions;
- declarative Terms, including Watchable Types and default display weights;
- structural Containers and Watchables;
- Memberships and directed Watch Relationships;
- First Public Release facts, external identifiers, and media references;
- reusable organizations and classification assignments when present;
- Guides when present;
- identity links, governed Decisions, and namespaced extensions when present.

Every included file participates in the deterministic inventory/checksum contract. Unknown files fail verification.

## Historical releases

Core retains:

1. the verified artifact digest and release metadata;
2. immutable release-scoped Canon rows;
3. import and activation history;
4. Focus completion/reconciliation snapshots where user state depends on a prior graph.

Core does **not** create a stable/revision pair for every record family or normalize every governance/configuration JSON object. The stable `canon_entity` registry preserves personal references across releases; typed release rows preserve the historical values that matter.

## Import transaction

A successful import:

1. snapshots hostile input bytes once;
2. validates exact files, sizes, checksums, canonical JSON, schemas, IDs, references, provenance, Memberships, Guides, and graph constraints;
3. stages a complete normalized projection;
4. inserts the release-scoped Canon rows and import report;
5. activates the release atomically;
6. reconciles affected Focus projections without modifying viewing history or Local Overrides.

Any failure leaves the previously active Pack and all mutable Core records unchanged.

## Core-owned state

The artifact never contains deployment credentials, sessions, recovery records, preferences, viewing history, feedback, Local Overrides, personal prerequisites, Focuses, portability records, or migration state. Those concerns are represented by the 12 mutable Core tables, one rebuildable projection table, and nine operational tables documented in the generated dictionary.

## Derived behavior

Effective Canon values, catalog rows, Viewing State, the active queue, Next Up, Guide satisfaction, and Focus progress are SQL views/queries. They are not authoritative imported records.

## Phase 2 exclusions

Phase 1 does not introduce user/profile ownership, multiple simultaneously active Packs, regional Release Event graphs, provider availability, playback progress, Pack plugins, Pack-defined database tables, or arbitrary UI components.
