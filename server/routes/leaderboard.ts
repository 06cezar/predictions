import { Router } from 'express';
import { db } from '../db';
import { users, predictions, outcomes, ratings, predictionHistory } from '../schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../auth';

const router = Router();

router.get('/', requireAuth, (req, res) => {
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
          const avg = ratingRows.reduce((s, r) => s + r.score, 0) / ratingRows.length;
          // Bonus tiers: lower rating = bolder prediction = more points
          if (avg < 10)       bonus = 4.0;
          else if (avg < 25)  bonus = 3.0;
          else if (avg < 50)  bonus = 2.0;
          else                bonus = 1.0;
        } else {
          bonus = 1.0;
        }
        // Penalty: -0.5 per edit, minimum 0.5
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

  board.sort((a, b) => b.score - a.score || b.weightedScore - a.weightedScore);

  res.json(board.map((u, i) => ({ ...u, rank: i + 1 })));
});

export default router;
