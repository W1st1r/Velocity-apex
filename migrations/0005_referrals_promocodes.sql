CREATE TABLE IF NOT EXISTS user_registration_signals (
  user_id TEXT PRIMARY KEY,
  network_hash TEXT,
  device_hash TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_registration_network ON user_registration_signals(network_hash);
CREATE INDEX IF NOT EXISTS idx_user_registration_device ON user_registration_signals(device_hash);

CREATE TABLE IF NOT EXISTS referrals (
  invited_user_id TEXT PRIMARY KEY,
  inviter_user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  reward_credits INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  network_hash TEXT,
  device_hash TEXT,
  created_at INTEGER NOT NULL,
  rewarded_at INTEGER,
  FOREIGN KEY (invited_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (inviter_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_referrals_inviter_created ON referrals(inviter_user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_referrals_network_created ON referrals(network_hash,created_at);
CREATE INDEX IF NOT EXISTS idx_referrals_device ON referrals(device_hash);

CREATE TABLE IF NOT EXISTS promo_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  reward_json TEXT NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 0,
  uses_count INTEGER NOT NULL DEFAULT 0,
  starts_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_codes_code_nocase ON promo_codes(code COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(enabled,starts_at,expires_at);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id TEXT PRIMARY KEY,
  promo_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reward_json TEXT NOT NULL,
  redeemed_at INTEGER NOT NULL,
  UNIQUE(promo_id,user_id),
  FOREIGN KEY (promo_id) REFERENCES promo_codes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON promo_redemptions(user_id,redeemed_at);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_promo ON promo_redemptions(promo_id,redeemed_at);
