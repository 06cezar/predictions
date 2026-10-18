import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { setupTestDb, createUser, createPrediction, createTestApp, loginAs, setPhase } from './helpers';

describe('Predictions routes', () => {
  let app: ReturnType<typeof createTestApp>;
  let db: ReturnType<typeof setupTestDb>['db'];

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    app = createTestApp();
  });

  // ── Visibility / Permission rules ──────────────────────────────────────────

  it('/api/predictions/to-rate: author cannot see their own prediction', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    // Alice writes a prediction about Bob
    const pred = createPrediction(db, alice.id, bob.id, 'Bob will succeed');
    // Charlie also writes about Bob — so Charlie can see predictions about Bob in to-rate
    createPrediction(db, charlie.id, bob.id, 'Bob will also succeed');

    // Charlie rates — should see Alice's prediction about Bob
    const charlieAgent = request.agent(app);
    await loginAs(charlieAgent, 'token-charlie');
    const charlieRes = await charlieAgent.get('/api/predictions/to-rate');
    expect(charlieRes.status).toBe(200);
    expect(charlieRes.body.length).toBe(1); // only Alice's (not Charlie's own)

    // Alice should NOT see her own prediction in to-rate, but sees Charlie's about Bob
    const aliceAgent = request.agent(app);
    await loginAs(aliceAgent, 'token-alice');
    const aliceRes = await aliceAgent.get('/api/predictions/to-rate');
    expect(aliceRes.status).toBe(200);
    // Alice sees Charlie's pred about Bob (Alice wrote about Bob too), but NOT her own
    const alicePredIds = aliceRes.body.map((p: any) => p.id);
    expect(alicePredIds).not.toContain(pred.id);
  });

  it('/api/predictions/to-rate: target cannot see predictions about them', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    // Alice writes a prediction about Bob
    createPrediction(db, alice.id, bob.id, 'Bob will succeed');
    // Bob writes about Charlie so Bob has targets — but pred1 is about Bob, so he can't rate it
    createPrediction(db, bob.id, charlie.id, 'Charlie will succeed');

    // Bob (the target) should NOT see the prediction about him in to-rate
    const bobAgent = request.agent(app);
    await loginAs(bobAgent, 'token-bob');
    const bobRes = await bobAgent.get('/api/predictions/to-rate');
    expect(bobRes.status).toBe(200);
    expect(bobRes.body.length).toBe(0);
  });

  it('/api/predictions/about-me returns 403 during submission phase', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    // Phase is submission by default
    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');
    const res = await agent.get('/api/predictions/about-me');
    expect(res.status).toBe(403);
  });

  it('/api/predictions/about-me works during reveal phase', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    createPrediction(db, alice.id, bob.id, 'Bob will do great things');
    setPhase(db, 'reveal');

    const bobAgent = request.agent(app);
    await loginAs(bobAgent, 'token-bob');
    const res = await bobAgent.get('/api/predictions/about-me');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].currentText).toBe('Bob will do great things');
  });

  it('/api/predictions/about-me works during done phase', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    createPrediction(db, alice.id, bob.id, 'Bob will do great things');
    setPhase(db, 'done');

    const bobAgent = request.agent(app);
    await loginAs(bobAgent, 'token-bob');
    const res = await bobAgent.get('/api/predictions/about-me');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('Predictions in to-rate are anonymous (no author_id or author name)', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    createPrediction(db, alice.id, bob.id, 'Bob will succeed');
    // Charlie must have written a prediction for Bob to see it in to-rate
    createPrediction(db, charlie.id, bob.id, 'Bob will also succeed');

    const charlieAgent = request.agent(app);
    await loginAs(charlieAgent, 'token-charlie');
    const res = await charlieAgent.get('/api/predictions/to-rate');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);

    const pred = res.body[0];
    expect(pred).not.toHaveProperty('authorId');
    expect(pred).not.toHaveProperty('author_id');
    expect(pred).not.toHaveProperty('authorName');
  });

  // ── POST /api/predictions ───────────────────────────────────────────────────

  it('POST /api/predictions creates a prediction', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.post('/api/predictions').send({ target_id: bob.id, text: 'Bob will be great' });

    expect(res.status).toBe(200);
    expect(res.body.currentText).toBe('Bob will be great');
    expect(res.body.authorId).toBe(alice.id);
    expect(res.body.targetId).toBe(bob.id);
  });

  it('POST /api/predictions returns 409 if prediction already exists for that target', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');

    createPrediction(db, alice.id, bob.id, 'First prediction');

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.post('/api/predictions').send({ target_id: bob.id, text: 'Second prediction' });

    expect(res.status).toBe(409);
  });

  it('POST /api/predictions returns 400 if writing about yourself', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.post('/api/predictions').send({ target_id: alice.id, text: 'I am great' });

    expect(res.status).toBe(400);
  });

  it('POST /api/predictions returns 403 after submission deadline (phase != submission)', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    setPhase(db, 'reveal');

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.post('/api/predictions').send({ target_id: bob.id, text: 'Too late' });

    expect(res.status).toBe(403);
  });

  it('POST /api/predictions allowed with adminOverride even after submission phase', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    setPhase(db, 'reveal', { adminOverride: true });

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.post('/api/predictions').send({ target_id: bob.id, text: 'Override enabled' });

    expect(res.status).toBe(200);
  });

  it('POST /api/predictions requires auth', async () => {
    const res = await request(app).post('/api/predictions').send({ target_id: 1, text: 'test' });
    expect(res.status).toBe(401);
  });

  // ── PUT /api/predictions/:id ───────────────────────────────────────────────

  it('PUT /api/predictions/:id saves old text to history', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const pred = createPrediction(db, alice.id, bob.id, 'Original text');

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.put(`/api/predictions/${pred.id}`).send({ text: 'Updated text' });

    expect(res.status).toBe(200);
    expect(res.body.currentText).toBe('Updated text');

    // Check that history was saved via the /mine route
    const mineRes = await agent.get('/api/predictions/mine');
    expect(mineRes.status).toBe(200);
    const updatedPred = mineRes.body.find((p: any) => p.id === pred.id);
    expect(updatedPred.editCount).toBe(1);
  });

  it('PUT /api/predictions/:id returns 403 if not the author', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    // Alice wrote a prediction about bob
    const pred = createPrediction(db, alice.id, bob.id, 'Original text');

    // Charlie tries to edit it
    const charlieAgent = request.agent(app);
    await loginAs(charlieAgent, 'token-charlie');

    const res = await charlieAgent.put(`/api/predictions/${pred.id}`).send({ text: 'Hijacked text' });

    expect(res.status).toBe(403);
  });

  it('PUT /api/predictions/:id returns 403 after submission deadline', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const pred = createPrediction(db, alice.id, bob.id, 'Original text');
    setPhase(db, 'reveal');

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.put(`/api/predictions/${pred.id}`).send({ text: 'Updated text' });

    expect(res.status).toBe(403);
  });

  it('GET /api/predictions/mine requires auth', async () => {
    const res = await request(app).get('/api/predictions/mine');
    expect(res.status).toBe(401);
  });

  it("GET /api/predictions/mine returns only the current user's predictions", async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    createPrediction(db, alice.id, bob.id, 'Alice about Bob');
    createPrediction(db, alice.id, charlie.id, 'Alice about Charlie');
    createPrediction(db, bob.id, charlie.id, 'Bob about Charlie');

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.get('/api/predictions/mine');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    for (const p of res.body) {
      expect(p.targetName).toBeDefined();
    }
  });
});
