-- APEX owner audit/logging system. Runtime also creates this schema defensively.
CREATE TABLE IF NOT EXISTS game_logs (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  actor_username TEXT,
  actor_role TEXT NOT NULL DEFAULT 'SYSTEM',
  target_user_id TEXT,
  target_username TEXT,
  server_id TEXT,
  source TEXT,
  subject TEXT,
  message TEXT,
  reason TEXT,
  amount INTEGER,
  currency TEXT,
  related_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_game_logs_category_created ON game_logs(category,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_logs_actor_created ON game_logs(actor_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_logs_target_created ON game_logs(target_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_logs_server_created ON game_logs(server_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_logs_event_created ON game_logs(event_type,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_logs_related ON game_logs(related_id,created_at DESC);
