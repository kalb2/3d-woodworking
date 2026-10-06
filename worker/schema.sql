CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  apple_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  password_hash TEXT,
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Empty usernames (Apple-only accounts) are allowed more than once.
CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_unique
  ON accounts(username) WHERE username != '';

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

-- Databases created before username accounts need:
-- ALTER TABLE accounts ADD COLUMN username TEXT NOT NULL DEFAULT '';
-- ALTER TABLE accounts ADD COLUMN password_hash TEXT;
-- then the unique index above.
