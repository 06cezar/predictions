import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  games, users, predictions, predictionHistory, ratings, outcomes, notifications,
  bonusCategories, bonusVotes, inviteLinks,
} from '../schema';
import { randomJoinCode } from '../random';

export const PHASES = ['submission', 'reveal', 'done'] as const;
export type Phase = typeof PHASES[number];
export type Game = typeof games.$inferSelect;
export type GameChanges = Partial<Omit<typeof games.$inferInsert, 'id' | 'createdAt'>>;

const MAX_NAME_LENGTH = 40;

/** Trim a game or player name from a request body; '' if missing. */
export function cleanName(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_NAME_LENGTH) : '';
}

export function getGame(id: number): Game | undefined {
  return db.select().from(games).where(eq(games.id, id)).get();
}

export function updateGame(id: number, values: GameChanges) {
  db.update(games).set(values).where(eq(games.id, id)).run();
}

/** Join codes are shown upper-case but accepted in any case. */
export function findGameByJoinCode(code: string): Game | undefined {
  return db.select().from(games).where(eq(games.joinCode, code.trim().toUpperCase())).get();
}

export function newJoinCode(): string {
  for (;;) {
    const code = randomJoinCode();
    if (!findGameByJoinCode(code)) return code;
  }
}

export function createGame(values: { name: string } & GameChanges): Game {
  return db.insert(games).values({ joinCode: newJoinCode(), ...values }).returning().get();
}

/** Can players still write and edit predictions? Admin override keeps it open. */
export function isSubmissionOpen(game: Game) {
  if (game.adminOverride) return true;
  if (game.currentPhase !== 'submission') return false;
  if (game.submissionDeadline) {
    return new Date() < new Date(game.submissionDeadline);
  }
  return true;
}

const gamePredictionIds = (gameId: number) =>
  db.select({ id: predictions.id }).from(predictions).where(eq(predictions.gameId, gameId));
const gameUserIds = (gameId: number) =>
  db.select({ id: users.id }).from(users).where(eq(users.gameId, gameId));
const gameCategoryIds = (gameId: number) =>
  db.select({ id: bonusCategories.id }).from(bonusCategories).where(eq(bonusCategories.gameId, gameId));

/** Wipe a game's predictions, ratings, outcomes, bonus round and notifications, keeping its players. */
export function clearGameData(gameId: number) {
  db.delete(bonusVotes).where(inArray(bonusVotes.categoryId, gameCategoryIds(gameId))).run();
  db.delete(bonusCategories).where(eq(bonusCategories.gameId, gameId)).run();
  db.delete(notifications).where(inArray(notifications.userId, gameUserIds(gameId))).run();
  db.delete(outcomes).where(inArray(outcomes.predictionId, gamePredictionIds(gameId))).run();
  db.delete(ratings).where(inArray(ratings.predictionId, gamePredictionIds(gameId))).run();
  db.delete(predictionHistory).where(inArray(predictionHistory.predictionId, gamePredictionIds(gameId))).run();
  db.delete(predictions).where(eq(predictions.gameId, gameId)).run();
}

/** Delete a game and everything in it. */
export function deleteGame(gameId: number) {
  clearGameData(gameId);
  db.delete(inviteLinks).where(eq(inviteLinks.gameId, gameId)).run();
  db.delete(users).where(eq(users.gameId, gameId)).run();
  db.delete(games).where(eq(games.id, gameId)).run();
}

/** On a fresh install, create a first game and its admin from ADMIN_TOKEN / ADMIN_NAME. */
export function seedAdminFromEnv() {
  const token = process.env.ADMIN_TOKEN;
  if (!token || db.select({ id: users.id }).from(users).limit(1).get()) return;

  const game = createGame({ name: process.env.ADMIN_GAME_NAME || 'Predictions', openJoin: false });
  const name = process.env.ADMIN_NAME || 'Admin';
  db.insert(users).values({ gameId: game.id, name, token, isAdmin: true }).run();
  console.log(`[db] Seeded admin user ${name} in game "${game.name}"`);
}
