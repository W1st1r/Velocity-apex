CREATE TABLE IF NOT EXISTS crew_settings (
  crew_id TEXT PRIMARY KEY REFERENCES crews(id) ON DELETE CASCADE,
  privacy TEXT NOT NULL DEFAULT 'public' CHECK(privacy IN ('public','private')),
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS crew_join_requests (
  crew_id TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(crew_id,user_id)
);
CREATE INDEX IF NOT EXISTS crew_join_requests_user ON crew_join_requests(user_id,created_at);
