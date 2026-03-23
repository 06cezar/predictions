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
import { eq } from 'drizzle-orm';
import * as schema from '../server/schema';

describe('Leaderboard scoring rules', () => {
  let app: ReturnType<typeof createTestApp>;
  let db: ReturnType<typeof setupTestDb>['db'];

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    app = createTestApp();
  });

  // threshold=40, tier1=floor(40*0.25)=10, tier2=floor(40*0.5)=20

  it('avg < tier1 (< 10%) → bonus 4.0', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'reveal');
    const pred = createPrediction(db, alice.id, bob.id, 'Bold prediction');
    createRating(db, pred.id, charlie.id, 5); // avg=5 < tier1(10)
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');

    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(4.0);
  });

  it('tier1 <= avg < tier2 (10-20%) → bonus 3.0', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'reveal');
    const pred = createPrediction(db, alice.id, bob.id, 'Unlikely prediction');
    createRating(db, pred.id, charlie.id, 15); // avg=15, tier1(10) <= 15 < tier2(20)
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');

    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(3.0);
  });

  it('tier2 <= avg < threshold (20-40%) → bonus 2.0', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'reveal');
    const pred = createPrediction(db, alice.id, bob.id, 'Below threshold');
    createRating(db, pred.id, charlie.id, 30); // avg=30, tier2(20) <= 30 < threshold(40)
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');

    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(2.0);
  });

  it('avg >= threshold (>= 40%) → bonus 1.0', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'reveal');
    const pred = createPrediction(db, alice.id, bob.id, 'Safe prediction');
    createRating(db, pred.id, charlie.id, 75); // avg=75 >= threshold(40)
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');

    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(1.0);
  });

  it('no ratings → bonus 1.0 fallback', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');

    setPhase(db, 'reveal');
    const pred = createPrediction(db, alice.id, bob.id, 'Unrated prediction');
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');

    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(1.0);
  });

  it('1 edit → penalty 0.5 subtracted from bonus', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'reveal');
    const pred = createPrediction(db, alice.id, bob.id, 'Original');
    // Simulate 1 edit in history
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'Original' }).run();
    createRating(db, pred.id, charlie.id, 30); // bonus=2.0
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');

    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    // 2.0 - 0.5 = 1.5
    expect(aliceEntry.weightedScore).toBe(1.5);
  });

  it('many edits → minimum 0.5, never 0', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'reveal');
    const pred = createPrediction(db, alice.id, bob.id, 'Original');
    // 5 edits → penalty 2.5, bonus=1.0 → would be -1.5 but min is 0.5
    for (let i = 0; i < 5; i++) {
      db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: `v${i}` }).run();
    }
    createRating(db, pred.id, charlie.id, 75); // bonus=1.0
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');

    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(0.5);
  });

  it('prediction that did not come true → 0 points, no bonus/penalty', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'reveal');
    const pred = createPrediction(db, alice.id, bob.id, 'Wrong prediction');
    createRating(db, pred.id, charlie.id, 5); // would be 4.0 bonus if true
    // Simulate 0 edits
    createOutcome(db, pred.id, false, bob.id); // DID NOT HAPPEN

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');

    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.score).toBe(0);
    expect(aliceEntry.weightedScore).toBe(0);
  });

  it('threshold change affects tier boundaries', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    // Change threshold to 80: tier1=20, tier2=40, threshold=80
    db.update(schema.settings).set({ ratingThreshold: 80 }).where(eq(schema.settings.id, 1)).run();
    setPhase(db, 'reveal');

    const pred = createPrediction(db, alice.id, bob.id, 'Mid prediction');
    createRating(db, pred.id, charlie.id, 30); // avg=30: tier2(40) > 30 >= tier1(20) → 3.0 with threshold=80
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');

    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    // With threshold=80: tier1=20, tier2=40. avg=30 is between tier1(20) and tier2(40) → bonus=3.0
    expect(aliceEntry.weightedScore).toBe(3.0);
  });

  it('multiple predictions: weighted scores sum correctly', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');
    const dave = createUser(db, 'Dave', 'token-dave');

    setPhase(db, 'reveal');

    // pred1: avg=5 (< tier1=10) → bonus 4.0, happened
    const pred1 = createPrediction(db, alice.id, bob.id, 'Bold one');
    createRating(db, pred1.id, charlie.id, 5);
    createOutcome(db, pred1.id, true, bob.id);

    // pred2: avg=75 (>= threshold=40) → bonus 1.0, happened
    const pred2 = createPrediction(db, alice.id, charlie.id, 'Safe one');
    createRating(db, pred2.id, dave.id, 75);
    createOutcome(db, pred2.id, true, charlie.id);

    // pred3: didn't happen → 0
    const pred3 = createPrediction(db, alice.id, dave.id, 'Wrong one');
    createRating(db, pred3.id, bob.id, 20);
    createOutcome(db, pred3.id, false, dave.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');

    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.score).toBe(2);         // 2 happened
    expect(aliceEntry.weightedScore).toBe(5.0); // 4.0 + 1.0
  });
});
