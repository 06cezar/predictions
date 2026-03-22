import { Router } from 'express';
import { db } from '../db';
import { users, predictions, outcomes, ratings } from '../schema';
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
        const ratingRows = db.select({ score: ratings.score }).from(ratings)
          .where(eq(ratings.predictionId, p.id)).all();
        if (ratingRows.length > 0) {
          const avg = ratingRows.reduce((s, r) => s + r.score, 0) / ratingRows.length;
          // Bonus tiers: lower rating = bolder prediction = more points
          let bonus: number;
          if (avg < 10)       bonus = 4.0; // < 10%: nimeni nu credea
          else if (avg < 25)  bonus = 3.0; // 10–25%: improbabil
          else if (avg < 50)  bonus = 2.0; // 25–50%: sub 50/50
          else                bonus = 1.0; // >= 50%: evident
          totalWeighted += bonus;
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
