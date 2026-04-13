import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import {
  setupTestDb,
  createUser,
  createTestApp,
  loginAs,
} from './helpers';
import { eq } from 'drizzle-orm';
import * as schema from '../server/schema';

describe('Invite link routes', () => {
  let app: ReturnType<typeof createTestApp>;
  let db: ReturnType<typeof setupTestDb>['db'];

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    app = createTestApp();
  });

  // ── Access control ──────────────────────────────────────────────────────────

  it('Non-admin cannot POST /api/invite → 403', async () => {
    createUser(db, 'Regular', 'token-regular', false);
    const agent = request.agent(app);
    await loginAs(agent, 'token-regular');

    const res = await agent.post('/api/invite');
    expect(res.status).toBe(403);
  });

  it('Non-admin cannot GET /api/invite → 403', async () => {
    createUser(db, 'Regular', 'token-regular', false);
    const agent = request.agent(app);
    await loginAs(agent, 'token-regular');

    const res = await agent.get('/api/invite');
    expect(res.status).toBe(403);
  });

  it('Unauthenticated cannot GET /api/invite → 401', async () => {
    const res = await request(app).get('/api/invite');
    expect(res.status).toBe(401);
  });

  // ── Generate ────────────────────────────────────────────────────────────────

  it('Admin can generate an invite link', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const res = await agent.post('/api/invite');
    expect(res.status).toBe(200);
    expect(res.body.code).toBeDefined();
    expect(typeof res.body.code).toBe('string');
    expect(res.body.code.length).toBeGreaterThan(0);
  });

  it('Generated link is listed in GET /api/invite', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    await agent.post('/api/invite');
    await agent.post('/api/invite');

    const res = await agent.get('/api/invite');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  // ── Revoke ───────────────────────────────────────────────────────────────────

  it('Admin can revoke an unused invite link', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const { body: link } = await agent.post('/api/invite');
    const res = await agent.delete(`/api/invite/${link.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const list = await agent.get('/api/invite');
    expect(list.body.length).toBe(0);
  });

  it('Cannot revoke a used invite link → 400', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const { body: link } = await agent.post('/api/invite');

    // Use the link
    await request(app).post(`/api/invite/join/${link.code}`).send({ name: 'NewUser' });

    const res = await agent.delete(`/api/invite/${link.id}`);
    expect(res.status).toBe(400);
  });

  it('Revoking nonexistent link → 404', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const res = await agent.delete('/api/invite/9999');
    expect(res.status).toBe(404);
  });

  // ── Join: GET (check validity) ───────────────────────────────────────────────

  it('GET /api/invite/join/:code returns valid=true for fresh link', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const { body: link } = await agent.post('/api/invite');

    const res = await request(app).get(`/api/invite/join/${link.code}`);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  it('GET /api/invite/join/:code returns 404 for unknown code', async () => {
    const res = await request(app).get('/api/invite/join/nonexistentcode');
    expect(res.status).toBe(404);
  });

  it('GET /api/invite/join/:code returns 410 for used link', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const { body: link } = await agent.post('/api/invite');
    await request(app).post(`/api/invite/join/${link.code}`).send({ name: 'NewUser' });

    const res = await request(app).get(`/api/invite/join/${link.code}`);
    expect(res.status).toBe(410);
  });

  // ── Join: POST (register) ────────────────────────────────────────────────────

  it('User can register via invite link without custom token', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const { body: link } = await agent.post('/api/invite');

    const res = await request(app)
      .post(`/api/invite/join/${link.code}`)
      .send({ name: 'NewPerson' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.name).toBe('NewPerson');
    expect(res.body.token).toBeDefined();
  });

  it('User can register via invite link with custom token', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const { body: link } = await agent.post('/api/invite');

    const res = await request(app)
      .post(`/api/invite/join/${link.code}`)
      .send({ name: 'NewPerson', token: 'my-custom-token' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBe('my-custom-token');
  });

  it('Link is marked as used after registration', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const { body: link } = await agent.post('/api/invite');
    await request(app).post(`/api/invite/join/${link.code}`).send({ name: 'NewPerson' });

    const list = await agent.get('/api/invite');
    const used = list.body.find((l: any) => l.id === link.id);
    expect(used.usedBy).toBeDefined();
    expect(used.usedByName).toBe('NewPerson');
  });

  it('Cannot use the same link twice → 410', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const { body: link } = await agent.post('/api/invite');
    await request(app).post(`/api/invite/join/${link.code}`).send({ name: 'First' });

    const res = await request(app)
      .post(`/api/invite/join/${link.code}`)
      .send({ name: 'Second' });

    expect(res.status).toBe(410);
  });

  it('Joining without name → 400', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const { body: link } = await agent.post('/api/invite');

    const res = await request(app)
      .post(`/api/invite/join/${link.code}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('Joining with unknown code → 404', async () => {
    const res = await request(app)
      .post('/api/invite/join/badcode')
      .send({ name: 'Someone' });
    expect(res.status).toBe(404);
  });

  // ── Token conflict ───────────────────────────────────────────────────────────

  it('Token conflict: returns 409 and regenerates old user token', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    createUser(db, 'Existing', 'my-taken-token', false);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const { body: link } = await agent.post('/api/invite');

    const res = await request(app)
      .post(`/api/invite/join/${link.code}`)
      .send({ name: 'NewPerson', token: 'my-taken-token' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/token is already in use/i);

    // Old user's token should have been changed
    const existing = db.select().from(schema.users).where(eq(schema.users.name, 'Existing')).get();
    expect(existing!.token).not.toBe('my-taken-token');
  });

  it('Token conflict: notifies admin', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    createUser(db, 'Existing', 'taken-token', false);
    const admin = db.select().from(schema.users).where(eq(schema.users.name, 'Admin')).get()!;
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const { body: link } = await agent.post('/api/invite');

    await request(app)
      .post(`/api/invite/join/${link.code}`)
      .send({ name: 'Newcomer', token: 'taken-token' });

    // Admin should have a notification
    const notif = db.select().from(schema.notifications)
      .where(eq(schema.notifications.userId, admin.id))
      .get();
    expect(notif).toBeDefined();
    expect(notif!.type).toBe('token_conflict');
    const meta = JSON.parse(notif!.meta!);
    expect(meta.oldUserName).toBe('Existing');
    expect(meta.newUserName).toBe('Newcomer');
  });

  it('Token conflict: link stays active, new user can retry with different token', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    createUser(db, 'Existing', 'taken-token', false);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const { body: link } = await agent.post('/api/invite');

    // First attempt with taken token → 409
    await request(app)
      .post(`/api/invite/join/${link.code}`)
      .send({ name: 'NewPerson', token: 'taken-token' });

    // Second attempt with different token → success
    const res = await request(app)
      .post(`/api/invite/join/${link.code}`)
      .send({ name: 'NewPerson', token: 'my-unique-token' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBe('my-unique-token');
  });

  // ── Blocked tokens ────────────────────────────────────────────────────────────

  it('Freed token is blocked after conflict - second attempt with same token → 409', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    createUser(db, 'Existing', 'taken-token', false);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const { body: link } = await agent.post('/api/invite');

    // First attempt → conflict → token gets freed + blocked
    await request(app)
      .post(`/api/invite/join/${link.code}`)
      .send({ name: 'Attacker', token: 'taken-token' });

    // Second attempt with same token → blocked
    const res = await request(app)
      .post(`/api/invite/join/${link.code}`)
      .send({ name: 'Attacker', token: 'taken-token' });

    expect(res.status).toBe(409);
  });

  it('Blocked token cannot be used via admin create user', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    createUser(db, 'Existing', 'soon-blocked', false);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const { body: link } = await agent.post('/api/invite');

    // Trigger conflict → 'soon-blocked' gets freed and blocked
    await request(app)
      .post(`/api/invite/join/${link.code}`)
      .send({ name: 'Attacker', token: 'soon-blocked' });

    // Admin tries to create user with that blocked token
    const res = await agent.post('/api/admin/users').send({ name: 'NewUser', token: 'soon-blocked' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/token already in use/i);
  });

  it('Auto-generated tokens never use blocked tokens', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    createUser(db, 'Existing', 'swift-lion-42', false);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const { body: link } = await agent.post('/api/invite');

    // Block 'swift-lion-42'
    await request(app)
      .post(`/api/invite/join/${link.code}`)
      .send({ name: 'Attacker', token: 'swift-lion-42' });

    // Verify it's in blocked_tokens
    const blocked = db.select().from(schema.blockedTokens)
      .where(eq(schema.blockedTokens.token, 'swift-lion-42'))
      .get();
    expect(blocked).toBeDefined();
  });

  it('Spam: multiple requests with same token all fail after first conflict', async () => {
    createUser(db, 'Admin', 'token-admin', true);
    createUser(db, 'Existing', 'spam-token', false);
    const agent = request.agent(app);
    await loginAs(agent, 'token-admin');

    const { body: link } = await agent.post('/api/invite');

    // First → conflict (409)
    const r1 = await request(app).post(`/api/invite/join/${link.code}`).send({ name: 'A', token: 'spam-token' });
    expect(r1.status).toBe(409);

    // Second → blocked (409)
    const r2 = await request(app).post(`/api/invite/join/${link.code}`).send({ name: 'A', token: 'spam-token' });
    expect(r2.status).toBe(409);

    // Third → still blocked (409)
    const r3 = await request(app).post(`/api/invite/join/${link.code}`).send({ name: 'A', token: 'spam-token' });
    expect(r3.status).toBe(409);

    // Nobody registered
    const allUsers = db.select().from(schema.users).all();
    expect(allUsers.filter(u => u.name === 'A').length).toBe(0);
  });
});
