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
 ('north-loop','North Loop','STANDARD',3000,980,620,0),
 ('harbor-crossing','Harbor Crossing','PRESTIGE',6000,1480,1020,0),
 ('old-town','Old Town','STANDARD',3000,2040,760,0),
 ('south-industrial','South Industrial','STANDARD',3000,2560,1510,0),
 ('apex-heights','Apex Heights','PRESTIGE',6000,1110,1740,0),
 ('coastal-ridge','Coastal Ridge','PRESTIGE',6000,1820,2110,0),
 ('grand-avenue','Grand Avenue','STANDARD',3000,2530,920,0),
 ('apex-center','Apex Center','ELITE',10000,1910,1290,0);
