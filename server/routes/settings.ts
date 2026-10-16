import { Router } from 'express';
import { requireAuth } from '../auth';
import { getSettings } from '../services/settings';

const router = Router();

// Public settings (phase + deadlines + threshold) — accessible to all authenticated users
router.get('/', requireAuth, (req, res) => {
  const s = getSettings();
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
