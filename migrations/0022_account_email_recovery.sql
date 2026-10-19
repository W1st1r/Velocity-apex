-- Additive account recovery schema; existing account and game rows are untouched.
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN email_verified_at INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_verified_email
  ON users(email COLLATE NOCASE)
  WHERE email IS NOT NULL AND email_verified_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS account_recovery_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_kind TEXT NOT NULL CHECK(token_kind IN ('verify_email','password_reset')),
  pending_email TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_recovery_tokens_user_kind
  ON account_recovery_tokens(user_id, token_kind, expires_at);

CREATE TABLE IF NOT EXISTS account_recovery_limits (
  bucket_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL,
  PRIMARY KEY(bucket_hash, window_start)
);

CREATE TABLE IF NOT EXISTS account_security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_account_security_events_user_created
  ON account_security_events(user_id, created_at);
