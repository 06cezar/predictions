import type { Config } from 'drizzle-kit';
export default {
  schema: './server/schema.ts',
  out: './drizzle',
  driver: 'better-sqlite',
  dbCredentials: { url: './predictions.db' },
} satisfies Config;
