CREATE TABLE password_reset_token (
  token_sha256 char(64) PRIMARY KEY,
  tracker_instance_id uuid NOT NULL REFERENCES tracker_instance(tracker_instance_id),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT password_reset_token_sha256_format
    CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT password_reset_token_expiry_after_created
    CHECK (expires_at > created_at),
  CONSTRAINT password_reset_token_consumed_after_created
    CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX password_reset_token_tracker_instance_idx
  ON password_reset_token (tracker_instance_id, expires_at)
  WHERE consumed_at IS NULL;
