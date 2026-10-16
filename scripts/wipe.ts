import { db } from '../server/db';
import {
  users, predictions, predictionHistory, ratings, outcomes, notifications,
  bonusCategories, bonusVotes, inviteLinks, blockedTokens,
} from '../server/schema';

/** Delete every row except settings, children before parents (foreign keys are on). */
export function wipeAllData() {
  db.delete(notifications).run();
  db.delete(bonusVotes).run();
  db.delete(bonusCategories).run();
  db.delete(outcomes).run();
  db.delete(ratings).run();
  db.delete(predictionHistory).run();
  db.delete(predictions).run();
  db.delete(inviteLinks).run();
  db.delete(blockedTokens).run();
  db.delete(users).run();
}
