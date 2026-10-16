import { Router } from 'express';
import { db, DATA_DIR } from '../db';
import { users, predictions, predictionHistory, ratings, outcomes, notifications, bonusCategories, bonusVotes, blockedTokens, inviteLinks } from '../schema';
import { eq, and } from 'drizzle-orm';
import { requireAdmin, getCurrentUser } from '../auth';
import { notifyAllUsersPhaseChange } from '../notifications-helper';
import { getSettings, updateSettings, PHASES, Phase } from '../services/settings';
import { loadSnapshot, Prediction } from '../services/snapshot';
import { calcScores } from '../services/scoring';
import * as awards from '../services/awards';
import { nanoid } from 'nanoid';
import path from 'path';

const router = Router();

const ADJECTIVES = ['swift', 'brave', 'calm', 'dark', 'wild', 'cool', 'bold', 'keen', 'wise', 'pure'];
const NOUNS = ['lion', 'hawk', 'wolf', 'bear', 'fox', 'deer', 'owl', 'elk', 'ram', 'jay'];

function generateToken() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 90) + 10;
  return `${adj}-${noun}-${num}`;
}

function isTokenAvailable(token: string): boolean {
  const takenByUser = db.select().from(users).where(eq(users.token, token)).get();
  if (takenByUser) return false;
  const blocked = db.select().from(blockedTokens).where(eq(blockedTokens.token, token)).get();
  if (blocked) return false;
  return true;
}

function generateUniqueToken(): string {
  let token: string;
  let attempts = 0;
  do {
    token = generateToken();
    if (isTokenAvailable(token)) return token;
    attempts++;
  } while (attempts < 100);
  return `user-${nanoid(8)}`;
}

router.get('/users', requireAdmin, (req, res) => {
  const allUsers = db.select().from(users).all();
  res.json(allUsers);
});

router.post('/users', requireAdmin, (req, res) => {
  const { name, token: customToken } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const token = customToken?.trim() ? customToken.trim() : generateUniqueToken();
  if (!isTokenAvailable(token)) return res.status(400).json({ error: 'Token already in use' });

  const user = db.insert(users).values({ name: name.trim(), token }).returning().get();
  res.json(user);
});

router.put('/users/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const { name, regenerateToken } = req.body;
  const updates: Record<string, any> = {};
  if (name?.trim()) updates.name = name.trim();
  if (regenerateToken) updates.token = generateUniqueToken();
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
  // Nullify invite links FK references to this user
  db.update(inviteLinks).set({ usedBy: null, usedAt: null }).where(eq(inviteLinks.usedBy, id)).run();
  db.delete(inviteLinks).where(eq(inviteLinks.createdBy, id)).run();
  db.delete(users).where(eq(users.id, id)).run();
  res.json({ success: true });
});

