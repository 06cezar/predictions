# Database

SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), queried with
[Drizzle ORM](https://orm.drizzle.team). The Drizzle table definitions live in
[`server/schema.ts`](../server/schema.ts); the SQL that creates and upgrades the database lives
in [`server/migrate.ts`](../server/migrate.ts) and runs on every startup.

Dates are stored as ISO-8601 text. Booleans are `INTEGER` 0/1.

## Tables

| Table | Purpose |
|---|---|
| `users` | Players. Login is by a secret `token` (no passwords); `is_admin` marks the game host. |
| `predictions` | One prediction per (author, target) pair. `current_text` is the latest version; `forgiven_edits` counts edits the admin chose not to penalise. |
| `prediction_history` | Previous texts of a prediction, one row per edit. Row count = edit count. |
| `ratings` | How likely each player thinks a prediction is, `score` 0-100. Unique per (prediction, user). Editing a prediction clears its ratings. |
| `outcomes` | Whether a prediction came true (`happened` 1/0, or NULL if unmarked). Marked by the prediction's target during the reveal phase. Unique per prediction. |
| `settings` | Single row (`id = 1`): current phase, deadlines, rating threshold, auto-advance, admin override, anonymous mode, bonus round on/off. |
| `notifications` | In-app notifications: someone wrote about you, an outcome was marked, the phase changed, a token was regenerated. `meta` holds JSON details. |
| `bonus_categories` | Bonus-round categories ("Most likely to…") and how many points the winner gets (may be negative). |
| `bonus_votes` | Ranked ballots: each player picks a 1st, 2nd and 3rd nominee per category. Unique per (category, voter, rank). |
| `invite_links` | One-use registration links created by the admin. See [invite-links.md](invite-links.md). |
| `blocked_tokens` | Tokens that may never be used again (freed after an invite token conflict). |

## Relationships

```
users ──(author_id)──► predictions ──► prediction_history
  │    ──(target_id)──►     │
  │                         ├──► ratings ◄──(user_id)── users
  │                         └──► outcomes ◄──(marked_by)── users
  │
  ├──► notifications        (user_id, author_id)
  ├──► bonus_votes ◄── bonus_categories   (voter_id, nominee_id)
  └──► invite_links         (created_by, used_by)

blocked_tokens              (no foreign keys)
```

Foreign keys are enforced (`PRAGMA foreign_keys = ON`), so deleting a user removes their
dependent rows first (see `DELETE /api/admin/users/:id`).

## Schema changes

`applySchema()` creates the full current schema with `CREATE TABLE IF NOT EXISTS`, then adds any
columns an older database is missing (checked with `PRAGMA table_info`). To add a column:

1. Add it to the table in `server/schema.ts`.
2. Add it to the matching `CREATE TABLE` in `server/migrate.ts`.
3. Append it to `ADDED_COLUMNS` in the same file so existing databases get it too.

Tests run against an in-memory database built by the same `applySchema()`.

## Exports

Admins can download data from **Admin → Settings → Export data**:

| Endpoint | Contents |
|---|---|
| `GET /api/admin/export/predictions.csv` | Every prediction with author, target, average rating, edits and outcome |
| `GET /api/admin/export/scores.csv` | Final leaderboard |
| `GET /api/admin/export/hof.csv` | Hall of Fame winners (same rules as the in-app Hall of Fame) |
| `GET /api/admin/export/db` | The raw `predictions.db` file |

The database file contains every player's login token in plain text, so treat exports as secrets.
