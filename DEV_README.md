# Predictions — Dev Guide

## Prerequisites

- **Node.js** v20+ — https://nodejs.org
- **npm** v10+ (vine cu Node)
- **Fly CLI** (doar pentru deploy) — https://fly.io/docs/hands-on/install-flyctl/
  ```
  winget install flyctl   # Windows
  brew install flyctl     # Mac
  ```

---

## Instalare dependențe

La primul clone sau după ce cineva adaugă pachete noi:

```
npm install
cd client && npm install && cd ..
```

---

## Pornire în development

```
npm run dev
```

Pornește ambele servere în paralel:

| Serviciu | URL |
|---|---|
| Frontend (Vite + React) | http://localhost:5173 |
| Backend (Express + SQLite) | http://localhost:3011 |

Requesturile `/api/*` din frontend sunt proxied automat spre backend — nu trebuie configurat nimic.

Serverul se reîncarcă automat la orice modificare în `server/`. Clientul are HMR.

---

## Rulare teste

```
npm test                  # rulează toate testele o dată
npm run test:watch        # mod watch — re-rulează la modificări
```

Testele folosesc o bază de date in-memory separată, nu ating `predictions.db`.

---

## Baza de date

Fișierul SQLite se creează automat la prima pornire: `predictions.db`

Migrările rulează automat la fiecare startup (`server/db.ts`) — nu trebuie comandă separată.

Pentru a reseta jocul (păstrează userii):

```
tsx reset.ts
```

Pentru a vizualiza fișierul `.db` grafic: **DB Browser for SQLite** — https://sqlitebrowser.org

---

## Deploy pe Fly.io

### Prima dată (setup inițial)

```
fly auth login
fly launch        # doar dacă nu există fly.toml
```

### Deploy normal

```
fly deploy
```

Fly.io face automat build + deploy. Durează ~2-3 minute.

### Logs în timp real

```
fly logs
```

### Rollback la versiunea anterioară

```
fly releases                    # listează toate release-urile
fly deploy --image registry.fly.io/predictions-app:<version>
```

### Info aplicație

```
fly status                      # starea mașinii
fly ssh console                 # SSH în container
```

---

## Structura proiectului

```
/
├── server/             # Express backend
│   ├── routes/         # Endpoint-uri (admin, predictions, invite, etc.)
│   ├── schema.ts       # Definițiile tabelelor (Drizzle ORM)
│   ├── db.ts           # Inițializare DB + migrări
│   └── phase-scheduler.ts  # Auto-avansare faze (setInterval)
├── client/             # React frontend (Vite)
│   └── src/pages/      # Dashboard, Admin, Leaderboard, Bonus, Join etc.
├── tests/              # Teste Vitest
├── predictions.db      # SQLite (local, nu se commitează)
├── fly.toml            # Config Fly.io
└── DB_README.md        # Documentație completă bază de date
```

---

## Porturi

| Port | Serviciu | Unde |
|---|---|---|
| `3011` | Backend API | doar local (3001 era ocupat de Docker) |
| `3001` | Backend API | producție (Fly, setat prin env PORT) |
| `5173` | Frontend dev | doar local |

În producție, frontentul e servit static de backend pe portul `3001`.