router.get('/predictions', requireAdmin, (req, res) => {
  const me = getCurrentUser(req)!;
  const all = db.select().from(predictions).all();

  const result = all.map(p => {
    const history = db.select().from(predictionHistory)
      .where(eq(predictionHistory.predictionId, p.id)).all();
    const author = db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, p.authorId)).get();
    const target = db.select({ id: users.id, name: users.name }).from(users)
      .where(eq(users.id, p.targetId)).get();
    const ratingRows = db.select({ score: ratings.score }).from(ratings)
      .where(eq(ratings.predictionId, p.id)).all();

    const avgRating = ratingRows.length > 0
      ? Math.round(ratingRows.reduce((s, r) => s + r.score, 0) / ratingRows.length)
      : null;

    const isAboutMe = p.targetId === me.id;

    return {
      id: p.id,
      author,
      target,
      currentText: p.currentText,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      editCount: history.length,
      forgivenEdits: p.forgivenEdits ?? 0,
      history,
      avgRating,
      ratingCount: ratingRows.length,
      isAboutMe,
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
  const s = getSettings();

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

  // Rating progress: match the same logic as /to-rate endpoint
  const ratingProgress = allUsers.map(u => {
    const myTargetIds = new Set(allPredictions.filter(p => p.authorId === u.id).map(p => p.targetId));
    const rateable = allPredictions.filter(p =>
      p.authorId !== u.id &&
      p.targetId !== u.id &&
      myTargetIds.has(p.targetId)
    ).length;
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
  const s = getSettings();
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

  updateSettings(updates);

  const updated = getSettings();
  res.json(updated);
});

function setPhase(phase: Phase) {
  updateSettings({ currentPhase: phase });
  notifyAllUsersPhaseChange(phase);
  return { success: true, newPhase: phase };
}

router.post('/phase/set', requireAdmin, (req, res) => {
  const { phase } = req.body;
  if (!PHASES.includes(phase)) {
    return res.status(400).json({ error: 'Invalid phase' });
  }
  res.json(setPhase(phase));
});

router.post('/phase/advance', requireAdmin, (req, res) => {
  const currentIndex = PHASES.indexOf(getSettings().currentPhase);
  if (currentIndex >= PHASES.length - 1) {
    return res.status(400).json({ error: 'Already in final phase' });
  }
  res.json(setPhase(PHASES[currentIndex + 1]));
});

router.post('/phase/reverse', requireAdmin, (req, res) => {
  const currentIndex = PHASES.indexOf(getSettings().currentPhase);
  if (currentIndex <= 0) {
    return res.status(400).json({ error: 'Already in first phase' });
  }
  res.json(setPhase(PHASES[currentIndex - 1]));
});

router.post('/bonus-active/toggle', requireAdmin, (req, res) => {
  const s = getSettings();
  const newVal = !s.bonusActive;
  updateSettings({ bonusActive: newVal });
  res.json({ success: true, bonusActive: newVal });
});

router.post('/predictions/:id/forgive-edit', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const pred = db.select().from(predictions).where(eq(predictions.id, id)).get();
  if (!pred) return res.status(404).json({ error: 'Prediction not found' });

  const editCount = db.select().from(predictionHistory).where(eq(predictionHistory.predictionId, id)).all().length;
  if ((pred.forgivenEdits ?? 0) >= editCount) {
    return res.status(400).json({ error: 'All edits already forgiven' });
  }

  const newForgiven = (pred.forgivenEdits ?? 0) + 1;
  db.update(predictions).set({ forgivenEdits: newForgiven }).where(eq(predictions.id, id)).run();
  res.json({ success: true, forgivenEdits: newForgiven, editCount });
});

router.post('/predictions/:id/unforgive-edit', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const pred = db.select().from(predictions).where(eq(predictions.id, id)).get();
  if (!pred) return res.status(404).json({ error: 'Prediction not found' });

  if ((pred.forgivenEdits ?? 0) <= 0) {
    return res.status(400).json({ error: 'No forgiven edits to undo' });
  }

  const editCount = db.select().from(predictionHistory).where(eq(predictionHistory.predictionId, id)).all().length;
  const newForgiven = (pred.forgivenEdits ?? 0) - 1;
  db.update(predictions).set({ forgivenEdits: newForgiven }).where(eq(predictions.id, id)).run();
  res.json({ success: true, forgivenEdits: newForgiven, editCount });
});

function csvCell(v: any) { return `"${String(v ?? '').replace(/"/g, '""')}"`; }

/** Hall of Fame as CSV, using the same award rules as the in-app Hall of Fame. */
router.get('/export/hof.csv', requireAdmin, (req, res) => {
  const g = loadSnapshot();
  const anon = getSettings().anonymousPredictions;
  const name = (id: number) => g.userName(id) ?? '';
  const author = (p: Prediction) => anon ? '?' : name(p.authorId);
  const about = (p: Prediction, detail: string) => `About ${name(p.targetId)} - ${detail} - ${p.currentText}`;
  const names = (winners: { name: string }[]) => winners.map(w => w.name).join(', ');

  const rows: string[][] = [];

  const courageous = awards.mostCourageous(g);
  if (courageous) {
    rows.push(['Most Courageous', author(courageous.prediction), about(courageous.prediction, `avg ${Math.round(courageous.avg)}%`)]);
  }

  const miss = awards.biggestMiss(g);
  if (miss) {
    rows.push(['Biggest Miss', author(miss.prediction), about(miss.prediction, `avg ${Math.round(miss.avg)}%`)]);
  }

  const controversial = awards.mostControversial(g);
  if (controversial) {
    const detail = `avg ${Math.round(controversial.avg)}%, spread ${Math.round(controversial.stdDev)}`;
    rows.push(['Most Controversial', author(controversial.prediction), about(controversial.prediction, detail)]);
  }

  const revised = awards.mostRevised(g);
  if (revised) {
    rows.push(["Can't Make Up Their Mind", author(revised.prediction), about(revised.prediction, `${revised.history.length} edits`)]);
  }

  const stars = awards.starOfTheShow(g);
  if (stars.length > 0) rows.push(['Star of the Show', names(stars), `${stars[0].count} true predictions`]);

  const jokers = awards.theJoker(g);
  if (jokers.length > 0) rows.push(['The Joker', names(jokers), `${jokers[0].count} true predictions`]);

  const friends = awards.bestFriends(g);
  if (friends.length > 0) rows.push(['Best Friends', friends.map(p => `${p.userA} & ${p.userB}`).join(', '), '']);

  const latest = awards.lastMinute(g);
  if (latest) rows.push(['Last Minute', author(latest), about(latest, latest.updatedAt)]);

  const first = awards.firstToSubmit(g);
  if (first) rows.push(['First to Submit', first.names.join(', '), first.at]);

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

router.get('/export/db', requireAdmin, (req, res) => {
  res.download(path.join(DATA_DIR, 'predictions.db'), 'predictions.db');
});

router.post('/reset', requireAdmin, (req, res) => {
  db.delete(bonusVotes).run();
  db.delete(bonusCategories).run();
  db.delete(notifications).run();
  db.delete(outcomes).run();
  db.delete(ratings).run();
  db.delete(predictionHistory).run();
  db.delete(predictions).run();
  updateSettings({ currentPhase: 'submission', submissionDeadline: null, revealDeadline: null, bonusActive: false });
  res.json({ success: true });
});

export default router;
