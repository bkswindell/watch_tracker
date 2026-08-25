CREATE TABLE watchable_feedback (
  watchable_feedback_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_instance_id uuid NOT NULL REFERENCES tracker_instance(tracker_instance_id),
  canon_pack_release_id uuid NOT NULL,
  watchable_id uuid NOT NULL,
  rating numeric(2,1),
  favorite boolean NOT NULL DEFAULT false,
  would_rewatch boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT watchable_feedback_watchable_fkey
    FOREIGN KEY (canon_pack_release_id, watchable_id)
    REFERENCES canon_pack_watchable(canon_pack_release_id, watchable_id),
  CONSTRAINT watchable_feedback_owner_watchable_key
    UNIQUE (tracker_instance_id, canon_pack_release_id, watchable_id),
  CONSTRAINT watchable_feedback_rating_valid
    CHECK (rating IS NULL OR (rating >= 0.5 AND rating <= 5.0 AND rating * 2 = trunc(rating * 2))),
  CONSTRAINT watchable_feedback_note_limited
    CHECK (note IS NULL OR char_length(note) <= 4000),
  CONSTRAINT watchable_feedback_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX watchable_feedback_owner_updated_idx
  ON watchable_feedback (tracker_instance_id, updated_at DESC);
