import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import {
  setupTestDb,
  createUser,
  createPrediction,
  createTestApp,
  loginAs,
} from './helpers';

describe('Users routes', () => {
  let app: ReturnType<typeof createTestApp>;
  let db: ReturnType<typeof setupTestDb>['db'];

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    app = createTestApp();
  });

  it('GET /api/users requires auth → 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('GET /api/users/me requires auth → 401', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });

  it('GET /api/users returns list without tokens', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.get('/api/users');
    expect(res.status).toBe(200);

    // Should not include self (Alice)
    const names = res.body.map((u: any) => u.name);
    expect(names).not.toContain('Alice');
    expect(names).toContain('Bob');

    // No tokens should be returned
    for (const user of res.body) {
      expect(user).not.toHaveProperty('token');
    }
  });

  it('GET /api/users/me returns current user with stats', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    // Alice wrote 2 predictions
    createPrediction(db, alice.id, bob.id, 'Bob will succeed');
    createPrediction(db, alice.id, charlie.id, 'Charlie will succeed');

    // One prediction about Alice
    createPrediction(db, bob.id, alice.id, 'Alice will succeed');

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.get('/api/users/me');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Alice');
    expect(res.body.id).toBe(alice.id);
    expect(res.body).toHaveProperty('stats');
    expect(res.body.stats.predictionsWritten).toBe(2);
    expect(res.body.stats.predictionsReceived).toBe(1);
    // totalTargets: all non-admin users except self = 2 (bob, charlie)
    expect(res.body.stats.totalTargets).toBe(2);
  });

  it('GET /api/users shows hasPrediction status for each user', async () => {
    const alice = createUser(db, 'Alice', 'token-alice');
    const bob = createUser(db, 'Bob', 'token-bob');
    const charlie = createUser(db, 'Charlie', 'token-charlie');

    // Alice wrote prediction about Bob but not Charlie
    createPrediction(db, alice.id, bob.id, 'Bob will succeed');

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.get('/api/users');
    expect(res.status).toBe(200);

    const bobEntry = res.body.find((u: any) => u.id === bob.id);
    const charlieEntry = res.body.find((u: any) => u.id === charlie.id);

    expect(bobEntry.hasPrediction).toBe(true);
    expect(charlieEntry.hasPrediction).toBe(false);
  });

  it('GET /api/users/me does not include token', async () => {
    createUser(db, 'Alice', 'token-alice');

    const agent = request.agent(app);
    await loginAs(agent, 'token-alice');

    const res = await agent.get('/api/users/me');
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('token');
  });
});
