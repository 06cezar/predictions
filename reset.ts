import { db, initDb } from './server/db';
import { users, predictions, predictionHistory, ratings, outcomes, notifications, settings } from './server/schema';
import { eq } from 'drizzle-orm';

initDb();

// Wipe all data
db.delete(notifications).run();
db.delete(outcomes).run();
db.delete(ratings).run();
db.delete(predictionHistory).run();
db.delete(predictions).run();
db.delete(users).run();

// Reset settings to defaults
db.update(settings).set({
  currentPhase: 'submission',
  submissionDeadline: null,
  revealDeadline: null,
  ratingThreshold: 40,
  autoAdvancePhase: true,
  adminOverride: false,
  anonymousPredictions: true,
}).where(eq(settings.id, 1)).run();

// Insert admin user
const admin = db.insert(users).values({
  name: 'Cioaca',
  token: 'admin-token-redacted',
  isAdmin: true,
}).returning().get();

console.log('✅ Database reset complete.');
console.log(`👑 Admin user: ${admin.name}`);
console.log(`   Token: ${admin.token}`);
