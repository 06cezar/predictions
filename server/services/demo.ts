import { and, eq, isNull, lt } from 'drizzle-orm';
import { db } from '../db';
import { games, users, predictions, ratings, outcomes, bonusCategories, bonusVotes } from '../schema';
import { createGame, deleteGame, Game } from './games';
import { generateUniqueToken } from './tokens';
import { loadSnapshot } from './snapshot';

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

/** What the bots predicted about each other, how the others rated it, and whether it came true. */
const BOT_PREDICTIONS: { author: Bot; target: Bot; text: string; ratings: Partial<Record<Bot, number>>; happened: boolean }[] = [
  { author: 'Jordan', target: 'Morgan', text: "Morgan will move to a new city within the year, chasing a dream job they've been quietly researching for months.", ratings: { Casey: 72, River: 65 }, happened: false },
  { author: 'Jordan', target: 'Casey', text: "Casey will finally start that creative project they keep mentioning, and it'll actually be really good.", ratings: { Morgan: 88, River: 45 }, happened: true },
  { author: 'Jordan', target: 'River', text: 'River will adopt a pet. Probably a cat, but could be something more unexpected.', ratings: { Morgan: 30, Casey: 55 }, happened: true },
  { author: 'Morgan', target: 'Jordan', text: 'Jordan will get a promotion or a significant raise this year; their hard work is finally being noticed.', ratings: { Casey: 80, River: 75 }, happened: true },
  { author: 'Morgan', target: 'Casey', text: "Casey will go on a trip to a country they've never visited before, probably somewhere in Asia.", ratings: { Jordan: 60, River: 70 }, happened: false },
  { author: 'Morgan', target: 'River', text: 'River will pick up a completely new hobby that surprises everyone, something physical.', ratings: { Jordan: 35, Casey: 42 }, happened: true },
  { author: 'Casey', target: 'Jordan', text: 'Jordan will start meditating or doing some kind of mindfulness practice by the end of the year.', ratings: { Morgan: 25, River: 30 }, happened: true },
  { author: 'Casey', target: 'Morgan', text: 'Morgan will publish something: a blog post, an article, or maybe even start a newsletter.', ratings: { Jordan: 90, River: 85 }, happened: false },
  { author: 'Casey', target: 'River', text: "River will finally read that giant book that's been sitting on their shelf for two years.", ratings: {}, happened: true },
  { author: 'River', target: 'Jordan', text: 'Jordan will learn to cook a new cuisine and become obsessed with it for at least three months.', ratings: { Morgan: 50, Casey: 62 }, happened: false },
  { author: 'River', target: 'Morgan', text: 'Morgan will cut their working hours and start taking weekends seriously again.', ratings: { Jordan: 78, Casey: 68 }, happened: true },
  { author: 'River', target: 'Casey', text: "Casey will reconnect with an old friend they haven't spoken to in years.", ratings: {}, happened: true },
];

/**
 * What the bots predict about the visitor, for them to mark in the reveal.
 * Written without a subject or pronouns, so they read right whatever the
 * visitor is called (the card already says who it's about).
 */
const ABOUT_VISITOR: { author: Bot; text: string; ratings: Partial<Record<Bot, number>> }[] = [
  { author: 'Jordan', text: 'Will jump into the pool in the freezing cold.', ratings: { Morgan: 30, Casey: 25 } },
  { author: 'Morgan', text: 'Will start a podcast and quit after two episodes.', ratings: { Jordan: 70, River: 65 } },
  { author: 'Casey', text: 'Will run a half marathon and post the medal everywhere.', ratings: { Jordan: 20, Morgan: 15 } },
  { author: 'River', text: 'Will learn to bake proper sourdough and bring it to every party.', ratings: { Casey: 55, Morgan: 47 } },
];

/**
 * How each bot treats the visitor's predictions. Ratings start from a score
 * derived from the prediction's text (the same text always gets the same
 * score), shifted by the bot's mood; in the reveal, each bot confirms or
 * denies what the visitor predicted about them.
 */
