-- Additive clan treasury. Balances and entries are server-owned CR only.
CREATE TABLE IF NOT EXISTS crew_treasuries (
  crew_id TEXT PRIMARY KEY REFERENCES crews(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS crew_treasury_ledger (
  id TEXT PRIMARY KEY,
  crew_id TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('CONTRIBUTION','DISTRICT_INCOME','SEAT_PURCHASE','SEASON_REWARD','QUEST_REWARD','ADJUSTMENT')),
  amount INTEGER NOT NULL CHECK (amount <> 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS crew_treasury_ledger_history ON crew_treasury_ledger(crew_id,created_at DESC);
