import path from 'path';
import { initDb } from './db';
import { startPhaseScheduler } from './phase-scheduler';
import { createApp } from './app';

const PORT = 3001;

// Init DB
initDb();

const app = createApp();

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(require('express').static(path.join(process.cwd(), 'client/dist')));
  app.get('*', (req: any, res: any) => {
    res.sendFile(path.join(process.cwd(), 'client/dist/index.html'));
  });
}

// Start phase scheduler
startPhaseScheduler();

app.listen(PORT, () => {
  console.log(`Predictions server running on http://localhost:${PORT}`);
});
