import { Router } from 'express';
import { db } from '../db';
import { users, predictions, outcomes, ratings, predictionHistory, settings } from '../schema';
import { eq } from 'drizzle-orm';
import { requireAuth, requireAdmin, getCurrentUser } from '../auth';

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

router.get('/preview', requireAdmin, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  const threshold = s.ratingThreshold;
  const tier1 = Math.floor(threshold * 0.25);
  const tier2 = Math.floor(threshold * 0.5);

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
          if (avg < tier1)          bonus = 4.0;
          else if (avg < tier2)     bonus = 3.0;
          else if (avg < threshold) bonus = 2.0;
          else                      bonus = 1.0;
        } else {
          bonus = 1.0;
        }
        const penalty = editCount * 0.5;
        totalWeighted += Math.max(0.5, bonus - penalty);
      }
    }
    return { id: u.id, name: u.name, score: happened, weightedScore: Math.round(totalWeighted * 10) / 10 };
  });

  board.sort((a, b) => b.weightedScore - a.weightedScore || b.score - a.score);
  res.json(board.map((u, i) => ({ ...u, rank: i + 1, threshold, tier1, tier2 })));
});

router.get('/most-courageous', requireAuth, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  const u = getCurrentUser(req); if (s.currentPhase !== 'done' && !u?.isAdmin) return res.status(403).json({ error: 'Not available yet' });

  const allPreds = db.select().from(predictions).all();
  let best: { predictionId: number; avg: number } | null = null;

  for (const p of allPreds) {
    const outcome = db.select().from(outcomes).where(eq(outcomes.predictionId, p.id)).get();
    if (outcome?.happened !== true) continue;
    const ratingRows = db.select({ score: ratings.score }).from(ratings)
      .where(eq(ratings.predictionId, p.id)).all();
    if (ratingRows.length === 0) continue;
    const avg = ratingRows.reduce((sum, r) => sum + r.score, 0) / ratingRows.length;
    if (best === null || avg < best.avg) best = { predictionId: p.id, avg };
  }

  if (!best) return res.json(null);

  const p = db.select().from(predictions).where(eq(predictions.id, best.predictionId)).get()!;
  const author = db.select({ name: users.name }).from(users).where(eq(users.id, p.authorId)).get();
  const target = db.select({ name: users.name }).from(users).where(eq(users.id, p.targetId)).get();

  res.json({
    text: p.currentText,
    authorName: s.anonymousPredictions ? null : author?.name,
    targetName: target?.name,
    avg: Math.round(best.avg),
  });
});

router.get('/most-controversial', requireAuth, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  const u = getCurrentUser(req); if (s.currentPhase !== 'done' && !u?.isAdmin) return res.status(403).json({ error: 'Not available yet' });

  const allPreds = db.select().from(predictions).all();
  let best: { predictionId: number; stdDev: number } | null = null;

  for (const p of allPreds) {
    const ratingRows = db.select({ score: ratings.score }).from(ratings)
      .where(eq(ratings.predictionId, p.id)).all();
    if (ratingRows.length < 2) continue;
    const scores = ratingRows.map(r => r.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const stdDev = Math.sqrt(scores.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / scores.length);
    if (best === null || stdDev > best.stdDev) best = { predictionId: p.id, stdDev };
  }

  if (!best) return res.json(null);

  const p = db.select().from(predictions).where(eq(predictions.id, best.predictionId)).get()!;
  const author = db.select({ name: users.name }).from(users).where(eq(users.id, p.authorId)).get();
  const target = db.select({ name: users.name }).from(users).where(eq(users.id, p.targetId)).get();
  const ratingRows = db.select({ score: ratings.score }).from(ratings).where(eq(ratings.predictionId, p.id)).all();
  const scores = ratingRows.map(r => r.score).sort((a, b) => a - b);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  res.json({
    text: p.currentText,
    authorName: s.anonymousPredictions ? null : author?.name,
    targetName: target?.name,
    avg,
    stdDev: Math.round(best.stdDev),
    individualRatings: scores,
  });
});

