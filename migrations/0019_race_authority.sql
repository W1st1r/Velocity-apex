-- Additive only: existing player_saves, inventories and progress are not rewritten.
CREATE TABLE IF NOT EXISTS race_sessions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 start_request_id TEXT NOT NULL,
 start_hash TEXT NOT NULL,
 runtime_version TEXT NOT NULL,
 config_json TEXT NOT NULL,
 car_save_json TEXT NOT NULL,
 seed INTEGER NOT NULL,
 state_json TEXT NOT NULL,
 sequence INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 1,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paid','cancelled','expired')),
 created_at INTEGER NOT NULL,
 starts_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 UNIQUE(user_id,start_request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_race_one_active_user ON race_sessions(user_id) WHERE status='active';
CREATE TABLE IF NOT EXISTS race_input_receipts (
 race_id TEXT NOT NULL REFERENCES race_sessions(id) ON DELETE CASCADE,
 sequence INTEGER NOT NULL,
 payload_hash TEXT NOT NULL,
 response_json TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(race_id,sequence)
);
