ALTER TABLE app_session
  ADD COLUMN tracker_instance_id uuid REFERENCES tracker_instance(tracker_instance_id);

UPDATE app_session AS session
SET tracker_instance_id = setup.tracker_instance_id
FROM installation_setup AS setup
WHERE setup.singleton;

ALTER TABLE app_session
  ALTER COLUMN tracker_instance_id SET NOT NULL;

CREATE INDEX app_session_tracker_instance_idx
  ON app_session (tracker_instance_id, expires_at);

-- User-owned Catalog records are deliberately separate from immutable signed Pack rows.
CREATE TABLE catalog_addition (
  catalog_addition_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_instance_id uuid NOT NULL REFERENCES tracker_instance(tracker_instance_id),
  slug varchar(160) NOT NULL,
  title text NOT NULL,
  type varchar(32) NOT NULL,
  summary text NOT NULL,
  release_date date NOT NULL,
  runtime_minutes integer NOT NULL,
  primary_series text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  queue_reason text NOT NULL,
  poster_url text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at timestamptz,
  CONSTRAINT catalog_addition_slug_format
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT catalog_addition_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT catalog_addition_type_valid
    CHECK (type IN ('movie', 'episode', 'special', 'short', 'lantern-signal')),
  CONSTRAINT catalog_addition_summary_not_blank CHECK (btrim(summary) <> ''),
  CONSTRAINT catalog_addition_runtime_valid
    CHECK (runtime_minutes BETWEEN 1 AND 10080),
  CONSTRAINT catalog_addition_series_not_blank CHECK (btrim(primary_series) <> ''),
  CONSTRAINT catalog_addition_queue_reason_not_blank CHECK (btrim(queue_reason) <> ''),
  CONSTRAINT catalog_addition_aliases_limited CHECK (cardinality(aliases) <= 20),
  CONSTRAINT catalog_addition_poster_url_approved
    CHECK (poster_url IS NULL OR poster_url ~ '^https://(image\.tmdb\.org|media\.themoviedb\.org)/'),
  CONSTRAINT catalog_addition_updated_after_created CHECK (updated_at >= created_at),
  CONSTRAINT catalog_addition_deleted_after_created
    CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE UNIQUE INDEX catalog_addition_owner_slug_active_key
  ON catalog_addition (tracker_instance_id, slug)
  WHERE deleted_at IS NULL;

CREATE INDEX catalog_addition_owner_updated_idx
  ON catalog_addition (tracker_instance_id, updated_at DESC)
  WHERE deleted_at IS NULL;
