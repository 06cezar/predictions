import { Router } from 'express';
import { db } from '../db';
import { settings } from '../schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../auth';

const router = Router();

// Public settings (phase + deadlines + threshold) — accessible to all authenticated users
router.get('/', requireAuth, (req, res) => {
  const s = db.select().from(settings).where(eq(settings.id, 1)).get();
  if (!s) return res.status(500).json({ error: 'Settings not found' });

  res.json({
    currentPhase: s.currentPhase,
    submissionDeadline: s.submissionDeadline,
    revealDeadline: s.revealDeadline,
    ratingThreshold: s.ratingThreshold,
    anonymousPredictions: s.anonymousPredictions,
    bonusActive: s.bonusActive,
    adminOverride: s.adminOverride,
  });
});

export default router;
