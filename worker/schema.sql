CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  apple_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS project_records (
  account_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  payload TEXT,
  PRIMARY KEY (account_id, project_id)
);
