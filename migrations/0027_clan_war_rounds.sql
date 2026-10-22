CREATE TABLE IF NOT EXISTS clan_war_battle_state (
  battle_id TEXT PRIMARY KEY REFERENCES clan_war_challenges(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL DEFAULT 1 CHECK (round_number BETWEEN 1 AND 4),
  attacker_score INTEGER NOT NULL DEFAULT 0,
  defender_score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','FINISHED','ABORTED')),
  winner_crew_id TEXT REFERENCES crews(id),
  tiebreak TEXT,
  result_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE TABLE IF NOT EXISTS clan_war_rounds (
  battle_id TEXT NOT NULL REFERENCES clan_war_challenges(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK (round_number BETWEEN 1 AND 4),
  attacker_points INTEGER NOT NULL,
  defender_points INTEGER NOT NULL,
  decisive_crew_id TEXT,
  results_json TEXT NOT NULL,
  applied INTEGER NOT NULL DEFAULT 0 CHECK (applied IN (0,1)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (battle_id,round_number)
);
CREATE TABLE IF NOT EXISTS clan_war_round_results (
  battle_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  crew_id TEXT NOT NULL REFERENCES crews(id),
  place INTEGER NOT NULL CHECK (place BETWEEN 1 AND 6),
  points INTEGER NOT NULL,
  time_ms INTEGER NOT NULL CHECK (time_ms >= 0),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (battle_id,round_number,user_id),
  UNIQUE (battle_id,round_number,place),
  FOREIGN KEY (battle_id,round_number) REFERENCES clan_war_rounds(battle_id,round_number) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS clan_war_round_results_history ON clan_war_round_results(user_id,created_at DESC);
