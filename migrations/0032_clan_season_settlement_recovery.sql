-- Additive follow-up for resumable season summaries and full-day district holds.
ALTER TABLE clan_season_results ADD COLUMN matches INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS clan_district_hold_settlements (
  district_id TEXT NOT NULL REFERENCES clan_war_districts(id),
  crew_id TEXT NOT NULL REFERENCES crews(id),
  ownership_started_at INTEGER NOT NULL,
  period_number INTEGER NOT NULL CHECK(period_number>0),
  settled_at INTEGER NOT NULL,
  PRIMARY KEY(district_id,crew_id,ownership_started_at,period_number)
);

DROP TRIGGER IF EXISTS clan_competition_match_finished;
CREATE TRIGGER clan_competition_match_finished AFTER UPDATE OF state ON clan_war_challenges
WHEN NEW.state='FINISHED' AND OLD.state<>'FINISHED' BEGIN
  INSERT OR IGNORE INTO clan_competition_outbox(id,event_type,crew_id,source_id,amount,created_at)
  SELECT 'MATCH_WIN:'||NEW.attacker_crew_id||':'||NEW.id,'MATCH_WIN',NEW.attacker_crew_id,NEW.id,1,NEW.updated_at
  FROM clan_war_battle_state s WHERE s.battle_id=NEW.id AND s.winner_crew_id=NEW.attacker_crew_id;
  INSERT OR IGNORE INTO clan_competition_outbox(id,event_type,crew_id,source_id,amount,created_at)
  SELECT 'MATCH_LOSS:'||NEW.defender_crew_id||':'||NEW.id,'MATCH_LOSS',NEW.defender_crew_id,NEW.id,1,NEW.updated_at
  FROM clan_war_battle_state s WHERE s.battle_id=NEW.id AND s.winner_crew_id=NEW.attacker_crew_id;
  INSERT OR IGNORE INTO clan_competition_outbox(id,event_type,crew_id,source_id,amount,created_at)
  SELECT 'MATCH_WIN:'||NEW.defender_crew_id||':'||NEW.id,'MATCH_WIN',NEW.defender_crew_id,NEW.id,1,NEW.updated_at
  FROM clan_war_battle_state s WHERE s.battle_id=NEW.id AND s.winner_crew_id=NEW.defender_crew_id;
  INSERT OR IGNORE INTO clan_competition_outbox(id,event_type,crew_id,source_id,amount,created_at)
  SELECT 'MATCH_LOSS:'||NEW.attacker_crew_id||':'||NEW.id,'MATCH_LOSS',NEW.attacker_crew_id,NEW.id,1,NEW.updated_at
  FROM clan_war_battle_state s WHERE s.battle_id=NEW.id AND s.winner_crew_id=NEW.defender_crew_id;
END;
