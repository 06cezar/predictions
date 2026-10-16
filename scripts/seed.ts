/**
 * Create the demo game locally, with fixed tokens so the README can list them.
 *
 *   npm run seed            # only if the database is empty
 *   npm run seed -- --force # wipe every game first
 */
import { db, initDb } from '../server/db';
import { users } from '../server/schema';
import { createDemoGame } from '../server/services/demo';
import { wipeAllData } from './wipe';

initDb();

if (db.select({ id: users.id }).from(users).limit(1).get()) {
  if (!process.argv.includes('--force')) {
    console.log('Database already has data. Skipping seed (use --force to wipe it).');
    process.exit(0);
  }
  wipeAllData();
}

const { game } = createDemoGame({
  isDemo: false,
  seedTokens: true,
  visitorName: 'Alex',
  visitorToken: 'lion-sunset-42',
});

console.log(`🌱 Seeded "${game.name}" (join code ${game.joinCode}). Log in with:\n`);
for (const u of db.select().from(users).all()) {
  console.log(`   ${u.isAdmin ? '👑' : '👤'} ${u.name.padEnd(8)} ${u.token}`);
}
