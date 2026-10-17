import { Router } from 'express';
import { db } from '../db';
import { users, inviteLinks } from '../schema';
import { and, eq } from 'drizzle-orm';
import { requireAdmin } from '../auth';
import { claimToken } from '../services/tokens';
import { cleanName } from '../services/games';
import { nanoid } from 'nanoid';

const router = Router();

// GET /api/invite — admin: list this game's invite links
router.get('/', requireAdmin, (req, res) => {
  const { game } = res.locals;
  const links = db.select().from(inviteLinks).where(eq(inviteLinks.gameId, game.id)).all();
  const players = db.select().from(users).where(eq(users.gameId, game.id)).all();
  const userMap = new Map(players.map(u => [u.id, u.name]));
  const result = links.map(l => ({
    ...l,
    usedByName: l.usedBy ? (userMap.get(l.usedBy) ?? null) : null,
    createdByName: userMap.get(l.createdBy) ?? null,
  }));
  res.json(result);
});

// POST /api/invite — admin: generate a new invite link
router.post('/', requireAdmin, (req, res) => {
  const { user: me, game } = res.locals;
  const link = db.insert(inviteLinks).values({ gameId: game.id, code: nanoid(12), createdBy: me.id }).returning().get();
  res.json(link);
});

// DELETE /api/invite/:id — admin: revoke (delete) an invite link
router.delete('/:id', requireAdmin, (req, res) => {
  const link = db.select().from(inviteLinks)
    .where(and(eq(inviteLinks.id, parseInt(req.params.id)), eq(inviteLinks.gameId, res.locals.game.id))).get();
  if (!link) return res.status(404).json({ error: 'Invite link not found' });
  if (link.usedBy) return res.status(400).json({ error: 'Cannot revoke a used invite link' });
  db.delete(inviteLinks).where(eq(inviteLinks.id, link.id)).run();
  res.json({ success: true });
});

// GET /api/invite/join/:code — public: get invite link info
router.get('/join/:code', (req, res) => {
  const { code } = req.params;
  const link = db.select().from(inviteLinks).where(eq(inviteLinks.code, code)).get();
  if (!link) return res.status(404).json({ error: 'Invite link not found' });
  if (link.usedBy) return res.status(410).json({ error: 'This invite link has already been used' });
  res.json({ valid: true, code });
});

// POST /api/invite/join/:code — public: register in the link's game
router.post('/join/:code', (req, res) => {
  const { code } = req.params;
  const name = cleanName(req.body.name);

  if (!name) return res.status(400).json({ error: 'Name is required' });

  const link = db.select().from(inviteLinks).where(eq(inviteLinks.code, code)).get();
  if (!link) return res.status(404).json({ error: 'Invite link not found' });
  if (link.usedBy) return res.status(410).json({ error: 'This invite link has already been used' });

  const claim = claimToken(req.body.token, { playerName: name, source: 'invite link' });
  if (!claim.ok) return res.status(409).json({ error: claim.error });

  const newUser = db.insert(users).values({ gameId: link.gameId, name, token: claim.token }).returning().get();

  db.update(inviteLinks)
    .set({ usedBy: newUser.id, usedAt: new Date().toISOString() })
    .where(eq(inviteLinks.id, link.id))
    .run();

  res.json({ success: true, token: claim.token, name: newUser.name });
});

export default router;
