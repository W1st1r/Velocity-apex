-- Additive V2 systems. Apply only to an isolated development database until separately approved.
CREATE TABLE IF NOT EXISTS bug_reports (
  report_no INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_request_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  steps TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL,
  diagnostics_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_progress','fixed','closed','rejected')),
  internal_comment TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(reporter_user_id,client_request_id)
);
CREATE INDEX IF NOT EXISTS idx_bug_reports_queue ON bug_reports(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_reports_reporter ON bug_reports(reporter_user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS bug_report_events (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bug_report_rate_limits (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK(request_count BETWEEN 1 AND 3),
  PRIMARY KEY(user_id,window_start)
);
CREATE TABLE IF NOT EXISTS bug_report_ip_rate_limits (
  ip_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK(request_count BETWEEN 1 AND 5),
  PRIMARY KEY(ip_hash,window_start)
);
CREATE TABLE IF NOT EXISTS bug_report_attachments (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
  size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 2097152),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ghost_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL,
  track_version TEXT NOT NULL,
  runtime_version TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('normal','career')),
  car_id TEXT NOT NULL,
  time_ms INTEGER NOT NULL CHECK(time_ms > 0),
  keyframes_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id,track_id,track_version,runtime_version,mode)
);
CREATE INDEX IF NOT EXISTS idx_ghost_records_track ON ghost_records(track_id,track_version,runtime_version,mode,time_ms);
ALTER TABLE race_sessions ADD COLUMN ghost_samples_json TEXT NOT NULL DEFAULT '[]';
