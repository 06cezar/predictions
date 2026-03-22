# Predictions

A social prediction game where friends write predictions about each other's futures, rate them, and reveal them after a deadline.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   cd client && npm install && cd ..
   ```

2. Seed the database:
   ```bash
   npm run seed
   ```

3. Start the app:
   ```bash
   npm run dev
   ```

4. Open http://localhost:5173 in your browser and use one of the tokens printed by the seed command.

## Tokens (from seed)

| User         | Token                  |
|--------------|------------------------|
| Alex (Admin) | lion-sunset-42         |
| Jordan       | thunder-storm-17       |
| Morgan       | silver-tide-88         |
| Casey        | golden-ember-33        |
| River        | crystal-wave-55        |

## Phases

- **Submission**: Write and rate predictions (default phase)
- **Reveal**: Targets can see predictions about them and mark outcomes
- **Done**: Game over, view the leaderboard

## Admin

Log in with the admin token and visit /admin to manage users, view all predictions, and control phase/settings.
