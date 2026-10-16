import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { migrate, SCHEMA_VERSION } from '../server/migrate';

/** The schema as first deployed (March 2026): no versioning, several columns and tables missing. */
const MARCH_2026_SCHEMA = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL REFERENCES users(id),
    target_id INTEGER NOT NULL REFERENCES users(id),
    current_text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE prediction_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prediction_id INTEGER NOT NULL REFERENCES predictions(id),
    old_text TEXT NOT NULL,
    edited_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prediction_id INTEGER NOT NULL REFERENCES predictions(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    score INTEGER NOT NULL,
    UNIQUE(prediction_id, user_id)
  );
  CREATE TABLE outcomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prediction_id INTEGER NOT NULL REFERENCES predictions(id),
    happened INTEGER,
    marked_by INTEGER NOT NULL REFERENCES users(id),
    marked_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE settings (
    id INTEGER PRIMARY KEY,
    current_phase TEXT NOT NULL DEFAULT 'submission',
    submission_deadline TEXT,
    reveal_deadline TEXT,
    rating_threshold INTEGER NOT NULL DEFAULT 40,
    auto_advance_phase INTEGER NOT NULL DEFAULT 1,
    admin_override INTEGER NOT NULL DEFAULT 0
  );
  INSERT INTO settings (id, current_phase, submission_deadline, rating_threshold)
    VALUES (1, 'reveal', '2026-04-16T20:43:00.000Z', 40);
  INSERT INTO users (id, name, token, is_admin) VALUES
    (1, 'Ana', 'ana-token', 1),
    (2, 'Bob', 'bob-token', 0);
  INSERT INTO predictions (id, author_id, target_id, current_text) VALUES
    (1, 1, 2, 'Bob moves abroad'),
    (2, 2, 1, 'Ana runs a marathon');
  INSERT INTO ratings (prediction_id, user_id, score) VALUES (1, 2, 30);
  INSERT INTO outcomes (prediction_id, happened, marked_by) VALUES (1, 1, 2);
`;

function legacyDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(MARCH_2026_SCHEMA);
  return sqlite;
}

const columns = (sqlite: Database.Database, table: string) =>
  (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name);

const tables = (sqlite: Database.Database) =>
  (sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[])
    .map(t => t.name).sort();

describe('migrate()', () => {
  it('builds the full schema on an empty database', () => {
    const sqlite = new Database(':memory:');
    migrate(sqlite);

    expect(sqlite.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    expect(tables(sqlite)).toEqual(expect.arrayContaining([
      'users', 'predictions', 'prediction_history', 'ratings', 'outcomes',
      'notifications', 'bonus_categories', 'bonus_votes', 'blocked_tokens', 'invite_links',
    ]));
  });

  it('upgrades an unversioned March 2026 database without losing data', () => {
    const sqlite = legacyDb();
    migrate(sqlite);

    expect(sqlite.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    expect(columns(sqlite, 'predictions')).toContain('forgiven_edits');
    expect(columns(sqlite, 'notifications')).toEqual(expect.arrayContaining(['meta', 'dismissed']));
    expect(sqlite.prepare('SELECT name, token, is_admin FROM users ORDER BY id').all()).toEqual([
      { name: 'Ana', token: 'ana-token', is_admin: 1 },
      { name: 'Bob', token: 'bob-token', is_admin: 0 },
    ]);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM predictions').get()).toEqual({ n: 2 });
    expect(sqlite.prepare('SELECT score FROM ratings').get()).toEqual({ score: 30 });
    expect(sqlite.prepare('SELECT happened FROM outcomes').get()).toEqual({ happened: 1 });
  });

  it('is a no-op when run again', () => {
    const sqlite = legacyDb();
    migrate(sqlite);
    const schemaBefore = sqlite.prepare('SELECT sql FROM sqlite_master ORDER BY name').all();
    migrate(sqlite);
    expect(sqlite.prepare('SELECT sql FROM sqlite_master ORDER BY name').all()).toEqual(schemaBefore);
  });

  it('leaves foreign keys enforced afterwards', () => {
    const sqlite = new Database(':memory:');
    migrate(sqlite);
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});
