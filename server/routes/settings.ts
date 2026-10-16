import { Router } from 'express';
import { requireAuth } from '../auth';

const router = Router();

// The player's game: name, phase, deadlines and rules
router.get('/', requireAuth, (req, res) => {
  const game = res.locals.game;
  res.json({
    gameName: game.name,
    isDemo: game.isDemo,
    currentPhase: game.currentPhase,
    submissionDeadline: game.submissionDeadline,
    revealDeadline: game.revealDeadline,
    ratingThreshold: game.ratingThreshold,
    anonymousPredictions: game.anonymousPredictions,
    bonusActive: game.bonusActive,
    adminOverride: game.adminOverride,
  });
});

export default router;
