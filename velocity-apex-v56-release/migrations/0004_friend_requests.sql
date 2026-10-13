CREATE TABLE IF NOT EXISTS friend_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(from_user,to_user),
  FOREIGN KEY (from_user) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (to_user) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user,created_at);
CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON friend_requests(from_user,created_at);
