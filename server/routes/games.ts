import { Router } from 'express';
import { db } from '../db';
import { users } from '../schema';
import { logIn } from '../auth';
import { cleanName, createGame, findGameByJoinCode } from '../services/games';
import { claimToken } from '../services/tokens';

const router = Router();

// POST /api/games — public: create a game and become its admin
router.post('/', (req, res) => {
  const gameName = cleanName(req.body.gameName);
  const playerName = cleanName(req.body.playerName);
  if (!gameName || !playerName) {
    return res.status(400).json({ error: 'Game name and your name are required' });
  }

  const claim = claimToken(req.body.token, { playerName, source: 'new game' });
  if (!claim.ok) return res.status(409).json({ error: claim.error });

  const game = createGame({ name: gameName });
  const admin = db
    .insert(users)
    .values({ gameId: game.id, name: playerName, token: claim.token, isAdmin: true })
    .returning()
    .get();
  logIn(req, admin);

  res.json({
    token: claim.token,
    user: { id: admin.id, name: admin.name, isAdmin: true },
    game: { id: game.id, name: game.name, joinCode: game.joinCode },
  });
});

// GET /api/games/join/:code — public: which game a join code belongs to
router.get('/join/:code', (req, res) => {
  const game = findGameByJoinCode(req.params.code);
  if (!game) return res.status(404).json({ error: 'No game with that code' });
  res.json({ name: game.name, currentPhase: game.currentPhase, openJoin: game.openJoin });
});

// POST /api/games/join/:code — public: join a game as a new player
router.post('/join/:code', (req, res) => {
  const game = findGameByJoinCode(req.params.code);
  if (!game) return res.status(404).json({ error: 'No game with that code' });
  if (!game.openJoin) {
    return res.status(403).json({ error: 'This game is invite-only - ask the admin for a token' });
  }
  if (game.currentPhase !== 'submission') {
    return res.status(403).json({ error: 'This game has already started - ask the admin to add you' });
  }

  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const claim = claimToken(req.body.token, { playerName: name, source: 'join code' });
  if (!claim.ok) return res.status(409).json({ error: claim.error });

  const player = db.insert(users).values({ gameId: game.id, name, token: claim.token }).returning().get();
  logIn(req, player);

  res.json({
    token: claim.token,
    user: { id: player.id, name: player.name, isAdmin: false },
    game: { id: game.id, name: game.name },
  });
});

export default router;
