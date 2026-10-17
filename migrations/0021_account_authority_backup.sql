-- Non-destructive cutover: retain the exact pre-preferences account JSON once.
-- Economic data remains in player_saves and is never reinitialized here.
CREATE TABLE IF NOT EXISTS account_authority_backups (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 save_json TEXT NOT NULL,
 revision INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
