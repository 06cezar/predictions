import { Router, Request, Response, NextFunction } from 'express';
import { logIn, requireAuth, requireAdmin } from '../auth';
import { cleanName, getGame } from '../services/games';
import { createDemoGame, demoExpiresAt, demoProgress } from '../services/demo';
import { skipDemoPhase } from '../services/phases';

const router = Router();

// POST /api/demo — public: a private sandbox game with bots, you as its admin
router.post('/', (req, res) => {
  const { game, visitor } = createDemoGame({ visitorName: cleanName(req.body?.name) });
  logIn(req, visitor);
  res.json({
    token: visitor.token,
    user: { id: visitor.id, name: visitor.name, isAdmin: true },
    game: { id: game.id, name: game.name, isDemo: true, expiresAt: demoExpiresAt(game) },
  });
});

/** The routes below only exist inside a demo game. */
function requireDemo(req: Request, res: Response, next: NextFunction) {
  if (!res.locals.game.isDemo) return res.status(404).json({ error: 'Not a demo game' });
  next();
}

// GET /api/demo/progress — how far the player is through the demo round
router.get('/progress', requireAuth, requireDemo, (req, res) => {
  res.json(demoProgress(res.locals.game, res.locals.user.id));
});

// POST /api/demo/skip — admin: jump to the next phase as if its deadline had passed
router.post('/skip', requireAdmin, requireDemo, (req, res) => {
  const newPhase = skipDemoPhase(res.locals.game);
  if (!newPhase) return res.status(400).json({ error: 'The demo round is already over' });
  res.json({ newPhase, game: getGame(res.locals.game.id) });
});

export default router;
