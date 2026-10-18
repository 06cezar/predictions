import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import * as schema from '../server/schema';
import { setupTestDb, createGame, createUser, createTestApp, setPhase } from './helpers';

describe('Creating and joining games', () => {
  let app: ReturnType<typeof createTestApp>;
  let db: ReturnType<typeof setupTestDb>['db'];

  beforeEach(() => {
    ({ db } = setupTestDb());
    app = createTestApp();
  });

  describe('POST /api/games', () => {
    it('creates a game and logs the creator in as its admin', async () => {
      const agent = request.agent(app);
      const res = await agent.post('/api/games').send({ gameName: 'Class of 2026', playerName: 'Ana' });

      expect(res.status).toBe(200);
      expect(res.body.token).toMatch(/^[a-z]+-[a-z]+-\d{4}$/);
      expect(res.body.game).toMatchObject({ name: 'Class of 2026', joinCode: expect.stringMatching(/^[A-Z2-9]{6}$/) });

      const me = await agent.get('/api/users/me');
      expect(me.body).toMatchObject({ name: 'Ana', isAdmin: true, game: { name: 'Class of 2026', isDemo: false } });
      const settings = await agent.get('/api/admin/settings');
      expect(settings.body).toMatchObject({ currentPhase: 'submission', openJoin: true });
    });

    it('lets the creator pick their own token', async () => {
      const res = await request(app)
        .post('/api/games')
        .send({ gameName: 'G', playerName: 'Ana', token: 'my-own-token' });
      expect(res.body.token).toBe('my-own-token');
      const login = await request(app).post('/api/auth/login').send({ token: 'my-own-token' });
      expect(login.body.user).toMatchObject({ name: 'Ana', isAdmin: true });
    });

    it('requires a game name and a player name', async () => {
      expect((await request(app).post('/api/games').send({ gameName: 'G' })).status).toBe(400);
      expect((await request(app).post('/api/games').send({ playerName: 'Ana' })).status).toBe(400);
      expect((await request(app).post('/api/games').send({ gameName: '  ', playerName: 'Ana' })).status).toBe(400);
    });

    it("refuses a token that is taken, rotating it so it can't be used", async () => {
      const bob = createUser(db, 'Bob', 'token-bob');
      const res = await request(app).post('/api/games').send({ gameName: 'G', playerName: 'Eve', token: 'token-bob' });

      expect(res.status).toBe(409);
      expect(db.select().from(schema.users).where(eq(schema.users.id, bob.id)).get()!.token).not.toBe('token-bob');
      expect(db.select().from(schema.games).all()).toHaveLength(1);
    });
  });

  describe('joining with a code', () => {
    let game: ReturnType<typeof createGame>;

    beforeEach(() => {
      game = createGame(db, 'Friends', { joinCode: 'ABC234' });
      createUser(db, 'Host', 'token-host', true, game.id);
    });

    it('shows which game a code belongs to, in any letter case', async () => {
      const res = await request(app).get('/api/games/join/abc234');
      expect(res.body).toEqual({ name: 'Friends', currentPhase: 'submission', openJoin: true });
    });

    it('answers 404 for an unknown code', async () => {
      expect((await request(app).get('/api/games/join/ZZZZZZ')).status).toBe(404);
      expect((await request(app).post('/api/games/join/ZZZZZZ').send({ name: 'Eve' })).status).toBe(404);
    });

    it('creates a player in that game and logs them in', async () => {
      const agent = request.agent(app);
      const res = await agent.post('/api/games/join/ABC234').send({ name: 'Eve' });

      expect(res.status).toBe(200);
      expect(res.body.game).toEqual({ id: game.id, name: 'Friends' });
      const players = await agent.get('/api/users');
      expect(players.body.map((u: any) => u.name)).toEqual(['Host']);

      const login = await request(app).post('/api/auth/login').send({ token: res.body.token });
      expect(login.body.user).toMatchObject({ name: 'Eve', isAdmin: false });
    });

    it('requires a name', async () => {
      expect((await request(app).post('/api/games/join/ABC234').send({})).status).toBe(400);
    });

    it('is refused when the admin closed open joining', async () => {
      db.update(schema.games).set({ openJoin: false }).where(eq(schema.games.id, game.id)).run();
      const res = await request(app).post('/api/games/join/ABC234').send({ name: 'Eve' });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/invite-only/);
    });

    it('is refused once the game has moved past submission', async () => {
      setPhase(db, 'reveal', {}, game.id);
      const res = await request(app).post('/api/games/join/ABC234').send({ name: 'Eve' });
      expect(res.status).toBe(403);
    });

    it("refuses a token that is taken and alerts the owner's admins", async () => {
      const res = await request(app).post('/api/games/join/ABC234').send({ name: 'Eve', token: 'token-host' });
      expect(res.status).toBe(409);

      const host = db.select().from(schema.users).where(eq(schema.users.name, 'Host')).get()!;
      expect(host.token).not.toBe('token-host');
      const notes = db.select().from(schema.notifications).where(eq(schema.notifications.userId, host.id)).all();
      expect(JSON.parse(notes[0].meta!).message).toContain('conflict with Eve (join code)');
    });

    it('lets the admin regenerate the code, which retires the old one', async () => {
      const admin = request.agent(app);
      await admin.post('/api/auth/login').send({ token: 'token-host' });
      const { body } = await admin.post('/api/admin/join-code/regenerate');

      expect(body.joinCode).not.toBe('ABC234');
      expect((await request(app).get('/api/games/join/ABC234')).status).toBe(404);
      expect((await request(app).get(`/api/games/join/${body.joinCode}`)).status).toBe(200);
    });

    it('lets the admin rename the game and close joining', async () => {
      const admin = request.agent(app);
      await admin.post('/api/auth/login').send({ token: 'token-host' });
      const res = await admin.put('/api/admin/settings').send({ name: 'Old Friends', openJoin: false });
      expect(res.body).toMatchObject({ name: 'Old Friends', openJoin: false });
    });
  });
});
