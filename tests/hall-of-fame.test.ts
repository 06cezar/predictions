import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import * as schema from '../server/schema';
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

const HOF_ENDPOINTS = [
  'most-courageous',
  'most-controversial',
  'biggest-miss',
  'star-of-the-show',
  'best-friends',
  'most-revised',
  'the-joker',
  'last-minute',
  'first-to-submit',
];

describe('Hall of Fame routes', () => {
  let app: ReturnType<typeof createTestApp>;
  let db: ReturnType<typeof setupTestDb>['db'];

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    app = createTestApp();
  });

  function setUpdatedAt(predictionId: number, updatedAt: string) {
    db.update(schema.predictions).set({ updatedAt }).where(eq(schema.predictions.id, predictionId)).run();
  }

  function addEdit(predictionId: number, oldText: string) {
    db.insert(schema.predictionHistory).values({ predictionId, oldText }).run();
  }

  /**
   * Ana, Bob, Cat and Dan write about each other; Zed is an admin with no predictions.
   *
   *   p1 Ana→Bob  ratings 10,30  (avg 20)  happened
   *   p2 Bob→Ana  ratings 90,70  (avg 80)  happened   1 edit
   *   p3 Cat→Bob  ratings 95,85  (avg 90)  did not happen
   *   p4 Dan→Cat  ratings 0,100  (avg 50)  happened   2 edits
   *   p5 Ana→Dan  no ratings              not marked
   */
  function seedGame() {
    const ana = createUser(db, 'Ana', 'token-ana');
    const bob = createUser(db, 'Bob', 'token-bob');
    const cat = createUser(db, 'Cat', 'token-cat');
    const dan = createUser(db, 'Dan', 'token-dan');
    createUser(db, 'Zed', 'token-zed', true);

    const p1 = createPrediction(db, ana.id, bob.id, 'Bob moves abroad');
    const p2 = createPrediction(db, bob.id, ana.id, 'Ana runs a marathon');
    const p3 = createPrediction(db, cat.id, bob.id, 'Bob adopts a cat');
    const p4 = createPrediction(db, dan.id, cat.id, 'Cat learns piano');
    const p5 = createPrediction(db, ana.id, dan.id, 'Dan quits his job');

    createRating(db, p1.id, cat.id, 10);
    createRating(db, p1.id, dan.id, 30);
    createRating(db, p2.id, cat.id, 90);
    createRating(db, p2.id, dan.id, 70);
    createRating(db, p3.id, ana.id, 95);
    createRating(db, p3.id, dan.id, 85);
    createRating(db, p4.id, ana.id, 0);
    createRating(db, p4.id, bob.id, 100);

    createOutcome(db, p1.id, true, bob.id);
    createOutcome(db, p2.id, true, ana.id);
    createOutcome(db, p3.id, false, bob.id);
    createOutcome(db, p4.id, true, cat.id);

    addEdit(p2.id, 'Ana runs a half marathon');
    addEdit(p4.id, 'Cat learns guitar');
    addEdit(p4.id, 'Cat learns violin');

    setUpdatedAt(p1.id, '2026-04-01T10:00:00.000Z');
    setUpdatedAt(p2.id, '2026-04-01T11:00:00.000Z');
    setUpdatedAt(p3.id, '2026-04-01T12:00:00.000Z');
    setUpdatedAt(p4.id, '2026-04-01T09:00:00.000Z');
    setUpdatedAt(p5.id, '2026-04-02T08:00:00.000Z');
  }

  async function fetchAs(token: string, path: string) {
    const agent = request.agent(app);
    await loginAs(agent, token);
    return agent.get(path);
  }

  const getAs = (token: string, endpoint: string) => fetchAs(token, `/api/leaderboard/${endpoint}`);

  describe('access control', () => {
    it.each(HOF_ENDPOINTS)('%s requires auth', async endpoint => {
      const res = await request(app).get(`/api/leaderboard/${endpoint}`);
      expect(res.status).toBe(401);
    });

    it.each(HOF_ENDPOINTS)('%s is hidden from players before the game is done', async endpoint => {
      seedGame();
      setPhase(db, 'reveal');
      const res = await getAs('token-ana', endpoint);
      expect(res.status).toBe(403);
    });

    it.each(HOF_ENDPOINTS)('%s is visible to admins before the game is done', async endpoint => {
      seedGame();
      setPhase(db, 'reveal');
      const res = await getAs('token-zed', endpoint);
      expect(res.status).toBe(200);
    });

    it('preview leaderboard is admin-only', async () => {
      seedGame();
      expect((await getAs('token-ana', 'preview')).status).toBe(403);
      expect((await getAs('token-zed', 'preview')).status).toBe(200);
    });
  });

  describe('awards', () => {
    beforeEach(() => {
      seedGame();
      setPhase(db, 'done');
    });

    it('most-courageous: lowest-rated prediction that came true', async () => {
      const res = await getAs('token-ana', 'most-courageous');
      expect(res.body).toEqual({ text: 'Bob moves abroad', authorName: null, targetName: 'Bob', avg: 20 });
    });

    it('reveals author names when anonymous mode is off', async () => {
      db.update(schema.games).set({ anonymousPredictions: false }).run();
      const res = await getAs('token-ana', 'most-courageous');
      expect(res.body.authorName).toBe('Ana');
    });

    it('most-controversial: highest rating spread', async () => {
      const res = await getAs('token-ana', 'most-controversial');
      expect(res.body).toEqual({
        text: 'Cat learns piano',
        authorName: null,
        targetName: 'Cat',
        avg: 50,
        stdDev: 50,
        individualRatings: [0, 100],
      });
    });

    it('biggest-miss: highest-rated prediction that did not happen', async () => {
      const res = await getAs('token-ana', 'biggest-miss');
      expect(res.body).toEqual({ text: 'Bob adopts a cat', authorName: null, targetName: 'Bob', avg: 90 });
    });

    it('star-of-the-show: most predictions came true, ties broken by lowest rating', async () => {
      const res = await getAs('token-ana', 'star-of-the-show');
      expect(res.body).toEqual([{ name: 'Bob', count: 1 }]);
    });

    it('best-friends: pairs whose predictions about each other both came true', async () => {
      const res = await getAs('token-ana', 'best-friends');
      expect(res.body).toEqual([{ userA: 'Ana', userB: 'Bob' }]);
    });

    it('most-revised: prediction with the most edits, with its history', async () => {
      const res = await getAs('token-ana', 'most-revised');
      expect(res.body).toEqual({
        text: 'Cat learns piano',
        authorName: null,
        targetName: 'Cat',
        editCount: 2,
        history: ['Cat learns guitar', 'Cat learns violin'],
      });
    });

    it('the-joker: fewest predictions about them came true', async () => {
      const res = await getAs('token-ana', 'the-joker');
      expect(res.body).toEqual([{ name: 'Dan', count: 0 }]);
    });

    it('last-minute: most recently updated prediction', async () => {
      const res = await getAs('token-ana', 'last-minute');
      expect(res.body).toEqual({
        text: 'Dan quits his job',
        authorName: null,
        targetName: 'Dan',
        updatedAt: '2026-04-02T08:00:00.000Z',
      });
    });

    it('first-to-submit: author who finished writing earliest', async () => {
      const res = await getAs('token-ana', 'first-to-submit');
      expect(res.body).toEqual({ names: ['Dan'], tied: false });
    });

    it('first-to-submit: reports ties', async () => {
      const preds = db.select().from(schema.predictions).all();
      for (const p of preds) setUpdatedAt(p.id, '2026-04-01T10:00:00.000Z');
      const res = await getAs('token-ana', 'first-to-submit');
      expect(res.body).toEqual({ names: ['Ana', 'Bob', 'Cat', 'Dan'], tied: true });
    });
  });

  describe('CSV exports', () => {
    beforeEach(() => {
      seedGame();
      setPhase(db, 'done');
    });

    it('Hall of Fame CSV lists the same winners as the app', async () => {
      const res = await fetchAs('token-zed', '/api/admin/export/hof.csv');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text.split('\n')).toEqual([
        'Category,Winner,Detail',
        '"Most Courageous","?","About Bob - avg 20% - Bob moves abroad"',
        '"Biggest Miss","?","About Bob - avg 90% - Bob adopts a cat"',
        '"Most Controversial","?","About Cat - avg 50%, spread 50 - Cat learns piano"',
        '"Can\'t Make Up Their Mind","?","About Cat - 2 edits - Cat learns piano"',
        '"Star of the Show","Bob","1 true predictions"',
        '"The Joker","Dan","0 true predictions"',
        '"Best Friends","Ana & Bob",""',
        '"Last Minute","?","About Dan - 2026-04-02T08:00:00.000Z - Dan quits his job"',
        '"First to Submit","Dan","2026-04-01T09:00:00.000Z"',
      ]);
    });

    it('scores CSV ranks players by weighted score', async () => {
      const res = await fetchAs('token-zed', '/api/admin/export/scores.csv');
      expect(res.status).toBe(200);
      const [header, first] = res.text.split('\n');
      expect(header).toBe('Rank,Name,True Predictions,Weighted Score');
      // Ana's prediction came true at avg 20, in the 12-25 band below threshold 50 -> x4
      expect(first).toBe('1,"Ana",1,4');
    });

    it('CSV exports are admin-only', async () => {
      const res = await fetchAs('token-ana', '/api/admin/export/hof.csv');
      expect(res.status).toBe(403);
    });
  });

  describe('empty game', () => {
    beforeEach(() => {
      createUser(db, 'Ana', 'token-ana');
      setPhase(db, 'done');
    });

    it.each([
      ['most-courageous', null],
      ['most-controversial', null],
      ['biggest-miss', null],
      ['star-of-the-show', []],
      ['best-friends', []],
      ['most-revised', null],
      ['the-joker', []],
      ['last-minute', null],
      ['first-to-submit', null],
    ])('%s returns %j', async (endpoint, expected) => {
      const res = await getAs('token-ana', endpoint);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(expected);
    });
  });
});
