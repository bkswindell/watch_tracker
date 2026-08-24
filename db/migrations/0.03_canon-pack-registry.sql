CREATE TABLE canon_pack_release (
  canon_pack_release_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL,
  pack_slug varchar(160) NOT NULL,
  pack_title text NOT NULL,
  pack_version varchar(64) NOT NULL,
  contract_version varchar(16) NOT NULL,
  manifest_sha256 char(64) NOT NULL,
  source_path text NOT NULL,
  validated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT canon_pack_release_identity_unique UNIQUE (pack_id, pack_version),
  CONSTRAINT canon_pack_release_slug_not_blank CHECK (btrim(pack_slug) <> ''),
  CONSTRAINT canon_pack_release_title_not_blank CHECK (btrim(pack_title) <> ''),
  CONSTRAINT canon_pack_release_version_not_blank CHECK (btrim(pack_version) <> ''),
  CONSTRAINT canon_pack_release_contract_valid CHECK (contract_version = '0.2.0'),
  CONSTRAINT canon_pack_release_manifest_sha256_format CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT canon_pack_release_source_path_absolute CHECK (source_path ~ '^/')
);

CREATE TABLE canon_pack_source (
  canon_pack_release_id uuid NOT NULL REFERENCES canon_pack_release(canon_pack_release_id),
  source_id uuid NOT NULL,
  slug varchar(160) NOT NULL,
  title text NOT NULL,
  PRIMARY KEY (canon_pack_release_id, source_id)
);

CREATE TABLE canon_pack_watchable_type (
  canon_pack_release_id uuid NOT NULL REFERENCES canon_pack_release(canon_pack_release_id),
  watchable_type_id uuid NOT NULL,
  code varchar(160) NOT NULL,
  label text NOT NULL,
  display_weight integer NOT NULL,
  PRIMARY KEY (canon_pack_release_id, watchable_type_id),
  CONSTRAINT canon_pack_watchable_type_weight_positive CHECK (display_weight > 0)
);

CREATE TABLE canon_pack_container (
  canon_pack_release_id uuid NOT NULL REFERENCES canon_pack_release(canon_pack_release_id),
  container_id uuid NOT NULL,
  slug varchar(160) NOT NULL,
  title text NOT NULL,
  kind varchar(80) NOT NULL,
  PRIMARY KEY (canon_pack_release_id, container_id),
  UNIQUE (canon_pack_release_id, slug)
);

CREATE TABLE canon_pack_watchable (
  canon_pack_release_id uuid NOT NULL REFERENCES canon_pack_release(canon_pack_release_id),
  watchable_id uuid NOT NULL,
  slug varchar(160) NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  watchable_type_id uuid NOT NULL,
  release_date date NOT NULL,
  release_order integer NOT NULL,
  PRIMARY KEY (canon_pack_release_id, watchable_id),
  UNIQUE (canon_pack_release_id, slug),
  UNIQUE (canon_pack_release_id, release_order),
  FOREIGN KEY (canon_pack_release_id, watchable_type_id)
    REFERENCES canon_pack_watchable_type(canon_pack_release_id, watchable_type_id),
  CONSTRAINT canon_pack_watchable_release_order_positive CHECK (release_order > 0)
);

CREATE TABLE canon_pack_membership (
  canon_pack_release_id uuid NOT NULL REFERENCES canon_pack_release(canon_pack_release_id),
  membership_id uuid NOT NULL,
  container_id uuid NOT NULL,
  member_id uuid NOT NULL,
  position integer,
  role varchar(80) NOT NULL,
  PRIMARY KEY (canon_pack_release_id, membership_id),
  FOREIGN KEY (canon_pack_release_id, container_id)
    REFERENCES canon_pack_container(canon_pack_release_id, container_id),
  CONSTRAINT canon_pack_membership_position_positive CHECK (position > 0)
);

CREATE TABLE canon_pack_relationship (
  canon_pack_release_id uuid NOT NULL REFERENCES canon_pack_release(canon_pack_release_id),
  relationship_id uuid NOT NULL,
  watchable_id uuid NOT NULL,
  prerequisite_id uuid NOT NULL,
  relationship_type varchar(80) NOT NULL,
  summary text NOT NULL,
  PRIMARY KEY (canon_pack_release_id, relationship_id),
  FOREIGN KEY (canon_pack_release_id, watchable_id)
    REFERENCES canon_pack_watchable(canon_pack_release_id, watchable_id),
  FOREIGN KEY (canon_pack_release_id, prerequisite_id)
    REFERENCES canon_pack_watchable(canon_pack_release_id, watchable_id)
);

CREATE TABLE canon_pack_import (
  canon_pack_import_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canon_pack_release_id uuid NOT NULL REFERENCES canon_pack_release(canon_pack_release_id),
  manifest_sha256 char(64) NOT NULL,
  source_path text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT canon_pack_import_manifest_sha256_format CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT canon_pack_import_source_path_absolute CHECK (source_path ~ '^/')
);

CREATE TABLE active_canon_pack_registry (
  singleton boolean PRIMARY KEY DEFAULT true,
  canon_pack_release_id uuid NOT NULL REFERENCES canon_pack_release(canon_pack_release_id),
  activated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT active_canon_pack_registry_singleton_true CHECK (singleton)
);

