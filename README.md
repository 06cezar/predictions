# Predictions

A social prediction game. Everyone in a group writes one prediction about each friend's year,
the group secretly rates how likely each prediction is, and when the deadline passes the
predictions are revealed and their targets mark what actually came true. Bold calls that come
true score the most.

It started as a game for my own friend group. Now anyone can run their own game on the same
deployment, or try it alone in a private demo with bot players.

**Try it:** https://predictions-app.fly.dev → **Try the demo** (no sign-up; you get a private
game with four bots, as its admin).

**Stack:** TypeScript · React 18 · Vite · Tailwind CSS · Express · SQLite (better-sqlite3) ·
Drizzle ORM · Vitest + Supertest · Docker · Fly.io · GitHub Actions

## How a game works

| Phase | What players do |
|---|---|
| **Submission** | Write (and edit) one prediction about each other player. Rate other people's predictions about the friends you also wrote about, from 0% (no way) to 100% (certain). Predictions about you stay hidden from you until the reveal. |
| **Reveal** | See the predictions written about you and mark each one as happened / didn't happen. |
| **Done** | The leaderboard and Hall of Fame unlock. |

Phases advance automatically at their deadlines (a scheduler checks every minute) or manually
from the admin panel.

### Games and players

- **Create a game** from the start page: name it and yourself, and you become its admin.
- **Join a game** with its six-character code (or the `/game/CODE` link) while it's in the
  submission phase. Admins can close open joining, issue a new code, send one-use invite links,
  or add players themselves.
- **Log in** with your token: one field, no passwords. Tokens are unique across all games, so a
  token also tells the server which game you're in.
- **Try the demo**: a fresh private game where four bots have already written and rated
  predictions. When you move it to the reveal, the bots mark their outcomes, so you can play it
  through to the Hall of Fame alone. Demos delete themselves after three days.

### Scoring

Authors score for each of their predictions that came true. The fewer people believed it, the more
it is worth. With rating threshold `T` (default 50%):

| Group's average rating | Points |
|---|---|
| below 25% of `T` | 5 |
| below 50% of `T` | 4 |
| below 75% of `T` | 3 |
| below `T` | 2 |
| `T` or higher | 1 |

Each edit costs 0.5 points (minimum 0.5 per prediction) and clears the prediction's ratings, so
the group re-rates the new text. The admin can forgive individual edits. An optional
**bonus round** adds ranked-choice voting categories ("most likely to…") whose winners get extra points.

### Hall of Fame

Nine awards computed when the game ends, such as **Most Courageous** (came true despite the
lowest rating), **Biggest Miss**, **Most Controversial** (widest spread of ratings),
**Best Friends** (two players whose predictions about each other both came true) and
**The Joker** (the player nobody could predict).

### Other features

- **Anonymous mode** (admin setting) hides who wrote each prediction.
- **In-app notifications** for new predictions about you, marked outcomes and phase changes.
- **Admin panel:** manage players, monitor submission/rating/reveal progress, preview the leaderboard
  before the end, change settings and deadlines, export CSVs or the whole game as JSON.

## Architecture

```
client/              React SPA (Vite, React Router, Tailwind)
  pages/admin/       one component per admin tab
server/
  index.ts           entry point: migrations, phase scheduler, static files in production
  app.ts             Express app: sessions, rate limits, route mounting
  auth.ts            loads the player and their game into res.locals for every request
  routes/            thin HTTP handlers, one file per resource
  services/          game logic with no HTTP:
    games.ts           games, join codes, wiping/deleting a game
    tokens.ts          token generation and conflict-safe claiming
    snapshot.ts        a game's data, loaded with one query per table
    scoring.ts         leaderboard scoring and bonus tallies
    awards.ts          the nine Hall of Fame awards as pure functions
    phases.ts          the single place a game changes phase
    demo.ts            demo content, bots marking outcomes, expiry
  migrate.ts         versioned schema migrations (PRAGMA user_version)
  schema.ts          Drizzle table definitions
tests/               Vitest + Supertest tests against in-memory SQLite
scripts/             seed and reset utilities
```

- **Many games, one database.** Every game is a row; players, predictions, bonus categories and
  invite links carry a `game_id`, and everything else hangs off those. `requireAuth` resolves the
  player's game once per request, and every lookup by id is scoped to it: another game's ids
  answer 404, as if they didn't exist.
- **Versioned migrations.** Numbered migrations run on startup in a transaction with a foreign
  key check. Moving from one game to many (v2) rebuilt four tables and turned the original
  settings row into game #1. It was rehearsed on a copy of the production database before
  release, so the original group kept every row and every token.
- **Scoring and awards work on an in-memory snapshot.** Each request loads the game with one
  query per table, then computes the results with pure functions. The API and the CSV exports
  share the same functions, so they always agree.
- **Tested through the HTTP API.** About 250 tests cover auth, phase rules, permissions, scoring
  edge cases, invite and join flows, every award, the migrations, and a game-isolation suite in
  which players and admins of one game try to read or change another.
- **Single-process SQLite.** WAL mode on a Fly.io volume is plenty for this and keeps hosting
  free. Sessions are stored in SQLite too, so restarts don't log anyone out.
- **Hardening:** rate limits on login, game creation and joining. `httpOnly`/`secure`/`sameSite`
  session cookies, and a required `SESSION_SECRET` in production. A token that is already
  taken is rotated rather than confirmed, so nobody can probe for working logins
  ([design notes](docs/invite-links.md)).

More detail: [database and migrations](docs/database.md) · [tokens, invites and join codes](docs/invite-links.md).

## Running locally

Requires Node.js 20+.

```bash
npm install
npm install --prefix client
npm run dev       # API on :3011, web app on :5173
```

Open http://localhost:5173 and click **Try the demo**, or create a game. To get a game with
known tokens instead, run `npm run seed` first and log in as `lion-sunset-42` (admin) or
`thunder-storm-17`.

| Command | |
|---|---|
| `npm test` | run the test suite |
| `npm run typecheck` | type-check server, tests and client |
| `npm run build` | build the client and compile the server to `dist/` |
| `npm start` | run the production build |
| `npm run seed -- --force` | wipe every game and re-seed the demo game |
| `ADMIN_TOKEN=... npm run reset` | wipe everything and start with one game and its admin |

Configuration is through environment variables. See [`.env.example`](.env.example).

## Deploying

The multi-stage [Dockerfile](Dockerfile) builds the client and server, then ships a slim runtime
image. On Fly.io ([fly.toml](fly.toml)) the SQLite files live on a persistent volume mounted at
`/data`:

```bash
fly secrets set SESSION_SECRET=...
fly volumes snapshots create <volume-id>   # before a release that migrates the schema
fly deploy
```

Migrations run when the server starts. On a fresh install, setting `ADMIN_TOKEN` (and optionally
`ADMIN_NAME`, `ADMIN_GAME_NAME`) creates a first game and its admin.
