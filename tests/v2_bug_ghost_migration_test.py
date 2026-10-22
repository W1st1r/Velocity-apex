import pathlib
import sqlite3

root = pathlib.Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.execute("CREATE TABLE users(id TEXT PRIMARY KEY, username TEXT NOT NULL)")
db.execute("CREATE TABLE race_sessions(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), state_json TEXT NOT NULL)")
db.execute("INSERT INTO users VALUES('player-1','racer')")
db.execute("INSERT INTO race_sessions VALUES('race-1','player-1','{\"frame\":12}')")
db.executescript((root / "migrations/0023_v2_bug_reports_ghosts.sql").read_text())
assert db.execute("SELECT state_json FROM race_sessions WHERE id='race-1'").fetchone()[0] == '{"frame":12}'
assert db.execute("SELECT username FROM users WHERE id='player-1'").fetchone()[0] == 'racer'
tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
assert {'bug_reports','bug_report_attachments','bug_report_events','bug_report_rate_limits','bug_report_ip_rate_limits','ghost_records'} <= tables
cols = {r[1] for r in db.execute("PRAGMA table_info(race_sessions)")}
assert 'ghost_samples_json' in cols
db.execute("INSERT INTO bug_reports(id,reporter_user_id,client_request_id,title,description,location,created_at,updated_at) VALUES('report-1','player-1','request-1','Menu blank','The screen became empty','Главное меню',1,1)")
assert db.execute("SELECT title FROM bug_reports WHERE id='report-1'").fetchone()[0] == 'Menu blank'
print("V2 bug/ghost additive migration test passed")