CREATE TABLE canon_pack_watch_focus (
  singleton boolean PRIMARY KEY DEFAULT true,
  canon_pack_release_id uuid NOT NULL,
  watchable_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (canon_pack_release_id, watchable_id)
    REFERENCES canon_pack_watchable(canon_pack_release_id, watchable_id),
  CONSTRAINT canon_pack_watch_focus_singleton_true CHECK (singleton)
);

CREATE TABLE canon_pack_viewing_attempt (
  viewing_attempt_id uuid PRIMARY KEY,
  canon_pack_release_id uuid NOT NULL,
  watchable_id uuid NOT NULL,
  status varchar(16) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (canon_pack_release_id, watchable_id)
    REFERENCES canon_pack_watchable(canon_pack_release_id, watchable_id),
  CONSTRAINT canon_pack_viewing_attempt_status_valid
    CHECK (status IN ('active', 'completed', 'discarded'))
);

CREATE INDEX canon_pack_viewing_attempt_active_idx
  ON canon_pack_viewing_attempt (canon_pack_release_id, watchable_id, created_at DESC);

-- Preserve the complete visible 0.02 projection before the registry becomes authoritative.
-- The synthetic legacy release is intentionally stable per 0.02 active version; original
-- slugs, ordering, focus, and attempt timestamps remain the user-visible identities.
INSERT INTO canon_pack_release
  (pack_id, pack_slug, pack_title, pack_version, contract_version, manifest_sha256, source_path, validated_at)
SELECT
  '00000000-0000-7000-8000-000000000020'::uuid,
  'legacy-core-slice',
  active.title,
  active.version,
  '0.2.0',
  repeat('0', 64),
  '/legacy/0.02',
  active.imported_at
FROM active_canon_pack AS active
WHERE active.singleton;

INSERT INTO canon_pack_watchable_type
  (canon_pack_release_id, watchable_type_id, code, label, display_weight)
SELECT
  release.canon_pack_release_id,
  (substr(md5('legacy-type:' || item.type), 1, 8) || '-' || substr(md5('legacy-type:' || item.type), 9, 4) || '-7000-8000-' || substr(md5('legacy-type:' || item.type), 17, 12))::uuid,
  lower(item.type),
  item.type,
  row_number() OVER (ORDER BY item.type)
FROM (
  SELECT DISTINCT catalog_item.type FROM catalog_item
) AS item
JOIN canon_pack_release AS release
  ON release.pack_id = '00000000-0000-7000-8000-000000000020'::uuid
JOIN active_canon_pack AS active ON active.version = release.pack_version AND active.singleton;

INSERT INTO canon_pack_watchable
  (canon_pack_release_id, watchable_id, slug, title, summary, watchable_type_id, release_date, release_order)
SELECT
  release.canon_pack_release_id,
  (substr(md5('legacy-watchable:' || item.slug), 1, 8) || '-' || substr(md5('legacy-watchable:' || item.slug), 9, 4) || '-7000-8000-' || substr(md5('legacy-watchable:' || item.slug), 17, 12))::uuid,
  item.slug,
  item.title,
  item.summary,
  (substr(md5('legacy-type:' || item.type), 1, 8) || '-' || substr(md5('legacy-type:' || item.type), 9, 4) || '-7000-8000-' || substr(md5('legacy-type:' || item.type), 17, 12))::uuid,
  CURRENT_DATE,
  item.release_order
FROM catalog_item AS item
JOIN canon_pack_release AS release
  ON release.pack_id = '00000000-0000-7000-8000-000000000020'::uuid
JOIN active_canon_pack AS active ON active.version = release.pack_version AND active.singleton;

INSERT INTO active_canon_pack_registry (singleton, canon_pack_release_id, activated_at)
SELECT true, legacy_release.canon_pack_release_id, active.imported_at
FROM active_canon_pack AS active
JOIN canon_pack_release AS legacy_release
  ON legacy_release.pack_id = '00000000-0000-7000-8000-000000000020'::uuid
 AND legacy_release.pack_version = active.version
WHERE active.singleton;

INSERT INTO canon_pack_watch_focus (singleton, canon_pack_release_id, watchable_id, updated_at)
SELECT true, release.canon_pack_release_id, watchable.watchable_id, focus.updated_at
FROM watch_focus AS focus
JOIN active_canon_pack AS active ON active.singleton
JOIN canon_pack_release AS release
  ON release.pack_id = '00000000-0000-7000-8000-000000000020'::uuid
 AND release.pack_version = active.version
JOIN canon_pack_watchable AS watchable
  ON watchable.canon_pack_release_id = release.canon_pack_release_id
JOIN catalog_item AS item ON item.slug = focus.target_slug
 AND watchable.slug = item.slug
WHERE focus.singleton;

INSERT INTO canon_pack_viewing_attempt
  (viewing_attempt_id, canon_pack_release_id, watchable_id, status, created_at)
SELECT attempt.viewing_attempt_id, release.canon_pack_release_id, watchable.watchable_id, attempt.status, attempt.created_at
FROM viewing_attempt AS attempt
JOIN catalog_item AS item ON item.slug = attempt.catalog_slug
JOIN active_canon_pack AS active ON active.singleton
JOIN canon_pack_release AS release
  ON release.pack_id = '00000000-0000-7000-8000-000000000020'::uuid
 AND release.pack_version = active.version
JOIN canon_pack_watchable AS watchable
  ON watchable.canon_pack_release_id = release.canon_pack_release_id
 AND watchable.slug = item.slug;
