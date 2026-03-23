import { Router } from 'express';
import { db } from '../db';
import { users, predictions, outcomes, ratings, predictionHistory, settings } from '../schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../auth';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  if (s.currentPhase !== 'done') {
    return res.status(403).json({ error: 'Leaderboard is only available after the game is done' });
  }
  const threshold = s.ratingThreshold;
  const tier1 = Math.floor(threshold * 0.25); // e.g. 10 for threshold=40
  const tier2 = Math.floor(threshold * 0.5);  // e.g. 20 for threshold=40

  const allUsers = db.select().from(users).all();

  const board = allUsers.map(u => {
    const myPreds = db.select().from(predictions).where(eq(predictions.authorId, u.id)).all();

    let happened = 0;
    let totalWeighted = 0;

    for (const p of myPreds) {
      const outcome = db.select().from(outcomes).where(eq(outcomes.predictionId, p.id)).get();
      if (outcome?.happened === true) {
        happened++;
        const editCount = db.select().from(predictionHistory)
          .where(eq(predictionHistory.predictionId, p.id)).all().length;
        const ratingRows = db.select({ score: ratings.score }).from(ratings)
          .where(eq(ratings.predictionId, p.id)).all();
        let bonus: number;
        if (ratingRows.length > 0) {
          const avg = ratingRows.reduce((r, row) => r + row.score, 0) / ratingRows.length;
          if (avg < tier1)        bonus = 4.0;
          else if (avg < tier2)   bonus = 3.0;
          else if (avg < threshold) bonus = 2.0;
          else                    bonus = 1.0;
        } else {
          bonus = 1.0;
        }
        const penalty = editCount * 0.5;
        totalWeighted += Math.max(0.5, bonus - penalty);
      }
    }

    return {
      id: u.id,
      name: u.name,
      score: happened,
      weightedScore: Math.round(totalWeighted * 10) / 10,
    };
  });

  board.sort((a, b) => b.weightedScore - a.weightedScore || b.score - a.score);

  res.json(board.map((u, i) => ({ ...u, rank: i + 1, threshold, tier1, tier2 })));
});

export default router;
