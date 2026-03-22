import { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { users } from './schema';
import { eq } from 'drizzle-orm';

declare module 'express-session' {
  interface SessionData {
    userId: number;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const user = db.select().from(users).where(eq(users.id, req.session.userId)).get();
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin required' });
  }
  next();
}

export function getCurrentUser(req: Request) {
  if (!req.session.userId) return null;
  return db.select().from(users).where(eq(users.id, req.session.userId)).get() || null;
}
