import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import * as schema from '../server/schema';
import { setupTestDb, createGame, createUser, createPrediction, createTestApp, loginAs, setPhase } from './helpers';

/**
 * Two games share one database. Nothing a player or admin of game A does may
 * read or change game B; ids from B behave as if they did not exist.
 */
describe('Game isolation', () => {
  let app: ReturnType<typeof createTestApp>;
  let db: ReturnType<typeof setupTestDb>['db'];
  let gameB: ReturnType<typeof createGame>;
  let ana: ReturnType<typeof createUser>, bob: ReturnType<typeof createUser>;
  let carl: ReturnType<typeof createUser>, dina: ReturnType<typeof createUser>;
  let predA: ReturnType<typeof createPrediction>, predB: ReturnType<typeof createPrediction>;

  beforeEach(() => {
    ({ db } = setupTestDb());
    app = createTestApp();

    ana = createUser(db, 'Ana', 'token-ana', true);
    bob = createUser(db, 'Bob', 'token-bob');
    gameB = createGame(db, 'Game B');
    carl = createUser(db, 'Carl', 'token-carl', true, gameB.id);
    dina = createUser(db, 'Dina', 'token-dina', false, gameB.id);

    predA = createPrediction(db, ana.id, bob.id, 'Bob moves abroad');
    predB = createPrediction(db, carl.id, dina.id, 'Dina learns piano');
  });

  async function as(token: string) {
    const agent = request.agent(app);
    await loginAs(agent, token);
    return agent;
  }

  const predictionExists = (id: number) =>
    !!db.select().from(schema.predictions).where(eq(schema.predictions.id, id)).get();
  const userExists = (id: number) => !!db.select().from(schema.users).where(eq(schema.users.id, id)).get();

  describe('players', () => {
    it('only see players of their own game', async () => {
      const res = await (await as('token-bob')).get('/api/users');
      expect(res.body.map((u: any) => u.name)).toEqual(['Ana']);
    });

    it('see their own game in /me and /settings', async () => {
      const agent = await as('token-dina');
      expect((await agent.get('/api/users/me')).body.game).toMatchObject({ id: gameB.id, name: 'Game B' });
      expect((await agent.get('/api/settings')).body.gameName).toBe('Game B');
    });

    it('cannot write about a player of another game', async () => {
      const res = await (await as('token-bob')).post('/api/predictions').send({ target_id: dina.id, text: 'Hi' });
      expect(res.status).toBe(404);
    });

    it("cannot edit another game's prediction", async () => {
      const res = await (await as('token-bob')).put(`/api/predictions/${predB.id}`).send({ text: 'Hacked' });
      expect(res.status).toBe(404);
    });

    it("cannot rate another game's prediction", async () => {
      const res = await (await as('token-bob')).post('/api/ratings').send({ prediction_id: predB.id, score: 10 });
      expect(res.status).toBe(404);
    });

    it("cannot mark another game's outcome", async () => {
      setPhase(db, 'reveal');
      const res = await (await as('token-bob')).post('/api/outcomes').send({ prediction_id: predB.id, happened: true });
      expect(res.status).toBe(404);
    });

    it("never get another game's predictions to rate", async () => {
      const cleo = createUser(db, 'Cleo', 'token-cleo');
      createPrediction(db, cleo.id, bob.id, 'Bob gets a dog');
      const res = await (await as('token-ana')).get('/api/predictions/to-rate');
      expect(res.body.map((p: any) => p.currentText)).toEqual(['Bob gets a dog']);
    });

    it('see a leaderboard of their own game only', async () => {
      setPhase(db, 'done');
      const res = await (await as('token-bob')).get('/api/leaderboard');
      expect(res.body.map((e: any) => e.name).sort()).toEqual(['Ana', 'Bob']);
    });

    it("cannot vote in another game's bonus category", async () => {
      setPhase(db, 'submission', { bonusActive: true });
      const cat = db.insert(schema.bonusCategories).values({ gameId: gameB.id, name: 'B only' }).returning().get();
      const cleo = createUser(db, 'Cleo', 'token-cleo');
      const res = await (await as('token-bob')).post('/api/bonus/vote').send({
        categoryId: cat.id,
        votes: [
          { rank: 1, nomineeId: ana.id },
          { rank: 2, nomineeId: cleo.id },
          { rank: 3, nomineeId: dina.id },
        ],
      });
      expect(res.status).toBe(404);
    });
  });

  describe('admins', () => {
    it('list only their own players', async () => {
      const res = await (await as('token-ana')).get('/api/admin/users');
      expect(res.body.map((u: any) => u.name).sort()).toEqual(['Ana', 'Bob']);
    });

    it('cannot edit or delete players of another game', async () => {
      const agent = await as('token-ana');
      expect((await agent.put(`/api/admin/users/${dina.id}`).send({ name: 'X' })).status).toBe(404);
      expect((await agent.delete(`/api/admin/users/${dina.id}`)).status).toBe(404);
      expect(userExists(dina.id)).toBe(true);
    });

    it('cannot delete or forgive edits on predictions of another game', async () => {
      const agent = await as('token-ana');
      await agent.delete(`/api/admin/predictions/${predB.id}`);
      expect(predictionExists(predB.id)).toBe(true);
      expect((await agent.post(`/api/admin/predictions/${predB.id}/forgive-edit`)).status).toBe(404);
    });

    it('only see predictions and stats of their own game', async () => {
      const agent = await as('token-ana');
      expect((await agent.get('/api/admin/predictions')).body.map((p: any) => p.id)).toEqual([predA.id]);
      expect((await agent.get('/api/admin/stats')).body.totalUsers).toBe(2);
    });

    it("cannot change another game's bonus categories or invite links", async () => {
      const cat = db.insert(schema.bonusCategories).values({ gameId: gameB.id, name: 'B only' }).returning().get();
      const link = db
        .insert(schema.inviteLinks)
        .values({ gameId: gameB.id, code: 'game-b-link1', createdBy: carl.id })
        .returning()
        .get();
      const agent = await as('token-ana');
      expect((await agent.put(`/api/bonus/categories/${cat.id}`).send({ name: 'Mine' })).status).toBe(404);
      expect((await agent.delete(`/api/bonus/categories/${cat.id}`)).status).toBe(404);
      expect((await agent.delete(`/api/invite/${link.id}`)).status).toBe(404);
      expect((await agent.get('/api/invite')).body).toEqual([]);
    });

    it('change settings and phase of their own game only', async () => {
      const agent = await as('token-ana');
      await agent.put('/api/admin/settings').send({ name: 'Renamed', ratingThreshold: 70 });
      await agent.post('/api/admin/phase/advance');

      const b = db.select().from(schema.games).where(eq(schema.games.id, gameB.id)).get()!;
      expect(b).toMatchObject({ name: 'Game B', ratingThreshold: 50, currentPhase: 'submission' });
    });

    it('notify only their own players about a phase change', async () => {
      await (await as('token-ana')).post('/api/admin/phase/set').send({ phase: 'reveal' });
      const notified = db
        .select({ userId: schema.notifications.userId })
        .from(schema.notifications)
        .where(eq(schema.notifications.type, 'phase_changed'))
        .all()
        .map(n => n.userId)
        .sort();
      expect(notified).toEqual([ana.id, bob.id].sort());
    });

    it('reset only their own game', async () => {
      await (await as('token-ana')).post('/api/admin/reset');
      expect(predictionExists(predA.id)).toBe(false);
      expect(predictionExists(predB.id)).toBe(true);
    });

    it('export only their own game', async () => {
      const res = await (await as('token-ana')).get('/api/admin/export/game.json');
      expect(res.body.game.id).not.toBe(gameB.id);
      expect(res.body.users.map((u: any) => u.name).sort()).toEqual(['Ana', 'Bob']);
      expect(res.body.predictions.map((p: any) => p.id)).toEqual([predA.id]);
    });

    it('cannot download the raw database file (it holds every game)', async () => {
      const res = await (await as('token-ana')).get('/api/admin/export/db');
      expect(res.status).toBe(404);
    });
  });

  describe('tokens are unique across games', () => {
    it("adding a player with another game's token rotates that token instead of revealing it", async () => {
      const res = await (await as('token-ana')).post('/api/admin/users').send({ name: 'Eve', token: 'token-dina' });
      expect(res.status).toBe(400);

      const rotated = db.select().from(schema.users).where(eq(schema.users.id, dina.id)).get()!;
      expect(rotated.token).not.toBe('token-dina');
      const login = await request(app).post('/api/auth/login').send({ token: 'token-dina' });
      expect(login.status).toBe(401);

      const carlsNotes = db.select().from(schema.notifications).where(eq(schema.notifications.userId, carl.id)).all();
      expect(carlsNotes.map(n => n.type)).toEqual(['token_conflict']);
    });

    it("adding a player with a token from the admin's own game is just refused", async () => {
      const res = await (await as('token-ana')).post('/api/admin/users').send({ name: 'Eve', token: 'token-bob' });
      expect(res.status).toBe(400);
      expect(db.select().from(schema.users).where(eq(schema.users.id, bob.id)).get()!.token).toBe('token-bob');
    });
  });
});
