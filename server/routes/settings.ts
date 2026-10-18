import { Router } from 'express';
import { requireAuth } from '../auth';
import { demoExpiresAt } from '../services/demo';
import { scoringTiers } from '../services/scoring';

const router = Router();

// The player's game: name, phase, deadlines and rules
router.get('/', requireAuth, (req, res) => {
  const game = res.locals.game;
  res.json({
    gameName: game.name,
    isDemo: game.isDemo,
    demoExpiresAt: game.isDemo ? demoExpiresAt(game) : null,
    currentPhase: game.currentPhase,
    submissionDeadline: game.submissionDeadline,
    revealDeadline: game.revealDeadline,
    ratingThreshold: game.ratingThreshold,
    scoringTiers: scoringTiers(game.ratingThreshold),
    anonymousPredictions: game.anonymousPredictions,
    bonusActive: game.bonusActive,
    adminOverride: game.adminOverride,
  });
});

export default router;
