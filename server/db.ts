import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import { migrate } from './migrate';

/** Where SQLite files live. Production mounts a Fly.io volume at /data. */
export const DATA_DIR = process.env.DATA_DIR ?? (process.env.NODE_ENV === 'production' ? '/data' : process.cwd());

// Tests inject their own in-memory DB via setDb(), so never open a file there:
// parallel test workers racing to create predictions.db cause SQLITE_BUSY.
const sqlite = new Database(process.env.NODE_ENV === 'test' ? ':memory:' : path.join(DATA_DIR, 'predictions.db'));
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

let _db = drizzle(sqlite, { schema });

export type Db = typeof _db;

// Proxy so that when routes do `db.select()` etc. at request time,
// they always use the current _db instance (important for test injection).
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    return Reflect.get(_db, prop);
  },
});

export function setDb(newDb: Db) {
  _db = newDb;
}

export function initDb() {
  migrate(sqlite, { legacyGameName: process.env.LEGACY_GAME_NAME });
}
