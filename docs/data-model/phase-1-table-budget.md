# Watch Tracker Phase 1 table budget

## TL;DR

The accepted lean budget is **48 persisted PostgreSQL tables plus 9 derived SQL views**. This is 57 fewer tables (54.3%) than the rejected 105-table completeness prototype.

| Class | Persisted tables |
|---|---:|
| Immutable Canon Pack domain | 26 |
| Mutable authoritative Core domain | 12 |
| Persisted rebuildable projection | 1 |
| Operational and infrastructure | 9 |
| **Total** | **48** |
| Non-persisted derived SQL views | 9 |

## Representation rules

- Normalize stable identities, graph edges, ownership boundaries, lifecycle records, and records requiring relational integrity.
- Keep cohesive configuration, presentation, validation reports, snapshots, and uncommon namespaced extensions in governed schema-validated JSON.
- Keep Next Up, effective catalog data, viewing state, Guide satisfaction, and Focus progress derived.
- Retain verified release artifacts and immutable release-scoped rows; do not create a stable/revision pair for every record family.
- Treat the historical 15-table Canon Pack 0.1 ERD as historical, not as the Phase 1 Core schema.

## Inventory

### Immutable Canon Pack domain

- `canon_pack` — MVP-required: Identifies the logical Canon Pack across releases.
- `canon_pack_release` — MVP-required: Stores immutable release metadata and verified artifact details.
- `canon_entity` — MVP-required: Provides stable canonical identity across all releases and types.
- `canon_entity_revision` — MVP-required: Stores release-scoped common entity labels and metadata.
- `canon_entity_identity_link` — Optional: Records governed equivalence or replacement links between identities.
- `canon_term_revision` — MVP-required: Defines release-scoped declarative types, roles, and vocabularies.
- `source_revision` — MVP-required: Stores immutable release-scoped provenance-source details.
- `source_relation` — Optional: Relates sources through governed citation or derivation semantics.
- `provenance_claim` — MVP-required: Identifies a record- or field-level canonical claim.
- `provenance_claim_source` — MVP-required: Connects each provenance claim to supporting sources.
- `decision_record` — Optional: Captures governed canonical modeling decisions and rationale.
- `container_revision` — MVP-required: Stores release-scoped structural Container records.
- `watchable_revision` — MVP-required: Stores release-scoped Watchable metadata and type assignment.
- `first_public_release` — MVP-required: Stores the Phase 1 first-public-release fact per Watchable revision.
- `external_identifier` — Optional: Associates canonical entities with external namespace/value identifiers.
- `media_reference` — MVP-required: Stores governed poster, artwork, and trailer references.
- `entity_organization` — Optional: Assigns reusable organizations to entities in defined roles.
- `classification_value_revision` — Optional: Defines release-scoped reusable classification values.
- `classification_value_parent` — Optional: Represents classification hierarchy edges.
- `entity_classification` — Optional: Assigns classification values to canonical entities.
- `container_membership_revision` — MVP-required: Stores immutable release-scoped structural memberships and ordering.
- `watch_relationship_revision` — MVP-required: Stores immutable directed Watchable relationships and prerequisites.
- `watch_guide_revision` — Optional: Defines immutable release-scoped Watch Guides.
- `guide_stage_revision` — Optional: Defines ordered stages within a Watch Guide revision.
- `guide_entry_revision` — Optional: Places canonical entities within Guide stages.
- `extension_schema_version` — Optional: Governs namespaced Canon extension-document schemas.

### Mutable authoritative Core domain

- `tracker_instance` — MVP-required: Stores deployment-wide setup and authentication state.
- `viewing_attempt` — MVP-required: Stores the single active incomplete attempt for a Watchable.
- `viewing_session` — MVP-required: Retains one immutable completed viewing event for a Watchable.
- `watchable_feedback` — MVP-required: Stores overall and optional per-session feedback without altering viewing history.
- `tracker_preference` — MVP-required: Stores mutable display, ordering, and spoiler preferences.
- `spoiler_reveal` — Optional: Records explicit per-Watchable spoiler-reveal choices.
- `local_override` — Optional: Stores governed user-owned overlays on immutable Canon content.
- `personal_watch_relationship` — Optional: Stores user-defined prerequisite relationships.
- `watch_focus` — MVP-required: Stores saved Focus identity, target, lifecycle, and active status.
- `watch_focus_rule` — MVP-required: Stores validated filters, policies, weights, pins, and decisions.
- `watch_focus_completion` — Optional: Preserves immutable completion snapshots for finished Focuses.
- `focus_change_set` — Optional: Records reconciliation outcomes after Canon graph changes.

### Persisted rebuildable projection

- `watch_focus_projection` — MVP-required: Caches the generated Focus queue, explanations, and reconciliation baseline.

### Operational and infrastructure

- `deployment_session` — Infrastructure: Stores hashed deployment authentication sessions and expiration state.
- `password_recovery_credential` — Infrastructure: Stores short-lived host-generated recovery credentials.
- `canon_pack_repository` — Infrastructure: Configures the Phase 1 Canon Pack release source.
- `canon_pack_import` — Infrastructure: Records validation and transactional import attempts.
- `canon_pack_activation` — Infrastructure: Records which verified release was active during each interval.
- `canon_pack_update_check` — Infrastructure: Records update checks and discovered candidate releases.
- `schema_migration_run` — Infrastructure: Records guarded startup migration executions and outcomes.
- `schema_migration` — Infrastructure: Tracks individual migration versions and checksums.
- `portable_transfer` — Infrastructure: Records portable export, restore, and validation operations.

### Derived views

- `effective_canon_entity` — Active release entity rows with Local Overrides layered separately.
- `effective_container` — Effective structural Containers for the active Pack.
- `effective_watchable` — Effective Watchables with declarative Type and release fact.
- `catalog_watchable` — Catalog projection with placement, media, state, and prerequisite summaries.
- `viewing_state` — Derived Not Started, In Progress, or Watched state.
- `active_watch_focus_queue` — Ordered queue rows expanded from the active Focus projection.
- `next_up` — First eligible queue entry with deterministic explanation.
- `guide_stage_satisfaction` — Derived Guide Stage satisfaction from Entry inclusion and viewing state.
- `watch_focus_progress` — Derived Focus completion and progress aggregates.
