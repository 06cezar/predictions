import type Database from 'better-sqlite3';

/**
 * Schema changes are numbered migrations; PRAGMA user_version records how many
 * have been applied. Each one runs in its own transaction with foreign keys
 * off, so it can rebuild tables (SQLite cannot alter constraints in place).
 */

/**
 * v1 baseline: the single-game schema. Databases created before migrations
 * were versioned report user_version 0 but may already have some or all of
 * it, so every statement here is idempotent.
 */
const V1_TABLES_SQL = `
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
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    forgiven_edits INTEGER NOT NULL DEFAULT 0
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
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    author_id INTEGER REFERENCES users(id),
    meta TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    dismissed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS bonus_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 5,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS bonus_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES bonus_categories(id),
    voter_id INTEGER NOT NULL REFERENCES users(id),
    nominee_id INTEGER NOT NULL REFERENCES users(id),
    rank INTEGER NOT NULL,
    UNIQUE(category_id, voter_id, rank)
  );
  CREATE TABLE IF NOT EXISTS blocked_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS invite_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    created_by INTEGER NOT NULL REFERENCES users(id),
    used_by INTEGER REFERENCES users(id),
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY,
    current_phase TEXT NOT NULL DEFAULT 'submission',
    submission_deadline TEXT,
    reveal_deadline TEXT,
    rating_threshold INTEGER NOT NULL DEFAULT 50,
    auto_advance_phase INTEGER NOT NULL DEFAULT 1,
    admin_override INTEGER NOT NULL DEFAULT 0,
    anonymous_predictions INTEGER NOT NULL DEFAULT 1,
    bonus_active INTEGER NOT NULL DEFAULT 0
  );
`;

/**
 * Columns added after the first deploy. CREATE TABLE IF NOT EXISTS leaves an
 * existing table untouched, so older databases get these added explicitly.
 */
const ADDED_COLUMNS: [table: string, column: string, definition: string][] = [
  ['settings', 'anonymous_predictions', 'INTEGER NOT NULL DEFAULT 1'],
  ['settings', 'bonus_active', 'INTEGER NOT NULL DEFAULT 0'],
  ['predictions', 'forgiven_edits', 'INTEGER NOT NULL DEFAULT 0'],
  ['notifications', 'meta', 'TEXT'],
  ['notifications', 'dismissed', 'INTEGER NOT NULL DEFAULT 0'],
];

function hasColumn(sqlite: Database.Database, table: string, column: string) {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some(c => c.name === column);
}

function v1Baseline(sqlite: Database.Database) {
  sqlite.exec(V1_TABLES_SQL);

  for (const [table, column, definition] of ADDED_COLUMNS) {
    if (!hasColumn(sqlite, table, column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS unique_outcome ON outcomes(prediction_id);
    INSERT OR IGNORE INTO settings (id) VALUES (1);
  `);
}

const MIGRATIONS: ((sqlite: Database.Database) => void)[] = [
  v1Baseline,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Apply every migration the database hasn't seen yet. Safe to call on every startup. */
export function migrate(sqlite: Database.Database) {
  const applied = sqlite.pragma('user_version', { simple: true }) as number;

  for (let version = applied; version < MIGRATIONS.length; version++) {
    // PRAGMA foreign_keys is a no-op inside a transaction, so toggle it around one.
    sqlite.pragma('foreign_keys = OFF');
    try {
      sqlite.transaction(() => {
        MIGRATIONS[version](sqlite);
        const violations = sqlite.pragma('foreign_key_check') as unknown[];
        if (violations.length > 0) {
          throw new Error(`Migration ${version + 1} left ${violations.length} foreign key violation(s)`);
        }
        sqlite.pragma(`user_version = ${version + 1}`);
      })();
    } finally {
      sqlite.pragma('foreign_keys = ON');
    }
  }
}
