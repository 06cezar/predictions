import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { setupTestDb, createUser, createTestApp } from './helpers';

describe('Auth routes', () => {
  let app: ReturnType<typeof createTestApp>;
  let db: ReturnType<typeof setupTestDb>['db'];

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    app = createTestApp();
  });

  it('POST /api/auth/login with valid token → 200 and sets session', async () => {
    createUser(db, 'Alice', 'token-alice');

    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ token: 'token-alice' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.name).toBe('Alice');
    expect(res.body.user).not.toHaveProperty('token'); // token not returned

    // Session should now be set — hitting a protected route should work
    const meRes = await agent.get('/api/users/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.name).toBe('Alice');
  });

  it('POST /api/auth/login with invalid token → 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ token: 'bad-token' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('POST /api/auth/login with missing token → 400', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/auth/logout → 200', async () => {
    createUser(db, 'Bob', 'token-bob');

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ token: 'token-bob' });

    const logoutRes = await agent.post('/api/auth/logout');
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    // After logout, protected routes should return 401
    const meRes = await agent.get('/api/users/me');
    expect(meRes.status).toBe(401);
  });

  it('Protected route without session → 401', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });

  it('Protected route without session (predictions) → 401', async () => {
    const res = await request(app).get('/api/predictions/mine');
    expect(res.status).toBe(401);
  });

  it('Protected route without session (leaderboard) → 401', async () => {
    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(401);
  });

  it('Admin user login returns isAdmin true', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const res = await request(app).post('/api/auth/login').send({ token: 'token-admin' });
    expect(res.status).toBe(200);
    expect(res.body.user.isAdmin).toBe(true);
  });

  it('Regular user login returns isAdmin false', async () => {
    createUser(db, 'Regular', 'token-regular', false);
    const res = await request(app).post('/api/auth/login').send({ token: 'token-regular' });
    expect(res.status).toBe(200);
    expect(res.body.user.isAdmin).toBe(false);
  });
});
