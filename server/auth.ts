import { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users } from './schema';
import { getGame, Game } from './services/games';

export type User = typeof users.$inferSelect;

declare module 'express-session' {
  interface SessionData {
    userId: number;
  }
}

// Set by requireAuth/requireAdmin for every authenticated request.
declare global {
  namespace Express {
    interface Locals {
      user: User;
      game: Game;
    }
  }
}

/** Load the logged-in player and their game into res.locals, or answer 401. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = req.session.userId ? db.select().from(users).where(eq(users.id, req.session.userId)).get() : undefined;
  const game = user && getGame(user.gameId);
  if (!user || !game) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.locals.user = user;
  res.locals.game = game;
  next();
}

/** Like requireAuth, but only for the admins of the player's own game. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!res.locals.user.isAdmin) {
      return res.status(403).json({ error: 'Admin required' });
    }
    next();
  });
}

export function logIn(req: Request, user: User) {
  req.session.userId = user.id;
}
