import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import {
  setupTestDb,
  createUser,
  createPrediction,
  createTestApp,
  loginAs,
  setPhase,
} from './helpers';
import { eq } from 'drizzle-orm';
import * as schema from '../server/schema';

describe('Settings endpoint', () => {
  let app: ReturnType<typeof createTestApp>;
  let db: ReturnType<typeof setupTestDb>['db'];

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    app = createTestApp();
  });

  it('GET /api/settings requires auth → 401', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
  });

  it('GET /api/settings returns all expected fields', async () => {
    createUser(db, 'Alice', 'token-alice');
    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('currentPhase');
    expect(res.body).toHaveProperty('ratingThreshold');
    expect(res.body).toHaveProperty('anonymousPredictions');
    expect(res.body.currentPhase).toBe('submission');
    expect(res.body.ratingThreshold).toBe(40);
  });

  it('GET /api/settings does NOT expose admin-only fields', async () => {
    createUser(db, 'Alice', 'token-alice');
    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.get('/api/settings');
    expect(res.body).not.toHaveProperty('autoAdvancePhase');
    expect(res.body).not.toHaveProperty('adminOverride');
  });

  it('GET /api/settings reflects phase changes', async () => {
    createUser(db, 'Alice', 'token-alice');
    setPhase(db, 'reveal');

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.get('/api/settings');
    expect(res.body.currentPhase).toBe('reveal');
  });
});

describe('Anonymous predictions setting', () => {
  let app: ReturnType<typeof createTestApp>;
  let db: ReturnType<typeof setupTestDb>['db'];

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    app = createTestApp();
  });

  it('anonymous ON: about-me does not include authorName', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    createPrediction(db, alice.id, bob.id, 'Bob will do great things');
    // anonymousPredictions = 1 (ON) by default
    setPhase(db, 'reveal');

    const bobAgent = request.agent(app);
    await loginAs(bobAgent, 'token-bob');

    const res = await bobAgent.get('/api/predictions/about-me');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].authorName).toBeUndefined();
  });

  it('anonymous OFF: about-me includes authorName', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    createPrediction(db, alice.id, bob.id, 'Bob will do great things');
    // Turn anonymous OFF
    db.update(schema.settings).set({ anonymousPredictions: false }).where(eq(schema.settings.id, 1)).run();
    setPhase(db, 'reveal');

    const bobAgent = request.agent(app);
    await loginAs(bobAgent, 'token-bob');

    const res = await bobAgent.get('/api/predictions/about-me');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].authorName).toBe('Alice');
  });

  it('admin can toggle anonymousPredictions via PUT /api/admin/settings', async () => {
    createUser(db, 'Admin', 'token-admin', true);

    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const res = await agent.put('/api/admin/settings').send({ anonymousPredictions: false });
    expect(res.status).toBe(200);
    expect(res.body.anonymousPredictions).toBe(false);
  });

  it('anonymousPredictions is included in GET /api/settings', async () => {
    createUser(db, 'Alice', 'token-alice');
    db.update(schema.settings).set({ anonymousPredictions: false }).where(eq(schema.settings.id, 1)).run();

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.get('/api/settings');
    expect(res.body.anonymousPredictions).toBe(false);
  });
});

describe('Phase management', () => {
  let app: ReturnType<typeof createTestApp>;
  let db: ReturnType<typeof setupTestDb>['db'];

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    app = createTestApp();
  });

  it('POST /api/admin/phase/set switches to any valid phase directly', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const res = await agent.post('/api/admin/phase/set').send({ phase: 'done' });
    expect(res.status).toBe(200);
    expect(res.body.newPhase).toBe('done');
  });

  it('POST /api/admin/phase/set with invalid phase → 400', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const res = await agent.post('/api/admin/phase/set').send({ phase: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('POST /api/admin/phase/set non-admin → 403', async () => {
    createUser(db, 'Regular', 'token-regular', false);
    const agent = request.agent(app);
    await loginAs(agent, 'token-regular');

    const res = await agent.post('/api/admin/phase/set').send({ phase: 'reveal' });
    expect(res.status).toBe(403);
  });

  it('POST /api/admin/phase/reverse goes back one phase', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    setPhase(db, 'reveal');

    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const res = await agent.post('/api/admin/phase/reverse');
    expect(res.status).toBe(200);
    expect(res.body.newPhase).toBe('submission');
  });

  it('POST /api/admin/phase/reverse from done → reveal', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    setPhase(db, 'done');

    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const res = await agent.post('/api/admin/phase/reverse');
    expect(res.status).toBe(200);
    expect(res.body.newPhase).toBe('reveal');
  });

  it('POST /api/admin/phase/reverse from submission → 400 (already first)', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    // Phase is submission by default

    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const res = await agent.post('/api/admin/phase/reverse');
    expect(res.status).toBe(400);
  });
});
