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

  // threshold=50, tier1=floor(50*0.25)=12, tier2=floor(50*0.5)=25, tier3=floor(50*0.75)=37

  it('avg < tier1 (< 12%) → bonus 5.0', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Bold prediction');
    createRating(db, pred.id, charlie.id, 5); // avg=5 < tier1(12)
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');

    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(5.0);
  });

  it('tier1 <= avg < tier2 (12-25%) → bonus 4.0', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Unlikely prediction');
    createRating(db, pred.id, charlie.id, 15); // avg=15, tier1(12) <= 15 < tier2(25)
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');

    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(4.0);
  });

  it('tier2 <= avg < tier3 (25-37%) → bonus 3.0', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Below threshold');
    createRating(db, pred.id, charlie.id, 30); // avg=30, tier2(25) <= 30 < tier3(37)
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');

    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(3.0);
  });

  it('avg >= threshold (>= 50%) → bonus 1.0', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Safe prediction');
    createRating(db, pred.id, charlie.id, 75); // avg=75 >= threshold(50)
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

    setPhase(db, 'done');
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

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Original');
    // Simulate 1 edit in history
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'Original' }).run();
    createRating(db, pred.id, charlie.id, 30); // bonus=3.0 (tier2<=30<tier3)
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');

    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    // 3.0 - 0.5 = 2.5
    expect(aliceEntry.weightedScore).toBe(2.5);
  });

  it('many edits → minimum 0.5, never 0', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Original');
    // 5 edits → penalty 2.5, bonus=1.0 → would be -1.5 but min is 0.5
    for (let i = 0; i < 5; i++) {
      db.insert(schema.predictionHistory)
        .values({ predictionId: pred.id, oldText: `v${i}` })
        .run();
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

    setPhase(db, 'done');
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
    db.update(schema.games).set({ ratingThreshold: 80 }).where(eq(schema.games.id, 1)).run();
    setPhase(db, 'done');

    const pred = createPrediction(db, alice.id, bob.id, 'Mid prediction');
    createRating(db, pred.id, charlie.id, 30); // avg=30: tier2(40) > 30 >= tier1(20) → 3.0 with threshold=80
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');

    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    // With threshold=80: tier1=20, tier2=40, tier3=60. avg=30 is between tier1(20) and tier2(40) → bonus=4.0
    expect(aliceEntry.weightedScore).toBe(4.0);
  });

  it('multiple predictions: weighted scores sum correctly', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');
    const dave = createUser(db, 'Dave', 'token-dave');

    setPhase(db, 'done');

    // pred1: avg=5 (< tier1=12) → bonus 5.0, happened
    const pred1 = createPrediction(db, alice.id, bob.id, 'Bold one');
    createRating(db, pred1.id, charlie.id, 5);
    createOutcome(db, pred1.id, true, bob.id);

    // pred2: avg=75 (>= threshold=50) → bonus 1.0, happened
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
    expect(aliceEntry.score).toBe(2); // 2 happened
    expect(aliceEntry.weightedScore).toBe(6.0); // 5.0 + 1.0
  });

  it('forgiven edit removes penalty from score', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Edited prediction');
    // 2 edits
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'v1' }).run();
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'v2' }).run();
    // Forgive 1 edit
    db.update(schema.predictions).set({ forgivenEdits: 1 }).where(eq(schema.predictions.id, pred.id)).run();
    createRating(db, pred.id, charlie.id, 30); // bonus=3.0 (tier2<=30<tier3)
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');

    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    // 2 edits - 1 forgiven = 1 penalized edit → 3.0 - 0.5 = 2.5
    expect(aliceEntry.weightedScore).toBe(2.5);
  });

  it('all edits forgiven → no penalty at all', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Fully forgiven');
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'v1' }).run();
    // Forgive all
    db.update(schema.predictions).set({ forgivenEdits: 1 }).where(eq(schema.predictions.id, pred.id)).run();
    createRating(db, pred.id, charlie.id, 30); // bonus=3.0
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');

    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    // 1 edit - 1 forgiven = 0 penalized → bonus=3.0
    expect(aliceEntry.weightedScore).toBe(3.0);
  });

  // ── Additional tier boundary tests ──────────────────────────────────────

  it('avg exactly at tier1 boundary (12) → bonus 4.0, not 5.0', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Boundary test');
    createRating(db, pred.id, charlie.id, 12); // avg=12, exactly at tier1
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(4.0);
  });

  it('avg exactly at tier2 boundary (25) → bonus 3.0, not 4.0', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Boundary test');
    createRating(db, pred.id, charlie.id, 25);
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(3.0);
  });

  it('avg exactly at tier3 boundary (37) → bonus 2.0, not 3.0', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Boundary test');
    createRating(db, pred.id, charlie.id, 37);
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(2.0);
  });

  it('avg exactly at threshold (50) → bonus 1.0', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Boundary test');
    createRating(db, pred.id, charlie.id, 50);
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(1.0);
  });

  it('avg=0 → bonus 5.0 (lowest possible rating)', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Zero rating');
    createRating(db, pred.id, charlie.id, 0);
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(5.0);
  });

  it('avg=100 → bonus 1.0 (highest possible rating)', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Max rating');
    createRating(db, pred.id, charlie.id, 100);
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(1.0);
  });

  it('multiple ratings averaged correctly', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');
    const dave = createUser(db, 'Dave', 'token-dave');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Multi rated');
    createRating(db, pred.id, charlie.id, 10); // avg of 10 and 20 = 15 → tier1(12)<=15<tier2(25) → 4.0
    createRating(db, pred.id, dave.id, 20);
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(4.0);
  });

  // ── Additional edit penalty tests ───────────────────────────────────────

  it('2 edits → penalty 1.0', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Twice edited');
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'v1' }).run();
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'v2' }).run();
    createRating(db, pred.id, charlie.id, 30); // bonus=3.0
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    // 3.0 - 1.0 = 2.0
    expect(aliceEntry.weightedScore).toBe(2.0);
  });

  it('3 edits → penalty 1.5', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Triple edited');
    for (let i = 0; i < 3; i++) {
      db.insert(schema.predictionHistory)
        .values({ predictionId: pred.id, oldText: `v${i}` })
        .run();
    }
    createRating(db, pred.id, charlie.id, 30); // bonus=3.0
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    // 3.0 - 1.5 = 1.5
    expect(aliceEntry.weightedScore).toBe(1.5);
  });

  it('edits on false prediction → still 0 points (no penalty applies)', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Edited but false');
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'v1' }).run();
    createRating(db, pred.id, charlie.id, 5);
    createOutcome(db, pred.id, false, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.score).toBe(0);
    expect(aliceEntry.weightedScore).toBe(0);
  });

  it('no outcome marked → 0 points', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    createPrediction(db, alice.id, bob.id, 'No outcome');
    // No outcome created

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.score).toBe(0);
    expect(aliceEntry.weightedScore).toBe(0);
  });

  // ── Additional forgive tests ────────────────────────────────────────────

  it('forgive 2 of 3 edits → only 1 penalized', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Triple edit partial forgive');
    for (let i = 0; i < 3; i++) {
      db.insert(schema.predictionHistory)
        .values({ predictionId: pred.id, oldText: `v${i}` })
        .run();
    }
    db.update(schema.predictions).set({ forgivenEdits: 2 }).where(eq(schema.predictions.id, pred.id)).run();
    createRating(db, pred.id, charlie.id, 30); // bonus=3.0
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    // 3 edits - 2 forgiven = 1 penalized → 3.0 - 0.5 = 2.5
    expect(aliceEntry.weightedScore).toBe(2.5);
  });

  it('forgive 3 of 3 edits → no penalty at all', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'All forgiven');
    for (let i = 0; i < 3; i++) {
      db.insert(schema.predictionHistory)
        .values({ predictionId: pred.id, oldText: `v${i}` })
        .run();
    }
    db.update(schema.predictions).set({ forgivenEdits: 3 }).where(eq(schema.predictions.id, pred.id)).run();
    createRating(db, pred.id, charlie.id, 5); // bonus=5.0
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    // 3 edits - 3 forgiven = 0 penalized → full bonus 5.0
    expect(aliceEntry.weightedScore).toBe(5.0);
  });

  it('forgiven edits on false prediction → still 0', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Forgiven but false');
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'v1' }).run();
    db.update(schema.predictions).set({ forgivenEdits: 1 }).where(eq(schema.predictions.id, pred.id)).run();
    createRating(db, pred.id, charlie.id, 5);
    createOutcome(db, pred.id, false, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.score).toBe(0);
    expect(aliceEntry.weightedScore).toBe(0);
  });

  it('many edits with many forgiven → min 0.5 still applies', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Heavy edits');
    for (let i = 0; i < 10; i++) {
      db.insert(schema.predictionHistory)
        .values({ predictionId: pred.id, oldText: `v${i}` })
        .run();
    }
    // Forgive 5, leaving 5 penalized → penalty 2.5, bonus=1.0 → max(0.5, 1.0-2.5) = 0.5
    db.update(schema.predictions).set({ forgivenEdits: 5 }).where(eq(schema.predictions.id, pred.id)).run();
    createRating(db, pred.id, charlie.id, 75); // bonus=1.0
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(0.5);
  });

  it('forgive via admin endpoint works end-to-end', async () => {
    const admin = createUser(db, 'Admin', 'token-admin', true);
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'E2E forgive');
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'v1' }).run();
    createRating(db, pred.id, charlie.id, 30); // bonus=3.0
    createOutcome(db, pred.id, true, bob.id);

    const adminAgent = request.agent(app);
    await loginAs(adminAgent, 'token-admin');

    // Before forgive: 3.0 - 0.5 = 2.5
    let res = await adminAgent.get('/api/leaderboard');
    let aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(2.5);

    // Forgive
    const forgiveRes = await adminAgent.post(`/api/admin/predictions/${pred.id}/forgive-edit`);
    expect(forgiveRes.status).toBe(200);
    expect(forgiveRes.body.forgivenEdits).toBe(1);

    // After forgive: 3.0 - 0 = 3.0
    res = await adminAgent.get('/api/leaderboard');
    aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(3.0);
  });

  it('forgive multiple times via endpoint increments correctly', async () => {
    const admin = createUser(db, 'Admin', 'token-admin', true);
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Multi forgive');
    for (let i = 0; i < 3; i++) {
      db.insert(schema.predictionHistory)
        .values({ predictionId: pred.id, oldText: `v${i}` })
        .run();
    }
    createRating(db, pred.id, charlie.id, 30); // bonus=3.0
    createOutcome(db, pred.id, true, bob.id);

    const adminAgent = request.agent(app);
    await loginAs(adminAgent, 'token-admin');

    // Before: 3 edits → 3.0 - 1.5 = 1.5
    let res = await adminAgent.get('/api/leaderboard');
    expect(res.body.find((e: any) => e.name === 'Alice').weightedScore).toBe(1.5);

    // Forgive 1st: 2 penalized → 3.0 - 1.0 = 2.0
    await adminAgent.post(`/api/admin/predictions/${pred.id}/forgive-edit`);
    res = await adminAgent.get('/api/leaderboard');
    expect(res.body.find((e: any) => e.name === 'Alice').weightedScore).toBe(2.0);

    // Forgive 2nd: 1 penalized → 3.0 - 0.5 = 2.5
    await adminAgent.post(`/api/admin/predictions/${pred.id}/forgive-edit`);
    res = await adminAgent.get('/api/leaderboard');
    expect(res.body.find((e: any) => e.name === 'Alice').weightedScore).toBe(2.5);

    // Forgive 3rd: 0 penalized → 3.0
    await adminAgent.post(`/api/admin/predictions/${pred.id}/forgive-edit`);
    res = await adminAgent.get('/api/leaderboard');
    expect(res.body.find((e: any) => e.name === 'Alice').weightedScore).toBe(3.0);

    // 4th forgive should fail
    const failRes = await adminAgent.post(`/api/admin/predictions/${pred.id}/forgive-edit`);
    expect(failRes.status).toBe(400);
  });

  // ── Mixed scenarios ─────────────────────────────────────────────────────

  it('user with no predictions → score 0, weightedScore 0', async () => {
    createUser(db, 'Alice', 'token-alice');
    createUser(db, 'Bob', 'token-bob');
    setPhase(db, 'done');

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.score).toBe(0);
    expect(aliceEntry.weightedScore).toBe(0);
  });

  it('tier3 <= avg < threshold (37-50%) → bonus 2.0', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Mid-high');
    createRating(db, pred.id, charlie.id, 45); // tier3(37) <= 45 < threshold(50)
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(2.0);
  });

  it('avg=11 → still bonus 5.0 (just below tier1=12)', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Just below tier1');
    createRating(db, pred.id, charlie.id, 11);
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(5.0);
  });

  it('avg=49 → bonus 2.0 (just below threshold=50)', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Just below threshold');
    createRating(db, pred.id, charlie.id, 49);
    createOutcome(db, pred.id, true, bob.id);

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/leaderboard');
    const aliceEntry = res.body.find((e: any) => e.name === 'Alice');
    expect(aliceEntry.weightedScore).toBe(2.0);
  });

  // ── Forgive + Unforgive combined tests ──────────────────────────────────

  it('forgive then unforgive restores original penalty', async () => {
    const admin = createUser(db, 'Admin', 'token-admin', true);
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Forgive undo');
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'v1' }).run();
    createRating(db, pred.id, charlie.id, 30); // bonus=3.0
    createOutcome(db, pred.id, true, bob.id);

    const adminAgent = request.agent(app);
    await loginAs(adminAgent, 'token-admin');

    // Original: 1 edit → 3.0 - 0.5 = 2.5
    let res = await adminAgent.get('/api/leaderboard');
    expect(res.body.find((e: any) => e.name === 'Alice').weightedScore).toBe(2.5);

    // Forgive → 3.0
    await adminAgent.post(`/api/admin/predictions/${pred.id}/forgive-edit`);
    res = await adminAgent.get('/api/leaderboard');
    expect(res.body.find((e: any) => e.name === 'Alice').weightedScore).toBe(3.0);

    // Unforgive → back to 2.5
    await adminAgent.post(`/api/admin/predictions/${pred.id}/unforgive-edit`);
    res = await adminAgent.get('/api/leaderboard');
    expect(res.body.find((e: any) => e.name === 'Alice').weightedScore).toBe(2.5);
  });

  it('forgive all then unforgive one restores one penalty', async () => {
    const admin = createUser(db, 'Admin', 'token-admin', true);
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Partial undo');
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'v1' }).run();
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'v2' }).run();
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'v3' }).run();
    createRating(db, pred.id, charlie.id, 5); // bonus=5.0
    createOutcome(db, pred.id, true, bob.id);

    const adminAgent = request.agent(app);
    await loginAs(adminAgent, 'token-admin');

    // Original: 3 edits → 5.0 - 1.5 = 3.5
    let res = await adminAgent.get('/api/leaderboard');
    expect(res.body.find((e: any) => e.name === 'Alice').weightedScore).toBe(3.5);

    // Forgive all 3
    await adminAgent.post(`/api/admin/predictions/${pred.id}/forgive-edit`);
    await adminAgent.post(`/api/admin/predictions/${pred.id}/forgive-edit`);
    await adminAgent.post(`/api/admin/predictions/${pred.id}/forgive-edit`);
    res = await adminAgent.get('/api/leaderboard');
    expect(res.body.find((e: any) => e.name === 'Alice').weightedScore).toBe(5.0);

    // Unforgive 1 → 2 forgiven, 1 penalized → 5.0 - 0.5 = 4.5
    await adminAgent.post(`/api/admin/predictions/${pred.id}/unforgive-edit`);
    res = await adminAgent.get('/api/leaderboard');
    expect(res.body.find((e: any) => e.name === 'Alice').weightedScore).toBe(4.5);
  });

  it('unforgive on zero forgiven → 400', async () => {
    const admin = createUser(db, 'Admin', 'token-admin', true);
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const pred = createPrediction(db, alice.id, bob.id, 'No forgives');
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'v1' }).run();

    const adminAgent = request.agent(app);
    await loginAs(adminAgent, 'token-admin');

    const res = await adminAgent.post(`/api/admin/predictions/${pred.id}/unforgive-edit`);
    expect(res.status).toBe(400);
  });

  it('unforgive on prediction with no edits → 400', async () => {
    const admin = createUser(db, 'Admin', 'token-admin', true);
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const pred = createPrediction(db, alice.id, bob.id, 'Never edited');

    const adminAgent = request.agent(app);
    await loginAs(adminAgent, 'token-admin');

    const res = await adminAgent.post(`/api/admin/predictions/${pred.id}/unforgive-edit`);
    expect(res.status).toBe(400);
  });

  it('forgive-unforgive-forgive cycle keeps score consistent', async () => {
    const admin = createUser(db, 'Admin', 'token-admin', true);
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');
    const pred = createPrediction(db, alice.id, bob.id, 'Cycle test');
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'v1' }).run();
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'v2' }).run();
    createRating(db, pred.id, charlie.id, 30); // bonus=3.0
    createOutcome(db, pred.id, true, bob.id);

    const adminAgent = request.agent(app);
    await loginAs(adminAgent, 'token-admin');

    // Start: 2 edits → 3.0 - 1.0 = 2.0
    let res = await adminAgent.get('/api/leaderboard');
    expect(res.body.find((e: any) => e.name === 'Alice').weightedScore).toBe(2.0);

    // Forgive 1 → 3.0 - 0.5 = 2.5
    await adminAgent.post(`/api/admin/predictions/${pred.id}/forgive-edit`);
    res = await adminAgent.get('/api/leaderboard');
    expect(res.body.find((e: any) => e.name === 'Alice').weightedScore).toBe(2.5);

    // Unforgive → back to 2.0
    await adminAgent.post(`/api/admin/predictions/${pred.id}/unforgive-edit`);
    res = await adminAgent.get('/api/leaderboard');
    expect(res.body.find((e: any) => e.name === 'Alice').weightedScore).toBe(2.0);

    // Forgive again → 2.5
    await adminAgent.post(`/api/admin/predictions/${pred.id}/forgive-edit`);
    res = await adminAgent.get('/api/leaderboard');
    expect(res.body.find((e: any) => e.name === 'Alice').weightedScore).toBe(2.5);

    // Forgive 2nd → 3.0
    await adminAgent.post(`/api/admin/predictions/${pred.id}/forgive-edit`);
    res = await adminAgent.get('/api/leaderboard');
    expect(res.body.find((e: any) => e.name === 'Alice').weightedScore).toBe(3.0);

    // Unforgive once → 2.5
    await adminAgent.post(`/api/admin/predictions/${pred.id}/unforgive-edit`);
    res = await adminAgent.get('/api/leaderboard');
    expect(res.body.find((e: any) => e.name === 'Alice').weightedScore).toBe(2.5);
  });

  it('multiple predictions: forgive on one does not affect other', async () => {
    const admin = createUser(db, 'Admin', 'token-admin', true);
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    setPhase(db, 'done');

    const pred1 = createPrediction(db, alice.id, bob.id, 'Pred 1');
    db.insert(schema.predictionHistory).values({ predictionId: pred1.id, oldText: 'v1' }).run();
    createRating(db, pred1.id, charlie.id, 30); // bonus=3.0
    createOutcome(db, pred1.id, true, bob.id);

    const pred2 = createPrediction(db, alice.id, charlie.id, 'Pred 2');
    db.insert(schema.predictionHistory).values({ predictionId: pred2.id, oldText: 'v1' }).run();
    createRating(db, pred2.id, bob.id, 30); // bonus=3.0
    createOutcome(db, pred2.id, true, charlie.id);

    const adminAgent = request.agent(app);
    await loginAs(adminAgent, 'token-admin');

    // Both have 1 edit: (3.0-0.5) + (3.0-0.5) = 5.0
    let res = await adminAgent.get('/api/leaderboard');
    expect(res.body.find((e: any) => e.name === 'Alice').weightedScore).toBe(5.0);

    // Forgive only pred1
    await adminAgent.post(`/api/admin/predictions/${pred1.id}/forgive-edit`);
    res = await adminAgent.get('/api/leaderboard');
    // pred1: 3.0 (no penalty), pred2: 2.5 (still penalized) = 5.5
    expect(res.body.find((e: any) => e.name === 'Alice').weightedScore).toBe(5.5);

    // Unforgive pred1 → back to 5.0
    await adminAgent.post(`/api/admin/predictions/${pred1.id}/unforgive-edit`);
    res = await adminAgent.get('/api/leaderboard');
    expect(res.body.find((e: any) => e.name === 'Alice').weightedScore).toBe(5.0);
  });
});
