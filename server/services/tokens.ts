import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db';
import { users, blockedTokens, notifications } from '../schema';
import { randomToken } from '../random';

export const TOKEN_TAKEN = 'That token is already in use - please choose a different one';

export function isTokenAvailable(token: string): boolean {
  if (db.select().from(users).where(eq(users.token, token)).get()) return false;
  if (db.select().from(blockedTokens).where(eq(blockedTokens.token, token)).get()) return false;
  return true;
}

export function generateUniqueToken(): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const token = randomToken();
    if (isTokenAvailable(token)) return token;
  }
  return `user-${nanoid(8)}`;
}

export type TokenClaim = { ok: true; token: string } | { ok: false; error: string };

interface ClaimContext {
  /** Name of the player being created, for the conflict notification. */
  playerName: string;
  /** How they are joining, e.g. "invite link". */
  source: string;
  /** Set when an admin of this game is asking; they can already see their own players' tokens. */
  adminOfGameId?: number;
}

/**
 * Reserve a login token for a new player, generating one if none was requested.
 *
 * Tokens are unique across all games and are the only credential, so being told
 * "taken" would reveal a working login. When a requested token belongs to someone
 * else, that player's token is therefore rotated and the old one blocked, making
 * the knowledge useless, and their game's admins are notified so they can hand
 * out the new token. See docs/invite-links.md.
 */
export function claimToken(requested: unknown, ctx: ClaimContext): TokenClaim {
  const token = typeof requested === 'string' ? requested.trim() : '';
  if (!token) return { ok: true, token: generateUniqueToken() };

  if (db.select().from(blockedTokens).where(eq(blockedTokens.token, token)).get()) {
    return { ok: false, error: TOKEN_TAKEN };
  }

  const existing = db.select().from(users).where(eq(users.token, token)).get();
  if (!existing) return { ok: true, token };
  if (existing.gameId === ctx.adminOfGameId) return { ok: false, error: TOKEN_TAKEN };

  const newToken = generateUniqueToken();
  db.update(users).set({ token: newToken }).where(eq(users.id, existing.id)).run();
  db.insert(blockedTokens).values({ token }).run();

  const admins = db
    .select()
    .from(users)
    .where(and(eq(users.gameId, existing.gameId), eq(users.isAdmin, true)))
    .all();
  for (const admin of admins) {
    db.insert(notifications)
      .values({
        userId: admin.id,
        type: 'token_conflict',
        meta: JSON.stringify({
          message: `${existing.name}'s token was regenerated - conflict with ${ctx.playerName} (${ctx.source})`,
          oldUserName: existing.name,
          newUserName: ctx.playerName,
          oldToken: token,
          newToken,
        }),
      })
      .run();
  }

  return { ok: false, error: TOKEN_TAKEN };
}
