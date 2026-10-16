import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../server/schema';
import { setDb } from '../server/db';
import { applySchema } from '../server/migrate';
import { createApp } from '../server/app';
import request from 'supertest';

export function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  applySchema(sqlite);
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
