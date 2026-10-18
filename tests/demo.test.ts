import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import * as schema from '../server/schema';
import { deleteExpiredDemos } from '../server/services/demo';
import { runScheduledTasks } from '../server/phase-scheduler';
import { setupTestDb, createGame, createUser, createTestApp, setPhase, DEFAULT_GAME_ID } from './helpers';

describe('Demo games', () => {
  let app: ReturnType<typeof createTestApp>;
  let db: ReturnType<typeof setupTestDb>['db'];

  beforeEach(() => {
    ({ db } = setupTestDb());
    app = createTestApp();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  async function startDemo(name?: string) {
    const agent = request.agent(app);
    const res = await agent.post('/api/demo').send(name ? { name } : {});
    return { agent, res };
  }

  it('creates a private, ready-to-play game with the visitor as admin', async () => {
    const { agent, res } = await startDemo('Recruiter');

    expect(res.status).toBe(200);
    expect(res.body.game).toMatchObject({ name: 'Demo game', isDemo: true, expiresAt: expect.any(String) });

    const me = await agent.get('/api/users/me');
    expect(me.body).toMatchObject({ name: 'Recruiter', isAdmin: true, game: { isDemo: true } });
    expect(me.body.stats).toEqual({ predictionsWritten: 0, totalTargets: 4, predictionsReceived: 4 });

    const players = await agent.get('/api/users');
    expect(players.body.map((u: any) => u.name)).toEqual(['Jordan', 'Morgan', 'Casey', 'River']);

    const stats = await agent.get('/api/admin/stats');
    expect(stats.body).toMatchObject({ submissionCount: 16, totalUsers: 5 });
  });

  it('calls the visitor "You" when no name is given', async () => {
    const { agent } = await startDemo();
    expect((await agent.get('/api/users/me')).body.name).toBe('You');
  });

  it('gives every demo its own game and its own bot tokens', async () => {
    const first = await startDemo();
    const second = await startDemo();
    expect(first.res.body.game.id).not.toBe(second.res.body.game.id);

    const tokens = db
      .select({ token: schema.users.token })
      .from(schema.users)
      .all()
      .map(u => u.token);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('tells the client when the demo expires', async () => {
    const { agent } = await startDemo();
    const settings = await agent.get('/api/settings');
    expect(settings.body.isDemo).toBe(true);
    expect(new Date(settings.body.demoExpiresAt).getTime()).toBeGreaterThan(Date.now() + 71 * 3600_000);
  });

  it('lets the visitor play it through: bots mark their outcomes at the reveal', async () => {
    const { agent } = await startDemo('Recruiter');
    const players = (await agent.get('/api/users')).body;
    const jordan = players.find((u: any) => u.name === 'Jordan');

    await agent.post('/api/predictions').send({ target_id: jordan.id, text: 'Jordan opens a bakery' });
    await agent.post('/api/admin/phase/advance');

    // Bots marked everything about themselves, the visitor's prediction included...
    const mine = (await agent.get('/api/predictions/mine')).body[0];
    const marked = db.select().from(schema.outcomes).where(eq(schema.outcomes.predictionId, mine.id)).get();
    expect(marked?.happened).not.toBeNull();
    // ...but left the four predictions about the visitor for them to mark
    const aboutMe = (await agent.get('/api/predictions/about-me')).body;
    expect(aboutMe).toHaveLength(4);
    expect(aboutMe.every((p: any) => p.outcome === null)).toBe(true);
    for (const p of aboutMe) {
      expect((await agent.post('/api/outcomes').send({ prediction_id: p.id, happened: true })).status).toBe(200);
    }

    await agent.post('/api/admin/phase/advance');
    const board = (await agent.get('/api/leaderboard')).body;
    expect(board).toHaveLength(5);
    expect((await agent.get('/api/leaderboard/hall-of-fame')).body.mostCourageous).not.toBeNull();
  });
});

describe('Scheduled tasks', () => {
  let db: ReturnType<typeof setupTestDb>['db'];
  const now = new Date('2026-10-17T12:00:00.000Z');
  const sqliteTime = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19);
  const hoursAgo = (h: number) => sqliteTime(new Date(now.getTime() - h * 3600_000));
  const gameIds = () =>
    db
      .select({ id: schema.games.id })
      .from(schema.games)
      .all()
      .map(g => g.id)
      .sort((a, b) => a - b);

  beforeEach(() => {
    ({ db } = setupTestDb());
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('deletes demo games older than 72 hours, with everything in them', () => {
    const old = createGame(db, 'Old demo', { isDemo: true, createdAt: hoursAgo(73) });
    const fresh = createGame(db, 'Fresh demo', { isDemo: true, createdAt: hoursAgo(71) });
    const ancient = createGame(db, 'Real game', { createdAt: hoursAgo(1000) });
    const a = createUser(db, 'A', 'token-a', true, old.id);
    const b = createUser(db, 'B', 'token-b', false, old.id);
    db.insert(schema.predictions).values({ gameId: old.id, authorId: a.id, targetId: b.id, currentText: 'x' }).run();

    expect(deleteExpiredDemos(now)).toBe(1);
    expect(gameIds()).toEqual([DEFAULT_GAME_ID, fresh.id, ancient.id]);
    expect(db.select().from(schema.users).where(eq(schema.users.gameId, old.id)).all()).toEqual([]);
    expect(db.select().from(schema.predictions).all()).toEqual([]);
  });

  it('advances only games whose deadline has passed', () => {
    setPhase(db, 'submission', { submissionDeadline: '2026-10-17T11:00:00.000Z' });
    const later = createGame(db, 'Later', { submissionDeadline: '2026-10-18T11:00:00.000Z' });
    const manual = createGame(db, 'Manual', {
      submissionDeadline: '2026-10-17T11:00:00.000Z',
      autoAdvancePhase: false,
    });
    createUser(db, 'P', 'token-p');

    runScheduledTasks(now);

    const phase = (id: number) => db.select().from(schema.games).where(eq(schema.games.id, id)).get()!.currentPhase;
    expect(phase(DEFAULT_GAME_ID)).toBe('reveal');
    expect(phase(later.id)).toBe('submission');
    expect(phase(manual.id)).toBe('submission');
    expect(db.select().from(schema.notifications).all()).toHaveLength(1);
  });
});
