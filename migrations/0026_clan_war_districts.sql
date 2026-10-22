-- Apex Bay district ownership and influence. Income cursors are kept separately
-- from capture timestamps so a delayed/repeated Cron can settle exactly once.
CREATE TABLE IF NOT EXISTS clan_war_districts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('STANDARD','PRESTIGE','ELITE')),
  daily_income INTEGER NOT NULL CHECK (daily_income > 0),
  map_x REAL NOT NULL DEFAULT 0,
  map_y REAL NOT NULL DEFAULT 0,
  owner_crew_id TEXT REFERENCES crews(id) ON DELETE SET NULL,
  captured_at INTEGER,
  protected_until INTEGER,
  influence INTEGER NOT NULL DEFAULT 0 CHECK (influence >= 0),
  income_owner_crew_id TEXT REFERENCES crews(id) ON DELETE SET NULL,
  income_cursor_ms INTEGER,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS clan_war_district_history (
  id TEXT PRIMARY KEY,
  district_id TEXT NOT NULL REFERENCES clan_war_districts(id),
  previous_crew_id TEXT REFERENCES crews(id),
  new_crew_id TEXT REFERENCES crews(id),
  battle_id TEXT,
  changed_at INTEGER NOT NULL,
  UNIQUE(district_id,battle_id,new_crew_id)
);
CREATE INDEX IF NOT EXISTS clan_war_district_history_time ON clan_war_district_history(district_id,changed_at DESC);
INSERT OR IGNORE INTO clan_war_districts(id,name,tier,daily_income,map_x,map_y,updated_at) VALUES
 ('north-loop','Panoramic Ridge','STANDARD',3000,650,720,0),
 ('harbor-crossing','Harbor Drift','PRESTIGE',6000,700,2250,0),
 ('old-town','Central Park','STANDARD',3000,1370,1300,0),
 ('south-industrial','Industrial Park','STANDARD',3000,3900,1200,0),
 ('apex-heights','Solar Quarter','PRESTIGE',6000,3850,1900,0),
 ('coastal-ridge','Apex Bay Coast','PRESTIGE',6000,1680,2300,0),
 ('grand-avenue','Downtown · Motor Club','STANDARD',3000,2320,1500,0),
 ('apex-center','Airport District','ELITE',10000,3900,2620,0);
