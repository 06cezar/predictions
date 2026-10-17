import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import * as schema from '../server/schema';
import { botRating, createDemoGame, DEMO_TTL_HOURS } from '../server/services/demo';
import { runScheduledTasks } from '../server/phase-scheduler';
import { setupTestDb, createUser, createTestApp, loginAs } from './helpers';

type Agent = ReturnType<typeof request.agent>;

/** The guided demo round: deterministic bots, progress for the guide, and Skip. */
describe('Demo round', () => {
  let app: ReturnType<typeof createTestApp>;
  let db: ReturnType<typeof setupTestDb>['db'];

  beforeEach(() => {
    ({ db } = setupTestDb());
    app = createTestApp();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  async function startDemo(name = 'Ana') {
    const agent = request.agent(app);
    await agent.post('/api/demo').send({ name });
    const players: { id: number; name: string }[] = (await agent.get('/api/users')).body;
    const id = (n: string) => players.find(p => p.name === n)!.id;
    return { agent, id };
  }

  async function predict(agent: Agent, targetId: number, text: string) {
    const res = await agent.post('/api/predictions').send({ target_id: targetId, text });
    expect(res.status).toBe(200);
    return res.body.id as number;
  }

  const outcomeOf = (predictionId: number) =>
    db.select().from(schema.outcomes).where(eq(schema.outcomes.predictionId, predictionId)).get()?.happened ?? null;

  const ratingsOf = (predictionId: number) =>
    db.select({ userId: schema.ratings.userId, score: schema.ratings.score }).from(schema.ratings)
      .where(eq(schema.ratings.predictionId, predictionId)).all();

  it("writes the bots' predictions about the visitor without names or pronouns", async () => {
    const { agent } = await startDemo('Ana');
    await agent.post('/api/demo/skip');
    const aboutMe: { currentText: string }[] = (await agent.get('/api/predictions/about-me')).body;

    expect(aboutMe.map(p => p.currentText)).toContain('Will jump into the pool in the freezing cold.');
    for (const { currentText } of aboutMe) {
      expect(currentText).toMatch(/^Will /);
      expect(currentText).not.toMatch(/\b(Ana|he|she|they|their|them|his|her)\b/i);
    }
  });

  describe('Skip', () => {
    it('from submission: bots rate your predictions, the deadline passes, the reveal starts', async () => {
      const { agent, id } = await startDemo();
      const aboutJordan = await predict(agent, id('Jordan'), 'Jordan opens a bakery');
      const aboutMorgan = await predict(agent, id('Morgan'), 'Morgan learns to surf');

      const res = await agent.post('/api/demo/skip');
      expect(res.status).toBe(200);
      expect(res.body.newPhase).toBe('reveal');
      expect(new Date(res.body.game.submissionDeadline).getTime()).toBeLessThanOrEqual(Date.now());
      expect(new Date(res.body.game.revealDeadline).getTime()).toBeGreaterThan(Date.now());

      // Every bot except the target rates, with its fixed personality
      expect(ratingsOf(aboutJordan).sort((a, b) => a.userId - b.userId)).toEqual([
        { userId: id('Morgan'), score: botRating('Morgan', 'Jordan opens a bakery') },
        { userId: id('Casey'), score: botRating('Casey', 'Jordan opens a bakery') },
        { userId: id('River'), score: botRating('River', 'Jordan opens a bakery') },
      ]);
      // Jordan confirms what you predicted about him; Morgan never admits anything
      expect(outcomeOf(aboutJordan)).toBe(true);
      expect(outcomeOf(aboutMorgan)).toBe(false);

      // The predictions about you are left for you to mark
      const aboutMe = (await agent.get('/api/predictions/about-me')).body;
      expect(aboutMe.every((p: any) => p.outcome === null)).toBe(true);
    });

    it('from reveal: the reveal deadline passes and the results are in', async () => {
      const { agent } = await startDemo();
      await agent.post('/api/demo/skip');
      const res = await agent.post('/api/demo/skip');

      expect(res.body.newPhase).toBe('done');
      expect(new Date(res.body.game.revealDeadline).getTime()).toBeLessThanOrEqual(Date.now());
      expect((await agent.get('/api/leaderboard')).status).toBe(200);
    });

    it('is refused once the round is over', async () => {
      const { agent } = await startDemo();
      await agent.post('/api/demo/skip');
      await agent.post('/api/demo/skip');
      expect((await agent.post('/api/demo/skip')).status).toBe(400);
    });

    it('does not exist outside demo games', async () => {
      createUser(db, 'Admin', 'token-admin', true);
      const agent = request.agent(app);
      await loginAs(agent, 'token-admin');
      expect((await agent.post('/api/demo/skip')).status).toBe(404);
      expect((await agent.get('/api/demo/progress')).status).toBe(404);
    });

    it('is admin-only', async () => {
      const { id } = await startDemo();
      const bot = db.select().from(schema.users).where(eq(schema.users.id, id('Casey'))).get()!;
      const asBot = request.agent(app);
      await loginAs(asBot, bot.token);
      expect((await asBot.post('/api/demo/skip')).status).toBe(403);
    });
  });

  describe('runs on its own if nobody skips', () => {
    const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000);
    const near = (iso: string | null, minutes: number) =>
      Math.abs(Date.parse(iso!) - minutesFromNow(minutes).getTime()) < 60_000;

    it('gives each phase 30 minutes, ending long before the demo is deleted', async () => {
      const { agent } = await startDemo();
      const settings = (await agent.get('/api/admin/settings')).body;
      expect(near(settings.submissionDeadline, 30)).toBe(true);
      expect(near(settings.revealDeadline, 60)).toBe(true);
      expect(60).toBeLessThan(DEMO_TTL_HOURS * 60);
    });

    it('moves to the reveal after 30 minutes and to the results after 60, bots included', async () => {
      const { agent, id } = await startDemo();
      const aboutJordan = await predict(agent, id('Jordan'), 'Jordan opens a bakery');

      runScheduledTasks(minutesFromNow(31));
      expect((await agent.get('/api/demo/progress')).body.phase).toBe('reveal');
      expect(ratingsOf(aboutJordan)).toHaveLength(3);
      expect(outcomeOf(aboutJordan)).toBe(true);

      runScheduledTasks(minutesFromNow(61));
      const progress = (await agent.get('/api/demo/progress')).body;
      expect(progress.phase).toBe('done');
      expect(progress.nextDeadline).toBeNull();
    });

    it('after a skip, the reveal also gets 30 minutes', async () => {
      const { agent } = await startDemo();
      const { game } = (await agent.post('/api/demo/skip')).body;
      expect(near(game.revealDeadline, 30)).toBe(true);
      expect(near((await agent.get('/api/demo/progress')).body.nextDeadline, 30)).toBe(true);
    });

    it('a local seed (not a demo) keeps a month per phase', () => {
      const { game } = createDemoGame({ isDemo: false });
      expect(Date.parse(game.submissionDeadline!)).toBeGreaterThan(Date.now() + 29 * 24 * 3600_000);
    });
  });

  it('reports progress for the step-by-step guide', async () => {
    const { agent, id } = await startDemo();
    const progress = async () => (await agent.get('/api/demo/progress')).body;

    expect(await progress()).toMatchObject({
      phase: 'submission', written: 0, writeTotal: 4, rated: 0, rateTotal: 0, marked: 0, markTotal: 4,
      bonusActive: false, bonusVoted: 0, bonusTotal: 1,
    });

    // The optional bonus round: switch it on, vote in the bots' category
    await agent.post('/api/admin/bonus-active/toggle');
    const { categories } = (await agent.get('/api/bonus')).body;
    await agent.post('/api/bonus/vote').send({
      categoryId: categories[0].id,
      votes: ['Jordan', 'Morgan', 'Casey'].map((name, i) => ({ rank: i + 1, nomineeId: id(name) })),
    });
    expect(await progress()).toMatchObject({ bonusActive: true, bonusVoted: 1 });

    await predict(agent, id('Jordan'), 'Jordan opens a bakery');
    const toRate: { id: number }[] = (await agent.get('/api/predictions/to-rate')).body;
    await agent.post('/api/ratings').send({ prediction_id: toRate[0].id, score: 40 });
    expect(await progress()).toMatchObject({ written: 1, rated: 1, rateTotal: 3 });

    await agent.post('/api/demo/skip');
    const aboutMe = (await agent.get('/api/predictions/about-me')).body;
    await agent.post('/api/outcomes').send({ prediction_id: aboutMe[0].id, happened: true });
    expect(await progress()).toMatchObject({ phase: 'reveal', marked: 1, markTotal: 4 });
  });

  it('plays out identically every time', async () => {
    async function playRound() {
      const { agent, id } = await startDemo('Ana');
      await predict(agent, id('Jordan'), 'Jordan opens a bakery');
      await predict(agent, id('Morgan'), 'Morgan learns to surf');
      await predict(agent, id('Casey'), 'Casey gets a tattoo');
      for (const p of (await agent.get('/api/predictions/to-rate')).body) {
        await agent.post('/api/ratings').send({ prediction_id: p.id, score: 30 });
      }
      await agent.post('/api/demo/skip');
      const aboutMe = (await agent.get('/api/predictions/about-me')).body;
      for (const [i, p] of aboutMe.entries()) {
        await agent.post('/api/outcomes').send({ prediction_id: p.id, happened: i % 2 === 0 });
      }
      await agent.post('/api/demo/skip');
      const board = (await agent.get('/api/leaderboard')).body;
      const star = (await agent.get('/api/leaderboard/star-of-the-show')).body;
      return { board: board.map((e: any) => [e.rank, e.name, e.score, e.weightedScore]), star };
    }

    const first = await playRound();
    expect(first.board).toHaveLength(5);
    expect(await playRound()).toEqual(first);
  });
});
