import { eq, getTableColumns } from 'drizzle-orm';
import { db } from '../db';
import { users, predictions, outcomes, ratings, predictionHistory } from '../schema';

export type User = typeof users.$inferSelect;
export type Prediction = typeof predictions.$inferSelect;
export type Outcome = typeof outcomes.$inferSelect;
export type Rating = typeof ratings.$inferSelect;

/**
 * Everything scoring and the Hall of Fame need for one game, loaded with one
 * query per table. A game is a group of friends, so working in memory is
 * simpler and much cheaper than querying per prediction.
 */
export interface GameSnapshot {
  users: User[];
  predictions: Prediction[];
  outcomes: Outcome[];
  allRatings: Rating[];
  userName(id: number): string | undefined;
  outcome(predictionId: number): Outcome | undefined;
  ratings(predictionId: number): number[];
  /** Previous texts of a prediction, oldest first. */
  history(predictionId: number): string[];
}

export function loadSnapshot(gameId: number): GameSnapshot {
  const inGame = eq(predictions.gameId, gameId);
  const allUsers = db.select().from(users).where(eq(users.gameId, gameId)).all();
  const allPredictions = db.select().from(predictions).where(inGame).all();
  const allOutcomes = db.select(getTableColumns(outcomes)).from(outcomes)
    .innerJoin(predictions, eq(predictions.id, outcomes.predictionId)).where(inGame).orderBy(outcomes.id).all();
  const allRatings = db.select(getTableColumns(ratings)).from(ratings)
    .innerJoin(predictions, eq(predictions.id, ratings.predictionId)).where(inGame).orderBy(ratings.id).all();
  const allHistory = db.select(getTableColumns(predictionHistory)).from(predictionHistory)
    .innerJoin(predictions, eq(predictions.id, predictionHistory.predictionId)).where(inGame).orderBy(predictionHistory.id).all();
  const names = new Map(allUsers.map(u => [u.id, u.name]));
  const outcomeByPrediction = new Map<number, Outcome>();
  for (const o of allOutcomes) {
    if (!outcomeByPrediction.has(o.predictionId)) outcomeByPrediction.set(o.predictionId, o);
  }
  const ratingsByPrediction = groupBy(allRatings, r => r.predictionId, r => r.score);
  const historyByPrediction = groupBy(allHistory, h => h.predictionId, h => h.oldText);

  return {
    users: allUsers,
    predictions: allPredictions,
    outcomes: allOutcomes,
    allRatings,
    userName: id => names.get(id),
    outcome: id => outcomeByPrediction.get(id),
    ratings: id => ratingsByPrediction.get(id) ?? [],
    history: id => historyByPrediction.get(id) ?? [],
  };
}

function groupBy<T, V>(rows: T[], key: (row: T) => number, value: (row: T) => V) {
  const groups = new Map<number, V[]>();
  for (const row of rows) {
    const k = key(row);
    const group = groups.get(k);
    if (group) group.push(value(row));
    else groups.set(k, [value(row)]);
  }
  return groups;
}

export function mean(values: number[]) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Average rating of a prediction (0-100), or null if nobody rated it. */
export function avgRating(g: GameSnapshot, predictionId: number): number | null {
  const scores = g.ratings(predictionId);
  return scores.length > 0 ? mean(scores) : null;
}
