CREATE TABLE IF NOT EXISTS player_progress (
  user_id TEXT PRIMARY KEY,
  total_exp INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_player_progress_exp ON player_progress(total_exp);

CREATE TABLE IF NOT EXISTS progression_rewards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  event_id TEXT NOT NULL,
  exp INTEGER NOT NULL DEFAULT 0,
  credits INTEGER NOT NULL DEFAULT 0,
  requested_credits INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(user_id,source,event_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_progression_rewards_user_time ON progression_rewards(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_progression_rewards_source_time ON progression_rewards(user_id,source,created_at);
