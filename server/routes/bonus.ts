import { Router } from 'express';
import { db } from '../db';
import { bonusCategories, bonusVotes, users } from '../schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, requireAdmin } from '../auth';
import { Game } from '../services/games';
import { tallyVotes } from '../services/scoring';

const router = Router();

/** A bonus category of this game, or undefined (also for other games' categories). */
function findCategory(game: Game, id: number) {
  return db
    .select()
    .from(bonusCategories)
    .where(and(eq(bonusCategories.id, id), eq(bonusCategories.gameId, game.id)))
    .get();
}

/** Points for a category: a whole number from 1 to 100, or null if invalid. */
function parsePoints(value: unknown): number | null {
  const points = Number(value);
  return Number.isInteger(points) && points >= 1 && points <= 100 ? points : null;
}
const BAD_POINTS = 'points must be a whole number from 1 to 100';

type BonusVote = { rank: number; nomineeId: number };

function isVote(value: unknown): value is BonusVote {
  const vote = value as Partial<BonusVote> | null;
  return Number.isInteger(vote?.rank) && Number.isInteger(vote?.nomineeId);
}

// GET /api/bonus — get categories + my votes + tally (tally only at done or for admin)
router.get('/', requireAuth, (req, res) => {
  const { user: me, game } = res.locals;

  if (!game.bonusActive && game.currentPhase !== 'done' && !me.isAdmin) {
    return res.status(403).json({ error: 'Not available yet' });
  }

  const allUsers = db.select({ id: users.id, name: users.name }).from(users).where(eq(users.gameId, game.id)).all();
  const allCats = db.select().from(bonusCategories).where(eq(bonusCategories.gameId, game.id)).all();
  const showTally = game.currentPhase === 'done' || me.isAdmin;

  const categories = allCats.map(cat => {
    const myVotes = db
      .select()
      .from(bonusVotes)
      .where(and(eq(bonusVotes.categoryId, cat.id), eq(bonusVotes.voterId, me.id)))
      .all()
      .sort((a, b) => a.rank - b.rank);

    const results = showTally
      ? tallyVotes(db.select().from(bonusVotes).where(eq(bonusVotes.categoryId, cat.id)).all())
      : undefined;

    return {
      id: cat.id,
      name: cat.name,
      points: cat.points,
      myVotes: myVotes.map(v => ({ rank: v.rank, nomineeId: v.nomineeId })),
      tally: results?.tally,
      winners: results?.winners,
    };
  });

  res.json({ categories, users: allUsers, phase: game.currentPhase, bonusActive: game.bonusActive });
});

// POST /api/bonus/vote — submit votes for a category (replaces existing)
router.post('/vote', requireAuth, (req, res) => {
  const { user: me, game } = res.locals;

  if (!game.bonusActive) {
    return res.status(403).json({ error: 'Voting only available when Bonus is active' });
  }
  // The results are shown once the game is done, so votes can no longer change them
  if (game.currentPhase === 'done') {
    return res.status(403).json({ error: 'Voting is closed - the game is over' });
  }

  const { categoryId, votes } = req.body;
  if (!categoryId || !Array.isArray(votes)) {
    return res.status(400).json({ error: 'categoryId and votes required' });
  }
  if (!votes.every(isVote)) {
    return res.status(400).json({ error: 'Each vote needs a rank and a nomineeId' });
  }

  const cat = findCategory(game, categoryId);
  if (!cat) return res.status(404).json({ error: 'Category not found' });

  // Rank your top 3, or everyone else when the game has fewer than 4 players
  const otherPlayers = db.select({ id: users.id }).from(users).where(eq(users.gameId, game.id)).all().length - 1;
  const required = Math.min(3, otherPlayers);
  if (required < 1) return res.status(400).json({ error: 'Voting needs at least two players' });

  // Validate: one vote per rank 1..required, no duplicates, no self-vote
  if (votes.length !== required) return res.status(400).json({ error: `Must submit exactly ${required} votes` });
  const ranks = votes.map((v: BonusVote) => v.rank).sort();
  if (JSON.stringify(ranks) !== JSON.stringify([1, 2, 3].slice(0, required))) {
    return res.status(400).json({ error: `Must rank places 1 to ${required}` });
  }
  const nomineeIds = votes.map((v: BonusVote) => v.nomineeId);
  if (new Set(nomineeIds).size !== required)
    return res.status(400).json({ error: 'Cannot vote for same person twice' });
  if (nomineeIds.includes(me.id)) return res.status(400).json({ error: 'Cannot vote for yourself' });

  // Nominees from another game answer like unknown ids
  for (const nid of nomineeIds) {
    const u = db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, nid), eq(users.gameId, game.id)))
      .get();
    if (!u) return res.status(400).json({ error: `User ${nid} not found` });
  }

  // A new ballot replaces the voter's previous one in this category
  db.delete(bonusVotes)
    .where(and(eq(bonusVotes.categoryId, categoryId), eq(bonusVotes.voterId, me.id)))
    .run();
  for (const v of votes) {
    db.insert(bonusVotes).values({ categoryId, voterId: me.id, nomineeId: v.nomineeId, rank: v.rank }).run();
  }

  res.json({ success: true });
});

// POST /api/bonus/categories (admin) — create category
router.post('/categories', requireAdmin, (req, res) => {
  const { name, points } = req.body;
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name required' });
  const pts = points === undefined || points === '' ? 5 : parsePoints(points);
  if (pts === null) return res.status(400).json({ error: BAD_POINTS });
  const cat = db
    .insert(bonusCategories)
    .values({ gameId: res.locals.game.id, name: name.trim(), points: pts })
    .returning()
    .get();
  res.json(cat);
});

// PUT /api/bonus/categories/:id (admin) — update category
router.put('/categories/:id', requireAdmin, (req, res) => {
  const cat = findCategory(res.locals.game, parseInt(req.params.id));
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  const { name, points } = req.body;
  const updates: Partial<typeof bonusCategories.$inferInsert> = {};
  if (typeof name === 'string' && name.trim()) updates.name = name.trim();
  if (points !== undefined) {
    const pts = parsePoints(points);
    if (pts === null) return res.status(400).json({ error: BAD_POINTS });
    updates.points = pts;
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });
  db.update(bonusCategories).set(updates).where(eq(bonusCategories.id, cat.id)).run();
  res.json(findCategory(res.locals.game, cat.id));
});

// DELETE /api/bonus/categories/:id (admin) — delete category and its votes
router.delete('/categories/:id', requireAdmin, (req, res) => {
  const cat = findCategory(res.locals.game, parseInt(req.params.id));
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  db.delete(bonusVotes).where(eq(bonusVotes.categoryId, cat.id)).run();
  db.delete(bonusCategories).where(eq(bonusCategories.id, cat.id)).run();
  res.json({ success: true });
});

export default router;
