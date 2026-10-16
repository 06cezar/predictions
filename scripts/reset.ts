/**
 * Wipe the game and start over with a single admin user.
 *
 *   ADMIN_TOKEN=my-secret-token ADMIN_NAME=Alex npm run reset
 */
import { db, initDb } from '../server/db';
import { users } from '../server/schema';
import { updateSettings } from '../server/services/settings';
import { wipeAllData } from './wipe';

const token = process.env.ADMIN_TOKEN;
if (!token) {
  console.error('Set ADMIN_TOKEN (and optionally ADMIN_NAME) to choose the admin login.');
  process.exit(1);
}

initDb();
wipeAllData();

updateSettings({
  currentPhase: 'submission',
  submissionDeadline: null,
  revealDeadline: null,
  ratingThreshold: 40,
  autoAdvancePhase: true,
  adminOverride: false,
  anonymousPredictions: true,
  bonusActive: false,
});

const admin = db.insert(users).values({
  name: process.env.ADMIN_NAME || 'Admin',
  token,
  isAdmin: true,
}).returning().get();

console.log('✅ Database reset complete.');
console.log(`👑 Admin user: ${admin.name}`);
