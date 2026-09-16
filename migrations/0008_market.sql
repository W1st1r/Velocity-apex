CREATE TABLE IF NOT EXISTS market_sell_listings (
  id TEXT PRIMARY KEY,
  seller_user_id TEXT NOT NULL,
  car_id TEXT NOT NULL,
  price INTEGER NOT NULL,
  upgrades_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  buyer_user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sold_at INTEGER,
  FOREIGN KEY (seller_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_market_sell_active ON market_sell_listings(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_sell_seller ON market_sell_listings(seller_user_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS market_buy_orders (
  id TEXT PRIMARY KEY,
  buyer_user_id TEXT NOT NULL,
  car_id TEXT NOT NULL,
  price INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  seller_user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  filled_at INTEGER,
  FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (seller_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_market_buy_active ON market_buy_orders(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_buy_buyer ON market_buy_orders(buyer_user_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS market_history (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  car_id TEXT NOT NULL,
  price INTEGER NOT NULL,
  buyer_user_id TEXT NOT NULL,
  seller_user_id TEXT NOT NULL,
  upgrades_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (seller_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_market_history_buyer ON market_history(buyer_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_history_seller ON market_history(seller_user_id,created_at DESC);
