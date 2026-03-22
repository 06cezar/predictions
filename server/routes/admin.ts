import { Router } from 'express';
import { db } from '../db';
import { users, predictions, predictionHistory, ratings, settings, outcomes } from '../schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '../auth';
import { nanoid } from 'nanoid';

const router = Router();

const ADJECTIVES = ['swift', 'brave', 'calm', 'dark', 'wild', 'cool', 'bold', 'keen', 'wise', 'pure'];
const NOUNS = ['lion', 'hawk', 'wolf', 'bear', 'fox', 'deer', 'owl', 'elk', 'ram', 'jay'];

function generateToken() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 90) + 10;
  return `${adj}-${noun}-${num}`;
}

router.get('/users', requireAdmin, (req, res) => {
  const allUsers = db.select().from(users).all();
  res.json(allUsers);
});

router.post('/users', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const token = generateToken();
  const user = db.insert(users).values({ name: name.trim(), token }).returning().get();
  res.json(user);
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  db.delete(users).where(eq(users.id, parseInt(req.params.id))).run();
  res.json({ success: true });
});

router.get('/predictions', requireAdmin, (req, res) => {
  const all = db.select().from(predictions).all();

  const result = all.map(p => {
    const history = db.select().from(predictionHistory)
      .where(eq(predictionHistory.predictionId, p.id)).all();
    const author = db.select({ id: users.id, name: users.name }).from(users)
      .where(eq(users.id, p.authorId)).get();
    const target = db.select({ id: users.id, name: users.name }).from(users)
      .where(eq(users.id, p.targetId)).get();
    const ratingRows = db.select({ score: ratings.score }).from(ratings)
      .where(eq(ratings.predictionId, p.id)).all();

    const avgRating = ratingRows.length > 0
      ? Math.round(ratingRows.reduce((s, r) => s + r.score, 0) / ratingRows.length)
      : null;

    return {
      id: p.id,
      author,
      target,
      currentText: p.currentText,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      editCount: history.length,
      history,
      avgRating,
      ratingCount: ratingRows.length,
    };
  });

  res.json(result);
});

router.get('/stats', requireAdmin, (req, res) => {
  const allPredictions = db.select().from(predictions).all();
  const allRatings = db.select().from(ratings).all();
  const s = db.select().from(settings).where(eq(settings.id, 1)).get()!;

  const avgRating = allRatings.length > 0
    ? Math.round(allRatings.reduce((sum, r) => sum + r.score, 0) / allRatings.length)
    : null;

  // Count predictions with avg rating below threshold
  let lowRatedCount = 0;
  for (const p of allPredictions) {
    const ratingRows = allRatings.filter(r => r.predictionId === p.id);
    if (ratingRows.length > 0) {
      const avg = ratingRows.reduce((s, r) => s + r.score, 0) / ratingRows.length;
      if (avg < s.ratingThreshold) lowRatedCount++;
    }
  }

  res.json({
    submissionCount: allPredictions.length,
    ratingCount: allRatings.length,
    avgRating,
    lowRatedCount,
  });
});

router.get('/settings', requireAdmin, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get();
  res.json(s);
});

router.put('/settings', requireAdmin, (req, res) => {
  const { currentPhase, submissionDeadline, revealDeadline, ratingThreshold, autoAdvancePhase, adminOverride } = req.body;

  const updates: Record<string, any> = {};
  if (currentPhase !== undefined) updates.currentPhase = currentPhase;
  if (submissionDeadline !== undefined) updates.submissionDeadline = submissionDeadline;
  if (revealDeadline !== undefined) updates.revealDeadline = revealDeadline;
  if (ratingThreshold !== undefined) updates.ratingThreshold = parseInt(ratingThreshold);
  if (autoAdvancePhase !== undefined) updates.autoAdvancePhase = autoAdvancePhase;
  if (adminOverride !== undefined) updates.adminOverride = adminOverride;

  db.update(settings).set(updates).where(eq(settings.id, 1)).run();

  const updated = db.select().from(settings).where(eq(settings.id, 1)).get();
  res.json(updated);
});

router.post('/phase/advance', requireAdmin, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get()!;

  const phases: Array<'submission' | 'reveal' | 'done'> = ['submission', 'reveal', 'done'];
  const currentIndex = phases.indexOf(s.currentPhase);

  if (currentIndex >= phases.length - 1) {
    return res.status(400).json({ error: 'Already in final phase' });
  }

  const nextPhase = phases[currentIndex + 1];
  db.update(settings).set({ currentPhase: nextPhase }).where(eq(settings.id, 1)).run();

  res.json({ success: true, newPhase: nextPhase });
});

export default router;
