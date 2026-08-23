CREATE TABLE schema_migration (
  schema_migration_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_version varchar(32) NOT NULL UNIQUE,
  migration_name varchar(255) NOT NULL,
  migration_sha256 char(64) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT schema_migration_version_not_blank
    CHECK (btrim(migration_version) <> ''),
  CONSTRAINT schema_migration_name_not_blank
    CHECK (btrim(migration_name) <> ''),
  CONSTRAINT schema_migration_sha256_format
    CHECK (migration_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE TABLE tracker_instance (
  tracker_instance_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  credential_hash text,
  setup_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tracker_instance_display_name_not_blank
    CHECK (btrim(display_name) <> ''),
  CONSTRAINT tracker_instance_updated_after_created
    CHECK (updated_at >= created_at)
);
