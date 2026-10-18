import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { setupTestDb, createUser, createPrediction, createRating, createTestApp, loginAs, setPhase } from './helpers';

describe('Ratings routes', () => {
  let app: ReturnType<typeof createTestApp>;
  let db: ReturnType<typeof setupTestDb>['db'];

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    app = createTestApp();
  });

  it('POST /api/ratings creates a rating', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    const pred = createPrediction(db, alice.id, bob.id, 'Bob will succeed');

    // Charlie rates the prediction
    const charlieAgent = request.agent(app);
    await loginAs(charlieAgent, 'token-charlie');

    const res = await charlieAgent.post('/api/ratings').send({
      prediction_id: pred.id,
      score: 75,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/ratings updates existing rating (upsert)', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    const pred = createPrediction(db, alice.id, bob.id, 'Bob will succeed');
    // Charlie must have written a prediction for Bob to see it in to-rate
    createPrediction(db, charlie.id, bob.id, 'Bob will also succeed');
    createRating(db, pred.id, charlie.id, 50); // Existing rating

    const charlieAgent = request.agent(app);
    await loginAs(charlieAgent, 'token-charlie');

    // Update to a new score
    const res = await charlieAgent.post('/api/ratings').send({
      prediction_id: pred.id,
      score: 90,
    });

    expect(res.status).toBe(200);

    // Verify via to-rate endpoint that myRating was updated
    const toRateRes = await charlieAgent.get('/api/predictions/to-rate');
    const ratedPred = toRateRes.body.find((p: any) => p.id === pred.id);
    expect(ratedPred.myRating).toBe(90);
  });

  it('Score of 101 → 400 Bad Request', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    const pred = createPrediction(db, alice.id, bob.id, 'Bob will succeed');

    const charlieAgent = request.agent(app);
    await loginAs(charlieAgent, 'token-charlie');

    const res = await charlieAgent.post('/api/ratings').send({
      prediction_id: pred.id,
      score: 101,
    });

    expect(res.status).toBe(400);
  });

  it('Score of -1 → 400 Bad Request', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    const pred = createPrediction(db, alice.id, bob.id, 'Bob will succeed');

    const charlieAgent = request.agent(app);
    await loginAs(charlieAgent, 'token-charlie');

    const res = await charlieAgent.post('/api/ratings').send({
      prediction_id: pred.id,
      score: -1,
    });

    expect(res.status).toBe(400);
  });

  it('Score of 0 is valid', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    const pred = createPrediction(db, alice.id, bob.id, 'Bob will succeed');

    const charlieAgent = request.agent(app);
    await loginAs(charlieAgent, 'token-charlie');

    const res = await charlieAgent.post('/api/ratings').send({
      prediction_id: pred.id,
      score: 0,
    });

    expect(res.status).toBe(200);
  });

  it('Score of 100 is valid', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    const pred = createPrediction(db, alice.id, bob.id, 'Bob will succeed');

    const charlieAgent = request.agent(app);
    await loginAs(charlieAgent, 'token-charlie');

    const res = await charlieAgent.post('/api/ratings').send({
      prediction_id: pred.id,
      score: 100,
    });

    expect(res.status).toBe(200);
  });

  it('Cannot rate your own prediction → 403', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');

    // Alice writes prediction about Bob
    const pred = createPrediction(db, alice.id, bob.id, 'Bob will succeed');

    // Alice tries to rate her own prediction
    const aliceAgent = request.agent(app);
    await loginAs(aliceAgent, 'token-alice');

    const res = await aliceAgent.post('/api/ratings').send({
      prediction_id: pred.id,
      score: 50,
    });

    expect(res.status).toBe(403);
  });

  it('Cannot rate a prediction about yourself → 403', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');

    // Alice writes prediction about Bob
    const pred = createPrediction(db, alice.id, bob.id, 'Bob will succeed');

    // Bob tries to rate a prediction about himself
    const bobAgent = request.agent(app);
    await loginAs(bobAgent, 'token-bob');

    const res = await bobAgent.post('/api/ratings').send({
      prediction_id: pred.id,
      score: 50,
    });

    expect(res.status).toBe(403);
  });

  it('Cannot rate during reveal phase → 403', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');
    const pred = createPrediction(db, alice.id, bob.id, 'Bob will succeed');
    setPhase(db, 'reveal');

    const charlieAgent = request.agent(app);
    await loginAs(charlieAgent, 'token-charlie');

    const res = await charlieAgent.post('/api/ratings').send({ prediction_id: pred.id, score: 50 });
    expect(res.status).toBe(403);
  });

  it('Cannot rate during done phase → 403', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');
    const pred = createPrediction(db, alice.id, bob.id, 'Bob will succeed');
    setPhase(db, 'done');

    const charlieAgent = request.agent(app);
    await loginAs(charlieAgent, 'token-charlie');

    const res = await charlieAgent.post('/api/ratings').send({ prediction_id: pred.id, score: 50 });
    expect(res.status).toBe(403);
  });

  it('POST /api/ratings requires auth', async () => {
    const res = await request(app).post('/api/ratings').send({ prediction_id: 1, score: 50 });
    expect(res.status).toBe(401);
  });

  it('POST /api/ratings with missing fields → 400', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.post('/api/ratings').send({ score: 50 }); // missing prediction_id
    expect(res.status).toBe(400);
  });

  it('Rating a non-existent prediction → 404', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.post('/api/ratings').send({ prediction_id: 9999, score: 50 });
    expect(res.status).toBe(404);
  });
});
