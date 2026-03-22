import { sqliteTable, integer, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  token: text('token').notNull().unique(),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const predictions = sqliteTable('predictions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  authorId: integer('author_id').notNull().references(() => users.id),
  targetId: integer('target_id').notNull().references(() => users.id),
  currentText: text('current_text').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
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
});

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  currentPhase: text('current_phase', { enum: ['submission', 'reveal', 'done'] }).notNull().default('submission'),
  submissionDeadline: text('submission_deadline'),
  revealDeadline: text('reveal_deadline'),
  ratingThreshold: integer('rating_threshold').notNull().default(40),
  autoAdvancePhase: integer('auto_advance_phase', { mode: 'boolean' }).notNull().default(true),
  adminOverride: integer('admin_override', { mode: 'boolean' }).notNull().default(false),
  anonymousPredictions: integer('anonymous_predictions', { mode: 'boolean' }).notNull().default(true),
});
