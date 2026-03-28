import { Router } from 'express';
import { db } from '../db';
import { users, predictions, predictionHistory, ratings, settings, outcomes, notifications, bonusCategories, bonusVotes } from '../schema';
import { eq, and } from 'drizzle-orm';
import { requireAdmin } from '../auth';
import { calcScores } from './leaderboard';
import { notifyAllUsersPhaseChange } from '../notifications-helper';
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
  const { name, token: customToken } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const token = customToken?.trim() || generateToken();
  const existing = db.select().from(users).where(eq(users.token, token)).get();
  if (existing) return res.status(400).json({ error: 'Token already in use' });

  const user = db.insert(users).values({ name: name.trim(), token }).returning().get();
  res.json(user);
});

router.put('/users/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const { name, regenerateToken } = req.body;
  const updates: Record<string, any> = {};
  if (name?.trim()) updates.name = name.trim();
  if (regenerateToken) updates.token = generateToken();
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });
  db.update(users).set(updates).where(eq(users.id, id)).run();
  const updated = db.select().from(users).where(eq(users.id, id)).get();
  res.json(updated);
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  // Get all prediction IDs where this user is author or target
  const userPreds = db.select({ id: predictions.id }).from(predictions)
    .where(eq(predictions.authorId, id)).all()
    .concat(db.select({ id: predictions.id }).from(predictions).where(eq(predictions.targetId, id)).all());
  const predIds = [...new Set(userPreds.map(p => p.id))];
  // Delete child records for those predictions
  for (const predId of predIds) {
    db.delete(outcomes).where(eq(outcomes.predictionId, predId)).run();
    db.delete(ratings).where(eq(ratings.predictionId, predId)).run();
    db.delete(predictionHistory).where(eq(predictionHistory.predictionId, predId)).run();
  }
  db.delete(predictions).where(eq(predictions.authorId, id)).run();
  db.delete(predictions).where(eq(predictions.targetId, id)).run();
  // Delete any remaining ratings/outcomes by this user (for predictions they didn't author/target)
  db.delete(ratings).where(eq(ratings.userId, id)).run();
  db.delete(outcomes).where(eq(outcomes.markedBy, id)).run();
  // Delete notifications for or by this user
  db.delete(notifications).where(eq(notifications.userId, id)).run();
  db.delete(notifications).where(eq(notifications.authorId, id)).run();
  // Delete bonus votes by or for this user
  db.delete(bonusVotes).where(eq(bonusVotes.voterId, id)).run();
  db.delete(bonusVotes).where(eq(bonusVotes.nomineeId, id)).run();
  db.delete(users).where(eq(users.id, id)).run();
  res.json({ success: true });
});

router.get('/predictions', requireAdmin, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  const all = db.select().from(predictions).all();

  const result = all.map(p => {
    const history = db.select().from(predictionHistory)
      .where(eq(predictionHistory.predictionId, p.id)).all();
    const author = s.anonymousPredictions
      ? null
      : db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, p.authorId)).get();
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

router.delete('/predictions/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const pred = db.select().from(predictions).where(eq(predictions.id, id)).get();
  db.delete(outcomes).where(eq(outcomes.predictionId, id)).run();
  db.delete(ratings).where(eq(ratings.predictionId, id)).run();
  db.delete(predictionHistory).where(eq(predictionHistory.predictionId, id)).run();
  db.delete(predictions).where(eq(predictions.id, id)).run();
  if (pred) {
    // Remove prediction_about_you notification for target
    db.delete(notifications)
      .where(and(eq(notifications.userId, pred.targetId), eq(notifications.type, 'prediction_about_you'), eq(notifications.authorId, pred.authorId)))
      .run();
    // Remove outcome_marked notification for author (match by predictionId in meta)
    const outcomeNotifs = db.select({ id: notifications.id, meta: notifications.meta })
      .from(notifications)
      .where(and(eq(notifications.userId, pred.authorId), eq(notifications.type, 'outcome_marked')))
      .all()
      .filter(n => { try { return JSON.parse(n.meta ?? '{}').predictionId === id; } catch { return false; } });
    for (const n of outcomeNotifs) {
      db.delete(notifications).where(eq(notifications.id, n.id)).run();
    }
  }
  res.json({ success: true });
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

  const allUsers = db.select().from(users).all();
  const total = allUsers.length;

  // Submission progress
  const userProgress = allUsers.map(u => {
    const written = new Set(allPredictions.filter(p => p.authorId === u.id).map(p => p.targetId)).size;
    const expected = total - 1;
    return { id: u.id, name: u.name, written, expected, complete: written >= expected };
  });
  const completedUsers = userProgress.filter(u => u.complete).length;

  // Rating progress: each user should rate all predictions NOT about them
  const ratingProgress = allUsers.map(u => {
    const rateable = allPredictions.filter(p => p.targetId !== u.id).length;
    const given = allRatings.filter(r => r.userId === u.id).length;
    return { id: u.id, name: u.name, written: given, expected: rateable, complete: rateable > 0 && given >= rateable };
  });
  const completedRaters = ratingProgress.filter(u => u.complete).length;

  // Outcomes progress: per user, how many predictions about them have been marked
  const allOutcomes = db.select().from(outcomes).all();
  const outcomesProgress = allUsers.map(u => {
    const aboutUser = allPredictions.filter(p => p.targetId === u.id);
    const marked = aboutUser.filter(p => allOutcomes.some(o => o.predictionId === p.id && o.happened !== null)).length;
    return { id: u.id, name: u.name, written: marked, expected: aboutUser.length, complete: aboutUser.length > 0 && marked >= aboutUser.length };
  });
  const markedPredictions = allOutcomes.filter(o => o.happened !== null).length;

  res.json({
    submissionCount: allPredictions.length,
    ratingCount: allRatings.length,
    avgRating,
    lowRatedCount,
    completedUsers,
    totalUsers: total,
    userProgress,
    completedRaters,
    ratingProgress,
    markedPredictions,
    outcomesProgress,
    currentPhase: s.currentPhase,
  });
});

