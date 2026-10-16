import { eq } from 'drizzle-orm';
import { db } from '../db';
import { bonusCategories, bonusVotes } from '../schema';
import { GameSnapshot, avgRating } from './snapshot';

/**
 * Rating bands below the threshold. A prediction the group rated in the lowest
 * band (least likely) is worth x5 if it comes true; at or above the threshold, x1.
 */
export function scoringTiers(threshold: number) {
  return {
    threshold,
    tier1: Math.floor(threshold * 0.25),
    tier2: Math.floor(threshold * 0.5),
    tier3: Math.floor(threshold * 0.75),
  };
}

/** Points for one prediction that came true. Each unforgiven edit costs half a point. */
export function predictionPoints(avg: number | null, edits: number, forgivenEdits: number, threshold: number) {
  const { tier1, tier2, tier3 } = scoringTiers(threshold);
  let multiplier = 1.0;
  if (avg !== null) {
    if (avg < tier1)          multiplier = 5.0;
    else if (avg < tier2)     multiplier = 4.0;
    else if (avg < tier3)     multiplier = 3.0;
    else if (avg < threshold) multiplier = 2.0;
  }
  const penalizedEdits = Math.max(0, edits - forgivenEdits);
  return Math.max(0.5, multiplier - penalizedEdits * 0.5);
}

/** Tally one bonus category. Ballots rank three nominees: 1st = 3 pts, 2nd = 2, 3rd = 1. */
export function tallyVotes(votes: { nomineeId: number; rank: number }[]) {
  const tally: Record<number, number> = {};
  for (const vote of votes) {
    tally[vote.nomineeId] = (tally[vote.nomineeId] ?? 0) + (4 - vote.rank);
  }
  const maxPts = Object.values(tally).length > 0 ? Math.max(...Object.values(tally)) : 0;
  const winners = maxPts > 0
    ? Object.entries(tally).filter(([, pts]) => pts === maxPts).map(([id]) => parseInt(id))
    : [];
  return { tally, winners };
}

/** Bonus points per user id: each category's points are split evenly between its winners. */
export function calcBonusPoints(gameId: number): Record<number, number> {
  const categories = db.select().from(bonusCategories).where(eq(bonusCategories.gameId, gameId)).all();
  const allVotes = db.select({ categoryId: bonusVotes.categoryId, nomineeId: bonusVotes.nomineeId, rank: bonusVotes.rank })
    .from(bonusVotes)
    .innerJoin(bonusCategories, eq(bonusCategories.id, bonusVotes.categoryId))
    .where(eq(bonusCategories.gameId, gameId))
    .all();
  const points: Record<number, number> = {};
  for (const cat of categories) {
    const { winners } = tallyVotes(allVotes.filter(v => v.categoryId === cat.id));
    for (const id of winners) {
      points[id] = (points[id] ?? 0) + cat.points / winners.length;
    }
  }
  return points;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The ranked leaderboard of one game: authors score for their predictions that came true. */
export function calcScores(gameId: number, g: GameSnapshot, threshold: number) {
  const bonusPoints = calcBonusPoints(gameId);

  const board = g.users.map(u => {
    let happened = 0;
    let weighted = 0;
    for (const p of g.predictions) {
      if (p.authorId !== u.id || g.outcome(p.id)?.happened !== true) continue;
      happened++;
      weighted += predictionPoints(avgRating(g, p.id), g.history(p.id).length, p.forgivenEdits ?? 0, threshold);
    }
    const bonus = round1(bonusPoints[u.id] ?? 0);
    return { id: u.id, name: u.name, score: happened, weightedScore: round1(weighted + bonus), bonusPoints: bonus };
  });

  board.sort((a, b) => b.weightedScore - a.weightedScore || b.score - a.score);
  return board.map((u, i) => ({ ...u, rank: i + 1 }));
}
