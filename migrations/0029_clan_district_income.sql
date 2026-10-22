CREATE TABLE IF NOT EXISTS clan_war_district_income_ledger (
  district_id TEXT NOT NULL REFERENCES clan_war_districts(id),
  crew_id TEXT NOT NULL REFERENCES crews(id),
  from_ms INTEGER NOT NULL,
  to_ms INTEGER NOT NULL CHECK (to_ms > from_ms),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (district_id,from_ms,to_ms)
);
CREATE INDEX IF NOT EXISTS clan_war_district_income_crew_time
  ON clan_war_district_income_ledger(crew_id,created_at DESC);
