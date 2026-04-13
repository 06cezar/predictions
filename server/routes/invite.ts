import { Router } from 'express';
import { db } from '../db';
import { users, inviteLinks, notifications, blockedTokens } from '../schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, getCurrentUser } from '../auth';
import { nanoid } from 'nanoid';

const router = Router();

const ADJECTIVES = ['swift', 'brave', 'calm', 'dark', 'wild', 'cool', 'bold', 'keen', 'wise', 'pure'];
const NOUNS = ['lion', 'hawk', 'wolf', 'bear', 'fox', 'deer', 'owl', 'elk', 'ram', 'jay'];

function generateToken(): string {
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
  // Fallback: random suffix
  return `user-${nanoid(8)}`;
}

// GET /api/invite — admin: list all invite links
router.get('/', requireAdmin, (_req, res) => {
  const links = db.select().from(inviteLinks).all();
  const allUsers = db.select().from(users).all();
  const userMap = new Map(allUsers.map(u => [u.id, u.name]));
  const result = links.map(l => ({
    ...l,
    usedByName: l.usedBy ? (userMap.get(l.usedBy) ?? null) : null,
    createdByName: userMap.get(l.createdBy) ?? null,
  }));
  res.json(result);
});

// POST /api/invite — admin: generate a new invite link
router.post('/', requireAdmin, (req, res) => {
  const me = getCurrentUser(req)!;
  const code = nanoid(12);
  const link = db.insert(inviteLinks).values({ code, createdBy: me.id }).returning().get();
  res.json(link);
});

// DELETE /api/invite/:id — admin: revoke (delete) an invite link
router.delete('/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const link = db.select().from(inviteLinks).where(eq(inviteLinks.id, id)).get();
  if (!link) return res.status(404).json({ error: 'Invite link not found' });
  if (link.usedBy) return res.status(400).json({ error: 'Cannot revoke a used invite link' });
  db.delete(inviteLinks).where(eq(inviteLinks.id, id)).run();
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

// POST /api/invite/join/:code — public: register using invite link
router.post('/join/:code', (req, res) => {
  const { code } = req.params;
  const { name, token: requestedToken } = req.body;

  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  const link = db.select().from(inviteLinks).where(eq(inviteLinks.code, code)).get();
  if (!link) return res.status(404).json({ error: 'Invite link not found' });
  if (link.usedBy) return res.status(410).json({ error: 'This invite link has already been used' });

  let finalToken: string;

  if (requestedToken?.trim()) {
    const trimmed = requestedToken.trim();

    // Check if blocked
    const blocked = db.select().from(blockedTokens).where(eq(blockedTokens.token, trimmed)).get();
    if (blocked) {
      return res.status(409).json({ error: 'That token is already in use - please choose a different one' });
    }

    // Check if taken by existing user
    const existing = db.select().from(users).where(eq(users.token, trimmed)).get();
    if (existing) {
      // Regenerate old user's token
      const newToken = generateUniqueToken();
      db.update(users).set({ token: newToken }).where(eq(users.id, existing.id)).run();

      // Block the freed token so it can't be claimed
      db.insert(blockedTokens).values({ token: trimmed }).run();

      // Notify all admins
      const allAdmins = db.select().from(users).where(eq(users.isAdmin, true)).all();
      for (const admin of allAdmins) {
        db.insert(notifications).values({
          userId: admin.id,
          type: 'token_conflict',
          meta: JSON.stringify({
            message: `${existing.name}'s token was regenerated - conflict with ${name.trim()} (invite link)`,
            oldUserName: existing.name,
            newUserName: name.trim(),
            oldToken: trimmed,
            newToken,
          }),
        }).run();
      }

      return res.status(409).json({ error: 'That token is already in use - please choose a different one' });
    }

    finalToken = trimmed;
  } else {
    finalToken = generateUniqueToken();
  }

  // Create the user
  const newUser = db.insert(users).values({ name: name.trim(), token: finalToken }).returning().get();

  // Mark link as used
  db.update(inviteLinks)
    .set({ usedBy: newUser.id, usedAt: new Date().toISOString() })
    .where(eq(inviteLinks.id, link.id))
    .run();

  res.json({ success: true, token: finalToken, name: newUser.name });
});

export default router;
