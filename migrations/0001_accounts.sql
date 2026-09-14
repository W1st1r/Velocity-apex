CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_iterations INTEGER NOT NULL DEFAULT 210000,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_login_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase
ON users(username COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS player_saves (
    user_id TEXT PRIMARY KEY,
    save_json TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_saves_updated_at ON player_saves(updated_at);
