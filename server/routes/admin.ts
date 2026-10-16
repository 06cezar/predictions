import { Router } from 'express';
import { db } from '../db';
import { users, predictions, predictionHistory, ratings, outcomes, notifications, bonusCategories, bonusVotes, inviteLinks } from '../schema';
import { eq, and, inArray, getTableColumns } from 'drizzle-orm';
import { requireAdmin } from '../auth';
import { notifyAllUsersPhaseChange } from '../notifications-helper';
import { Game, GameChanges, PHASES, Phase, getGame, updateGame, clearGameData, newJoinCode } from '../services/games';
import { loadSnapshot, Prediction } from '../services/snapshot';
import { calcScores } from '../services/scoring';
import { claimToken, generateUniqueToken } from '../services/tokens';
import * as awards from '../services/awards';

const router = Router();

// Every route here acts on the admin's own game only.
router.use(requireAdmin);

/** A player of this game, or undefined (also for players of other games). */
function findPlayer(game: Game, id: number) {
  return db.select().from(users).where(and(eq(users.id, id), eq(users.gameId, game.id))).get();
}

/** A prediction of this game, or undefined (also for predictions of other games). */
function findPrediction(game: Game, id: number) {
  return db.select().from(predictions).where(and(eq(predictions.id, id), eq(predictions.gameId, game.id))).get();
}

router.get('/users', (req, res) => {
  res.json(db.select().from(users).where(eq(users.gameId, res.locals.game.id)).all());
});

router.post('/users', (req, res) => {
  const { game } = res.locals;
  const { name, token: customToken } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const claim = claimToken(customToken, { playerName: name.trim(), source: 'added by an admin', adminOfGameId: game.id });
  if (!claim.ok) return res.status(400).json({ error: 'Token already in use' });

  const user = db.insert(users).values({ gameId: game.id, name: name.trim(), token: claim.token }).returning().get();
  res.json(user);
});

router.put('/users/:id', (req, res) => {
  const player = findPlayer(res.locals.game, parseInt(req.params.id));
  if (!player) return res.status(404).json({ error: 'User not found' });

  const { name, regenerateToken } = req.body;
  const updates: Partial<typeof users.$inferInsert> = {};
  if (name?.trim()) updates.name = name.trim();
  if (regenerateToken) updates.token = generateUniqueToken();
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });
  db.update(users).set(updates).where(eq(users.id, player.id)).run();
  res.json(db.select().from(users).where(eq(users.id, player.id)).get());
});

router.delete('/users/:id', (req, res) => {
  const player = findPlayer(res.locals.game, parseInt(req.params.id));
  if (!player) return res.status(404).json({ error: 'User not found' });
  const id = player.id;

  // Predictions by or about this player, and everything hanging off them
  const predIds = db.select({ id: predictions.id }).from(predictions)
    .where(eq(predictions.authorId, id)).all()
    .concat(db.select({ id: predictions.id }).from(predictions).where(eq(predictions.targetId, id)).all())
    .map(p => p.id);
  if (predIds.length > 0) {
    db.delete(outcomes).where(inArray(outcomes.predictionId, predIds)).run();
    db.delete(ratings).where(inArray(ratings.predictionId, predIds)).run();
    db.delete(predictionHistory).where(inArray(predictionHistory.predictionId, predIds)).run();
    db.delete(predictions).where(inArray(predictions.id, predIds)).run();
  }
  // Their ratings/outcomes on other predictions, notifications, bonus votes, invite links
  db.delete(ratings).where(eq(ratings.userId, id)).run();
  db.delete(outcomes).where(eq(outcomes.markedBy, id)).run();
  db.delete(notifications).where(eq(notifications.userId, id)).run();
  db.delete(notifications).where(eq(notifications.authorId, id)).run();
  db.delete(bonusVotes).where(eq(bonusVotes.voterId, id)).run();
  db.delete(bonusVotes).where(eq(bonusVotes.nomineeId, id)).run();
  db.update(inviteLinks).set({ usedBy: null, usedAt: null }).where(eq(inviteLinks.usedBy, id)).run();
  db.delete(inviteLinks).where(eq(inviteLinks.createdBy, id)).run();
  db.delete(users).where(eq(users.id, id)).run();
  res.json({ success: true });
});

router.get('/predictions', (req, res) => {
  const { user: me, game } = res.locals;
  const g = loadSnapshot(game.id);
  const historyRows = db.select(getTableColumns(predictionHistory))
    .from(predictionHistory)
    .innerJoin(predictions, eq(predictions.id, predictionHistory.predictionId))
    .where(eq(predictions.gameId, game.id))
    .all();
  const player = (id: number) => ({ id, name: g.userName(id) });

  res.json(g.predictions.map(p => {
    const scores = g.ratings(p.id);
    const history = historyRows.filter(h => h.predictionId === p.id);
    return {
      id: p.id,
      author: player(p.authorId),
      target: player(p.targetId),
      currentText: p.currentText,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      editCount: history.length,
      forgivenEdits: p.forgivenEdits ?? 0,
      history,
      avgRating: scores.length > 0 ? Math.round(scores.reduce((s, r) => s + r, 0) / scores.length) : null,
      ratingCount: scores.length,
      isAboutMe: p.targetId === me.id,
    };
  }));
});

