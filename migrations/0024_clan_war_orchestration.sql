-- Additive state for private, roster-locked clan race rooms.
CREATE TABLE IF NOT EXISTS clan_war_challenges (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  attacker_crew_id TEXT NOT NULL REFERENCES crews(id),
  defender_crew_id TEXT NOT NULL REFERENCES crews(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  state TEXT NOT NULL CHECK (state IN ('INVITED','ACCEPTED','ROSTER_LOCKED','READY','RUNNING','FINISHED','REJECTED','CANCELLED','EXPIRED','ABORTED')),
  expires_at INTEGER NOT NULL,
  room_name TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (attacker_crew_id <> defender_crew_id)
);
CREATE INDEX IF NOT EXISTS clan_war_challenges_attacker ON clan_war_challenges(attacker_crew_id,state,created_at DESC);
CREATE INDEX IF NOT EXISTS clan_war_challenges_defender ON clan_war_challenges(defender_crew_id,state,created_at DESC);
CREATE TABLE IF NOT EXISTS clan_war_rosters (
  battle_id TEXT NOT NULL REFERENCES clan_war_challenges(id) ON DELETE CASCADE,
  crew_id TEXT NOT NULL REFERENCES crews(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  ready_at INTEGER,
  PRIMARY KEY (battle_id,user_id),
  UNIQUE (battle_id,crew_id,user_id)
);
CREATE INDEX IF NOT EXISTS clan_war_rosters_user ON clan_war_rosters(user_id,battle_id);
-- Reservation prevents a player joining two live clan matches concurrently.
CREATE TABLE IF NOT EXISTS clan_war_active_users (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  battle_id TEXT NOT NULL REFERENCES clan_war_challenges(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS clan_war_active_users_battle ON clan_war_active_users(battle_id);
-- One active call per clan; rows are released only on terminal states.
CREATE TABLE IF NOT EXISTS clan_war_active_crews (
  crew_id TEXT PRIMARY KEY REFERENCES crews(id),
  battle_id TEXT NOT NULL REFERENCES clan_war_challenges(id) ON DELETE CASCADE
);
CREATE TRIGGER IF NOT EXISTS clan_war_challenge_leader_guard
BEFORE INSERT ON clan_war_challenges
WHEN NOT EXISTS (SELECT 1 FROM crews WHERE id=NEW.attacker_crew_id AND leader_id=NEW.created_by)
BEGIN SELECT RAISE(ABORT,'CLAN_WAR_LEADER_REQUIRED'); END;
CREATE TRIGGER IF NOT EXISTS clan_war_roster_membership_guard
BEFORE INSERT ON clan_war_rosters
WHEN NOT EXISTS (SELECT 1 FROM crew_members WHERE crew_id=NEW.crew_id AND user_id=NEW.user_id)
  OR NOT EXISTS (SELECT 1 FROM clan_war_challenges WHERE id=NEW.battle_id AND state='ACCEPTED' AND NEW.crew_id IN(attacker_crew_id,defender_crew_id))
BEGIN SELECT RAISE(ABORT,'CLAN_WAR_ROSTER_INVALID'); END;
CREATE TRIGGER IF NOT EXISTS clan_war_active_user_roster_guard
BEFORE INSERT ON clan_war_active_users
WHEN NOT EXISTS (SELECT 1 FROM clan_war_rosters WHERE battle_id=NEW.battle_id AND user_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'CLAN_WAR_RESERVATION_INVALID'); END;
