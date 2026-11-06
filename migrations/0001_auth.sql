PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS allowed_accounts (
 email TEXT PRIMARY KEY COLLATE NOCASE,
 google_sub TEXT UNIQUE,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY,
 email TEXT NOT NULL COLLATE NOCASE REFERENCES allowed_accounts(email) ON DELETE CASCADE,
 google_sub TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS oauth_transactions (
 state_hash TEXT PRIMARY KEY,
 nonce TEXT NOT NULL,
 verifier TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
