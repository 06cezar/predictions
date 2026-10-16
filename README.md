# Predictions

A social prediction game for a group of friends. Everyone writes one prediction about each
friend's year, the group secretly rates how likely each prediction is, and when the deadline
passes the predictions are revealed and their targets mark what actually came true. Bold calls
that come true score the most.

Built for and played by my own friend group, deployed on Fly.io.

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

- **Token login and one-use invite links.** No passwords; new players join through a link and pick
  their own token. Token collisions are handled so nobody can take over another account
  ([design notes](docs/invite-links.md)).
- **Anonymous mode** (admin setting) hides who wrote each prediction.
- **In-app notifications** for new predictions about you, marked outcomes and phase changes.
- **Admin panel:** manage players, monitor submission/rating/reveal progress, preview the leaderboard
  before the end, change settings and deadlines, export CSVs or the whole database.

## Architecture

```
client/            React SPA (Vite, React Router, Tailwind)
server/
  index.ts         entry point: DB init, phase scheduler, static files in production
  app.ts           Express app: sessions, rate limiting, route mounting
  routes/          thin HTTP handlers, one file per resource
  services/        game logic with no HTTP: settings, scoring, Hall of Fame awards
  migrate.ts       idempotent schema creation and upgrades, run on startup
  schema.ts        Drizzle table definitions
tests/             Vitest + Supertest API tests against an in-memory SQLite database
scripts/           seed and reset utilities
```

- **Single-process, single-file database.** SQLite in WAL mode on a Fly.io volume is plenty for a
  friend group and keeps hosting free. Sessions are stored in SQLite too, so restarts don't log
  anyone out.
- **Scoring and awards work on an in-memory snapshot.** Each request loads the game with one
  query per table, then computes the results with pure functions. The API and the CSV exports
  share the same functions, so they always agree.
- **Tested through the HTTP API.** About 200 tests cover auth, phase rules, permissions, scoring
  edge cases, invite-link conflicts and every award, each against a fresh in-memory database.
- **Hardening:** rate-limited login, `httpOnly`/`secure`/`sameSite` session cookies, a required
  `SESSION_SECRET` in production, role checks on every protected route.

More detail: [database and schema](docs/database.md) · [invite links](docs/invite-links.md).

## Running locally

Requires Node.js 20+.

```bash
npm install
npm install --prefix client
npm run seed      # demo game with five players
npm run dev       # API on :3011, web app on :5173
```

Open http://localhost:5173 and log in with one of the demo tokens printed by the seed script,
e.g. `lion-sunset-42` (admin) or `thunder-storm-17`.

| Command | |
|---|---|
| `npm test` | run the test suite |
| `npm run typecheck` | type-check server, tests and client |
| `npm run build` | build the client and compile the server to `dist/` |
| `npm start` | run the production build |
| `npm run seed -- --force` | wipe and re-seed the demo game |
| `ADMIN_TOKEN=... npm run reset` | wipe everything and start with a single admin |

Configuration is through environment variables. See [`.env.example`](.env.example).

## Deploying

The multi-stage [Dockerfile](Dockerfile) builds the client and server, then ships a slim runtime
image. On Fly.io ([fly.toml](fly.toml)) the SQLite files live on a persistent volume mounted at
`/data`:

```bash
fly secrets set SESSION_SECRET=... ADMIN_TOKEN=... ADMIN_NAME=...
fly deploy
```

The first admin is created from `ADMIN_TOKEN` when the database is empty.
