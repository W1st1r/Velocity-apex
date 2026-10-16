-- Additive escrow journal. Never rewrites legacy player saves.
CREATE TABLE IF NOT EXISTS room_wager_escrows (
 race_id TEXT PRIMARY KEY,
 participants_json TEXT NOT NULL,
 stake INTEGER NOT NULL CHECK(stake>0),
 status TEXT NOT NULL CHECK(status IN ('locked','awarded','refunded')),
 winner_user_id TEXT,
 lock_token TEXT NOT NULL,
 settlement_token TEXT,
 created_at INTEGER NOT NULL,
 settled_at INTEGER
);
