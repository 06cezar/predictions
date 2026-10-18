import { Response } from 'express';
import { Game } from './games';
import { GameSnapshot, Prediction, roundedAvgRating } from './snapshot';
import { calcScores } from './scoring';
import * as awards from './awards';
import { toIso } from '../time';

/**
 * One quoted CSV cell. Text that starts like a formula (=, +, -, @) gets a
 * leading ' so a spreadsheet shows it instead of running it: names and
 * predictions are written by players.
 */
function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

const csv = (header: string, rows: string[]) => [header, ...rows].join('\n');

export function sendCsv(res: Response, filename: string, content: string) {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(content);
}

/** The leaderboard as CSV. */
export function scoresCsv(game: Game, g: GameSnapshot) {
  const rows = calcScores(game.id, g, game.ratingThreshold).map(u =>
    [u.rank, csvCell(u.name), u.score, u.weightedScore].join(','),
  );
  return csv('Rank,Name,True Predictions,Weighted Score', rows);
}

/** Every prediction with its ratings, edits and outcome. */
export function predictionsCsv(g: GameSnapshot) {
  const rows = g.predictions.map(p => {
    const happened = g.outcome(p.id)?.happened;
    return [
      p.id,
      csvCell(g.userName(p.authorId)),
      csvCell(g.userName(p.targetId)),
      csvCell(p.currentText),
      roundedAvgRating(g, p.id) ?? '',
      g.ratings(p.id).length,
      g.history(p.id).length,
      happened == null ? '' : String(happened),
    ].join(',');
  });
  return csv('ID,Author,Target,Text,Avg Rating,Rating Count,Edit Count,Outcome', rows);
}

/** The Hall of Fame as CSV, using the same award rules as the app. */
export function hallOfFameCsv(game: Game, g: GameSnapshot) {
  const name = (id: number) => g.userName(id) ?? '';
  const author = (p: Prediction) => (game.anonymousPredictions ? '?' : name(p.authorId));
  const about = (p: Prediction, detail: string) => `About ${name(p.targetId)} - ${detail} - ${p.currentText}`;
  const names = (winners: { name: string }[]) => winners.map(w => w.name).join(', ');
  const rows: string[][] = [];

  const courageous = awards.mostCourageous(g);
  if (courageous) {
    rows.push([
      'Most Courageous',
      author(courageous.prediction),
      about(courageous.prediction, `avg ${Math.round(courageous.avg)}%`),
    ]);
  }

  const miss = awards.biggestMiss(g);
  if (miss) {
    rows.push(['Biggest Miss', author(miss.prediction), about(miss.prediction, `avg ${Math.round(miss.avg)}%`)]);
  }

  const controversial = awards.mostControversial(g);
  if (controversial) {
    const detail = `avg ${Math.round(controversial.avg)}%, spread ${Math.round(controversial.stdDev)}`;
    rows.push(['Most Controversial', author(controversial.prediction), about(controversial.prediction, detail)]);
  }

  const revised = awards.mostRevised(g);
  if (revised) {
    const edits = revised.history.length;
    rows.push([
      "Can't Make Up Their Mind",
      author(revised.prediction),
      about(revised.prediction, `${edits} edit${edits !== 1 ? 's' : ''}`),
    ]);
  }

  const stars = awards.starOfTheShow(g);
  if (stars.length > 0) rows.push(['Star of the Show', names(stars), `${stars[0].count} true predictions`]);

  const jokers = awards.theJoker(g);
  if (jokers.length > 0) rows.push(['The Joker', names(jokers), `${jokers[0].count} true predictions`]);

  const friends = awards.bestFriends(g);
  if (friends.length > 0) rows.push(['Best Friends', friends.map(p => `${p.userA} & ${p.userB}`).join(', '), '']);

  const latest = awards.lastMinute(g);
  if (latest) rows.push(['Last Minute', author(latest), about(latest, toIso(latest.updatedAt))]);

  const first = awards.firstToSubmit(g);
  if (first) rows.push(['First to Submit', first.names.join(', '), first.at]);

  return csv(
    'Category,Winner,Detail',
    rows.map(r => r.map(csvCell).join(',')),
  );
}
