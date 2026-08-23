# Watch Tracker Phase 1 data model

## TL;DR

The canonical lean Phase 1 model contains **48 persisted tables**, **95 relationships**, and **9 non-persisted derived SQL views**. Model definitions in `scripts/generate_phase1_data_model.py` are authoritative. Native DrawDB JSON is the canonical published diagram format; `.ddb` is a byte-identical compatibility copy; DBML is a lossy fallback.

## Artifacts

| File | Purpose |
|---|---|
| `phase-1-logical-model.json` | Generated normalized machine-readable logical model |
| `phase-1.drawdb.json` | Generated canonical DrawDB Generic diagram for review and import |
| `phase-1.ddb` | Byte-identical DrawDB compatibility copy |
| `phase-1.dbml` | Lossy portable/import fallback |
| `phase-1-data-dictionary.md` | Generated table/column/key dictionary |
| `phase-1-table-budget.md` | Generated representation decisions and exact inventory |
| `generated-artifacts.sha256.json` | SHA-256 manifest for generated artifacts |
| `naming-and-ownership.md` | Naming and persistence ownership conventions |
| `canon-pack-postgresql-crosswalk.md` | Authoring → release → PostgreSQL mapping |
| `shortcut-audit.md` | Historical Canon Pack 0.1 omissions and lean corrections |

## Regeneration

```bash
python3 scripts/generate_phase1_data_model.py
python3 scripts/generate_phase1_data_model.py --check
```

`--check` fails if any generated artifact is absent or differs from the generator's canonical output.

Edit model definitions in `scripts/generate_phase1_data_model.py`, regenerate, and review the resulting DrawDB diagram. Direct edits to generated JSON, DrawDB, DDB, DBML, dictionary, budget, or checksum files are intentionally rejected as drift.

## DrawDB import

1. Open DrawDB.
2. Select **Generic** database mode before importing.
3. Import `phase-1.drawdb.json` or `phase-1.ddb`.
4. Use subject areas and colors to distinguish ownership:
   - blue: immutable Canon Pack data;
   - green: mutable authoritative Core data;
   - amber: explicitly rebuildable projection;
   - purple: operational/infrastructure records.

Compatibility is validated against DrawDB source commit `bb3fdf0a0b088e1508129bfc5eb508e6dfa5bb01`.

## Logical versus physical model

This is the accepted logical model. PostgreSQL migrations will add physical indexes, partial uniqueness, `jsonb`, check/deferred constraints, graph-cycle validation, advisory migration locking, append-only application rules, and transactional activation mechanics. Those physical details must preserve the identities, ownership boundaries, and cardinalities documented here.

## Phase boundary

The diagram includes MVP-required, Later Phase 1 optional, rebuildable, and infrastructure structures. It deliberately excludes Phase 2 users/profiles, simultaneous multi-Pack composition, regional Release Event graphs, provider availability, playback progress, and Pack executable extensions.
