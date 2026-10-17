# Database

SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), queried with
[Drizzle ORM](https://orm.drizzle.team). The Drizzle table definitions live in
[`server/schema.ts`](../server/schema.ts); the SQL that creates and upgrades the database lives
in [`server/migrate.ts`](../server/migrate.ts) and runs on every startup.

Dates are stored as ISO-8601 text (`created_at` columns use SQLite's `YYYY-MM-DD HH:MM:SS`, UTC).
Booleans are `INTEGER` 0/1.

## Tables

One database holds many games. A game row is also that game's settings.

| Table | Purpose |
|---|---|
| `games` | One per game: `name`, a six-character `join_code`, `open_join`, `is_demo`, and its settings (current phase, deadlines, rating threshold, auto-advance, admin override, anonymous mode, bonus round on/off). |
| `users` | Players, each in one game (`game_id`). Login is by a secret `token`, unique across all games; `is_admin` marks the game's hosts. |
| `predictions` | One prediction per (author, target) pair, with its `game_id`. `current_text` is the latest version; `forgiven_edits` counts edits the admin chose not to penalise. |
| `prediction_history` | Previous texts of a prediction, one row per edit. Row count = edit count. |
| `ratings` | How likely each player thinks a prediction is, `score` 0-100. Unique per (prediction, user). Editing a prediction clears its ratings. |
| `outcomes` | Whether a prediction came true (`happened` 1/0, or NULL if unmarked). Marked by the prediction's target during the reveal phase. Unique per prediction. |
| `notifications` | In-app notifications: someone wrote about you, an outcome was marked, the phase changed, a token was regenerated. `meta` holds JSON details. |
| `bonus_categories` | A game's bonus-round categories ("Most likely to…") and how many points the winner gets (may be negative). |
| `bonus_votes` | Ranked ballots: each player picks a 1st, 2nd and 3rd nominee per category. Unique per (category, voter, rank). |
| `invite_links` | One-use registration links into a game. See [invite-links.md](invite-links.md). |
| `blocked_tokens` | Tokens that may never be used again (freed after a token conflict), across all games. |

## Relationships

```
games ──► users ──(author_id)──► predictions ◄── games
            │    ──(target_id)──►     │
            │                         ├──► prediction_history
            │                         ├──► ratings ◄──(user_id)── users
            │                         └──► outcomes ◄──(marked_by)── users
            │
            ├──► notifications        (user_id, author_id)
            ├──► bonus_votes ◄── bonus_categories ◄── games
            └──► invite_links ◄── games   (created_by, used_by)

blocked_tokens                        (no foreign keys)
```

`game_id` sits on the four tables a game owns directly; the others belong to a game through
their prediction, user or category. The server resolves the logged-in player's game once per
request and scopes every query to it, so ids from another game behave as if they did not exist
(see `tests/isolation.test.ts`).

Foreign keys are enforced (`PRAGMA foreign_keys = ON`), so deleting a player or a game removes
dependent rows first (see `DELETE /api/admin/users/:id` and `deleteGame()`).

## Migrations

Schema changes are numbered migrations in `server/migrate.ts`; `PRAGMA user_version` records how
many a database has had. `migrate()` runs the missing ones on startup, each in a transaction with
foreign keys off (so tables can be rebuilt) and a `PRAGMA foreign_key_check` before it commits.

| Version | What it does |
|---|---|
| 1 | The original single-game schema. Idempotent, because databases from before versioning report version 0 but may already have most of it. |
| 2 | Many games: creates `games`, turns the `settings` row into game #1 (named from `LEGACY_GAME_NAME`, invite-only), rebuilds `users`, `predictions`, `bonus_categories` and `invite_links` with a `game_id`, and drops `settings`. |

To change the schema, append a function to `MIGRATIONS` and update `server/schema.ts` to match.
SQLite can't alter constraints in place, so rebuild a table with `rebuildTable()` when needed.
Migrations never change once released. A fresh database goes through the same steps as
production, and tests build their in-memory databases with the same `migrate()`.

Before deploying a release that adds a migration, snapshot the Fly.io volume
(`fly volumes snapshots create <volume-id>`). Version 2 was rehearsed on a copy of the production
database first: same row counts, tokens unchanged, integrity and foreign key checks clean.

## Exports

Admins can download their game's data from **Admin → Settings → Export data**:

| Endpoint | Contents |
|---|---|
| `GET /api/admin/export/predictions.csv` | Every prediction with author, target, average rating, edits and outcome |
| `GET /api/admin/export/scores.csv` | Final leaderboard |
| `GET /api/admin/export/hof.csv` | Hall of Fame winners (same rules as the in-app Hall of Fame) |
| `GET /api/admin/export/game.json` | Everything in the game: settings, players, predictions, history, ratings, outcomes, bonus round, invite links |

There is no download of the raw database file, since it holds every game; the operator can copy
it off the volume with `fly ssh sftp get /data/predictions.db`. Exports include players' tokens,
so treat them as secrets.
