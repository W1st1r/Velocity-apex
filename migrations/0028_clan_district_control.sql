ALTER TABLE clan_war_challenges ADD COLUMN district_id TEXT REFERENCES clan_war_districts(id);
CREATE TABLE IF NOT EXISTS clan_war_influence_ledger (
  id TEXT PRIMARY KEY,
  crew_id TEXT NOT NULL REFERENCES crews(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  source TEXT NOT NULL CHECK (source IN ('ONLINE_FINISH','ONLINE_WIN')),
  event_id TEXT NOT NULL,
  points INTEGER NOT NULL CHECK (points > 0),
  created_at INTEGER NOT NULL,
  day_start INTEGER NOT NULL,
  UNIQUE(user_id,source,event_id)
);
CREATE INDEX IF NOT EXISTS clan_war_influence_crew ON clan_war_influence_ledger(crew_id,created_at DESC);
CREATE TABLE IF NOT EXISTS clan_war_attack_ledger (
  battle_id TEXT PRIMARY KEY REFERENCES clan_war_challenges(id) ON DELETE CASCADE,
  attacker_crew_id TEXT NOT NULL REFERENCES crews(id),
  district_id TEXT NOT NULL REFERENCES clan_war_districts(id),
  declared_at INTEGER NOT NULL,
  day_start INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS clan_war_attack_daily ON clan_war_attack_ledger(attacker_crew_id,day_start,declared_at DESC);
