ALTER TABLE canon_pack_release
  ADD COLUMN inventory_file_count integer,
  ADD COLUMN inventory_total_bytes bigint,
  ADD COLUMN verification_status varchar(16),
  ADD COLUMN checksums_sha256 char(64);

ALTER TABLE canon_pack_watchable
  ADD COLUMN season_number integer,
  ADD COLUMN episode_number integer,
  ADD COLUMN aliases text[] NOT NULL DEFAULT '{}',
  ADD COLUMN generated_poster boolean NOT NULL DEFAULT false,
  ADD COLUMN queue_reason text,
  ADD COLUMN poster_url text;

UPDATE canon_pack_watchable
SET queue_reason = summary
WHERE queue_reason IS NULL;

ALTER TABLE canon_pack_watchable
  ALTER COLUMN queue_reason SET NOT NULL;

ALTER TABLE canon_pack_viewing_attempt
  ADD COLUMN watched_minutes integer,
  ADD COLUMN completed_at timestamptz;

UPDATE canon_pack_release
SET verification_status = 'verified'
WHERE verification_status IS NULL;

UPDATE canon_pack_viewing_attempt AS attempt
SET completed_at = attempt.created_at,
    watched_minutes = watchable.runtime_minutes
FROM canon_pack_watchable AS watchable
WHERE attempt.status = 'completed'
  AND attempt.canon_pack_release_id = watchable.canon_pack_release_id
  AND attempt.watchable_id = watchable.watchable_id;

ALTER TABLE canon_pack_release
  ADD CONSTRAINT canon_pack_release_inventory_file_count_positive CHECK (inventory_file_count IS NULL OR inventory_file_count > 0),
  ADD CONSTRAINT canon_pack_release_inventory_total_bytes_positive CHECK (inventory_total_bytes IS NULL OR inventory_total_bytes > 0),
  ADD CONSTRAINT canon_pack_release_verification_status_valid CHECK (verification_status IS NULL OR verification_status IN ('verified', 'rejected')),
  ADD CONSTRAINT canon_pack_release_checksums_sha256_format CHECK (checksums_sha256 IS NULL OR checksums_sha256 ~ '^[0-9a-f]{64}$');

ALTER TABLE canon_pack_watchable
  ADD CONSTRAINT canon_pack_watchable_season_positive CHECK (season_number IS NULL OR season_number > 0),
  ADD CONSTRAINT canon_pack_watchable_episode_positive CHECK (episode_number IS NULL OR episode_number > 0),
  ADD CONSTRAINT canon_pack_watchable_episode_identity_pair CHECK ((season_number IS NULL) = (episode_number IS NULL)),
  ADD CONSTRAINT canon_pack_watchable_queue_reason_not_blank CHECK (btrim(queue_reason) <> ''),
  ADD CONSTRAINT canon_pack_watchable_poster_url_approved CHECK (poster_url IS NULL OR poster_url ~ '^https://(image\.tmdb\.org|media\.themoviedb\.org)/');

ALTER TABLE canon_pack_viewing_attempt
  ADD CONSTRAINT canon_pack_viewing_attempt_watched_minutes_positive CHECK (watched_minutes IS NULL OR watched_minutes >= 0),
  ADD CONSTRAINT canon_pack_viewing_attempt_completed_at_consistent CHECK (status <> 'completed' OR completed_at IS NOT NULL);
