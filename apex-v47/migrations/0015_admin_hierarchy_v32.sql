-- Velocity Apex V32: expand staff hierarchy from 5 to 8 levels and add suspension/notes.
CREATE TABLE staff_admins_v32 (
  user_id TEXT PRIMARY KEY,
  level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 8),
  active INTEGER NOT NULL DEFAULT 1,
  appointed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  appointed_by TEXT NOT NULL,
  suspended_until INTEGER NOT NULL DEFAULT 0,
  suspension_reason TEXT NOT NULL DEFAULT '',
  suspended_by TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO staff_admins_v32 (user_id,level,active,appointed_at,updated_at,appointed_by)
SELECT user_id,level,active,appointed_at,updated_at,appointed_by FROM staff_admins;

DROP TABLE staff_admins;
ALTER TABLE staff_admins_v32 RENAME TO staff_admins;
CREATE INDEX idx_staff_admins_active_level ON staff_admins(active,level);

CREATE TABLE IF NOT EXISTS staff_admin_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_staff_notes_user ON staff_admin_notes(user_id,created_at);

