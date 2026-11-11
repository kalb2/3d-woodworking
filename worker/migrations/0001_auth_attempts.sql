-- Login rate-limit sliding window (Nov 3 security audit).
-- Apply only after review, from the repo root:
--   npx wrangler d1 migrations apply workbench --remote --config worker/wrangler.toml
-- Do not run that command as part of opening this PR.

CREATE TABLE IF NOT EXISTS auth_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_attempts_bucket_time
  ON auth_attempts(bucket, attempted_at);
