import express from 'express';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
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

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

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

  // Use SQLite session store in production, MemoryStore in tests
  const sessionOptions: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'predictions-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
  };
  if (process.env.NODE_ENV !== 'test') {
    const SQLiteStore = require('connect-sqlite3')(session);
    const dbDir = process.env.NODE_ENV === 'production' ? '/data' : process.cwd();
    sessionOptions.store = new SQLiteStore({ db: 'sessions.db', dir: dbDir });
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

  return app;
}
