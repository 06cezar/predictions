import { and, eq, isNull, lt } from 'drizzle-orm';
import { db } from '../db';
import { games, users, predictions, ratings, outcomes, bonusCategories, bonusVotes } from '../schema';
import { createGame, deleteGame, Game } from './games';
import { generateUniqueToken } from './tokens';

/** Demo games delete themselves this long after they were created. */
export const DEMO_TTL_HOURS = 72;

type Bot = 'Jordan' | 'Morgan' | 'Casey' | 'River';

/** The four bots, with fixed tokens used only by `npm run seed`. */
const BOTS: { name: Bot; seedToken: string }[] = [
  { name: 'Jordan', seedToken: 'thunder-storm-17' },
  { name: 'Morgan', seedToken: 'silver-tide-88' },
  { name: 'Casey', seedToken: 'golden-ember-33' },
  { name: 'River', seedToken: 'crystal-wave-55' },
];

const BOT_PREDICTIONS: { author: Bot; target: Bot; text: string; ratings: Partial<Record<Bot, number>> }[] = [
  { author: 'Jordan', target: 'Morgan', text: "Morgan will move to a new city within the year, chasing a dream job they've been quietly researching for months.", ratings: { Casey: 72, River: 65 } },
  { author: 'Jordan', target: 'Casey', text: "Casey will finally start that creative project they keep mentioning, and it'll actually be really good.", ratings: { Morgan: 88, River: 45 } },
  { author: 'Jordan', target: 'River', text: 'River will adopt a pet. Probably a cat, but could be something more unexpected.', ratings: { Morgan: 30, Casey: 55 } },
  { author: 'Morgan', target: 'Jordan', text: 'Jordan will get a promotion or a significant raise this year; their hard work is finally being noticed.', ratings: { Casey: 80, River: 75 } },
  { author: 'Morgan', target: 'Casey', text: "Casey will go on a trip to a country they've never visited before, probably somewhere in Asia.", ratings: { Jordan: 60, River: 70 } },
  { author: 'Morgan', target: 'River', text: 'River will pick up a completely new hobby that surprises everyone, something physical.', ratings: { Jordan: 35, Casey: 42 } },
  { author: 'Casey', target: 'Jordan', text: 'Jordan will start meditating or doing some kind of mindfulness practice by the end of the year.', ratings: { Morgan: 25, River: 30 } },
  { author: 'Casey', target: 'Morgan', text: 'Morgan will publish something: a blog post, an article, or maybe even start a newsletter.', ratings: { Jordan: 90, River: 85 } },
  { author: 'Casey', target: 'River', text: "River will finally read that giant book that's been sitting on their shelf for two years.", ratings: {} },
  { author: 'River', target: 'Jordan', text: 'Jordan will learn to cook a new cuisine and become obsessed with it for at least three months.', ratings: { Morgan: 50, Casey: 62 } },
  { author: 'River', target: 'Morgan', text: 'Morgan will cut their working hours and start taking weekends seriously again.', ratings: { Jordan: 78, Casey: 68 } },
  { author: 'River', target: 'Casey', text: "Casey will reconnect with an old friend they haven't spoken to in years.", ratings: {} },
];

/** What the bots predict about the visitor, so they have outcomes to mark in the reveal. */
const ABOUT_VISITOR: { author: Bot; text: (name: string) => string; ratings: Partial<Record<Bot, number>> }[] = [
  { author: 'Jordan', text: n => `${n} will land an interview at a company they've admired for years.`, ratings: { Morgan: 70, Casey: 64 } },
  { author: 'Morgan', text: n => `${n} will ship a side project that strangers actually use.`, ratings: { Jordan: 35, River: 28 } },
  { author: 'Casey', text: n => `${n} will run a 10k race and post the finish photo everywhere.`, ratings: { Jordan: 20, Morgan: 15 } },
  { author: 'River', text: n => `${n} will learn to make proper sourdough and bring it to every gathering.`, ratings: { Casey: 55, Morgan: 47 } },
];

const BOT_VOTES: Record<Bot, Bot[]> = {
  Jordan: ['Casey', 'River', 'Morgan'],
  Morgan: ['Casey', 'Jordan', 'River'],
  Casey: ['River', 'Jordan', 'Morgan'],
  River: ['Casey', 'Morgan', 'Jordan'],
};

