import { Router } from 'express';
import { db } from '../db';
import { users, predictions, outcomes, ratings } from '../schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../auth';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  const allUsers = db.select().from(users).all();

  const board = allUsers.map(u => {
    const myPreds = db.select().from(predictions).where(eq(predictions.targetId, u.id)).all();

    let happened = 0;
    let totalWeighted = 0;

    for (const p of myPreds) {
      const outcome = db.select().from(outcomes).where(eq(outcomes.predictionId, p.id)).get();
      if (outcome?.happened === true) {
        happened++;
        const ratingRows = db.select({ score: ratings.score }).from(ratings)
          .where(eq(ratings.predictionId, p.id)).all();
        if (ratingRows.length > 0) {
          const avg = ratingRows.reduce((s, r) => s + r.score, 0) / ratingRows.length;
          totalWeighted += avg / 100;
        } else {
          totalWeighted += 1;
        }
      }
    }

    return {
      id: u.id,
      name: u.name,
      score: happened,
      weightedScore: Math.round(totalWeighted * 10) / 10,
    };
  });

  board.sort((a, b) => b.score - a.score || b.weightedScore - a.weightedScore);

  res.json(board.map((u, i) => ({ ...u, rank: i + 1 })));
});

export default router;
