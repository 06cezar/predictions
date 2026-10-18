/**
 * Wipe every game and start over with one game and its admin.
 *
 *   ADMIN_TOKEN=my-secret-token ADMIN_NAME=Alex ADMIN_GAME_NAME="Class of 2026" npm run reset
 */
import { db, initDb } from '../server/db';
import { users } from '../server/schema';
import { createGame } from '../server/services/games';
import { wipeAllData } from './wipe';

const token = process.env.ADMIN_TOKEN;
if (!token) {
  console.error('Set ADMIN_TOKEN (and optionally ADMIN_NAME) to choose the admin login.');
  process.exit(1);
}

initDb();
wipeAllData();

const game = createGame({ name: process.env.ADMIN_GAME_NAME || 'Predictions', openJoin: false, ratingThreshold: 40 });

const admin = db
  .insert(users)
  .values({
    gameId: game.id,
    name: process.env.ADMIN_NAME || 'Admin',
    token,
    isAdmin: true,
  })
  .returning()
  .get();

console.log('✅ Database reset complete.');
console.log(`🎲 Game: ${game.name} (join code ${game.joinCode})`);
console.log(`👑 Admin user: ${admin.name}`);
