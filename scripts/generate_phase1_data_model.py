#!/usr/bin/env python3
"""Generate the lean Watch Tracker Phase 1 logical model artifacts."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "data-model"
GENERIC_TYPES = {"UUID", "VARCHAR", "TEXT", "INT", "BOOLEAN", "DATE", "TIMESTAMP", "JSON", "DECIMAL"}
COLORS = {
    "canon": "#3B82F6",
    "core": "#10B981",
    "projection": "#F59E0B",
    "operations": "#8B5CF6",
}
AREA_TITLES = {
    "canon": "Immutable Canon Pack domain",
    "core": "Mutable authoritative Core domain",
    "projection": "Persisted rebuildable projection",
    "operations": "Operational and infrastructure",
}


def c(name: str, typ: str, *, nn: bool = True, uq: bool = False, pk: bool = False,
      size: int | None = None, check: str = "", comment: str = "", ref: str | None = None) -> dict[str, Any]:
    return {"name": name, "type": typ, "not_null": nn, "unique": uq, "primary": pk,
            "size": size, "check": check, "comment": comment, "ref": ref}


def pk(table: str) -> dict[str, Any]:
    return c(f"{table}_id", "UUID", pk=True, comment=f"Stable {table} identity")


def fk(name: str, table: str, *, nn: bool = True, uq: bool = False, comment: str = "") -> dict[str, Any]:
    return c(name, "UUID", nn=nn, uq=uq, ref=table, comment=comment)


def ts(name: str, *, nn: bool = True) -> dict[str, Any]:
    return c(name, "TIMESTAMP", nn=nn)


def table(name: str, area: str, classification: str, responsibility: str,
          columns: list[dict[str, Any]], uniques: list[list[str]] | None = None) -> dict[str, Any]:
    return {"name": name, "area": area, "classification": classification,
            "responsibility": responsibility, "columns": columns, "uniques": uniques or []}


TABLES: list[dict[str, Any]] = [
    table("canon_pack", "canon", "MVP-required", "Identifies the logical Canon Pack across releases.", [
        pk("canon_pack"), c("slug", "VARCHAR", size=128, uq=True), c("title", "TEXT"), ts("created_at")]),
    table("canon_pack_release", "canon", "MVP-required", "Stores immutable release metadata and verified artifact details.", [
        pk("canon_pack_release"), fk("canon_pack_id", "canon_pack"), c("version", "VARCHAR", size=64),
        c("contract_version", "VARCHAR", size=32), c("core_schema_range", "VARCHAR", size=128),
        c("artifact_sha256", "VARCHAR", size=64, uq=True), c("release_metadata", "JSON"), ts("published_at")],
        [["canon_pack_id", "version"]]),
    table("canon_entity", "canon", "MVP-required", "Provides stable canonical identity across all releases and types.", [
        pk("canon_entity"), fk("canon_pack_id", "canon_pack"), c("canonical_urn", "VARCHAR", size=512, uq=True),
        c("entity_class", "VARCHAR", size=32, check="entity_class IN ('container','watchable','term','source','organization','guide')")]),
    table("canon_entity_revision", "canon", "MVP-required", "Stores release-scoped common entity labels and metadata.", [
        pk("canon_entity_revision"), fk("canon_pack_release_id", "canon_pack_release"), fk("canon_entity_id", "canon_entity"),
        c("slug", "VARCHAR", size=160), c("title", "TEXT"), c("aliases", "JSON", nn=False), c("summary", "TEXT", nn=False),
        c("extension_document", "JSON", nn=False)], [["canon_pack_release_id", "canon_entity_id"], ["canon_pack_release_id", "slug"]]),
    table("canon_entity_identity_link", "canon", "Optional", "Records governed equivalence or replacement links between identities.", [
        pk("canon_entity_identity_link"), fk("canon_pack_release_id", "canon_pack_release"),
        fk("subject_canon_entity_id", "canon_entity"), fk("target_canon_entity_id", "canon_entity"),
        c("link_kind", "VARCHAR", size=32), fk("provenance_claim_id", "provenance_claim", nn=False)]),
    table("canon_term_revision", "canon", "MVP-required", "Defines release-scoped declarative types, roles, and vocabularies.", [
        pk("canon_term_revision"), fk("canon_pack_release_id", "canon_pack_release"), fk("canon_entity_id", "canon_entity"),
        c("term_kind", "VARCHAR", size=48), c("code", "VARCHAR", size=128), c("label", "TEXT"),
        c("display_weight", "INT", nn=False), c("capabilities", "JSON", nn=False), c("presentation", "JSON", nn=False)],
        [["canon_pack_release_id", "term_kind", "code"]]),
    table("source_revision", "canon", "MVP-required", "Stores immutable release-scoped provenance-source details.", [
        pk("source_revision"), fk("canon_pack_release_id", "canon_pack_release"), fk("canon_entity_id", "canon_entity"),
        c("source_type", "VARCHAR", size=48), c("citation", "TEXT"), c("url", "VARCHAR", size=2048, nn=False),
        ts("retrieved_at", nn=False), c("license", "JSON", nn=False)], [["canon_pack_release_id", "canon_entity_id"]]),
    table("source_relation", "canon", "Optional", "Relates sources through governed citation or derivation semantics.", [
        pk("source_relation"), fk("canon_pack_release_id", "canon_pack_release"),
        fk("subject_source_revision_id", "source_revision"), fk("target_source_revision_id", "source_revision"),
        c("relation_kind", "VARCHAR", size=48), c("note", "TEXT", nn=False)]),
    table("provenance_claim", "canon", "MVP-required", "Identifies a record- or field-level canonical claim.", [
        pk("provenance_claim"), fk("canon_pack_release_id", "canon_pack_release"),
        fk("canon_entity_revision_id", "canon_entity_revision", nn=False), c("record_kind", "VARCHAR", size=64),
        c("record_id", "UUID"), c("field_path", "VARCHAR", size=512, nn=False), c("method", "VARCHAR", size=32),
        c("note", "TEXT", nn=False)]),
    table("provenance_claim_source", "canon", "MVP-required", "Connects each provenance claim to supporting sources.", [
        pk("provenance_claim_source"), fk("provenance_claim_id", "provenance_claim"), fk("source_revision_id", "source_revision"),
        c("locator", "TEXT", nn=False), c("note", "TEXT", nn=False)], [["provenance_claim_id", "source_revision_id"]]),
    table("decision_record", "canon", "Optional", "Captures governed canonical modeling decisions and rationale.", [
        pk("decision_record"), fk("canon_pack_release_id", "canon_pack_release"), c("decision_code", "VARCHAR", size=128),
        c("status", "VARCHAR", size=32), c("title", "TEXT"), c("rationale", "TEXT"), ts("effective_at")],
        [["canon_pack_release_id", "decision_code"]]),
    table("container_revision", "canon", "MVP-required", "Stores release-scoped structural Container records.", [
        pk("container_revision"), fk("canon_entity_revision_id", "canon_entity_revision", uq=True),
        fk("container_kind_canon_term_revision_id", "canon_term_revision"), c("presentation", "JSON", nn=False)]),
    table("watchable_revision", "canon", "MVP-required", "Stores release-scoped Watchable metadata and type assignment.", [
        pk("watchable_revision"), fk("canon_entity_revision_id", "canon_entity_revision", uq=True),
        fk("watchable_type_canon_term_revision_id", "canon_term_revision"), c("runtime_minutes", "INT", nn=False),
        c("spoiler_metadata", "JSON", nn=False), c("extension_document", "JSON", nn=False)]),
    table("first_public_release", "canon", "MVP-required", "Stores the Phase 1 first-public-release fact per Watchable revision.", [
        pk("first_public_release"), fk("watchable_revision_id", "watchable_revision", uq=True), c("release_date", "DATE"),
        c("precision", "VARCHAR", size=16), c("status", "VARCHAR", size=24), c("region_code", "VARCHAR", size=32, nn=False),
        c("contributor_note", "TEXT", nn=False), fk("provenance_claim_id", "provenance_claim")]),
    table("external_identifier", "canon", "Optional", "Associates canonical entities with external namespace/value identifiers.", [
        pk("external_identifier"), fk("canon_entity_revision_id", "canon_entity_revision"), c("namespace", "VARCHAR", size=128),
        c("value", "VARCHAR", size=512), fk("provenance_claim_id", "provenance_claim")],
        [["canon_entity_revision_id", "namespace", "value"]]),
    table("media_reference", "canon", "MVP-required", "Stores governed poster, artwork, and trailer references.", [
        pk("media_reference"), fk("canon_entity_revision_id", "canon_entity_revision"), c("media_kind", "VARCHAR", size=32),
        c("url", "VARCHAR", size=2048), c("title", "TEXT", nn=False), c("language", "VARCHAR", size=32, nn=False),
        c("duration_seconds", "INT", nn=False), fk("provenance_claim_id", "provenance_claim", nn=False)]),
    table("entity_organization", "canon", "Optional", "Assigns reusable organizations to entities in defined roles.", [
        pk("entity_organization"), fk("canon_entity_revision_id", "canon_entity_revision"),
        fk("organization_canon_entity_revision_id", "canon_entity_revision"), fk("role_canon_term_revision_id", "canon_term_revision"),
        fk("provenance_claim_id", "provenance_claim", nn=False)]),
    table("classification_value_revision", "canon", "Optional", "Defines release-scoped reusable classification values.", [
        pk("classification_value_revision"), fk("canon_pack_release_id", "canon_pack_release"), fk("canon_entity_id", "canon_entity"),
        fk("dimension_canon_term_revision_id", "canon_term_revision"), c("slug", "VARCHAR", size=128), c("label", "TEXT")],
        [["canon_pack_release_id", "dimension_canon_term_revision_id", "slug"]]),
    table("classification_value_parent", "canon", "Optional", "Represents classification hierarchy edges.", [
        pk("classification_value_parent"), fk("child_classification_value_revision_id", "classification_value_revision"),
        fk("parent_classification_value_revision_id", "classification_value_revision"), c("position", "INT", nn=False)]),
    table("entity_classification", "canon", "Optional", "Assigns classification values to canonical entities.", [
        pk("entity_classification"), fk("canon_entity_revision_id", "canon_entity_revision"),
        fk("classification_value_revision_id", "classification_value_revision"), fk("provenance_claim_id", "provenance_claim", nn=False)],
        [["canon_entity_revision_id", "classification_value_revision_id"]]),
    table("container_membership_revision", "canon", "MVP-required", "Stores immutable release-scoped structural memberships and ordering.", [
        pk("container_membership_revision"), fk("canon_pack_release_id", "canon_pack_release"),
        fk("container_canon_entity_revision_id", "canon_entity_revision"), fk("member_canon_entity_revision_id", "canon_entity_revision"),
        fk("role_canon_term_revision_id", "canon_term_revision"), c("position", "INT", nn=False),
        fk("provenance_claim_id", "provenance_claim")]),
    table("watch_relationship_revision", "canon", "MVP-required", "Stores immutable directed Watchable relationships and prerequisites.", [
        pk("watch_relationship_revision"), fk("canon_pack_release_id", "canon_pack_release"),
        fk("prerequisite_watchable_revision_id", "watchable_revision"), fk("watchable_revision_id", "watchable_revision"),
        fk("relationship_type_canon_term_revision_id", "canon_term_revision"), c("summary", "TEXT", nn=False),
        fk("provenance_claim_id", "provenance_claim")]),
    table("watch_guide_revision", "canon", "Optional", "Defines immutable release-scoped Watch Guides.", [
        pk("watch_guide_revision"), fk("canon_pack_release_id", "canon_pack_release"), fk("canon_entity_id", "canon_entity"),
        c("slug", "VARCHAR", size=160), c("title", "TEXT"), c("description", "TEXT", nn=False)],
        [["canon_pack_release_id", "canon_entity_id"]]),
    table("guide_stage_revision", "canon", "Optional", "Defines ordered stages within a Watch Guide revision.", [
        pk("guide_stage_revision"), fk("watch_guide_revision_id", "watch_guide_revision"), c("position", "INT"),
        c("stage_mode", "VARCHAR", size=32), c("title", "TEXT", nn=False), c("description", "TEXT", nn=False)],
        [["watch_guide_revision_id", "position"]]),
    table("guide_entry_revision", "canon", "Optional", "Places canonical entities within Guide stages.", [
        pk("guide_entry_revision"), fk("guide_stage_revision_id", "guide_stage_revision"),
        fk("canon_entity_revision_id", "canon_entity_revision"), c("position", "INT"),
        c("inclusion_class", "VARCHAR", size=24), c("choice_group", "VARCHAR", size=64, nn=False)],
        [["guide_stage_revision_id", "position"]]),
    table("extension_schema_version", "canon", "Optional", "Governs namespaced Canon extension-document schemas.", [
        pk("extension_schema_version"), fk("canon_pack_release_id", "canon_pack_release"), c("namespace", "VARCHAR", size=255),
        c("version", "VARCHAR", size=64), c("schema_uri", "VARCHAR", size=2048), c("schema_sha256", "VARCHAR", size=64)],
        [["canon_pack_release_id", "namespace", "version"]]),

    table("tracker_instance", "core", "MVP-required", "Stores deployment-wide setup and authentication state.", [
        pk("tracker_instance"), c("display_name", "TEXT"), c("credential_hash", "TEXT", nn=False), ts("setup_completed_at", nn=False),
        ts("created_at"), ts("updated_at")]),
    table("viewing_attempt", "core", "MVP-required", "Stores the single active incomplete attempt for a Watchable.", [
        pk("viewing_attempt"), fk("tracker_instance_id", "tracker_instance"), fk("canon_entity_id", "canon_entity"),
        fk("watch_focus_id", "watch_focus", nn=False), c("is_rewatch", "BOOLEAN"),
        c("idempotency_key", "VARCHAR", size=128, uq=True), ts("started_at")],
        [["tracker_instance_id", "canon_entity_id"]]),
    table("viewing_session", "core", "MVP-required", "Retains one immutable completed viewing event for a Watchable.", [
        pk("viewing_session"), fk("tracker_instance_id", "tracker_instance"), fk("canon_entity_id", "canon_entity"),
        fk("watch_focus_id", "watch_focus", nn=False), ts("started_at", nn=False), ts("completed_at"),
        c("rewatch_sequence", "INT"), c("completion_provenance", "VARCHAR", size=32),
        c("idempotency_key", "VARCHAR", size=128, uq=True)]),
    table("watchable_feedback", "core", "MVP-required", "Stores overall and optional per-session feedback without altering viewing history.", [
        pk("watchable_feedback"), fk("tracker_instance_id", "tracker_instance"), fk("canon_entity_id", "canon_entity"),
        fk("viewing_session_id", "viewing_session", nn=False),
        c("feedback_scope", "VARCHAR", size=16, check="feedback_scope IN ('overall','session') AND ((feedback_scope = 'overall' AND viewing_session_id IS NULL) OR (feedback_scope = 'session' AND viewing_session_id IS NOT NULL))"),
        c("rating", "DECIMAL", nn=False, check="rating IS NULL OR (rating >= 0.5 AND rating <= 5.0)"),
        c("favorite", "BOOLEAN"), c("would_rewatch", "BOOLEAN"), c("note", "TEXT", nn=False), c("review", "TEXT", nn=False),
        c("note_has_spoilers", "BOOLEAN"), c("review_has_spoilers", "BOOLEAN"), ts("updated_at")]),
    table("tracker_preference", "core", "MVP-required", "Stores mutable display, ordering, and spoiler preferences.", [
        pk("tracker_preference"), fk("tracker_instance_id", "tracker_instance"), c("preference_key", "VARCHAR", size=128),
        c("preference_value", "JSON"), ts("updated_at")], [["tracker_instance_id", "preference_key"]]),
    table("spoiler_reveal", "core", "Optional", "Records explicit per-Watchable spoiler-reveal choices.", [
        pk("spoiler_reveal"), fk("tracker_instance_id", "tracker_instance"), fk("canon_entity_id", "canon_entity"), ts("revealed_at")],
        [["tracker_instance_id", "canon_entity_id"]]),
    table("local_override", "core", "Optional", "Stores governed user-owned overlays on immutable Canon content.", [
        pk("local_override"), fk("tracker_instance_id", "tracker_instance"), fk("canon_entity_id", "canon_entity"),
        c("field_path", "VARCHAR", size=512), c("override_value", "JSON"), c("reason", "TEXT", nn=False), ts("updated_at")],
        [["tracker_instance_id", "canon_entity_id", "field_path"]]),
    table("personal_watch_relationship", "core", "Optional", "Stores user-defined prerequisite relationships.", [
        pk("personal_watch_relationship"), fk("tracker_instance_id", "tracker_instance"),
        fk("prerequisite_canon_entity_id", "canon_entity"), fk("watchable_canon_entity_id", "canon_entity"),
        c("note", "TEXT", nn=False), ts("created_at")]),
    table("watch_focus", "core", "MVP-required", "Stores saved Focus identity, target, lifecycle, and active status.", [
        pk("watch_focus"), fk("tracker_instance_id", "tracker_instance"), fk("target_canon_entity_id", "canon_entity", nn=False),
        c("name", "TEXT"), c("route_strategy", "VARCHAR", size=48), c("status", "VARCHAR", size=24),
        c("is_active", "BOOLEAN"), c("configuration", "JSON"), ts("created_at"), ts("completed_at", nn=False)]),
    table("watch_focus_rule", "core", "MVP-required", "Stores validated filters, policies, weights, pins, and decisions.", [
        pk("watch_focus_rule"), fk("watch_focus_id", "watch_focus"), c("rule_kind", "VARCHAR", size=48),
        c("position", "INT"), c("rule_document", "JSON")], [["watch_focus_id", "rule_kind", "position"]]),
    table("watch_focus_completion", "core", "Optional", "Preserves immutable completion snapshots for finished Focuses.", [
        pk("watch_focus_completion"), fk("watch_focus_id", "watch_focus", uq=True), fk("canon_pack_release_id", "canon_pack_release"),
        ts("completed_at"), c("completion_snapshot", "JSON"), c("snapshot_sha256", "VARCHAR", size=64)]),
    table("focus_change_set", "core", "Optional", "Records reconciliation outcomes after Canon graph changes.", [
        pk("focus_change_set"), fk("watch_focus_id", "watch_focus"),
        fk("from_canon_pack_release_id", "canon_pack_release"), fk("to_canon_pack_release_id", "canon_pack_release"),
        c("status", "VARCHAR", size=24), c("change_document", "JSON"), ts("created_at"), ts("resolved_at", nn=False)]),

    table("watch_focus_projection", "projection", "MVP-required", "Caches the generated Focus queue, explanations, and reconciliation baseline.", [
        pk("watch_focus_projection"), fk("watch_focus_id", "watch_focus", uq=True), fk("canon_pack_release_id", "canon_pack_release"),
        c("algorithm_version", "VARCHAR", size=64), c("queue_document", "JSON"), c("explanation_document", "JSON"),
        c("baseline_sha256", "VARCHAR", size=64), ts("generated_at")]),

    table("deployment_session", "operations", "Infrastructure", "Stores hashed deployment authentication sessions and expiration state.", [
        pk("deployment_session"), fk("tracker_instance_id", "tracker_instance"), c("token_hash", "VARCHAR", size=128, uq=True),
        c("csrf_hash", "VARCHAR", size=128), ts("created_at"), ts("last_seen_at"), ts("idle_expires_at"),
        ts("absolute_expires_at"), ts("revoked_at", nn=False)]),
    table("password_recovery_credential", "operations", "Infrastructure", "Stores short-lived host-generated recovery credentials.", [
        pk("password_recovery_credential"), fk("tracker_instance_id", "tracker_instance"), c("code_hash", "VARCHAR", size=128, uq=True),
        ts("created_at"), ts("expires_at"), c("failed_attempt_count", "INT"), ts("consumed_at", nn=False)]),
    table("canon_pack_repository", "operations", "Infrastructure", "Configures the Phase 1 Canon Pack release source.", [
        pk("canon_pack_repository"), fk("tracker_instance_id", "tracker_instance"), c("repository_url", "VARCHAR", size=2048),
        c("release_channel", "VARCHAR", size=32), c("trust_policy", "JSON"), ts("created_at")]),
    table("canon_pack_import", "operations", "Infrastructure", "Records validation and transactional import attempts.", [
        pk("canon_pack_import"), fk("canon_pack_repository_id", "canon_pack_repository", nn=False),
        fk("canon_pack_release_id", "canon_pack_release", nn=False), c("artifact_sha256", "VARCHAR", size=64),
        c("status", "VARCHAR", size=24), c("validation_report", "JSON"), ts("started_at"), ts("completed_at", nn=False)]),
    table("canon_pack_activation", "operations", "Infrastructure", "Records which verified release was active during each interval.", [
        pk("canon_pack_activation"), fk("canon_pack_release_id", "canon_pack_release"), fk("canon_pack_import_id", "canon_pack_import"),
        ts("activated_at"), ts("deactivated_at", nn=False)]),
    table("canon_pack_update_check", "operations", "Infrastructure", "Records update checks and discovered candidate releases.", [
        pk("canon_pack_update_check"), fk("canon_pack_repository_id", "canon_pack_repository"), c("status", "VARCHAR", size=24),
        c("candidate_version", "VARCHAR", size=64, nn=False), c("result_document", "JSON"), ts("started_at"), ts("completed_at", nn=False)]),
    table("schema_migration_run", "operations", "Infrastructure", "Records guarded startup migration executions and outcomes.", [
        pk("schema_migration_run"), c("application_version", "VARCHAR", size=64), c("database_version", "VARCHAR", size=64),
        c("status", "VARCHAR", size=24), c("backup_reference", "TEXT", nn=False), c("error_code", "VARCHAR", size=128, nn=False),
        ts("started_at"), ts("completed_at", nn=False)]),
    table("schema_migration", "operations", "Infrastructure", "Tracks individual migration versions and checksums.", [
        c("schema_migration_id", "VARCHAR", size=128, pk=True), fk("schema_migration_run_id", "schema_migration_run"),
        c("checksum_sha256", "VARCHAR", size=64), ts("applied_at")]),
    table("portable_transfer", "operations", "Infrastructure", "Records portable export, restore, and validation operations.", [
        pk("portable_transfer"), fk("tracker_instance_id", "tracker_instance"), c("direction", "VARCHAR", size=16),
        c("format_version", "VARCHAR", size=32), c("artifact_sha256", "VARCHAR", size=64, nn=False),
        c("status", "VARCHAR", size=24), c("result_document", "JSON"), ts("started_at"), ts("completed_at", nn=False)]),
]

VIEWS = [
    ("effective_canon_entity", "Active release entity rows with Local Overrides layered separately."),
    ("effective_container", "Effective structural Containers for the active Pack."),
    ("effective_watchable", "Effective Watchables with declarative Type and release fact."),
    ("catalog_watchable", "Catalog projection with placement, media, state, and prerequisite summaries."),
    ("viewing_state", "Derived Not Started, In Progress, or Watched state."),
    ("active_watch_focus_queue", "Ordered queue rows expanded from the active Focus projection."),
    ("next_up", "First eligible queue entry with deterministic explanation."),
    ("guide_stage_satisfaction", "Derived Guide Stage satisfaction from Entry inclusion and viewing state."),
    ("watch_focus_progress", "Derived Focus completion and progress aggregates."),
]


def validate() -> list[tuple[str, str, str, str]]:
    errors: list[str] = []
    names = [t["name"] for t in TABLES]
    if len(TABLES) != 48: errors.append(f"expected 48 tables, found {len(TABLES)}")
    if len(set(names)) != len(names): errors.append("duplicate table names")
    if len(VIEWS) != 9 or len({v[0] for v in VIEWS}) != 9: errors.append("expected 9 unique views")
    counts = {area: sum(t["area"] == area for t in TABLES) for area in AREA_TITLES}
    if counts != {"canon": 26, "core": 12, "projection": 1, "operations": 9}: errors.append(f"area counts differ: {counts}")
    by_name = {t["name"]: t for t in TABLES}
    relationships: list[tuple[str, str, str, str]] = []
    for t in TABLES:
        cols = t["columns"]
        col_names = [x["name"] for x in cols]
        if len(col_names) != len(set(col_names)): errors.append(f"{t['name']}: duplicate columns")
        pks = [x for x in cols if x["primary"]]
        if len(pks) != 1 or pks[0]["name"] != f"{t['name']}_id": errors.append(f"{t['name']}: PK must be {t['name']}_id")
        for col in cols:
            if col["type"] not in GENERIC_TYPES: errors.append(f"{t['name']}.{col['name']}: unsupported type {col['type']}")
            target = col["ref"]
            if target:
                if target not in by_name: errors.append(f"{t['name']}.{col['name']}: missing target {target}")
                else:
                    target_pk = f"{target}_id"
                    # Exact target key names are required unless a table has multiple role-qualified references.
                    if col["name"] != target_pk and not col["name"].endswith("_" + target_pk):
                        errors.append(f"{t['name']}.{col['name']}: role-qualified FK must end with {target_pk}")
                    relationships.append((t["name"], col["name"], target, target_pk))
        for unique in t["uniques"]:
            missing = set(unique) - set(col_names)
            if missing: errors.append(f"{t['name']}: unique uses missing columns {sorted(missing)}")
    if errors:
        raise SystemExit("MODEL INVALID:\n- " + "\n- ".join(errors))
    return relationships


def relationship_cardinality(from_table: str, from_column: str) -> str:
    source = next(t for t in TABLES if t["name"] == from_table)
    column = next(col for col in source["columns"] if col["name"] == from_column)
    return "one_to_one" if column["unique"] else "many_to_one"


def logical_model(relationships: list[tuple[str, str, str, str]]) -> dict[str, Any]:
    return {"modelVersion": "0.1.0", "title": "Watch Tracker Phase 1 logical model",
            "databaseMode": "Generic", "tableBudget": 48, "derivedViewBudget": 9,
            "tables": TABLES, "relationships": [
                {"fromTable": a, "fromColumn": b, "toTable": c_, "toColumn": d,
                 "cardinality": relationship_cardinality(a, b)}
                for a, b, c_, d in relationships],
            "derivedViews": [{"name": name, "responsibility": responsibility} for name, responsibility in VIEWS]}


def dbml(relationships: list[tuple[str, str, str, str]]) -> str:
    lines = ["// Watch Tracker Phase 1 lean logical model", "// Generated; authoritative definitions are in scripts/generate_phase1_data_model.py", ""]
    for t in TABLES:
        lines += [f"Table {t['name']} {{"]
        for col in t["columns"]:
            typ = col["type"].lower()
            if col["size"]: typ += f"({col['size']})"
            attrs = []
            if col["primary"]: attrs.append("pk")
            if col["not_null"]: attrs.append("not null")
            if col["unique"]: attrs.append("unique")
            suffix = f" [{', '.join(attrs)}]" if attrs else ""
            lines.append(f"  {col['name']} {typ}{suffix}")
        for i, unique in enumerate(t["uniques"], 1):
            lines.append(f"  Indexes {{ ({', '.join(unique)}) [unique, name: 'uq_{t['name']}_{i}'] }}")
        lines += [f"  Note: '{t['classification']}: {t['responsibility'].replace(chr(39), chr(39)*2)}'", "}", ""]
    for a, b, c_, d in relationships:
        operator = "-" if relationship_cardinality(a, b) == "one_to_one" else ">"
        lines.append(f"Ref: {a}.{b} {operator} {c_}.{d}")
    lines += ["", "// Derived SQL views (not persisted)"] + [f"// - {n}: {r}" for n, r in VIEWS]
    return "\n".join(lines) + "\n"


def drawdb(relationships: list[tuple[str, str, str, str]]) -> dict[str, Any]:
    positions: dict[str, tuple[int, int]] = {}
    area_order = ["canon", "core", "projection", "operations"]
    areas = []
    x_origins = {"canon": 60, "core": 1950, "projection": 2900, "operations": 3350}
    widths = {"canon": 1800, "core": 900, "projection": 380, "operations": 900}
    for ai, area in enumerate(area_order, 1):
        members = [t for t in TABLES if t["area"] == area]
        cols = 4 if area == "canon" else 2
        for idx, t in enumerate(members):
            positions[t["name"]] = (x_origins[area] + (idx % cols) * 430, 100 + (idx // cols) * 480)
        rows = (len(members) + cols - 1) // cols
        areas.append({"id": ai, "name": AREA_TITLES[area], "x": x_origins[area]-30, "y": 50,
                      "width": widths[area], "height": max(600, rows*480+100), "color": COLORS[area]})
    tables_json = []
    field_ids: dict[tuple[str, str], str] = {}
    for ti, t in enumerate(TABLES, 1):
        fields = []
        for fi, col in enumerate(t["columns"], 1):
            fid = f"f{ti}_{fi}"
            field_ids[(t["name"], col["name"])] = fid
            f = {"id": fid, "name": col["name"], "type": col["type"], "default": "", "check": col["check"],
                 "primary": col["primary"], "unique": col["unique"], "notNull": col["not_null"],
                 "increment": False, "comment": col["comment"]}
            if col["size"]: f["size"] = col["size"]
            fields.append(f)
        indices = [{"name": f"uq_{t['name']}_{i}", "unique": True,
                    "fields": [field_ids[(t["name"], name)] for name in unique]}
                   for i, unique in enumerate(t["uniques"], 1)]
        x, y = positions[t["name"]]
        tables_json.append({"id": t["name"], "name": t["name"].upper(), "x": x, "y": y, "fields": fields,
                            "comment": f"{t['classification']}: {t['responsibility']}", "indices": indices,
                            "color": COLORS[t["area"]]})
    rels = []
    for i, (a, b, c_, d) in enumerate(relationships, 1):
        rels.append({"startTableId": a, "startFieldId": field_ids[(a,b)], "endTableId": c_,
                     "endFieldId": field_ids[(c_,d)], "name": f"fk_{a}_{b}",
                     "cardinality": relationship_cardinality(a, b),
                     "updateConstraint": "No action", "deleteConstraint": "Restrict", "id": f"r{i}"})
    notes = [
        {"id": 1, "x": 60, "y": 3550, "title": "Persistence boundary", "content": "Blue is immutable Pack data; green is mutable authoritative Core data; amber is a rebuildable cache; purple is operational state. Nine named SQL views remain derived and are not tables.", "color": "#64748B", "height": 180, "width": 680},
        {"id": 2, "x": 780, "y": 3550, "title": "Identity and naming", "content": "Every primary key repeats its table name. Foreign keys preserve the referenced key; role prefixes are used only when one table references the same target in multiple semantic roles.", "color": "#64748B", "height": 180, "width": 680},
        {"id": 3, "x": 1500, "y": 3550, "title": "Historical releases", "content": "Verified artifacts and release-scoped immutable rows retain history. The model does not duplicate a stable/revision pair for every record family and does not persist derived recommendations as authority.", "color": "#64748B", "height": 180, "width": 680},
    ]
    return {"title": "Watch Tracker — Lean Phase 1 Logical ERD", "database": "generic", "tables": tables_json,
            "relationships": rels, "notes": notes, "subjectAreas": areas, "types": [], "enums": []}


def dictionary() -> str:
    lines = ["# Watch Tracker Phase 1 data dictionary", "", "## TL;DR", "",
             "The complete lean Phase 1 model contains **48 persisted tables** and **9 non-persisted derived SQL views**. It separates immutable Canon Pack content, mutable authoritative Core records, one explicitly rebuildable projection, and operational records.", "",
             "Generated from the authoritative model definitions in `scripts/generate_phase1_data_model.py`; do not edit this file directly.", ""]
    for area in AREA_TITLES:
        members = [t for t in TABLES if t["area"] == area]
        lines += [f"## {AREA_TITLES[area]} — {len(members)} tables", ""]
        for t in members:
            lines += [f"### `{t['name']}` — {t['classification']}", "", t["responsibility"], "",
                      "| Column | Type | Null | Key / constraint |", "|---|---|---:|---|"]
            for col in t["columns"]:
                constraints = []
                if col["primary"]: constraints.append("PK")
                if col["ref"]: constraints.append(f"FK → `{col['ref']}.{col['ref']}_id`")
                if col["unique"]: constraints.append("UNIQUE")
                if col["check"]: constraints.append(f"CHECK `{col['check']}`")
                typ = col["type"] + (f"({col['size']})" if col["size"] else "")
                lines.append(f"| `{col['name']}` | `{typ}` | {'No' if col['not_null'] else 'Yes'} | {'; '.join(constraints)} |")
            if t["uniques"]:
                lines += ["", "Composite uniqueness: " + "; ".join("(`" + "`, `".join(u) + "`)" for u in t["uniques"])]
            lines.append("")
    lines += ["## Derived SQL views — 9", "", "| View | Responsibility |", "|---|---|"]
    lines += [f"| `{name}` | {responsibility} |" for name, responsibility in VIEWS]
    lines += ["", "## Naming exception", "", "A foreign key normally has the exact referenced primary-key name. When a table references the same target table in more than one semantic role, a role prefix is added while the complete referenced key remains the suffix (for example, `subject_canon_entity_id` and `target_canon_entity_id`).", ""]
    return "\n".join(lines)


def budget() -> str:
    lines = ["# Watch Tracker Phase 1 table budget", "", "## TL;DR", "",
             "The accepted lean budget is **48 persisted PostgreSQL tables plus 9 derived SQL views**. This is 57 fewer tables (54.3%) than the rejected 105-table completeness prototype.", "",
             "| Class | Persisted tables |", "|---|---:|", "| Immutable Canon Pack domain | 26 |",
             "| Mutable authoritative Core domain | 12 |", "| Persisted rebuildable projection | 1 |",
             "| Operational and infrastructure | 9 |", "| **Total** | **48** |", "| Non-persisted derived SQL views | 9 |", "",
             "## Representation rules", "", "- Normalize stable identities, graph edges, ownership boundaries, lifecycle records, and records requiring relational integrity.",
             "- Keep cohesive configuration, presentation, validation reports, snapshots, and uncommon namespaced extensions in governed schema-validated JSON.",
             "- Keep Next Up, effective catalog data, viewing state, Guide satisfaction, and Focus progress derived.",
             "- Retain verified release artifacts and immutable release-scoped rows; do not create a stable/revision pair for every record family.",
             "- Treat the historical 15-table Canon Pack 0.1 ERD as historical, not as the Phase 1 Core schema.", "", "## Inventory", ""]
    for area in AREA_TITLES:
        lines += [f"### {AREA_TITLES[area]}", ""] + [f"- `{t['name']}` — {t['classification']}: {t['responsibility']}" for t in TABLES if t["area"] == area] + [""]
    lines += ["### Derived views", ""] + [f"- `{n}` — {r}" for n, r in VIEWS] + [""]
    return "\n".join(lines)


def canonical_json(value: Any) -> str:
    return json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def outputs() -> dict[Path, str]:
    relationships = validate()
    model = logical_model(relationships)
    draw = canonical_json(drawdb(relationships))
    generated = {
        OUT / "phase-1-logical-model.json": canonical_json(model),
        OUT / "phase-1.drawdb.json": draw,
        OUT / "phase-1.ddb": draw,
        OUT / "phase-1.dbml": dbml(relationships),
        OUT / "phase-1-data-dictionary.md": dictionary(),
        OUT / "phase-1-table-budget.md": budget(),
    }
    manifest = {p.name: hashlib.sha256(content.encode()).hexdigest() for p, content in sorted(generated.items())}
    generated[OUT / "generated-artifacts.sha256.json"] = canonical_json(manifest)
    return generated


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    generated = outputs()
    if args.check:
        drift = [str(p.relative_to(ROOT)) for p, content in generated.items() if not p.exists() or p.read_text() != content]
        if drift: raise SystemExit("GENERATED ARTIFACT DRIFT:\n- " + "\n- ".join(drift))
        print(f"PASS mode=check tables={len(TABLES)} relationships={len(validate())} views={len(VIEWS)}")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    for path, content in generated.items():
        path.write_text(content)
    print(f"PASS mode=write tables={len(TABLES)} relationships={len(validate())} views={len(VIEWS)}")


if __name__ == "__main__":
    main()
