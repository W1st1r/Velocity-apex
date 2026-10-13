CREATE TABLE IF NOT EXISTS upgrade_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}',
  stake_value INTEGER NOT NULL DEFAULT 0,
  target_value INTEGER NOT NULL DEFAULT 0,
  chance_bps INTEGER NOT NULL DEFAULT 0,
  rng_value INTEGER,
  success INTEGER,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_upgrade_user_created ON upgrade_attempts(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upgrade_status_created ON upgrade_attempts(status,created_at DESC);
