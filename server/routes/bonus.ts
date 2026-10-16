import { Router } from 'express';
import { db } from '../db';
import { bonusCategories, bonusVotes, users } from '../schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, requireAdmin, getCurrentUser } from '../auth';
import { getSettings } from '../services/settings';
import { tallyVotes } from '../services/scoring';

const router = Router();

// GET /api/bonus — get categories + my votes + tally (tally only at done or for admin)
router.get('/', requireAuth, (req, res) => {
  const me = getCurrentUser(req)!;
  const s = getSettings();

  if (!s.bonusActive && s.currentPhase !== 'done' && !me.isAdmin) {
    return res.status(403).json({ error: 'Not available yet' });
  }

  const allUsers = db.select({ id: users.id, name: users.name }).from(users).all();
  const allCats = db.select().from(bonusCategories).all();
  const showTally = s.currentPhase === 'done' || me.isAdmin;

  const categories = allCats.map(cat => {
    const myVotes = db.select().from(bonusVotes)
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

  res.json({ categories, users: allUsers, phase: s.currentPhase, bonusActive: s.bonusActive });
});

// POST /api/bonus/vote — submit votes for a category (replaces existing)
router.post('/vote', requireAuth, (req, res) => {
  const me = getCurrentUser(req)!;
  const s = getSettings();

  if (!s.bonusActive) {
    return res.status(403).json({ error: 'Voting only available when Bonus is active' });
  }

  const { categoryId, votes } = req.body;
  if (!categoryId || !Array.isArray(votes)) {
    return res.status(400).json({ error: 'categoryId and votes required' });
  }

  // Validate: exactly 3 votes, ranks 1-3, no duplicates, no self-vote
  if (votes.length !== 3) return res.status(400).json({ error: 'Must submit exactly 3 votes' });
  const ranks = votes.map((v: any) => v.rank).sort();
  if (JSON.stringify(ranks) !== JSON.stringify([1, 2, 3])) {
    return res.status(400).json({ error: 'Must have exactly rank 1, 2 and 3' });
  }
  const nomineeIds = votes.map((v: any) => v.nomineeId);
  if (new Set(nomineeIds).size !== 3) return res.status(400).json({ error: 'Cannot vote for same person twice' });
  if (nomineeIds.includes(me.id)) return res.status(400).json({ error: 'Cannot vote for yourself' });

  const cat = db.select().from(bonusCategories).where(eq(bonusCategories.id, categoryId)).get();
  if (!cat) return res.status(404).json({ error: 'Category not found' });

  // Verify all nominees exist
  for (const nid of nomineeIds) {
    const u = db.select({ id: users.id }).from(users).where(eq(users.id, nid)).get();
    if (!u) return res.status(400).json({ error: `User ${nid} not found` });
  }

  // Replace votes
  db.delete(bonusVotes).where(and(eq(bonusVotes.categoryId, categoryId), eq(bonusVotes.voterId, me.id))).run();
  for (const v of votes) {
    db.insert(bonusVotes).values({ categoryId, voterId: me.id, nomineeId: v.nomineeId, rank: v.rank }).run();
  }

  res.json({ success: true });
});

// POST /api/bonus/categories (admin) — create category
router.post('/categories', requireAdmin, (req, res) => {
  const { name, points } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const cat = db.insert(bonusCategories).values({ name: name.trim(), points: parseInt(points) || 5 }).returning().get();
  res.json(cat);
});

// PUT /api/bonus/categories/:id (admin) — update category
router.put('/categories/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const { name, points } = req.body;
  const updates: Record<string, any> = {};
  if (name?.trim()) updates.name = name.trim();
  if (points !== undefined) updates.points = parseInt(points);
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });
  db.update(bonusCategories).set(updates).where(eq(bonusCategories.id, id)).run();
  const updated = db.select().from(bonusCategories).where(eq(bonusCategories.id, id)).get();
  res.json(updated);
});

// DELETE /api/bonus/categories/:id (admin) — delete category and its votes
router.delete('/categories/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  db.delete(bonusVotes).where(eq(bonusVotes.categoryId, id)).run();
  db.delete(bonusCategories).where(eq(bonusCategories.id, id)).run();
  res.json({ success: true });
});

export default router;
