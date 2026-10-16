import { Router } from 'express';
import { logIn } from '../auth';
import { cleanName } from '../services/games';
import { createDemoGame, demoExpiresAt } from '../services/demo';

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

export default router;
