import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';

const dbDir = process.env.NODE_ENV === 'production' ? '/data' : process.cwd();
const sqlite = new Database(path.join(dbDir, 'predictions.db'));
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

let _db = drizzle(sqlite, { schema });

// Proxy so that when routes do `db.select()` etc. at request time,
// they always use the current _db instance (important for test injection).
export const db = new Proxy({} as typeof _db, {
  get(_target, prop) {
    return (_db as any)[prop];
  },
});

export function setDb(newDb: typeof _db) {
  _db = newDb;
}

// Initialize tables if not exists
export function initDb() {
  // Run column migrations FIRST (before INSERT OR IGNORE that may reference new columns)
  try { sqlite.exec(`ALTER TABLE settings ADD COLUMN anonymous_predictions INTEGER NOT NULL DEFAULT 1`); } catch {}
  try { sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS unique_outcome ON outcomes(prediction_id)`); } catch {}
  try { sqlite.exec(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    author_id INTEGER REFERENCES users(id),
    meta TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`); } catch {}
  try { sqlite.exec(`ALTER TABLE notifications ADD COLUMN meta TEXT`); } catch {}
  try { sqlite.exec(`ALTER TABLE notifications ADD COLUMN dismissed INTEGER NOT NULL DEFAULT 0`); } catch {}

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id INTEGER NOT NULL REFERENCES users(id),
      target_id INTEGER NOT NULL REFERENCES users(id),
      current_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS prediction_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prediction_id INTEGER NOT NULL REFERENCES predictions(id),
      old_text TEXT NOT NULL,
      edited_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prediction_id INTEGER NOT NULL REFERENCES predictions(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      score INTEGER NOT NULL,
      UNIQUE(prediction_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS outcomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prediction_id INTEGER NOT NULL REFERENCES predictions(id),
      happened INTEGER,
      marked_by INTEGER NOT NULL REFERENCES users(id),
      marked_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      current_phase TEXT NOT NULL DEFAULT 'submission',
      submission_deadline TEXT,
      reveal_deadline TEXT,
      rating_threshold INTEGER NOT NULL DEFAULT 40,
      auto_advance_phase INTEGER NOT NULL DEFAULT 1,
      admin_override INTEGER NOT NULL DEFAULT 0,
      anonymous_predictions INTEGER NOT NULL DEFAULT 1
    );
    INSERT OR IGNORE INTO settings (id, current_phase, rating_threshold, auto_advance_phase, admin_override)
    VALUES (1, 'submission', 40, 1, 0);
  `);
}
