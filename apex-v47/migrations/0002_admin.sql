CREATE TABLE IF NOT EXISTS account_bans (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    revoked_at INTEGER,
    revoked_by TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_account_bans_user_active ON account_bans(user_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS admin_unlocks (
    session_token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_admin_unlocks_expires ON admin_unlocks(expires_at);

CREATE TABLE IF NOT EXISTS admin_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_user_id TEXT NOT NULL,
    target_user_id TEXT,
    action TEXT NOT NULL,
    details TEXT,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit(created_at);
