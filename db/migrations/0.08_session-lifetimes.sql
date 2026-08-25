ALTER TABLE app_session
  ADD COLUMN last_seen_at timestamptz,
  ADD COLUMN absolute_expires_at timestamptz;

UPDATE app_session
SET last_seen_at = created_at,
    absolute_expires_at = created_at + INTERVAL '90 days';

ALTER TABLE app_session
  ALTER COLUMN last_seen_at SET NOT NULL,
  ALTER COLUMN absolute_expires_at SET NOT NULL;

ALTER TABLE app_session
  ADD CONSTRAINT app_session_idle_expiry_within_absolute
    CHECK (expires_at <= absolute_expires_at),
  ADD CONSTRAINT app_session_last_seen_after_created
    CHECK (last_seen_at >= created_at),
  ADD CONSTRAINT app_session_absolute_expiry_after_created
    CHECK (absolute_expires_at > created_at);

CREATE INDEX app_session_absolute_expires_at_idx
  ON app_session (absolute_expires_at);
