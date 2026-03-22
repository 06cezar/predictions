import express from 'express';
import session from 'express-session';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import predictionRoutes from './routes/predictions';
import ratingRoutes from './routes/ratings';
import outcomeRoutes from './routes/outcomes';
import leaderboardRoutes from './routes/leaderboard';
import adminRoutes from './routes/admin';
import settingsRoutes from './routes/settings';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Use SQLite session store in production, MemoryStore in tests
  const sessionOptions: session.SessionOptions = {
    secret: 'predictions-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
  };
  if (process.env.NODE_ENV !== 'test') {
    const SQLiteStore = require('connect-sqlite3')(session);
    sessionOptions.store = new SQLiteStore({ db: 'sessions.db', dir: process.cwd() });
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

  return app;
}
