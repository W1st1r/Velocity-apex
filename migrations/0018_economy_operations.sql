-- Additive idempotency ledger for authenticated economy operations.
-- Existing player_saves and account progress are left untouched.
CREATE TABLE IF NOT EXISTS economy_operations (
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, request_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_economy_operations_created
ON economy_operations(created_at);