router.get('/biggest-miss', requireAuth, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  const u = getCurrentUser(req); if (s.currentPhase !== 'done' && !u?.isAdmin) return res.status(403).json({ error: 'Not available yet' });

  const allPreds = db.select().from(predictions).all();
  let best: { predictionId: number; avg: number } | null = null;

  for (const p of allPreds) {
    const outcome = db.select().from(outcomes).where(eq(outcomes.predictionId, p.id)).get();
    if (outcome?.happened !== false) continue;
    const ratingRows = db.select({ score: ratings.score }).from(ratings)
      .where(eq(ratings.predictionId, p.id)).all();
    if (ratingRows.length === 0) continue;
    const avg = ratingRows.reduce((sum, r) => sum + r.score, 0) / ratingRows.length;
    if (best === null || avg > best.avg) best = { predictionId: p.id, avg };
  }

  if (!best) return res.json(null);

  const p = db.select().from(predictions).where(eq(predictions.id, best.predictionId)).get()!;
  const author = db.select({ name: users.name }).from(users).where(eq(users.id, p.authorId)).get();
  const target = db.select({ name: users.name }).from(users).where(eq(users.id, p.targetId)).get();

  res.json({
    text: p.currentText,
    authorName: s.anonymousPredictions ? null : author?.name,
    targetName: target?.name,
    avg: Math.round(best.avg),
  });
});

router.get('/mr-does-it-all', requireAuth, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  const u = getCurrentUser(req); if (s.currentPhase !== 'done' && !u?.isAdmin) return res.status(403).json({ error: 'Not available yet' });

  const allUsers = db.select().from(users).all();
  const board: { userId: number; name: string; count: number; avgRating: number }[] = [];

  for (const u of allUsers) {
    const targetPreds = db.select().from(predictions).where(eq(predictions.targetId, u.id)).all();
    let count = 0;
    let totalRating = 0;
    let ratingCount = 0;
    for (const p of targetPreds) {
      const outcome = db.select().from(outcomes).where(eq(outcomes.predictionId, p.id)).get();
      if (outcome?.happened === true) {
        count++;
        const ratingRows = db.select({ score: ratings.score }).from(ratings).where(eq(ratings.predictionId, p.id)).all();
        if (ratingRows.length > 0) {
          totalRating += ratingRows.reduce((a, r) => a + r.score, 0) / ratingRows.length;
          ratingCount++;
        }
      }
    }
    if (count > 0) {
      board.push({ userId: u.id, name: u.name, count, avgRating: ratingCount > 0 ? totalRating / ratingCount : 100 });
    }
  }

  if (board.length === 0) return res.json([]);

  board.sort((a, b) => b.count - a.count || a.avgRating - b.avgRating);

  const topCount = board[0].count;
  const topAvg = board[0].avgRating;
  const winners = board.filter(u => u.count === topCount && Math.abs(u.avgRating - topAvg) < 0.01);

  res.json(winners.map(w => ({ name: w.name, count: w.count })));
});

router.get('/best-friends', requireAuth, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  const u = getCurrentUser(req); if (s.currentPhase !== 'done' && !u?.isAdmin) return res.status(403).json({ error: 'Not available yet' });

  const allUsers = db.select().from(users).all();
  const pairs: { userA: string; userB: string; avgRating: number }[] = [];

  for (let i = 0; i < allUsers.length; i++) {
    for (let j = i + 1; j < allUsers.length; j++) {
      const a = allUsers[i];
      const b = allUsers[j];
      let count = 0;
      let totalRating = 0;
      let ratingCount = 0;

      for (const [authorId, targetId] of [[a.id, b.id], [b.id, a.id]]) {
        const preds = db.select().from(predictions)
          .where(eq(predictions.authorId, authorId)).all()
          .filter(p => p.targetId === targetId);
        for (const p of preds) {
          const outcome = db.select().from(outcomes).where(eq(outcomes.predictionId, p.id)).get();
          if (outcome?.happened === true) {
            count++;
            const ratingRows = db.select({ score: ratings.score }).from(ratings).where(eq(ratings.predictionId, p.id)).all();
            if (ratingRows.length > 0) {
              totalRating += ratingRows.reduce((a, r) => a + r.score, 0) / ratingRows.length;
              ratingCount++;
            }
          }
        }
      }

      if (count === 2) {
        pairs.push({ userA: a.name, userB: b.name, avgRating: ratingCount > 0 ? totalRating / ratingCount : 100 });
      }
    }
  }

  if (pairs.length === 0) return res.json([]);

  pairs.sort((a, b) => a.avgRating - b.avgRating);
  const topAvg = pairs[0].avgRating;
  const winners = pairs.filter(p => Math.abs(p.avgRating - topAvg) < 0.01);

  res.json(winners.map(p => ({ userA: p.userA, userB: p.userB })));
});

