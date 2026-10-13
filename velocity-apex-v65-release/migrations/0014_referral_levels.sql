CREATE TABLE IF NOT EXISTS referral_profiles (
  user_id TEXT PRIMARY KEY,
  level INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 10),
  total_spent INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS referral_level_purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  from_level INTEGER NOT NULL,
  to_level INTEGER NOT NULL,
  cost INTEGER NOT NULL,
  verified_invites INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_referral_level_purchases_user ON referral_level_purchases(user_id,created_at);

CREATE TABLE IF NOT EXISTS referral_reward_details (
  invited_user_id TEXT PRIMARY KEY,
  inviter_level INTEGER NOT NULL,
  invitee_reward_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (invited_user_id) REFERENCES users(id) ON DELETE CASCADE
);
