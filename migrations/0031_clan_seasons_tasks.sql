-- UTC clan seasons, durable event inbox, division archive, and period task ledgers.
CREATE TABLE IF NOT EXISTS clan_divisions (
  crew_id TEXT PRIMARY KEY REFERENCES crews(id) ON DELETE CASCADE,
  division TEXT NOT NULL DEFAULT 'BRONZE' CHECK(division IN ('BRONZE','SILVER','GOLD','PLATINUM','DIAMOND')),
  updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO clan_divisions(crew_id,division,updated_at) SELECT id,'BRONZE',created_at FROM crews;
CREATE TRIGGER IF NOT EXISTS clan_division_new_crew AFTER INSERT ON crews BEGIN
  INSERT OR IGNORE INTO clan_divisions(crew_id,division,updated_at) VALUES(NEW.id,'BRONZE',NEW.created_at);
END;

CREATE TABLE IF NOT EXISTS clan_seasons (
  id TEXT PRIMARY KEY,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL CHECK(ends_at>starts_at),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','FINALIZING','FINISHED')),
  finalized_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS clan_seasons_period ON clan_seasons(starts_at,ends_at,status);
CREATE TABLE IF NOT EXISTS clan_season_members (
  season_id TEXT NOT NULL REFERENCES clan_seasons(id),
  crew_id TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  division_at_start TEXT NOT NULL CHECK(division_at_start IN ('BRONZE','SILVER','GOLD','PLATINUM','DIAMOND')),
  PRIMARY KEY(season_id,crew_id)
);
CREATE TABLE IF NOT EXISTS clan_season_events (
  season_id TEXT NOT NULL REFERENCES clan_seasons(id),
  crew_id TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK(event_type IN ('MATCH_WIN','MATCH_LOSS','DISTRICT_CAPTURE','DISTRICT_HOLD','INFLUENCE')),
  source_id TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0 CHECK(points>=0),
  wins INTEGER NOT NULL DEFAULT 0 CHECK(wins>=0),
  captures INTEGER NOT NULL DEFAULT 0 CHECK(captures>=0),
  influence_points INTEGER NOT NULL DEFAULT 0 CHECK(influence_points>=0),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(season_id,crew_id,event_type,source_id)
);
CREATE INDEX IF NOT EXISTS clan_season_events_rank ON clan_season_events(season_id,crew_id);
CREATE TABLE IF NOT EXISTS clan_season_results (
  season_id TEXT NOT NULL REFERENCES clan_seasons(id),
  crew_id TEXT NOT NULL REFERENCES crews(id),
  division_from TEXT NOT NULL,
  points INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  captures INTEGER NOT NULL,
  influence INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  tie_size INTEGER NOT NULL DEFAULT 1,
  division_to TEXT NOT NULL,
  participated INTEGER NOT NULL CHECK(participated IN (0,1)),
  reward INTEGER NOT NULL DEFAULT 0,
  finalized_at INTEGER NOT NULL,
  PRIMARY KEY(season_id,crew_id)
);
CREATE TABLE IF NOT EXISTS clan_division_history (
  season_id TEXT NOT NULL REFERENCES clan_seasons(id),
  crew_id TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  division_from TEXT NOT NULL,
  division_to TEXT NOT NULL,
  rank INTEGER NOT NULL,
  points INTEGER NOT NULL,
  changed_at INTEGER NOT NULL,
  PRIMARY KEY(season_id,crew_id)
);
CREATE TABLE IF NOT EXISTS clan_season_settlements (
  season_id TEXT NOT NULL REFERENCES clan_seasons(id),
  crew_id TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  reward INTEGER NOT NULL CHECK(reward>=0),
  paid_at INTEGER NOT NULL,
  PRIMARY KEY(season_id,crew_id)
);

CREATE TABLE IF NOT EXISTS clan_competition_outbox (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK(event_type IN ('ONLINE_FINISH','INFLUENCE','CONTRIBUTION','MATCH_WIN','MATCH_LOSS','DISTRICT_CAPTURE','DISTRICT_HOLD')),
  crew_id TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount>=0),
  created_at INTEGER NOT NULL,
  processed_at INTEGER,
  UNIQUE(event_type,crew_id,source_id)
);
CREATE INDEX IF NOT EXISTS clan_competition_outbox_pending ON clan_competition_outbox(processed_at,created_at);

CREATE TABLE IF NOT EXISTS clan_task_periods (
  period_type TEXT NOT NULL CHECK(period_type IN ('DAILY','WEEKLY')),
  period_key TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  config_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(period_type,period_key)
);
CREATE TABLE IF NOT EXISTS clan_task_events (
  period_type TEXT NOT NULL,
  period_key TEXT NOT NULL,
  crew_id TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount>0),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(period_type,period_key,crew_id,task_id,source_id),
  FOREIGN KEY(period_type,period_key) REFERENCES clan_task_periods(period_type,period_key)
);
CREATE INDEX IF NOT EXISTS clan_task_events_progress ON clan_task_events(period_type,period_key,crew_id,task_id);
CREATE TABLE IF NOT EXISTS clan_task_claims (
  period_type TEXT NOT NULL,
  period_key TEXT NOT NULL,
  crew_id TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  target INTEGER NOT NULL,
  reward INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  PRIMARY KEY(period_type,period_key,crew_id,task_id),
  FOREIGN KEY(period_type,period_key) REFERENCES clan_task_periods(period_type,period_key)
);

