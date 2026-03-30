import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import {
  setupTestDb,
  createUser,
  createPrediction,
  createTestApp,
  loginAs,
} from './helpers';
import { eq } from 'drizzle-orm';
import * as schema from '../server/schema';

describe('Admin routes', () => {
  let app: ReturnType<typeof createTestApp>;
  let db: ReturnType<typeof setupTestDb>['db'];

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    app = createTestApp();
  });

  // ── Access control ─────────────────────────────────────────────────────────

  it('Non-admin cannot access GET /api/admin/users → 403', async () => {
    createUser(db, 'Regular', 'token-regular', false);

    const agent = request.agent(app);
    await loginAs(agent, 'token-regular');

    const res = await agent.get('/api/admin/users');
    expect(res.status).toBe(403);
  });

  it('Unauthenticated cannot access GET /api/admin/users → 401', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });

  it('Non-admin cannot access GET /api/admin/predictions → 403', async () => {
    createUser(db, 'Regular', 'token-regular', false);

    const agent = request.agent(app);
    await loginAs(agent, 'token-regular');

    const res = await agent.get('/api/admin/predictions');
    expect(res.status).toBe(403);
  });

  it('Non-admin cannot access PUT /api/admin/settings → 403', async () => {
    createUser(db, 'Regular', 'token-regular', false);

    const agent = request.agent(app);
    await loginAs(agent, 'token-regular');

    const res = await agent.put('/api/admin/settings').send({ ratingThreshold: 50 });
    expect(res.status).toBe(403);
  });

  it('Non-admin cannot access POST /api/admin/phase/advance → 403', async () => {
    createUser(db, 'Regular', 'token-regular', false);

    const agent = request.agent(app);
    await loginAs(agent, 'token-regular');

    const res = await agent.post('/api/admin/phase/advance');
    expect(res.status).toBe(403);
  });

  // ── User management ────────────────────────────────────────────────────────

  it('GET /api/admin/users returns all users with tokens', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    createUser(db, 'Alice', 'token-alice');
    createUser(db, 'Bob', 'token-bob');

    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const res = await agent.get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);

    // Each user should have token field
    for (const user of res.body) {
      expect(user).toHaveProperty('token');
    }
  });

  it('POST /api/admin/users creates user with generated token', async () => {
    createUser(db, 'Admin', 'token-admin', true);

    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const res = await agent.post('/api/admin/users').send({ name: 'NewUser' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('NewUser');
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(0);
  });

  it('POST /api/admin/users without name → 400', async () => {
    createUser(db, 'Admin', 'token-admin', true);

    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const res = await agent.post('/api/admin/users').send({});
    expect(res.status).toBe(400);
  });

  it('DELETE /api/admin/users/:id removes user', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const alice = createUser(db, 'Alice', 'token-alice');

    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const deleteRes = await agent.delete(`/api/admin/users/${alice.id}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    // Verify user is gone
    const listRes = await agent.get('/api/admin/users');
    const names = listRes.body.map((u: any) => u.name);
    expect(names).not.toContain('Alice');
  });

  // ── Predictions admin ──────────────────────────────────────────────────────

  it('GET /api/admin/predictions returns full data including author names', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    createPrediction(db, alice.id, bob.id, 'Bob will succeed');
    db.update(schema.settings).set({ anonymousPredictions: false }).where(eq(schema.settings.id, 1)).run();

    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const res = await agent.get('/api/admin/predictions');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);

    const pred = res.body[0];
    expect(pred.author).toBeDefined();
    expect(pred.author.name).toBe('Alice');
    expect(pred.target).toBeDefined();
    expect(pred.target.name).toBe('Bob');
    expect(pred.currentText).toBe('Bob will succeed');
    expect(pred).toHaveProperty('editCount');
    expect(pred).toHaveProperty('history');
  });

  // ── Forgive edits ──────────────────────────────────────────────────────────

  it('POST /api/admin/predictions/:id/forgive-edit increments forgivenEdits', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const pred = createPrediction(db, alice.id, bob.id, 'Edited pred');
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'Original' }).run();

    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const res = await agent.post(`/api/admin/predictions/${pred.id}/forgive-edit`);
    expect(res.status).toBe(200);
    expect(res.body.forgivenEdits).toBe(1);
  });

  it('POST /api/admin/predictions/:id/forgive-edit cannot exceed edit count', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const pred = createPrediction(db, alice.id, bob.id, 'One edit');
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'Original' }).run();

    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    // First forgive succeeds
    await agent.post(`/api/admin/predictions/${pred.id}/forgive-edit`);
    // Second should fail (only 1 edit)
    const res = await agent.post(`/api/admin/predictions/${pred.id}/forgive-edit`);
    expect(res.status).toBe(400);
  });

  it('POST /api/admin/predictions/:id/forgive-edit non-admin → 403', async () => {
    createUser(db, 'Regular', 'token-regular');
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const pred = createPrediction(db, alice.id, bob.id, 'Test');

    const agent = request.agent(app);
    await loginAs(agent, 'token-regular');

    const res = await agent.post(`/api/admin/predictions/${pred.id}/forgive-edit`);
    expect(res.status).toBe(403);
  });

  it('POST /api/admin/predictions/:id/unforgive-edit decrements forgivenEdits', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const pred = createPrediction(db, alice.id, bob.id, 'Unforgive test');
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'Original' }).run();

    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    // Forgive first
    await agent.post(`/api/admin/predictions/${pred.id}/forgive-edit`);
    // Unforgive
    const res = await agent.post(`/api/admin/predictions/${pred.id}/unforgive-edit`);
    expect(res.status).toBe(200);
    expect(res.body.forgivenEdits).toBe(0);
  });

  it('POST /api/admin/predictions/:id/unforgive-edit cannot go below 0', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const pred = createPrediction(db, alice.id, bob.id, 'No forgives');
    db.insert(schema.predictionHistory).values({ predictionId: pred.id, oldText: 'Original' }).run();

    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const res = await agent.post(`/api/admin/predictions/${pred.id}/unforgive-edit`);
    expect(res.status).toBe(400);
  });

  it('POST /api/admin/predictions/:id/unforgive-edit non-admin → 403', async () => {
    createUser(db, 'Regular', 'token-regular');
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const pred = createPrediction(db, alice.id, bob.id, 'Test');

    const agent = request.agent(app);
    await loginAs(agent, 'token-regular');

    const res = await agent.post(`/api/admin/predictions/${pred.id}/unforgive-edit`);
    expect(res.status).toBe(403);
  });

  // ── Settings ───────────────────────────────────────────────────────────────

  it('PUT /api/admin/settings updates settings', async () => {
    createUser(db, 'Admin', 'token-admin', true);

    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const res = await agent.put('/api/admin/settings').send({
      ratingThreshold: 60,
      adminOverride: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.ratingThreshold).toBe(60);
    expect(res.body.adminOverride).toBe(true);
  });

  // ── Phase management ───────────────────────────────────────────────────────

  it('POST /api/admin/phase/advance advances phase submission→reveal', async () => {
    createUser(db, 'Admin', 'token-admin', true);

    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const res = await agent.post('/api/admin/phase/advance');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.newPhase).toBe('reveal');
  });

  it('POST /api/admin/phase/advance advances phase reveal→done', async () => {
    createUser(db, 'Admin', 'token-admin', true);

    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    // First advance: submission → reveal
    await agent.post('/api/admin/phase/advance');

    // Second advance: reveal → done
    const res = await agent.post('/api/admin/phase/advance');
    expect(res.status).toBe(200);
    expect(res.body.newPhase).toBe('done');
  });

  it('POST /api/admin/phase/advance on "done" → 400', async () => {
    createUser(db, 'Admin', 'token-admin', true);

    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    // Advance twice to reach "done"
    await agent.post('/api/admin/phase/advance');
    await agent.post('/api/admin/phase/advance');

    // Third advance should fail
    const res = await agent.post('/api/admin/phase/advance');
    expect(res.status).toBe(400);
  });
});