const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

interface DemoOptions {
  /** The visitor, who plays as the game's admin. */
  visitorName?: string;
  visitorToken?: string;
  /** Use the fixed bot tokens from the README (only for a local seed; tokens are global). */
  seedTokens?: boolean;
  /** False for `npm run seed`, so the game is not cleaned up. */
  isDemo?: boolean;
}

/**
 * A ready-to-play game: four bots who have already written and rated
 * predictions about each other and the visitor, plus a bonus category they
 * voted in. The visitor is the admin, so they can step through every phase.
 */
export function createDemoGame(options: DemoOptions = {}) {
  const visitorName = options.visitorName?.trim() || 'You';
  const game = createGame({
    name: 'Demo game',
    isDemo: options.isDemo ?? true,
    openJoin: false,
    anonymousPredictions: false,
    ratingThreshold: 40,
    submissionDeadline: days(30),
    revealDeadline: days(60),
  });

  const visitor = db.insert(users).values({
    gameId: game.id,
    name: visitorName,
    token: options.visitorToken ?? generateUniqueToken(),
    isAdmin: true,
  }).returning().get();

  const bot = {} as Record<Bot, number>;
  for (const b of BOTS) {
    const token = options.seedTokens ? b.seedToken : generateUniqueToken();
    bot[b.name] = db.insert(users).values({ gameId: game.id, name: b.name, token }).returning().get().id;
  }

  const addPrediction = (authorId: number, targetId: number, text: string, scores: Partial<Record<Bot, number>>) => {
    const p = db.insert(predictions).values({ gameId: game.id, authorId, targetId, currentText: text }).returning().get();
    for (const [rater, score] of Object.entries(scores) as [Bot, number][]) {
      db.insert(ratings).values({ predictionId: p.id, userId: bot[rater], score }).run();
    }
  };
  for (const p of BOT_PREDICTIONS) addPrediction(bot[p.author], bot[p.target], p.text, p.ratings);
  for (const p of ABOUT_VISITOR) addPrediction(bot[p.author], visitor.id, p.text(visitorName), p.ratings);

  const category = db.insert(bonusCategories)
    .values({ gameId: game.id, name: 'Most likely to become famous', points: 3 })
    .returning().get();
  for (const [voter, picks] of Object.entries(BOT_VOTES) as [Bot, Bot[]][]) {
    picks.forEach((nominee, i) => {
      db.insert(bonusVotes).values({ categoryId: category.id, voterId: bot[voter], nomineeId: bot[nominee], rank: i + 1 }).run();
    });
  }

  return { game, visitor };
}

/**
 * Bots can't click, so when a demo reaches the reveal they mark every
 * unmarked prediction about themselves, the visitor's included. About two
 * in three come true, decided by the prediction id so replays look the same.
 */
export function botsMarkOutcomes(game: Game) {
  const unmarked = db.select({ id: predictions.id, targetId: predictions.targetId })
    .from(predictions)
    .innerJoin(users, eq(users.id, predictions.targetId))
    .leftJoin(outcomes, eq(outcomes.predictionId, predictions.id))
    .where(and(eq(predictions.gameId, game.id), eq(users.isAdmin, false), isNull(outcomes.id)))
    .all();
  for (const p of unmarked) {
    db.insert(outcomes).values({ predictionId: p.id, happened: p.id % 3 !== 0, markedBy: p.targetId }).run();
  }
}

/** Delete demo games older than DEMO_TTL_HOURS. Returns how many were deleted. */
export function deleteExpiredDemos(now = new Date()) {
  // created_at is SQLite's "YYYY-MM-DD HH:MM:SS" (UTC), which compares as text
  const cutoff = new Date(now.getTime() - DEMO_TTL_HOURS * 60 * 60 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);
  const expired = db.select({ id: games.id }).from(games)
    .where(and(eq(games.isDemo, true), lt(games.createdAt, cutoff)))
    .all();
  for (const { id } of expired) deleteGame(id);
  return expired.length;
}

/** When a demo game will be deleted, as ISO-8601. */
export function demoExpiresAt(game: Game) {
  const created = new Date(game.createdAt.replace(' ', 'T') + 'Z');
  return new Date(created.getTime() + DEMO_TTL_HOURS * 60 * 60 * 1000).toISOString();
}
