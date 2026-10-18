import path from 'path';
import express from 'express';
import { initDb } from './db';
import { startPhaseScheduler } from './phase-scheduler';
import { createApp } from './app';
import { seedAdminFromEnv } from './services/games';

const PORT = parseInt(process.env.PORT || '3011');

initDb(); // runs any pending migrations
seedAdminFromEnv();

const app = createApp();

// In production the same server also serves the built React app (in development Vite does)
if (process.env.NODE_ENV === 'production') {
  const clientDir = path.join(process.cwd(), 'client/dist');
  app.use(express.static(clientDir));
  app.get('*', (req, res) => res.sendFile(path.join(clientDir, 'index.html')));
}

startPhaseScheduler();

app.listen(PORT, () => {
  console.log(`Predictions server running on http://localhost:${PORT}`);
});