router.get('/most-revised', requireAuth, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  const u = getCurrentUser(req); if (s.currentPhase !== 'done' && !u?.isAdmin) return res.status(403).json({ error: 'Not available yet' });

  const allPreds = db.select().from(predictions).all();
  let best: { predictionId: number; editCount: number } | null = null;

  for (const p of allPreds) {
    const editCount = db.select().from(predictionHistory).where(eq(predictionHistory.predictionId, p.id)).all().length;
    if (editCount === 0) continue;
    if (best === null || editCount > best.editCount || (editCount === best.editCount && p.id > best.predictionId)) {
      best = { predictionId: p.id, editCount };
    }
  }

  if (!best) return res.json(null);

  const p = db.select().from(predictions).where(eq(predictions.id, best.predictionId)).get()!;
  const author = db.select({ name: users.name }).from(users).where(eq(users.id, p.authorId)).get();
  const target = db.select({ name: users.name }).from(users).where(eq(users.id, p.targetId)).get();
  const history = db.select({ oldText: predictionHistory.oldText })
    .from(predictionHistory).where(eq(predictionHistory.predictionId, p.id)).all();

  res.json({
    text: p.currentText,
    authorName: s.anonymousPredictions ? null : author?.name,
    targetName: target?.name,
    editCount: best.editCount,
    history: history.map(h => h.oldText),
  });
});

router.get('/most-unpredictable', requireAuth, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  const u = getCurrentUser(req); if (s.currentPhase !== 'done' && !u?.isAdmin) return res.status(403).json({ error: 'Not available yet' });

  const allUsers = db.select().from(users).all();
  const board: { userId: number; name: string; count: number; avgRating: number }[] = [];

  for (const u of allUsers) {
    const targetPreds = db.select().from(predictions).where(eq(predictions.targetId, u.id)).all();
    if (targetPreds.length === 0) continue;
    let trueCount = 0;
    let totalRating = 0;
    let ratingCount = 0;
    for (const p of targetPreds) {
      const outcome = db.select().from(outcomes).where(eq(outcomes.predictionId, p.id)).get();
      if (outcome?.happened === true) trueCount++;
      const ratingRows = db.select({ score: ratings.score }).from(ratings).where(eq(ratings.predictionId, p.id)).all();
      if (ratingRows.length > 0) {
        totalRating += ratingRows.reduce((a, r) => a + r.score, 0) / ratingRows.length;
        ratingCount++;
      }
    }
    board.push({ userId: u.id, name: u.name, count: trueCount, avgRating: ratingCount > 0 ? totalRating / ratingCount : 0 });
  }

  if (board.length === 0) return res.json([]);

  // Fewest true predictions → tiebreak: highest avg rating (everyone expected things to happen but they didn't)
  board.sort((a, b) => a.count - b.count || b.avgRating - a.avgRating);

  // Edge case: if everyone has count=0 and avgRating=0, don't show The Joker at all
  if (board[0].count === 0 && board[0].avgRating === 0 && board.every(u => u.count === 0)) return res.json([]);

  const topCount = board[0].count;
  const topAvg = board[0].avgRating;
  const winners = board.filter(u => u.count === topCount && Math.abs(u.avgRating - topAvg) < 0.01);

  res.json(winners.map(w => ({ name: w.name, count: w.count })));
});

router.get('/last-minute', requireAuth, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  const u = getCurrentUser(req); if (s.currentPhase !== 'done' && !u?.isAdmin) return res.status(403).json({ error: 'Not available yet' });

  const allPreds = db.select().from(predictions).all();
  if (allPreds.length === 0) return res.json(null);

  allPreds.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  const latest = allPreds[0];

  const author = db.select({ name: users.name }).from(users).where(eq(users.id, latest.authorId)).get();
  const target = db.select({ name: users.name }).from(users).where(eq(users.id, latest.targetId)).get();

  res.json({
    text: latest.currentText,
    authorName: s.anonymousPredictions ? null : author?.name,
    targetName: target?.name,
    updatedAt: latest.updatedAt,
  });
});

router.get('/first-to-submit', requireAuth, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  const u = getCurrentUser(req); if (s.currentPhase !== 'done' && !u?.isAdmin) return res.status(403).json({ error: 'Not available yet' });

  const allUsers = db.select().from(users).all();
  const board: { name: string; lastPredAt: string }[] = [];

  for (const u of allUsers) {
    const preds = db.select().from(predictions).where(eq(predictions.authorId, u.id)).all();
    if (preds.length === 0) continue;
    const lastPredAt = preds.map(p => p.updatedAt ?? '').sort().reverse()[0];
    if (lastPredAt) board.push({ name: u.name, lastPredAt });
  }

  if (board.length === 0) return res.json(null);

  board.sort((a, b) => a.lastPredAt.localeCompare(b.lastPredAt));
  const topTime = board[0].lastPredAt;
  const winners = board.filter(u => u.lastPredAt === topTime);

  res.json(winners.length === 1
    ? { names: [board[0].name], tied: false }
    : { names: winners.map(w => w.name), tied: true }
  );
});

export default router;