router.get('/settings', requireAdmin, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get();
  res.json(s);
});

router.put('/settings', requireAdmin, (req, res) => {
  const { currentPhase, submissionDeadline, revealDeadline, ratingThreshold, autoAdvancePhase, adminOverride, anonymousPredictions, bonusActive } = req.body;

  const updates: Record<string, any> = {};
  if (currentPhase !== undefined) updates.currentPhase = currentPhase;
  if (submissionDeadline !== undefined) updates.submissionDeadline = submissionDeadline;
  if (revealDeadline !== undefined) updates.revealDeadline = revealDeadline;
  if (ratingThreshold !== undefined) updates.ratingThreshold = parseInt(ratingThreshold);
  if (autoAdvancePhase !== undefined) updates.autoAdvancePhase = autoAdvancePhase;
  if (adminOverride !== undefined) updates.adminOverride = adminOverride;
  if (anonymousPredictions !== undefined) updates.anonymousPredictions = anonymousPredictions;
  if (bonusActive !== undefined) updates.bonusActive = bonusActive;

  db.update(settings).set(updates).where(eq(settings.id, 1)).run();

  const updated = db.select().from(settings).where(eq(settings.id, 1)).get();
  res.json(updated);
});

router.post('/phase/set', requireAdmin, (req, res) => {
  const { phase } = req.body;
  const phases = ['submission', 'reveal', 'done'];
  if (!phases.includes(phase)) {
    return res.status(400).json({ error: 'Invalid phase' });
  }
  db.update(settings).set({ currentPhase: phase as any }).where(eq(settings.id, 1)).run();
  notifyAllUsersPhaseChange(phase);
  res.json({ success: true, newPhase: phase });
});

router.post('/phase/advance', requireAdmin, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get()!;

  const phases: Array<'submission' | 'reveal' | 'done'> = ['submission', 'reveal', 'done'];
  const currentIndex = phases.indexOf(s.currentPhase as any);

  if (currentIndex >= phases.length - 1) {
    return res.status(400).json({ error: 'Already in final phase' });
  }

  const nextPhase = phases[currentIndex + 1];
  db.update(settings).set({ currentPhase: nextPhase }).where(eq(settings.id, 1)).run();
  notifyAllUsersPhaseChange(nextPhase);
  res.json({ success: true, newPhase: nextPhase });
});

router.post('/phase/reverse', requireAdmin, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get()!;

  const phases: Array<'submission' | 'reveal' | 'done'> = ['submission', 'reveal', 'done'];
  const currentIndex = phases.indexOf(s.currentPhase as any);

  if (currentIndex <= 0) {
    return res.status(400).json({ error: 'Already in first phase' });
  }

  const prevPhase = phases[currentIndex - 1];
  db.update(settings).set({ currentPhase: prevPhase }).where(eq(settings.id, 1)).run();
  notifyAllUsersPhaseChange(prevPhase);
  res.json({ success: true, newPhase: prevPhase });
});

