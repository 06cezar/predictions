import { sqliteTable, integer, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/** A game is one group of players and its settings (phase, deadlines, rules). */
export const games = sqliteTable('games', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  joinCode: text('join_code').notNull().unique(),
  openJoin: integer('open_join', { mode: 'boolean' }).notNull().default(true),
  isDemo: integer('is_demo', { mode: 'boolean' }).notNull().default(false),
  currentPhase: text('current_phase', { enum: ['submission', 'reveal', 'done'] }).notNull().default('submission'),
  submissionDeadline: text('submission_deadline'),
  revealDeadline: text('reveal_deadline'),
  ratingThreshold: integer('rating_threshold').notNull().default(50),
  autoAdvancePhase: integer('auto_advance_phase', { mode: 'boolean' }).notNull().default(true),
  adminOverride: integer('admin_override', { mode: 'boolean' }).notNull().default(false),
  anonymousPredictions: integer('anonymous_predictions', { mode: 'boolean' }).notNull().default(true),
  bonusActive: integer('bonus_active', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  gameId: integer('game_id').notNull().references(() => games.id),
  name: text('name').notNull(),
  token: text('token').notNull().unique(),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const predictions = sqliteTable('predictions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  gameId: integer('game_id').notNull().references(() => games.id),
  authorId: integer('author_id').notNull().references(() => users.id),
  targetId: integer('target_id').notNull().references(() => users.id),
  currentText: text('current_text').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  forgivenEdits: integer('forgiven_edits').notNull().default(0),
});

export const predictionHistory = sqliteTable('prediction_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  predictionId: integer('prediction_id').notNull().references(() => predictions.id),
  oldText: text('old_text').notNull(),
  editedAt: text('edited_at').notNull().default(sql`(datetime('now'))`),
});

export const ratings = sqliteTable('ratings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  predictionId: integer('prediction_id').notNull().references(() => predictions.id),
  userId: integer('user_id').notNull().references(() => users.id),
  score: integer('score').notNull(), // 0-100
}, (table) => ({
  uniqueRating: uniqueIndex('unique_rating').on(table.predictionId, table.userId),
}));

export const outcomes = sqliteTable('outcomes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  predictionId: integer('prediction_id').notNull().references(() => predictions.id),
  happened: integer('happened', { mode: 'boolean' }),
  markedBy: integer('marked_by').notNull().references(() => users.id),
  markedAt: text('marked_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  uniqueOutcome: uniqueIndex('unique_outcome').on(table.predictionId),
}));

export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  type: text('type').notNull(), // 'prediction_about_you' | 'outcome_marked'
  authorId: integer('author_id').references(() => users.id),
  meta: text('meta'), // JSON string for extra data
  read: integer('read', { mode: 'boolean' }).notNull().default(false),
  dismissed: integer('dismissed', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const bonusCategories = sqliteTable('bonus_categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  gameId: integer('game_id').notNull().references(() => games.id),
  name: text('name').notNull(),
  points: integer('points').notNull().default(5),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const bonusVotes = sqliteTable('bonus_votes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  categoryId: integer('category_id').notNull().references(() => bonusCategories.id),
  voterId: integer('voter_id').notNull().references(() => users.id),
  nomineeId: integer('nominee_id').notNull().references(() => users.id),
  rank: integer('rank').notNull(), // 1, 2, 3
}, (table) => ({
  uniqueVoteSlot: uniqueIndex('unique_vote_slot').on(table.categoryId, table.voterId, table.rank),
}));

export const blockedTokens = sqliteTable('blocked_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  token: text('token').notNull().unique(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const inviteLinks = sqliteTable('invite_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  gameId: integer('game_id').notNull().references(() => games.id),
  code: text('code').notNull().unique(),
  createdBy: integer('created_by').notNull().references(() => users.id),
  usedBy: integer('used_by').references(() => users.id),
  usedAt: text('used_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
