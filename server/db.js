// SQLite storage via the built-in node:sqlite module. Single process, synchronous, transactional.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA secure_delete = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      pass_hash TEXT NOT NULL,
      balance INTEGER NOT NULL,
      notional_cents INTEGER NOT NULL DEFAULT 100,
      limits TEXT NOT NULL DEFAULT '{"lossLimit":0,"sessionMinutes":0,"realityEvery":25}',
      lessons TEXT NOT NULL DEFAULT '[]',
      milestones TEXT NOT NULL DEFAULT '[]',
      refills INTEGER NOT NULL DEFAULT 0,
      vault INTEGER NOT NULL DEFAULT 0,
      deposited INTEGER NOT NULL DEFAULT 0,
      tier TEXT NOT NULL DEFAULT 'bronze',
      rebate_pending REAL NOT NULL DEFAULT 0,
      rebate_claimed INTEGER NOT NULL DEFAULT 0,
      bonuses INTEGER NOT NULL DEFAULT 0,
      failed_logins INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      start_balance INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS seeds (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      server_seed_enc TEXT NOT NULL,
      server_seed_hash TEXT NOT NULL,
      client_seed TEXT NOT NULL,
      nonce INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS seed_history (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      server_seed TEXT NOT NULL,
      server_seed_hash TEXT NOT NULL,
      client_seed TEXT NOT NULL,
      nonces INTEGER NOT NULL,
      revealed_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS seed_history_user ON seed_history(user_id);
    CREATE TABLE IF NOT EXISTS rounds (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game TEXT NOT NULL,
      base INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      rtp REAL NOT NULL,
      params TEXT NOT NULL,
      nonce INTEGER NOT NULL,
      server_seed_hash TEXT NOT NULL,
      client_seed TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('open','settled')),
      state TEXT,
      multiplier REAL,
      payout INTEGER,
      outcome TEXT,
      floats_used INTEGER NOT NULL DEFAULT 0,
      balance_after INTEGER,
      opened_at INTEGER NOT NULL,
      settled_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS rounds_user ON rounds(user_id, id);
    CREATE UNIQUE INDEX IF NOT EXISTS rounds_one_open ON rounds(user_id) WHERE status = 'open';
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_user ON events(user_id, id);
    CREATE INDEX IF NOT EXISTS rounds_settled ON rounds(status, settled_at);
    CREATE TABLE IF NOT EXISTS chat (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      text TEXT NOT NULL,
      at INTEGER NOT NULL
    );
  `);
  // migrations for databases created before these columns existed
  const cols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
  if (!cols.has('vault')) db.exec('ALTER TABLE users ADD COLUMN vault INTEGER NOT NULL DEFAULT 0');
  if (!cols.has('ghost')) db.exec('ALTER TABLE users ADD COLUMN ghost INTEGER NOT NULL DEFAULT 0');
  if (!cols.has('deposited')) db.exec('ALTER TABLE users ADD COLUMN deposited INTEGER NOT NULL DEFAULT 0');
  if (!cols.has('tier')) db.exec("ALTER TABLE users ADD COLUMN tier TEXT NOT NULL DEFAULT 'bronze'");
  if (!cols.has('rebate_pending')) db.exec('ALTER TABLE users ADD COLUMN rebate_pending REAL NOT NULL DEFAULT 0');
  if (!cols.has('rebate_claimed')) db.exec('ALTER TABLE users ADD COLUMN rebate_claimed INTEGER NOT NULL DEFAULT 0');
  if (!cols.has('bonuses')) db.exec('ALTER TABLE users ADD COLUMN bonuses INTEGER NOT NULL DEFAULT 0');
  return db;
}

/** Run `fn` inside a transaction; rolls back on throw. */
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw e;
  }
}
