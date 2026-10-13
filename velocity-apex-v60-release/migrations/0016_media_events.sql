CREATE TABLE IF NOT EXISTS media_creators (
  user_id TEXT PRIMARY KEY,
  active INTEGER NOT NULL DEFAULT 1,
  appointed_at INTEGER NOT NULL,
  appointed_by TEXT NOT NULL,
  events_blocked INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS media_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  min_prize INTEGER NOT NULL DEFAULT 0,
  max_prize INTEGER NOT NULL DEFAULT 250000,
  daily_events INTEGER NOT NULL DEFAULT 8,
  daily_prize INTEGER NOT NULL DEFAULT 750000,
  updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO media_settings (id,min_prize,max_prize,daily_events,daily_prize,updated_at)
VALUES (1,0,250000,8,750000,0);

CREATE TABLE IF NOT EXISTS media_events (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  creator_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  game_key TEXT NOT NULL,
  access_type TEXT NOT NULL DEFAULT 'code',
  organizer_mode TEXT NOT NULL DEFAULT 'spectator',
  status TEXT NOT NULL DEFAULT 'WAITING',
  prize INTEGER NOT NULL DEFAULT 0,
  settings_json TEXT NOT NULL DEFAULT '{}',
  invite_json TEXT NOT NULL DEFAULT '[]',
  winner_json TEXT NOT NULL DEFAULT '[]',
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  cancelled_at INTEGER,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(creator_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_media_events_creator_time ON media_events(creator_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_events_status ON media_events(status,updated_at DESC);

CREATE TABLE IF NOT EXISTS media_event_participants (
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player',
  joined_at INTEGER NOT NULL,
  PRIMARY KEY(event_id,user_id),
  FOREIGN KEY(event_id) REFERENCES media_events(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_media_participants_user ON media_event_participants(user_id,joined_at DESC);