router.post('/bonus-active/toggle', requireAdmin, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  const newVal = !s.bonusActive;
  db.update(settings).set({ bonusActive: newVal }).where(eq(settings.id, 1)).run();
  res.json({ success: true, bonusActive: newVal });
});

function csvCell(v: any) { return `"${String(v ?? '').replace(/"/g, '""')}"`; }

router.get('/export/hof.csv', requireAdmin, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  const anon = s.anonymousPredictions;
  const allUsers = db.select().from(users).all();
  const allPreds = db.select().from(predictions).all();
  const allOutcomes = db.select().from(outcomes).all();
  const allRatings = db.select().from(ratings).all();
  const allHistory = db.select().from(predictionHistory).all();

  const userName = (id: number) => allUsers.find(u => u.id === id)?.name ?? '';
  const avgRating = (predId: number) => {
    const rs = allRatings.filter(r => r.predictionId === predId);
    return rs.length > 0 ? rs.reduce((s, r) => s + r.score, 0) / rs.length : null;
  };

  const rows: string[][] = [];

  // Most Courageous
  const truePreds = allPreds.filter(p => allOutcomes.find(o => o.predictionId === p.id)?.happened === true);
  const withAvg = truePreds.map(p => ({ p, avg: avgRating(p.id) })).filter(x => x.avg !== null) as { p: typeof allPreds[0]; avg: number }[];
  if (withAvg.length > 0) {
    withAvg.sort((a, b) => a.avg - b.avg);
    const best = withAvg[0];
    rows.push(['Most Courageous', anon ? '?' : userName(best.p.authorId), `About ${userName(best.p.targetId)} - avg ${Math.round(best.avg)}% - ${best.p.currentText}`]);
  }

  // Biggest Miss
  const falsePreds = allPreds.filter(p => allOutcomes.find(o => o.predictionId === p.id)?.happened === false);
  const falseWithAvg = falsePreds.map(p => ({ p, avg: avgRating(p.id) })).filter(x => x.avg !== null) as { p: typeof allPreds[0]; avg: number }[];
  if (falseWithAvg.length > 0) {
    falseWithAvg.sort((a, b) => b.avg - a.avg);
    const best = falseWithAvg[0];
    rows.push(['Biggest Miss', anon ? '?' : userName(best.p.authorId), `About ${userName(best.p.targetId)} - avg ${Math.round(best.avg)}% - ${best.p.currentText}`]);
  }

  // Can't Make Up Their Mind
  let mostRevised: { p: typeof allPreds[0]; editCount: number } | null = null;
  for (const p of allPreds) {
    const editCount = allHistory.filter(h => h.predictionId === p.id).length;
    if (editCount === 0) continue;
    if (!mostRevised || editCount > mostRevised.editCount || (editCount === mostRevised.editCount && p.id > mostRevised.p.id))
      mostRevised = { p, editCount };
  }
  if (mostRevised) {
    rows.push(["Can't Make Up Their Mind", anon ? '?' : userName(mostRevised.p.authorId), `About ${userName(mostRevised.p.targetId)} - ${mostRevised.editCount} edits - ${mostRevised.p.currentText}`]);
  }

  // Star of the Show
  const starBoard = allUsers.map(u => {
    const count = allPreds.filter(p => p.targetId === u.id && allOutcomes.find(o => o.predictionId === p.id)?.happened === true).length;
    return { name: u.name, count };
  }).filter(u => u.count > 0).sort((a, b) => b.count - a.count);
  if (starBoard.length > 0) {
    const top = starBoard[0].count;
    const winners = starBoard.filter(u => u.count === top);
    rows.push(['Star of the Show', winners.map(w => w.name).join(', '), `${top} true predictions`]);
  }

  // The Joker
  const jokerBoard = allUsers.map(u => {
    const count = allPreds.filter(p => p.targetId === u.id && allOutcomes.find(o => o.predictionId === p.id)?.happened === true).length;
    return { name: u.name, count };
  }).sort((a, b) => a.count - b.count);
  if (jokerBoard.length > 0 && !(jokerBoard[0].count === 0 && jokerBoard.every(u => u.count === 0))) {
    const top = jokerBoard[0].count;
    const winners = jokerBoard.filter(u => u.count === top);
    rows.push(['The Joker', winners.map(w => w.name).join(', '), `${top} true predictions`]);
  }

  // Best Friends
  const friendPairs: { userA: string; userB: string }[] = [];
  for (let i = 0; i < allUsers.length; i++) {
    for (let j = i + 1; j < allUsers.length; j++) {
      const a = allUsers[i]; const b = allUsers[j];
      let count = 0;
      for (const [aId, bId] of [[a.id, b.id], [b.id, a.id]]) {
        const p = allPreds.find(p => p.authorId === aId && p.targetId === bId);
        if (p && allOutcomes.find(o => o.predictionId === p.id)?.happened === true) count++;
      }
      if (count === 2) friendPairs.push({ userA: a.name, userB: b.name });
    }
  }
  if (friendPairs.length > 0) rows.push(['Best Friends', friendPairs.map(p => `${p.userA} & ${p.userB}`).join(', '), '']);

  // Last Minute
  if (allPreds.length > 0) {
    const latest = [...allPreds].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0];
    rows.push(['Last Minute', anon ? '?' : userName(latest.authorId), `About ${userName(latest.targetId)} - ${latest.updatedAt} - ${latest.currentText}`]);
  }

  // First to Submit
  const firstBoard = allUsers.map(u => {
    const preds = allPreds.filter(p => p.authorId === u.id);
    if (preds.length === 0) return null;
    const lastPredAt = preds.map(p => p.updatedAt ?? '').sort().reverse()[0];
    return { name: u.name, lastPredAt };
  }).filter(Boolean) as { name: string; lastPredAt: string }[];
  if (firstBoard.length > 0) {
    firstBoard.sort((a, b) => a.lastPredAt.localeCompare(b.lastPredAt));
    const winners = firstBoard.filter(u => u.lastPredAt === firstBoard[0].lastPredAt);
    rows.push(['First to Submit', winners.map(w => w.name).join(', '), firstBoard[0].lastPredAt]);
  }

  const csv = ['Category,Winner,Detail', ...rows.map(r => r.map(csvCell).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="hall-of-fame.csv"');
  res.send(csv);
});