router.delete('/predictions/:id', (req, res) => {
  const pred = findPrediction(res.locals.game, parseInt(req.params.id));
  if (!pred) return res.json({ success: true });
  const id = pred.id;

  db.delete(outcomes).where(eq(outcomes.predictionId, id)).run();
  db.delete(ratings).where(eq(ratings.predictionId, id)).run();
  db.delete(predictionHistory).where(eq(predictionHistory.predictionId, id)).run();
  db.delete(predictions).where(eq(predictions.id, id)).run();

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
  res.json({ success: true });
});

router.get('/stats', (req, res) => {
  const { game } = res.locals;
  const g = loadSnapshot(game.id);
  const allPredictions = g.predictions;
  const allRatings = g.allRatings;
  const allUsers = g.users;

  const avgRating = allRatings.length > 0
    ? Math.round(allRatings.reduce((sum, r) => sum + r.score, 0) / allRatings.length)
    : null;

  // Count predictions with avg rating below threshold
  let lowRatedCount = 0;
  for (const p of allPredictions) {
    const scores = g.ratings(p.id);
    if (scores.length > 0 && scores.reduce((s, r) => s + r, 0) / scores.length < game.ratingThreshold) lowRatedCount++;
  }

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
  const outcomesProgress = allUsers.map(u => {
    const aboutUser = allPredictions.filter(p => p.targetId === u.id);
    const marked = aboutUser.filter(p => g.outcome(p.id)?.happened != null).length;
    return { id: u.id, name: u.name, written: marked, expected: aboutUser.length, complete: aboutUser.length > 0 && marked >= aboutUser.length };
  });
  const markedPredictions = g.outcomes.filter(o => o.happened !== null).length;

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
    currentPhase: game.currentPhase,
  });
});

router.get('/settings', (req, res) => {
  res.json(res.locals.game);
});

router.put('/settings', (req, res) => {
  const { game } = res.locals;
  const { name, openJoin, currentPhase, submissionDeadline, revealDeadline, ratingThreshold, autoAdvancePhase, adminOverride, anonymousPredictions, bonusActive } = req.body;

  const updates: GameChanges = {};
  if (typeof name === 'string' && name.trim()) updates.name = name.trim();
  if (openJoin !== undefined) updates.openJoin = openJoin;
  if (currentPhase !== undefined) updates.currentPhase = currentPhase;
  if (submissionDeadline !== undefined) updates.submissionDeadline = submissionDeadline;
  if (revealDeadline !== undefined) updates.revealDeadline = revealDeadline;
  if (ratingThreshold !== undefined) updates.ratingThreshold = parseInt(ratingThreshold);
  if (autoAdvancePhase !== undefined) updates.autoAdvancePhase = autoAdvancePhase;
  if (adminOverride !== undefined) updates.adminOverride = adminOverride;
  if (anonymousPredictions !== undefined) updates.anonymousPredictions = anonymousPredictions;
  if (bonusActive !== undefined) updates.bonusActive = bonusActive;

  if (Object.keys(updates).length > 0) updateGame(game.id, updates);
  res.json(getGame(game.id));
});

/** Issue a new join code, so the old one (and links using it) stop working. */
router.post('/join-code/regenerate', (req, res) => {
  const joinCode = newJoinCode();
  updateGame(res.locals.game.id, { joinCode });
  res.json({ joinCode });
});

function setPhase(game: Game, phase: Phase) {
  updateGame(game.id, { currentPhase: phase });
  notifyAllUsersPhaseChange(game.id, phase);
  return { success: true, newPhase: phase };
}

router.post('/phase/set', (req, res) => {
  const { phase } = req.body;
  if (!PHASES.includes(phase)) {
    return res.status(400).json({ error: 'Invalid phase' });
  }
  res.json(setPhase(res.locals.game, phase));
});

router.post('/phase/advance', (req, res) => {
  const { game } = res.locals;
  const currentIndex = PHASES.indexOf(game.currentPhase);
  if (currentIndex >= PHASES.length - 1) {
    return res.status(400).json({ error: 'Already in final phase' });
  }
  res.json(setPhase(game, PHASES[currentIndex + 1]));
});

router.post('/phase/reverse', (req, res) => {
  const { game } = res.locals;
  const currentIndex = PHASES.indexOf(game.currentPhase);
  if (currentIndex <= 0) {
    return res.status(400).json({ error: 'Already in first phase' });
  }
  res.json(setPhase(game, PHASES[currentIndex - 1]));
});

