CREATE TABLE IF NOT EXISTS friendships (
  user_low TEXT NOT NULL,
  user_high TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_low,user_high),
  FOREIGN KEY (user_low) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (user_high) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_friendships_low ON friendships(user_low);
CREATE INDEX IF NOT EXISTS idx_friendships_high ON friendships(user_high);
CREATE TABLE IF NOT EXISTS user_presence (
  user_id TEXT PRIMARY KEY,
  last_seen_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_presence_seen ON user_presence(last_seen_at);
