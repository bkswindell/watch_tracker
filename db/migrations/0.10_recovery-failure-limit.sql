ALTER TABLE password_reset_token
  ADD COLUMN failed_attempt_count smallint NOT NULL DEFAULT 0,
  ADD CONSTRAINT password_reset_token_failed_attempt_count_valid
    CHECK (failed_attempt_count BETWEEN 0 AND 5);