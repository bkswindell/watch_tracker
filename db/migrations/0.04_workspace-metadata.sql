ALTER TABLE canon_pack_watchable
  ADD COLUMN runtime_minutes integer,
  ADD COLUMN primary_series text;

UPDATE canon_pack_watchable
SET runtime_minutes = 1,
    primary_series = 'Unclassified'
WHERE runtime_minutes IS NULL OR primary_series IS NULL;

ALTER TABLE canon_pack_watchable
  ALTER COLUMN runtime_minutes SET NOT NULL,
  ALTER COLUMN primary_series SET NOT NULL,
  ADD CONSTRAINT canon_pack_watchable_runtime_positive CHECK (runtime_minutes > 0),
  ADD CONSTRAINT canon_pack_watchable_primary_series_not_blank CHECK (btrim(primary_series) <> '');
