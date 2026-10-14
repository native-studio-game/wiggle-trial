CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  event_ts TEXT,
  visitor_id TEXT,
  session_id TEXT,
  event TEXT NOT NULL,
  mode TEXT,
  source_json TEXT,
  payload_json TEXT
);
