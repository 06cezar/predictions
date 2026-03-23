import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../server/schema';
import { setDb } from '../server/db';
import { createApp } from '../server/app';
import request from 'supertest';

const SCHEMA_SQL = `
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
  INSERT OR IGNORE INTO settings (id, current_phase, rating_threshold, auto_advance_phase, admin_override, anonymous_predictions)
  VALUES (1, 'submission', 40, 1, 0, 1);
`;

export function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(SCHEMA_SQL);
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

export function setupTestDb() {
  const { sqlite, db } = createTestDb();
  setDb(db);
  return { sqlite, db };
}

/** Create a test user directly in the DB. */
export function createUser(
  db: ReturnType<typeof createTestDb>['db'],
  name: string,
  token: string,
  isAdmin = false,
) {
  return db.insert(schema.users).values({ name, token, isAdmin }).returning().get()!;
}

/** Create a prediction directly in the DB. */
export function createPrediction(
  db: ReturnType<typeof createTestDb>['db'],
  authorId: number,
  targetId: number,
  text: string,
) {
  return db.insert(schema.predictions).values({ authorId, targetId, currentText: text }).returning().get()!;
}

/** Create a rating directly in the DB. */
export function createRating(
  db: ReturnType<typeof createTestDb>['db'],
  predictionId: number,
  userId: number,
  score: number,
) {
  return db.insert(schema.ratings).values({ predictionId, userId, score }).returning().get()!;
}

/** Create an outcome directly in the DB. */
export function createOutcome(
  db: ReturnType<typeof createTestDb>['db'],
  predictionId: number,
  happened: boolean | null,
  markedBy: number,
) {
  return db.insert(schema.outcomes).values({ predictionId, happened, markedBy }).returning().get()!;
}

/** Set the current phase in settings. */
export function setPhase(
  db: ReturnType<typeof createTestDb>['db'],
  phase: 'submission' | 'reveal' | 'done',
  extra: Partial<typeof schema.settings.$inferInsert> = {},
) {
  db.update(schema.settings).set({ currentPhase: phase, ...extra }).run();
}

/**
 * Returns a supertest agent that is already logged in as the given user.
 * The agent persists cookies so session is maintained across requests.
 */
export async function loginAs(
  agent: ReturnType<typeof request.agent>,
  token: string,
) {
  const res = await agent.post('/api/auth/login').send({ token });
  if (res.status !== 200) {
    throw new Error(`Login failed for token ${token}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

/** Create a fresh Express app for testing (does NOT call listen). */
export function createTestApp() {
  return createApp();
}
