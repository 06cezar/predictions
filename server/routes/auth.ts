import { Router } from 'express';
import { db } from '../db';
import { users } from '../schema';
import { eq } from 'drizzle-orm';
import { logIn } from '../auth';

const router = Router();

router.post('/login', (req, res) => {
  const { token } = req.body;
  if (typeof token !== 'string' || !token.trim()) return res.status(400).json({ error: 'Token required' });

  const user = db.select().from(users).where(eq(users.token, token.trim())).get();
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  logIn(req, user);
  res.json({ success: true, user: { id: user.id, name: user.name, isAdmin: user.isAdmin } });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {});
  res.json({ success: true });
});

export default router;
