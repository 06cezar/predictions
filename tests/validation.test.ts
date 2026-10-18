import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import * as schema from '../server/schema';
import { setupTestDb, createUser, createTestApp, loginAs, setPhase, DEFAULT_GAME_ID } from './helpers';

/** Bad input gets a clear 4xx answer and never corrupts a game. */
describe('Input validation and error responses', () => {
  let app: ReturnType<typeof createTestApp>;
  let db: ReturnType<typeof setupTestDb>['db'];
  let sqlite: ReturnType<typeof setupTestDb>['sqlite'];

  beforeEach(() => {
    ({ db, sqlite } = setupTestDb());
    app = createTestApp();
  });

  async function asAdmin() {
    createUser(db, 'Admin', 'token-admin', true);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');
    return agent;
  }

  const game = () => db.select().from(schema.games).where(eq(schema.games.id, DEFAULT_GAME_ID)).get()!;

  describe('API errors are JSON', () => {
    it('unknown API routes answer 404 JSON', async () => {
      const res = await request(app).get('/api/no-such-thing');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Not found' });
    });

    it('malformed JSON answers 400 JSON', async () => {
      const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"token":');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Malformed JSON' });
    });

    it('unexpected errors answer 500 without internals', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const agent = await asAdmin();
      sqlite.exec('DROP TABLE bonus_votes; DROP TABLE bonus_categories');
      const res = await agent.get('/api/admin/export/game.json');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Something went wrong' });
    });
  });

  describe('PUT /api/admin/settings', () => {
    it('does not change the phase (that goes through /phase, with notifications)', async () => {
      const agent = await asAdmin();
      const res = await agent.put('/api/admin/settings').send({ currentPhase: 'banana', ratingThreshold: 70 });
      expect(res.status).toBe(200);
      expect(game()).toMatchObject({ currentPhase: 'submission', ratingThreshold: 70 });
    });

    it.each([
      [{ ratingThreshold: 'abc' }, /ratingThreshold/],
      [{ ratingThreshold: 101 }, /ratingThreshold/],
      [{ ratingThreshold: 12.5 }, /ratingThreshold/],
      [{ openJoin: 'yes' }, /openJoin/],
      [{ submissionDeadline: 'next tuesday' }, /submissionDeadline/],
      [{ name: '   ' }, /name/],
    ])('rejects %j', async (body, message) => {
      const agent = await asAdmin();
      const before = game();
      const res = await agent.put('/api/admin/settings').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(message);
      expect(game()).toEqual(before);
    });

    it('accepts clearing a deadline', async () => {
      setPhase(db, 'submission', { submissionDeadline: '2026-11-01T10:00:00.000Z' });
      const agent = await asAdmin();
      await agent.put('/api/admin/settings').send({ submissionDeadline: null });
      expect(game().submissionDeadline).toBeNull();
    });
  });

  describe('names are capped at 40 characters', () => {
    const long = 'x'.repeat(60);

    it('when an admin adds a player', async () => {
      const res = await (await asAdmin()).post('/api/admin/users').send({ name: long });
      expect(res.body.name).toHaveLength(40);
    });

    it('when joining with an invite link', async () => {
      const admin = createUser(db, 'Admin', 'token-admin', true);
      db.insert(schema.inviteLinks)
        .values({ gameId: DEFAULT_GAME_ID, code: 'invite-code1', createdBy: admin.id })
        .run();
      const res = await request(app).post('/api/invite/join/invite-code1').send({ name: long });
      expect(res.body.name).toHaveLength(40);
    });
  });

  describe('bonus voting in small games', () => {
    let categoryId: number;

    beforeEach(() => {
      createUser(db, 'Ana', 'token-ana');
      createUser(db, 'Bob', 'token-bob');
      createUser(db, 'Cleo', 'token-cleo');
      setPhase(db, 'submission', { bonusActive: true });
      categoryId = db
        .insert(schema.bonusCategories)
        .values({ gameId: DEFAULT_GAME_ID, name: 'Most likely to travel' })
        .returning()
        .get().id;
    });

    async function vote(nominees: string[]) {
      const agent = request.agent(app);
      await loginAs(agent, 'token-ana');
      const ids = Object.fromEntries(
        db
          .select()
          .from(schema.users)
          .all()
          .map(u => [u.name, u.id]),
      );
      return agent.post('/api/bonus/vote').send({
        categoryId,
        votes: nominees.map((name, i) => ({ rank: i + 1, nomineeId: ids[name] })),
      });
    }

    it('with three players, each ranks the other two', async () => {
      expect((await vote(['Bob', 'Cleo'])).status).toBe(200);
    });

    it('with three players, asking for three votes is refused', async () => {
      const res = await vote(['Bob', 'Cleo', 'Ana']);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Must submit exactly 2 votes');
    });

    it('with four or more players, a top 3 is still required', async () => {
      createUser(db, 'Dan', 'token-dan');
      expect((await vote(['Bob', 'Cleo'])).status).toBe(400);
      expect((await vote(['Bob', 'Cleo', 'Dan'])).status).toBe(200);
    });
  });
});