-- These triggers capture the authoritative source event in the same D1 write
-- as a server finish, influence award, contribution, confirmed match, or capture.
CREATE TRIGGER IF NOT EXISTS clan_competition_online_finish AFTER INSERT ON progression_rewards
WHEN NEW.source='online' BEGIN
  INSERT OR IGNORE INTO clan_competition_outbox(id,event_type,crew_id,source_id,amount,created_at)
  SELECT 'ONLINE_FINISH:'||m.crew_id||':'||NEW.user_id||':'||NEW.event_id,'ONLINE_FINISH',m.crew_id,NEW.user_id||':'||NEW.event_id,1,NEW.created_at
  FROM crew_members m WHERE m.user_id=NEW.user_id;
END;
CREATE TRIGGER IF NOT EXISTS clan_competition_influence AFTER INSERT ON clan_war_influence_ledger BEGIN
  INSERT OR IGNORE INTO clan_competition_outbox(id,event_type,crew_id,source_id,amount,created_at)
  VALUES('INFLUENCE:'||NEW.crew_id||':'||NEW.user_id||':'||NEW.event_id,'INFLUENCE',NEW.crew_id,NEW.user_id||':'||NEW.event_id,NEW.points,NEW.created_at);
END;
CREATE TRIGGER IF NOT EXISTS clan_competition_contribution AFTER INSERT ON crew_treasury_ledger
WHEN NEW.kind='CONTRIBUTION' BEGIN
  INSERT OR IGNORE INTO clan_competition_outbox(id,event_type,crew_id,source_id,amount,created_at)
  VALUES('CONTRIBUTION:'||NEW.crew_id||':'||NEW.id,'CONTRIBUTION',NEW.crew_id,NEW.id,NEW.amount,NEW.created_at);
END;
CREATE TRIGGER IF NOT EXISTS clan_competition_match_finished AFTER UPDATE OF state ON clan_war_challenges
WHEN NEW.state='FINISHED' AND OLD.state<>'FINISHED' BEGIN
  INSERT OR IGNORE INTO clan_competition_outbox(id,event_type,crew_id,source_id,amount,created_at)
  SELECT 'MATCH_WIN:'||NEW.attacker_crew_id||':'||NEW.id,'MATCH_WIN',NEW.attacker_crew_id,NEW.id,1,COALESCE(s.completed_at,NEW.updated_at)
  FROM clan_war_battle_state s WHERE s.battle_id=NEW.id AND s.winner_crew_id=NEW.attacker_crew_id;
  INSERT OR IGNORE INTO clan_competition_outbox(id,event_type,crew_id,source_id,amount,created_at)
  SELECT 'MATCH_LOSS:'||NEW.defender_crew_id||':'||NEW.id,'MATCH_LOSS',NEW.defender_crew_id,NEW.id,1,COALESCE(s.completed_at,NEW.updated_at)
  FROM clan_war_battle_state s WHERE s.battle_id=NEW.id AND s.winner_crew_id=NEW.attacker_crew_id;
  INSERT OR IGNORE INTO clan_competition_outbox(id,event_type,crew_id,source_id,amount,created_at)
  SELECT 'MATCH_WIN:'||NEW.defender_crew_id||':'||NEW.id,'MATCH_WIN',NEW.defender_crew_id,NEW.id,1,COALESCE(s.completed_at,NEW.updated_at)
  FROM clan_war_battle_state s WHERE s.battle_id=NEW.id AND s.winner_crew_id=NEW.defender_crew_id;
  INSERT OR IGNORE INTO clan_competition_outbox(id,event_type,crew_id,source_id,amount,created_at)
  SELECT 'MATCH_LOSS:'||NEW.attacker_crew_id||':'||NEW.id,'MATCH_LOSS',NEW.attacker_crew_id,NEW.id,1,COALESCE(s.completed_at,NEW.updated_at)
  FROM clan_war_battle_state s WHERE s.battle_id=NEW.id AND s.winner_crew_id=NEW.defender_crew_id;
END;
CREATE TRIGGER IF NOT EXISTS clan_competition_district_capture AFTER INSERT ON clan_war_district_history
WHEN NEW.battle_id IS NOT NULL BEGIN
  INSERT OR IGNORE INTO clan_competition_outbox(id,event_type,crew_id,source_id,amount,created_at)
  VALUES('DISTRICT_CAPTURE:'||NEW.new_crew_id||':'||NEW.battle_id,'DISTRICT_CAPTURE',NEW.new_crew_id,NEW.battle_id,1,NEW.changed_at);
END;
