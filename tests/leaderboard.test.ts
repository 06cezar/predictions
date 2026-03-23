import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import {
  setupTestDb,
  createUser,
  createPrediction,
  createRating,
  createOutcome,
  createTestApp,
  loginAs,
  setPhase,
} from './helpers';

describe('Leaderboard route', () => {
  let app: ReturnType<typeof createTestApp>;
  let db: ReturnType<typeof setupTestDb>['db'];

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    app = createTestApp();
  });

  it('GET /api/leaderboard requires auth → 401', async () => {
    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(401);
  });

  it('GET /api/leaderboard returns ranked list', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    for (const entry of res.body) {
      expect(entry).toHaveProperty('rank');
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('score');
      expect(entry).toHaveProperty('weightedScore');
    }
  });

  it('Leaderboard ranks reflect marked outcomes', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'reveal');

    // Alice writes predictions about Bob and Charlie
    const pred1 = createPrediction(db, alice.id, bob.id, 'Bob will succeed');
    const pred2 = createPrediction(db, alice.id, charlie.id, 'Charlie will not succeed');

    // Charlie writes prediction about Bob
    const pred3 = createPrediction(db, charlie.id, bob.id, 'Bob will also succeed');

    // pred1 (Alice's) → happened → Alice gets 1 point
    createOutcome(db, pred1.id, true, bob.id);
    // pred3 (Charlie's) → happened → Charlie gets 1 point
    createOutcome(db, pred3.id, true, bob.id);
    // pred2 (Alice's about Charlie) → did NOT happen → no points
    createOutcome(db, pred2.id, false, charlie.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.get('/api/leaderboard');
    expect(res.status).toBe(200);

    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    const charlieEntry = res.body.find((e: any) => e.name === 'Charlie');
    const bobEntry = res.body.find((e: any) => e.name === 'Bob');

    // Alice and Charlie each have 1 correct prediction, Bob has none
    expect(aliceEntry.score).toBe(1);
    expect(charlieEntry.score).toBe(1);
    expect(bobEntry.score).toBe(0);
  });

  it('Leaderboard weighted scores incorporate ratings', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'reveal');

    // Alice writes prediction about Bob, Charlie rates it 80, it happened → Alice gets credit
    const pred1 = createPrediction(db, alice.id, bob.id, 'Bob will succeed');
    createRating(db, pred1.id, charlie.id, 80);
    createOutcome(db, pred1.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.get('/api/leaderboard');
    expect(res.status).toBe(200);

    // Alice (author) gets the score, not Bob (target)
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.score).toBe(1);
    // avg=80 >= threshold(40) → bonus=1.0, no edits → weightedScore=1.0
    expect(aliceEntry.weightedScore).toBe(1.0);
  });

  it('Leaderboard entries have correct rank ordering', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'reveal');

    // Two predictions about Bob, both happened
    const pred1 = createPrediction(db, alice.id, bob.id, 'Bob will succeed');
    const pred2 = createPrediction(db, charlie.id, bob.id, 'Bob will also succeed');
    createOutcome(db, pred1.id, true, bob.id);
    createOutcome(db, pred2.id, true, bob.id);

    // One prediction about Charlie, happened
    const pred3 = createPrediction(db, alice.id, charlie.id, 'Charlie will succeed');
    createOutcome(db, pred3.id, true, charlie.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.get('/api/leaderboard');
    expect(res.status).toBe(200);

    const ranks = res.body.map((e: any) => e.rank);
    // Ranks should be sequential and start at 1
    expect(ranks[0]).toBe(1);
    expect(ranks[1]).toBe(2);
    expect(ranks[2]).toBe(3);

    // Alice should be rank 1 (wrote 2 predictions that happened: pred1 + pred3)
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.rank).toBe(1);
    expect(aliceEntry.score).toBe(2);
  });
});
