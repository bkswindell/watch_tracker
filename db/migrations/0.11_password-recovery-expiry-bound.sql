ALTER TABLE password_reset_token
  ADD CONSTRAINT password_reset_token_expiry_within_15_minutes
  CHECK (expires_at <= created_at + INTERVAL '15 minutes');
