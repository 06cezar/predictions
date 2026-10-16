/**
 * Fill an empty database with five demo players, predictions and ratings.
 *
 *   npm run seed            # only if the database is empty
 *   npm run seed -- --force # wipe everything first
 */
import { db, initDb } from '../server/db';
import { users, predictions, ratings } from '../server/schema';
import { updateSettings } from '../server/services/settings';
import { wipeAllData } from './wipe';

initDb();

function makeToken(adj: string, noun: string, num: number) {
  return `${adj}-${noun}-${num}`;
}

async function seed() {
  console.log('🌱 Seeding Predictions database...\n');

  const forceReseed = process.argv.includes('--force');
  const existingUsers = db.select().from(users).all();
  if (existingUsers.length > 0) {
    if (!forceReseed) {
      console.log('Database already has data. Skipping seed.');
      process.exit(0);
    }

    wipeAllData();
    console.log('Force reseed enabled. Existing data cleared.');
  }

  // Create users
  const userData = [
    { name: 'Alex (Admin)', token: makeToken('lion', 'sunset', 42), isAdmin: true },
    { name: 'Jordan', token: makeToken('thunder', 'storm', 17), isAdmin: false },
    { name: 'Morgan', token: makeToken('silver', 'tide', 88), isAdmin: false },
    { name: 'Casey', token: makeToken('golden', 'ember', 33), isAdmin: false },
    { name: 'River', token: makeToken('crystal', 'wave', 55), isAdmin: false },
  ];

  const createdUsers = [];
  for (const u of userData) {
    const created = db.insert(users).values(u).returning().get();
    createdUsers.push(created);
  }

  console.log('✅ Created users:');
  for (const u of createdUsers) {
    console.log(`   ${u.isAdmin ? '👑' : '👤'} ${u.name.padEnd(20)} token: ${u.token}`);
  }

  const [, jordan, morgan, casey, river] = createdUsers;

  // Create some sample predictions
  const predData = [
    { authorId: jordan.id, targetId: morgan.id, currentText: "Morgan will move to a new city within the year, chasing a dream job they've been quietly researching for months." },
    { authorId: jordan.id, targetId: casey.id, currentText: "Casey will finally start that creative project they keep mentioning — and it'll actually be really good." },
    { authorId: jordan.id, targetId: river.id, currentText: "River will adopt a pet. Probably a cat, but could be something more unexpected." },
    { authorId: morgan.id, targetId: jordan.id, currentText: "Jordan will get a promotion or a significant raise this year — their hard work is finally being noticed." },
    { authorId: morgan.id, targetId: casey.id, currentText: "Casey will go on a trip to a country they've never visited before, probably somewhere in Asia." },
    { authorId: morgan.id, targetId: river.id, currentText: "River will pick up a completely new hobby that surprises everyone — something physical." },
    { authorId: casey.id, targetId: jordan.id, currentText: "Jordan will start meditating or doing some kind of mindfulness practice by the end of the year." },
    { authorId: casey.id, targetId: morgan.id, currentText: "Morgan will publish something — a blog post, an article, or maybe even start a newsletter." },
    { authorId: casey.id, targetId: river.id, currentText: "River will finally read that giant book that's been sitting on their shelf for two years." },
    { authorId: river.id, targetId: jordan.id, currentText: "Jordan will learn to cook a new cuisine and become obsessed with it for at least three months." },
    { authorId: river.id, targetId: morgan.id, currentText: "Morgan will cut their working hours and start taking weekends seriously again." },
    { authorId: river.id, targetId: casey.id, currentText: "Casey will reconnect with an old friend they haven't spoken to in years." },
  ];

  const createdPreds = [];
  for (const p of predData) {
    const created = db.insert(predictions).values(p).returning().get();
    createdPreds.push(created);
  }
  console.log(`\n✅ Created ${createdPreds.length} predictions`);

  // Create some ratings
  const ratingData = [
    // Jordan's predictions rated by others
    { predictionId: createdPreds[0].id, userId: casey.id, score: 72 },
    { predictionId: createdPreds[0].id, userId: river.id, score: 65 },
    { predictionId: createdPreds[1].id, userId: morgan.id, score: 88 },
    { predictionId: createdPreds[1].id, userId: river.id, score: 45 },
    { predictionId: createdPreds[2].id, userId: morgan.id, score: 30 },
    { predictionId: createdPreds[2].id, userId: casey.id, score: 55 },
    // Morgan's predictions
    { predictionId: createdPreds[3].id, userId: casey.id, score: 80 },
    { predictionId: createdPreds[3].id, userId: river.id, score: 75 },
    { predictionId: createdPreds[4].id, userId: jordan.id, score: 60 },
    { predictionId: createdPreds[4].id, userId: river.id, score: 70 },
    { predictionId: createdPreds[5].id, userId: jordan.id, score: 35 },
    { predictionId: createdPreds[5].id, userId: casey.id, score: 42 },
    // Casey's predictions
    { predictionId: createdPreds[6].id, userId: morgan.id, score: 25 },
    { predictionId: createdPreds[6].id, userId: river.id, score: 30 },
    { predictionId: createdPreds[7].id, userId: jordan.id, score: 90 },
    { predictionId: createdPreds[7].id, userId: river.id, score: 85 },
    // River's predictions
    { predictionId: createdPreds[9].id, userId: morgan.id, score: 50 },
    { predictionId: createdPreds[9].id, userId: casey.id, score: 62 },
    { predictionId: createdPreds[10].id, userId: jordan.id, score: 78 },
    { predictionId: createdPreds[10].id, userId: casey.id, score: 68 },
  ];

  for (const r of ratingData) {
    db.insert(ratings).values(r).run();
  }
  console.log(`✅ Created ${ratingData.length} ratings`);

  // Update settings with sample deadlines (30 days from now for submission, 60 for reveal)
  const submissionDeadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const revealDeadline = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

  updateSettings({
    submissionDeadline,
    revealDeadline,
    ratingThreshold: 40,
  });

  console.log(`\n✅ Settings configured:`);
  console.log(`   Submission deadline: ${submissionDeadline}`);
  console.log(`   Reveal deadline: ${revealDeadline}`);
  console.log(`   Rating threshold: 40%`);

  console.log('\n🎉 Seed complete! Use these tokens to log in:\n');
  for (const u of createdUsers) {
    console.log(`   ${u.name}: ${u.token}`);
  }
}

seed().catch(console.error);
