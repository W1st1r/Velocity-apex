-- APEX / YooMoney automatic CR top-ups
CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  package_id TEXT NOT NULL,
  rub_amount INTEGER NOT NULL,
  credits INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','expired','cancelled')),
  operation_id TEXT UNIQUE,
  notification_type TEXT,
  received_amount TEXT,
  withdraw_amount TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  paid_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_payment_orders_user_created ON payment_orders(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status_created ON payment_orders(status,created_at DESC);

CREATE TABLE IF NOT EXISTS payment_receipts (
  operation_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  credited INTEGER NOT NULL DEFAULT 0,
  notification_type TEXT,
  withdraw_amount TEXT,
  received_amount TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES payment_orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_order ON payment_receipts(order_id,created_at DESC);
