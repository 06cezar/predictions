import { Router } from 'express';
import { db } from '../db';
import { notifications, users, settings } from '../schema';
import { eq, and, ne } from 'drizzle-orm';
import { requireAuth, getCurrentUser } from '../auth';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  const me = getCurrentUser(req)!;
  const s = db.select().from(settings).where(eq(settings.id, 1)).get()!;

  const items = db.select().from(notifications)
    .where(and(eq(notifications.userId, me.id), ne(notifications.dismissed, true)))
    .all()
    .sort((a, b) => b.id - a.id)
    .map(n => {
      let message = '';
      const meta = n.meta ? JSON.parse(n.meta) : null;

      if (n.type === 'prediction_about_you') {
        let authorName: string | null = null;
        if (!s.anonymousPredictions && n.authorId) {
          const author = db.select({ name: users.name }).from(users)
            .where(eq(users.id, n.authorId)).get();
          authorName = author?.name ?? null;
        }
        message = authorName
          ? `${authorName} wrote a prediction about you`
          : 'Someone wrote a prediction about you';
      }

      if (n.type === 'phase_changed') {
        const phase = meta?.phase;
        if (phase === 'reveal') message = '👁️ The Reveal phase has started! Go mark your outcomes.';
        else if (phase === 'done') message = '🏁 The game is done! Check the leaderboard.';
        else if (phase === 'submission') message = '✏️ Back to Submission phase.';
        else message = 'The game phase has changed.';
      }

      if (n.type === 'token_conflict') {
        message = meta?.message ?? 'A token was regenerated due to a conflict.';
      }

      if (n.type === 'outcome_marked') {
        let targetName = meta?.targetName ?? 'Someone';
        const happened = meta?.happened;
        if (happened === true) {
          message = `${targetName} confirmed your prediction ✅`;
        } else if (happened === false) {
          message = `${targetName} denied your prediction ❌`;
        } else {
          message = `${targetName} updated the outcome of your prediction`;
        }
      }

      return { id: n.id, type: n.type, message, read: n.read, createdAt: n.createdAt };
    });

  const unread = items.filter(n => !n.read).length;
  res.json({ unread, items });
});

router.post('/dismiss/:id', requireAuth, (req, res) => {
  const me = getCurrentUser(req)!;
  const id = parseInt(req.params.id);
  db.update(notifications)
    .set({ dismissed: true })
    .where(and(eq(notifications.id, id), eq(notifications.userId, me.id)))
    .run();
  res.json({ ok: true });
});

router.post('/read-all', requireAuth, (req, res) => {
  const me = getCurrentUser(req)!;
  db.update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.userId, me.id), eq(notifications.read, false)))
    .run();
  res.json({ ok: true });
});

export default router;