router.get('/export/predictions.csv', requireAdmin, (req, res) => {
  const allPredictions = db.select().from(predictions).all();
  const allUsers = db.select().from(users).all();
  const allOutcomes = db.select().from(outcomes).all();
  const allRatings = db.select().from(ratings).all();
  const allHistory = db.select().from(predictionHistory).all();

  const userMap = Object.fromEntries(allUsers.map(u => [u.id, u.name]));

  const rows = allPredictions.map(p => {
    const outcome = allOutcomes.find(o => o.predictionId === p.id);
    const pRatings = allRatings.filter(r => r.predictionId === p.id);
    const avgRating = pRatings.length > 0
      ? Math.round(pRatings.reduce((s, r) => s + r.score, 0) / pRatings.length)
      : null;
    const editCount = allHistory.filter(h => h.predictionId === p.id).length;

    return [
      p.id,
      userMap[p.authorId] ?? '',
      userMap[p.targetId] ?? '',
      `"${(p.currentText ?? '').replace(/"/g, '""')}"`,
      avgRating ?? '',
      pRatings.length,
      editCount,
      outcome ? (outcome.happened ? 'true' : 'false') : '',
    ].join(',');
  });

  const csv = ['ID,Author,Target,Text,Avg Rating,Rating Count,Edit Count,Outcome', ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="predictions.csv"');
  res.send(csv);
});

router.get('/export/scores.csv', requireAdmin, (req, res) => {
  const scores = calcScores();
  const rows = scores.map(u => [u.rank, u.name, u.score, u.weightedScore].join(','));
  const csv = ['Rank,Name,True Predictions,Weighted Score', ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="scores.csv"');
  res.send(csv);
});

router.post('/reset', requireAdmin, (req, res) => {
  db.delete(bonusVotes).run();
  db.delete(bonusCategories).run();
  db.delete(outcomes).run();
  db.delete(ratings).run();
  db.delete(predictionHistory).run();
  db.delete(predictions).run();
  db.update(settings).set({ currentPhase: 'submission', submissionDeadline: null, revealDeadline: null, bonusActive: false }).where(eq(settings.id, 1)).run();
  res.json({ success: true });
});

export default router;
