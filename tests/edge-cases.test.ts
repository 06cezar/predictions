import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import * as schema from '../server/schema';
import { runScheduledTasks } from '../server/phase-scheduler';
import {
  setupTestDb,
  createUser,
  createPrediction,
  createRating,
  createOutcome,
  createTestApp,
  loginAs,
  setPhase,
  DEFAULT_GAME_ID,
} from './helpers';

/** Edge cases found by probing a running server, each one a past bug. */
describe('Edge cases', () => {
  let app: ReturnType<typeof createTestApp>;
  let db: ReturnType<typeof setupTestDb>['db'];

  beforeEach(() => {
    ({ db } = setupTestDb());
    app = createTestApp();
  });

  async function as(token: string) {
    const agent = request.agent(app);
    await loginAs(agent, token);
    return agent;
  }

  const game = () => db.select().from(schema.games).where(eq(schema.games.id, DEFAULT_GAME_ID)).get()!;
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

  describe('wrongly typed input answers 400, not 500', () => {
    it.each([123, { a: 1 }, ['x']])('login token %j', async token => {
      const res = await request(app).post('/api/auth/login').send({ token });
      expect(res.status).toBe(400);
    });

    it('numeric prediction text', async () => {
      createUser(db, 'Ana', 'token-ana');
      const bob = createUser(db, 'Bob', 'token-bob');
      const res = await (await as('token-ana')).post('/api/predictions').send({ target_id: bob.id, text: 12345 });
      expect(res.status).toBe(400);
    });

    it('a numeric token when joining gets a generated one', async () => {
      db.update(schema.games).set({ openJoin: true }).run();
      const res = await request(app).post(`/api/games/join/${game().joinCode}`).send({ name: 'Cat', token: 42 });
      expect(res.status).toBe(200);
      expect(typeof res.body.token).toBe('string');
    });
  });

  describe('predictions', () => {
    let agent: ReturnType<typeof request.agent>;
    let bobId: number;

    beforeEach(async () => {
      createUser(db, 'Ana', 'token-ana');
      bobId = createUser(db, 'Bob', 'token-bob').id;
      agent = await as('token-ana');
    });

    it('refuses text over 500 characters', async () => {
      const res = await agent.post('/api/predictions').send({ target_id: bobId, text: 'x'.repeat(501) });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/500 characters/);
    });

    it('saving unchanged text is not an edit and keeps the ratings', async () => {
      const carl = createUser(db, 'Carl', 'token-carl');
      const pred = (await agent.post('/api/predictions').send({ target_id: bobId, text: 'Bob learns to surf' })).body;
      createRating(db, pred.id, carl.id, 30);

      const res = await agent.put(`/api/predictions/${pred.id}`).send({ text: '  Bob learns to surf ' });
      expect(res.status).toBe(200);
      expect(db.select().from(schema.predictionHistory).all()).toHaveLength(0);
      expect(db.select().from(schema.ratings).all()).toHaveLength(1);
    });
  });

  describe('outcomes', () => {
    it('refuses a mark without "happened" instead of storing "didn\'t happen"', async () => {
      const ana = createUser(db, 'Ana', 'token-ana');
      const bob = createUser(db, 'Bob', 'token-bob');
      const pred = createPrediction(db, ana.id, bob.id, 'Bob moves abroad');
      setPhase(db, 'reveal');

      const res = await (await as('token-bob')).post('/api/outcomes').send({ prediction_id: pred.id });
      expect(res.status).toBe(400);
      expect(db.select().from(schema.outcomes).all()).toHaveLength(0);
    });
  });

  describe('bonus round', () => {
    let admin: ReturnType<typeof request.agent>;
    let categoryId: number;
    let ids: number[];

    beforeEach(async () => {
      createUser(db, 'Zed', 'token-zed', true);
      ids = ['Ana', 'Bob', 'Cat'].map(n => createUser(db, n, `token-${n.toLowerCase()}`).id);
      admin = await as('token-zed');
      categoryId = (await admin.post('/api/bonus/categories').send({ name: 'Most likely to be famous' })).body.id;
      db.update(schema.games).set({ bonusActive: true }).run();
    });

    const votes = () => ids.map((nomineeId, i) => ({ rank: i + 1, nomineeId }));

    it('voting closes when the game is done, since the results are shown', async () => {
      setPhase(db, 'done');
      const res = await admin.post('/api/bonus/vote').send({ categoryId, votes: votes() });
      expect(res.status).toBe(403);
      expect(db.select().from(schema.bonusVotes).all()).toHaveLength(0);
    });

    it('still accepts votes during the reveal', async () => {
      setPhase(db, 'reveal');
      const res = await admin.post('/api/bonus/vote').send({ categoryId, votes: votes() });
      expect(res.status).toBe(200);
    });

    it('refuses malformed votes', async () => {
      const res = await admin.post('/api/bonus/vote').send({ categoryId, votes: [null, null, null] });
      expect(res.status).toBe(400);
    });

    it.each([['abc'], [-50], [0], [2.5], [1000]])('refuses %j points', async points => {
      const created = await admin.post('/api/bonus/categories').send({ name: 'Other', points });
      const updated = await admin.put(`/api/bonus/categories/${categoryId}`).send({ points });
      expect([created.status, updated.status]).toEqual([400, 400]);
    });

    it('defaults to 5 points', async () => {
      const res = await admin.post('/api/bonus/categories').send({ name: 'Other' });
      expect(res.body.points).toBe(5);
    });
  });

  describe('admin', () => {
    let admin: ReturnType<typeof request.agent>;
    let zedId: number;

    beforeEach(async () => {
      zedId = createUser(db, 'Zed', 'token-zed', true).id;
      admin = await as('token-zed');
    });

    it("can't remove themselves, leaving the game without an admin", async () => {
      const res = await admin.delete(`/api/admin/users/${zedId}`);
      expect(res.status).toBe(400);
      expect((await admin.get('/api/users/me')).status).toBe(200);
    });

    it('CSV exports show formula-like names as text', async () => {
      const evil = createUser(db, '=HYPERLINK("http://x","y")', 'token-evil');
      const ana = createUser(db, 'Ana, Jr', 'token-ana');
      createPrediction(db, evil.id, ana.id, '+1 for this');

      const scores = (await admin.get('/api/admin/export/scores.csv')).text;
      expect(scores).toContain(`"'=HYPERLINK(""http://x"",""y"")"`);
      expect(scores).toContain('"Ana, Jr"');
      const preds = (await admin.get('/api/admin/export/predictions.csv')).text;
      expect(preds).toContain(`"'+1 for this"`);
    });

    it('moving back to a phase whose deadline passed clears it, so the scheduler does not undo the move', async () => {
      setPhase(db, 'reveal', { submissionDeadline: minutesAgo(10), autoAdvancePhase: true });

      const res = await admin.post('/api/admin/phase/set').send({ phase: 'submission' });
      expect(res.body).toMatchObject({ newPhase: 'submission', submissionDeadline: null });

      runScheduledTasks();
      expect(game().currentPhase).toBe('submission');
    });

    it('keeps a deadline that is still ahead', async () => {
      const later = new Date(Date.now() + 60 * 60_000).toISOString();
      setPhase(db, 'reveal', { submissionDeadline: later });
      const res = await admin.post('/api/admin/phase/set').send({ phase: 'submission' });
      expect(res.body.submissionDeadline).toBe(later);
    });
  });

  describe('timestamps saved in two formats', () => {
    // New rows get SQLite's "YYYY-MM-DD HH:MM:SS"; edits store ISO-8601
    it('Last Minute and First to Submit compare the times, not the text', async () => {
      const zed = createUser(db, 'Zed', 'token-zed', true);
      const ana = createUser(db, 'Ana', 'token-ana');
      const edited = createPrediction(db, zed.id, ana.id, 'Ana moves abroad');
      const written = createPrediction(db, ana.id, zed.id, 'Zed adopts a cat');
      const set = (id: number, updatedAt: string) =>
        db.update(schema.predictions).set({ updatedAt }).where(eq(schema.predictions.id, id)).run();
      set(edited.id, '2026-10-17T19:00:00.000Z'); // edited at 19:00
      set(written.id, '2026-10-17 20:00:00'); // written later, at 20:00
      createOutcome(db, written.id, true, zed.id);
      setPhase(db, 'done');

      const admin = await as('token-zed');
      const { lastMinute, firstToSubmit } = (await admin.get('/api/leaderboard/hall-of-fame')).body;
      expect(lastMinute).toMatchObject({ text: 'Zed adopts a cat', updatedAt: '2026-10-17T20:00:00.000Z' });
      expect(firstToSubmit.names).toEqual(['Zed']);
    });
  });
});
