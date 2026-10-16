import { GameSnapshot, Prediction, User, avgRating, mean } from './snapshot';

/**
 * Hall of Fame awards, computed from a game snapshot. Each returns null (or an
 * empty list) when nobody qualifies. Ties go to the earliest prediction/user
 * unless stated otherwise.
 */

type Rated = { prediction: Prediction; avg: number };

const cameTrue = (g: GameSnapshot, p: Prediction) => g.outcome(p.id)?.happened === true;
const didNotHappen = (g: GameSnapshot, p: Prediction) => g.outcome(p.id)?.happened === false;
const isNumber = (n: number | null): n is number => n !== null;

function rated(g: GameSnapshot, predictions: Prediction[]): Rated[] {
  return predictions.flatMap(prediction => {
    const avg = avgRating(g, prediction.id);
    return avg === null ? [] : [{ prediction, avg }];
  });
}

/** First item that no later item beats. */
function pickBest<T>(items: T[], beats: (a: T, b: T) => boolean): T | null {
  let best: T | null = null;
  for (const item of items) {
    if (best === null || beats(item, best)) best = item;
  }
  return best;
}

/** Everyone tied with the leader of a sorted board (ratings compared to 0.01). */
function leaders<T extends { count: number; avgRating: number }>(board: T[]): T[] {
  if (board.length === 0) return [];
  const [top] = board;
  return board.filter(e => e.count === top.count && Math.abs(e.avgRating - top.avgRating) < 0.01);
}

/** Mean of the average ratings of these predictions, or `fallback` if none were rated. */
function meanRating(g: GameSnapshot, predictions: Prediction[], fallback: number) {
  const avgs = predictions.map(p => avgRating(g, p.id)).filter(isNumber);
  return avgs.length > 0 ? mean(avgs) : fallback;
}

/** Most Courageous: came true despite the lowest average rating. */
export function mostCourageous(g: GameSnapshot): Rated | null {
  return pickBest(rated(g, g.predictions.filter(p => cameTrue(g, p))), (a, b) => a.avg < b.avg);
}

/** Biggest Miss: did not happen despite the highest average rating. */
export function biggestMiss(g: GameSnapshot): Rated | null {
  return pickBest(rated(g, g.predictions.filter(p => didNotHappen(g, p))), (a, b) => a.avg > b.avg);
}

/** Most Controversial: the widest spread (population std dev) between at least two ratings. */
export function mostControversial(g: GameSnapshot) {
  const candidates = g.predictions
    .map(prediction => ({ prediction, scores: g.ratings(prediction.id) }))
    .filter(c => c.scores.length >= 2)
    .map(({ prediction, scores }) => {
      const avg = mean(scores);
      const stdDev = Math.sqrt(mean(scores.map(x => Math.pow(x - avg, 2))));
      return { prediction, avg, stdDev, scores: [...scores].sort((a, b) => a - b) };
    });
  return pickBest(candidates, (a, b) => a.stdDev > b.stdDev);
}

/** Can't Make Up Their Mind: most edits; ties go to the newest prediction. */
export function mostRevised(g: GameSnapshot) {
  const candidates = g.predictions
    .map(prediction => ({ prediction, history: g.history(prediction.id) }))
    .filter(c => c.history.length > 0);
  return pickBest(candidates, (a, b) =>
    a.history.length > b.history.length
    || (a.history.length === b.history.length && a.prediction.id > b.prediction.id));
}

/** Star of the Show: the most predictions about them came true; ties go to the bolder ones. */
export function starOfTheShow(g: GameSnapshot) {
  const board = g.users.flatMap(u => {
    const trueAboutThem = g.predictions.filter(p => p.targetId === u.id && cameTrue(g, p));
    if (trueAboutThem.length === 0) return [];
    return [{ name: u.name, count: trueAboutThem.length, avgRating: meanRating(g, trueAboutThem, 100) }];
  });
  board.sort((a, b) => b.count - a.count || a.avgRating - b.avgRating);
  return leaders(board);
}

/**
 * The Joker: the fewest predictions about them came true; ties go to whoever
 * the group was most confident about. Hidden until any outcome is marked.
 */
export function theJoker(g: GameSnapshot) {
  if (!g.outcomes.some(o => o.happened !== null)) return [];
  const board = g.users.flatMap(u => {
    const aboutThem = g.predictions.filter(p => p.targetId === u.id);
    if (aboutThem.length === 0) return [];
    const count = aboutThem.filter(p => cameTrue(g, p)).length;
    return [{ name: u.name, count, avgRating: meanRating(g, aboutThem, 0) }];
  });
  board.sort((a, b) => a.count - b.count || b.avgRating - a.avgRating);
  return leaders(board);
}

/** Best Friends: pairs whose predictions about each other both came true; boldest pair wins. */
export function bestFriends(g: GameSnapshot) {
  const about = (author: User, target: User) =>
    g.predictions.filter(p => p.authorId === author.id && p.targetId === target.id);

  const pairs: { userA: string; userB: string; avgRating: number }[] = [];
  for (let i = 0; i < g.users.length; i++) {
    for (let j = i + 1; j < g.users.length; j++) {
      const [a, b] = [g.users[i], g.users[j]];
      const bothWays = [...about(a, b), ...about(b, a)].filter(p => cameTrue(g, p));
      if (bothWays.length === 2) {
        pairs.push({ userA: a.name, userB: b.name, avgRating: meanRating(g, bothWays, 100) });
      }
    }
  }
  if (pairs.length === 0) return [];

  pairs.sort((x, y) => x.avgRating - y.avgRating);
  const topAvg = pairs[0].avgRating;
  return pairs.filter(p => Math.abs(p.avgRating - topAvg) < 0.01);
}

/** Last Minute: the most recently written or edited prediction. */
export function lastMinute(g: GameSnapshot): Prediction | null {
  return pickBest(g.predictions, (a, b) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '') > 0);
}

/** First to Submit: whoever's last prediction was written earliest. */
export function firstToSubmit(g: GameSnapshot) {
  const finished = g.users.flatMap(u => {
    const times = g.predictions.filter(p => p.authorId === u.id).map(p => p.updatedAt ?? '');
    const lastAt = times.sort().reverse()[0];
    return lastAt ? [{ name: u.name, lastAt }] : [];
  });
  if (finished.length === 0) return null;

  finished.sort((a, b) => a.lastAt.localeCompare(b.lastAt));
  const at = finished[0].lastAt;
  return { names: finished.filter(f => f.lastAt === at).map(f => f.name), at };
}