const PERSONALITY: Record<Bot, { ratingShift: number; confirms: boolean }> = {
  Jordan: { ratingShift: 15, confirms: true },   // optimist
  Morgan: { ratingShift: -15, confirms: false }, // skeptic, never admits anything
  Casey: { ratingShift: 5, confirms: true },
  River: { ratingShift: -5, confirms: true },
};

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
  for (const p of ABOUT_VISITOR) addPrediction(bot[p.author], visitor.id, p.text, p.ratings);

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

const isBot = (name: string): name is Bot => name in PERSONALITY;

/** FNV-1a: a small, stable string hash. */
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** How likely a bot thinks one of the visitor's predictions is (0-100). */
export function botRating(bot: Bot, text: string) {
  const base = 5 + (hash(text.trim().toLowerCase()) % 91);
  return Math.max(0, Math.min(100, base + PERSONALITY[bot].ratingShift));
}

const BOT_OUTCOMES = new Map(BOT_PREDICTIONS.map(p => [`${p.author}->${p.target}`, p.happened]));

function demoPlayers(game: Game) {
  return db.select().from(users).where(eq(users.gameId, game.id)).all();
}

/**
 * When a demo leaves the submission phase the bots finish their part: each
 * rates every prediction the visitor wrote that isn't about that bot.
 */
export function botsFinishSubmission(game: Game) {
  const players = demoPlayers(game);
  const bots = players.filter(u => !u.isAdmin && isBot(u.name));
  const visitorIds = new Set(players.filter(u => u.isAdmin).map(u => u.id));
  const visitorPredictions = db.select().from(predictions).where(eq(predictions.gameId, game.id)).all()
    .filter(p => visitorIds.has(p.authorId));

  for (const p of visitorPredictions) {
    const rated = new Set(db.select({ userId: ratings.userId }).from(ratings)
      .where(eq(ratings.predictionId, p.id)).all().map(r => r.userId));
    for (const b of bots) {
      if (b.id === p.targetId || rated.has(b.id)) continue;
      db.insert(ratings).values({ predictionId: p.id, userId: b.id, score: botRating(b.name as Bot, p.currentText) }).run();
    }
  }
}

/**
 * Bots can't click, so when a demo reaches the reveal they mark every
 * unmarked prediction about themselves: their own predictions as scripted,
 * the visitor's according to each bot's personality.
 */
export function botsMarkOutcomes(game: Game) {
  const players = new Map(demoPlayers(game).map(u => [u.id, u]));
  const unmarked = db.select({ id: predictions.id, authorId: predictions.authorId, targetId: predictions.targetId })
    .from(predictions)
    .innerJoin(users, eq(users.id, predictions.targetId))
    .leftJoin(outcomes, eq(outcomes.predictionId, predictions.id))
    .where(and(eq(predictions.gameId, game.id), eq(users.isAdmin, false), isNull(outcomes.id)))
    .all();

  for (const p of unmarked) {
    const author = players.get(p.authorId)!;
    const target = players.get(p.targetId)!;
    const happened = author.isAdmin
      ? (isBot(target.name) ? PERSONALITY[target.name].confirms : true)
      : (BOT_OUTCOMES.get(`${author.name}->${target.name}`) ?? true);
    db.insert(outcomes).values({ predictionId: p.id, happened, markedBy: p.targetId }).run();
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

/** Where a player is in the demo round, for the step-by-step guide. */
export function demoProgress(game: Game, userId: number) {
  const g = loadSnapshot(game.id);
  const myTargets = new Set(g.predictions.filter(p => p.authorId === userId).map(p => p.targetId));
  const toRate = g.predictions.filter(p => p.authorId !== userId && p.targetId !== userId && myTargets.has(p.targetId));
  const myRatings = new Set(g.allRatings.filter(r => r.userId === userId).map(r => r.predictionId));
  const aboutMe = g.predictions.filter(p => p.targetId === userId);
  return {
    phase: game.currentPhase,
    written: myTargets.size,
    writeTotal: g.users.length - 1,
    rated: toRate.filter(p => myRatings.has(p.id)).length,
    rateTotal: toRate.length,
    marked: aboutMe.filter(p => g.outcome(p.id)?.happened != null).length,
    markTotal: aboutMe.length,
    expiresAt: demoExpiresAt(game),
  };
}
