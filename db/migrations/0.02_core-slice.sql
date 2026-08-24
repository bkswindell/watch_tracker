CREATE TABLE installation_setup (
  singleton boolean PRIMARY KEY DEFAULT true,
  tracker_instance_id uuid NOT NULL UNIQUE REFERENCES tracker_instance(tracker_instance_id),
  CONSTRAINT installation_setup_singleton_true CHECK (singleton)
);

CREATE TABLE app_session (
  token_sha256 char(64) PRIMARY KEY,
  csrf_token char(64) NOT NULL,
  csrf_sha256 char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT app_session_token_sha256_format
    CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT app_session_csrf_token_format
    CHECK (csrf_token ~ '^[0-9a-f]{64}$'),
  CONSTRAINT app_session_csrf_sha256_format
    CHECK (csrf_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX app_session_expires_at_idx ON app_session (expires_at);

CREATE TABLE active_canon_pack (
  singleton boolean PRIMARY KEY DEFAULT true,
  title text NOT NULL,
  version varchar(64) NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT active_canon_pack_singleton_true CHECK (singleton),
  CONSTRAINT active_canon_pack_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT active_canon_pack_version_not_blank CHECK (btrim(version) <> '')
);

CREATE TABLE catalog_item (
  slug varchar(160) PRIMARY KEY,
  title text NOT NULL,
  type varchar(16) NOT NULL,
  summary text NOT NULL,
  release_order integer NOT NULL UNIQUE,
  CONSTRAINT catalog_item_slug_not_blank CHECK (btrim(slug) <> ''),
  CONSTRAINT catalog_item_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT catalog_item_type_valid
    CHECK (type IN ('Movie', 'Episode', 'Special', 'Short')),
  CONSTRAINT catalog_item_summary_not_blank CHECK (btrim(summary) <> ''),
  CONSTRAINT catalog_item_release_order_positive CHECK (release_order > 0)
);

CREATE TABLE watch_focus (
  singleton boolean PRIMARY KEY DEFAULT true,
  target_slug varchar(160) NOT NULL REFERENCES catalog_item(slug),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT watch_focus_singleton_true CHECK (singleton)
);

CREATE TABLE viewing_attempt (
  viewing_attempt_id uuid PRIMARY KEY,
  catalog_slug varchar(160) NOT NULL REFERENCES catalog_item(slug),
  status varchar(16) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT viewing_attempt_status_valid
    CHECK (status IN ('active', 'completed', 'discarded'))
);

CREATE INDEX viewing_attempt_catalog_created_idx
  ON viewing_attempt (catalog_slug, created_at DESC);
