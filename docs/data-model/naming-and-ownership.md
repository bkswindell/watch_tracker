# Phase 1 data naming and ownership

## TL;DR

Watch Tracker uses one semantic vocabulary across Canon Pack authoring YAML, normalized release JSON, and PostgreSQL. Domain names remain singular and explicit. Authoring and release fields use lower camel case; PostgreSQL identifiers use singular snake case. Every database primary key includes its entity name, and every foreign key repeats the referenced primary-key name exactly.

## Naming forms

| Logical entity | Authoring / release collection | Authoring / release identifier | PostgreSQL table | PostgreSQL primary key |
|---|---|---|---|---|
| Canon Pack | `canonPack` | `canonPackId` | `canon_pack` | `canon_pack_id` |
| Canon Pack Release | `canonPackRelease` | `canonPackReleaseId` | `canon_pack_release` | `canon_pack_release_id` |
| Canon Entity | `canonEntities` | `canonEntityId` | `canon_entity` | `canon_entity_id` |
| Watchable | `watchables` | `watchableId` | `canon_entity` / `watchable_revision` | `canon_entity_id` / `watchable_revision_id` |
| Watchable Type | `watchableTypes` | `watchableTypeId` | `canon_entity` / `canon_term_revision` | `canon_entity_id` / `canon_term_revision_id` |
| Container | `containers` | `containerId` | `canon_entity` / `container_revision` | `canon_entity_id` / `container_revision_id` |
| Container Membership | `containerMemberships` | `containerMembershipId` | `container_membership_revision` | `container_membership_revision_id` |
| Watch Relationship | `watchRelationships` | `watchRelationshipId` | `watch_relationship_revision` | `watch_relationship_revision_id` |
| Watch Guide | `watchGuides` | `watchGuideId` | `canon_entity` / `watch_guide_revision` | `canon_entity_id` / `watch_guide_revision_id` |
| Guide Stage | `guideStages` | `guideStageId` | `guide_stage_revision` | `guide_stage_revision_id` |
| Guide Entry | `guideEntries` | `guideEntryId` | `guide_entry_revision` | `guide_entry_revision_id` |
| Watch Focus | not Pack-owned | not Pack-owned | `watch_focus` | `watch_focus_id` |
| Viewing Session | not Pack-owned | not Pack-owned | `viewing_session` | `viewing_session_id` |

The complete mapping is generated with the Phase 1 data dictionary.

## Primary and foreign keys

Database tables never use a bare `id` primary key. A table named `watchable_revision` uses `watchable_revision_id`; `viewing_session` uses `viewing_session_id`.

A foreign key repeats the referenced primary-key name exactly:

```text
canon_entity.canon_entity_id
canon_entity_revision.canon_entity_id
viewing_attempt.canon_entity_id
watchable_feedback.canon_entity_id
```

Qualifiers are added only when one table has multiple references to the same entity:

```text
watch_relationship_revision.prerequisite_watchable_revision_id
watch_relationship_revision.watchable_revision_id
focus_change_set.from_canon_pack_release_id
focus_change_set.to_canon_pack_release_id
```

Each qualified column still ends with the referenced primary-key name.

## Prohibited ambiguous names

The model does not use these names without qualification:

- `id`
- `type`
- `kind`
- `source`
- `target`
- `status` when multiple lifecycle dimensions exist
- `value` when the domain meaning has a precise name

Examples:

- `watchable_type_canon_term_revision_id`, not `type` or `kind`;
- `relationship_type_canon_term_revision_id`, not an ungoverned relationship string;
- `prerequisite_watchable_revision_id` and `watchable_revision_id`, not `source_id` and `target_id`;
- `lifecycle_status`, `import_status`, or `validation_status`, not an unexplained `status`.

## Stable identity and release revision

A stable Canon Pack identity is separate from the values imported from a particular release.

```text
canon_entity
  canon_entity_id
  canon_pack_id

canon_entity_revision
  canon_entity_revision_id
  canon_entity_id
  canon_pack_release_id
  ...common release-owned values

watchable_revision
  watchable_revision_id
  canon_entity_revision_id
  watchable_type_canon_term_revision_id
  ...Watchable release-owned values
```

This pattern preserves personal references across Pack updates and permits immutable old release projections to remain available for reconciliation and rollback.

The stable registry is deliberately narrow. `canon_entity` provides durable identity for user references; immutable release-scoped typed rows preserve values. Associations such as Memberships, Relationships, Guide Stages, and Guide Entries do not each require an additional stable table.

## Ownership boundaries

### Canon Pack-owned immutable definitions

Canon Packs own stable Canon IDs and release revisions for catalog entities, Types, classifications, Sources, provenance, memberships, relationships, Guides, presentation defaults, media references, lifecycle mappings, and extension definitions.

A Tracker imports these records. It does not edit them in place.

### Core-owned operational records

The Core owns Pack repository configuration, import reports, installed releases, activation history, update checks, schema migrations, migration backup references, portable exports, and restores.

### Tracker Instance-owned personal records

Phase 1 personal state belongs to `tracker_instance`, not a user or profile. This includes Viewing Attempts, Viewing Sessions, feedback, Local Overrides, Personal Watch Relationships, spoiler preferences/reveals, display preferences, Watch Focuses, queue projections, completion records, and Focus Change Sets.

Phase 1 deliberately does not introduce `user`, `account`, or `profile` tables. Profile ownership and migration are Phase 2 decisions.

## Optionality rule

MVP deferral does not remove a Later Phase 1 table or field from this model. It changes whether the application creates or edits that data during the MVP.

Each schema object is classified as one of:

- `MVP required` — used by the proposed minimum executable loop;
- `Phase 1 optional during MVP` — accepted Phase 1 structure whose workflow may be disabled initially;
- `Phase 1 infrastructure` — required to preserve compatibility, rollback, migration, or reconciliation even before full UI support;
- `Phase 2 excluded` — deliberately absent from the Phase 1 schema.

## Extension boundary

Common semantics use explicit relational fields and tables. Canon-specific metadata uses declared, versioned extension definitions and validated namespaced JSON objects. Extension JSON cannot redefine common fields, add executable behavior, introduce database tables, weaken validation, or create new watch states.

In the Generic DrawDB model, extension and cohesive document columns use Generic `JSON`; PostgreSQL migrations map them to schema-validated `jsonb` where appropriate.
