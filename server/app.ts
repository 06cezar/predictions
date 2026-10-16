import express from 'express';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import { DATA_DIR } from './db';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import predictionRoutes from './routes/predictions';
import ratingRoutes from './routes/ratings';
import outcomeRoutes from './routes/outcomes';
import leaderboardRoutes from './routes/leaderboard';
import adminRoutes from './routes/admin';
import settingsRoutes from './routes/settings';
import notificationRoutes from './routes/notifications';
import bonusRoutes from './routes/bonus';
import inviteRoutes from './routes/invite';
import gameRoutes from './routes/games';
import demoRoutes from './routes/demo';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Trust proxy (Fly.io) so rate limiting uses real client IP
  app.set('trust proxy', 1);

  // Rate limiting
  app.use('/api/auth', rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: { error: 'Too many login attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  }));
  app.use('/api', rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 200,
    message: { error: 'Too many requests, please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
  }));
  // Anyone can create games and join with a code, so cap how often one address can
  app.post(['/api/games', '/api/demo'], rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: { error: 'Too many new games from this address, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  }));
  app.post('/api/games/join/:code', rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: { error: 'Too many join attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  }));

  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be set in production');
  }

  // Use SQLite session store outside tests, MemoryStore in tests
  const sessionOptions: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'dev-only-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction, // Fly.io terminates TLS; 'trust proxy' lets Express see https
    },
  };
  if (process.env.NODE_ENV !== 'test') {
    const SQLiteStore = require('connect-sqlite3')(session);
    sessionOptions.store = new SQLiteStore({ db: 'sessions.db', dir: DATA_DIR });
  }
  app.use(session(sessionOptions));

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/predictions', predictionRoutes);
  app.use('/api/ratings', ratingRoutes);
  app.use('/api/outcomes', outcomeRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/bonus', bonusRoutes);
  app.use('/api/invite', inviteRoutes);
  app.use('/api/games', gameRoutes);
  app.use('/api/demo', demoRoutes);

  return app;
}
