-- Non-destructive owner management and activity tables.
CREATE TABLE IF NOT EXISTS owner_settings (id TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS owner_activity (user_id TEXT PRIMARY KEY,seen INTEGER NOT NULL,location TEXT NOT NULL,total_ms INTEGER NOT NULL DEFAULT 0,started INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_owner_activity_seen ON owner_activity(seen);
CREATE TABLE IF NOT EXISTS owner_tuning (user_id TEXT NOT NULL,car_id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(user_id,car_id));
CREATE TABLE IF NOT EXISTS owner_grants (car_id TEXT PRIMARY KEY,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS owner_results (race_id TEXT NOT NULL,user_id TEXT NOT NULL,kind TEXT NOT NULL,won INTEGER NOT NULL,time_ms INTEGER NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(race_id,user_id));
CREATE INDEX IF NOT EXISTS idx_owner_results_user ON owner_results(user_id);