router.post('/bonus-active/toggle', (req, res) => {
  const { game } = res.locals;
  const newVal = !game.bonusActive;
  updateGame(game.id, { bonusActive: newVal });
  res.json({ success: true, bonusActive: newVal });
});

function editCountOf(predictionId: number) {
  return db.select().from(predictionHistory).where(eq(predictionHistory.predictionId, predictionId)).all().length;
}

router.post('/predictions/:id/forgive-edit', (req, res) => {
  const pred = findPrediction(res.locals.game, parseInt(req.params.id));
  if (!pred) return res.status(404).json({ error: 'Prediction not found' });

  const editCount = editCountOf(pred.id);
  if ((pred.forgivenEdits ?? 0) >= editCount) {
    return res.status(400).json({ error: 'All edits already forgiven' });
  }

  const newForgiven = (pred.forgivenEdits ?? 0) + 1;
  db.update(predictions).set({ forgivenEdits: newForgiven }).where(eq(predictions.id, pred.id)).run();
  res.json({ success: true, forgivenEdits: newForgiven, editCount });
});

router.post('/predictions/:id/unforgive-edit', (req, res) => {
  const pred = findPrediction(res.locals.game, parseInt(req.params.id));
  if (!pred) return res.status(404).json({ error: 'Prediction not found' });

  if ((pred.forgivenEdits ?? 0) <= 0) {
    return res.status(400).json({ error: 'No forgiven edits to undo' });
  }

  const newForgiven = (pred.forgivenEdits ?? 0) - 1;
  db.update(predictions).set({ forgivenEdits: newForgiven }).where(eq(predictions.id, pred.id)).run();
  res.json({ success: true, forgivenEdits: newForgiven, editCount: editCountOf(pred.id) });
});

function csvCell(v: any) { return `"${String(v ?? '').replace(/"/g, '""')}"`; }

function sendCsv(res: import('express').Response, filename: string, csv: string) {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

/** Hall of Fame as CSV, using the same award rules as the in-app Hall of Fame. */
router.get('/export/hof.csv', (req, res) => {
  const { game } = res.locals;
  const g = loadSnapshot(game.id);
  const anon = game.anonymousPredictions;
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

  sendCsv(res, 'hall-of-fame.csv', ['Category,Winner,Detail', ...rows.map(r => r.map(csvCell).join(','))].join('\n'));
});

router.get('/export/predictions.csv', (req, res) => {
  const g = loadSnapshot(res.locals.game.id);

  const rows = g.predictions.map(p => {
    const outcome = g.outcome(p.id);
    const scores = g.ratings(p.id);
    const avgRating = scores.length > 0
      ? Math.round(scores.reduce((s, r) => s + r, 0) / scores.length)
      : null;

    return [
      p.id,
      g.userName(p.authorId) ?? '',
      g.userName(p.targetId) ?? '',
      `"${(p.currentText ?? '').replace(/"/g, '""')}"`,
      avgRating ?? '',
      scores.length,
      g.history(p.id).length,
      outcome ? (outcome.happened ? 'true' : 'false') : '',
    ].join(',');
  });

  sendCsv(res, 'predictions.csv', ['ID,Author,Target,Text,Avg Rating,Rating Count,Edit Count,Outcome', ...rows].join('\n'));
});

router.get('/export/scores.csv', (req, res) => {
  const { game } = res.locals;
  const scores = calcScores(game.id, loadSnapshot(game.id), game.ratingThreshold);
  const rows = scores.map(u => [u.rank, u.name, u.score, u.weightedScore].join(','));
  sendCsv(res, 'scores.csv', ['Rank,Name,True Predictions,Weighted Score', ...rows].join('\n'));
});

/** Everything in this game as JSON (the raw database file would include every game). */
router.get('/export/game.json', (req, res) => {
  const { game } = res.locals;
  const g = loadSnapshot(game.id);
  const categories = db.select().from(bonusCategories).where(eq(bonusCategories.gameId, game.id)).all();
  const categoryIds = categories.map(c => c.id);

  res.setHeader('Content-Disposition', `attachment; filename="game-${game.id}.json"`);
  res.json({
    exportedAt: new Date().toISOString(),
    game,
    users: g.users,
    predictions: g.predictions,
    predictionHistory: g.predictions.flatMap(p => g.history(p.id).map(oldText => ({ predictionId: p.id, oldText }))),
    ratings: g.allRatings,
    outcomes: g.outcomes,
    bonusCategories: categories,
    bonusVotes: categoryIds.length > 0
      ? db.select().from(bonusVotes).where(inArray(bonusVotes.categoryId, categoryIds)).all()
      : [],
    inviteLinks: db.select().from(inviteLinks).where(eq(inviteLinks.gameId, game.id)).all(),
  });
});

router.post('/reset', (req, res) => {
  const { game } = res.locals;
  clearGameData(game.id);
  updateGame(game.id, { currentPhase: 'submission', submissionDeadline: null, revealDeadline: null, bonusActive: false });
  res.json({ success: true });
});

export default router;
