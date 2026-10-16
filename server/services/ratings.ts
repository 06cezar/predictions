import { eq } from 'drizzle-orm';
import { db } from '../db';
import { ratings } from '../schema';

/** Average rating of a prediction rounded to a whole percent, or null if nobody rated it. */
export function getAvgRating(predictionId: number): number | null {
  const ratingRows = db.select({ score: ratings.score }).from(ratings)
    .where(eq(ratings.predictionId, predictionId)).all();
  if (ratingRows.length === 0) return null;
  return Math.round(ratingRows.reduce((s, r) => s + r.score, 0) / ratingRows.length);
}
