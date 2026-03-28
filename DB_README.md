# Database Structure — Predictions App

> Baza de date folosește **SQLite** (via Drizzle ORM), dar tipurile de mai jos sunt scrise în sintaxă **Oracle SQL** pentru claritate.
> Toate datele calendaristice sunt stocate ca `VARCHAR2` (ISO 8601 UTC, ex: `'2026-03-25T14:00:00.000Z'`).

---

## Tabele

### USERS

```sql
CREATE TABLE users (
    id          NUMBER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR2(255)   NOT NULL,
    token       VARCHAR2(255)   NOT NULL UNIQUE,       -- token de autentificare (Bearer)
    is_admin    NUMBER(1)       DEFAULT 0 NOT NULL,    -- 0 = user, 1 = admin
    created_at  VARCHAR2(30)    DEFAULT (datetime('now')) NOT NULL
);
```

---

### PREDICTIONS

```sql
CREATE TABLE predictions (
    id            NUMBER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    author_id     NUMBER          NOT NULL REFERENCES users(id),   -- cel care a scris predicția
    target_id     NUMBER          NOT NULL REFERENCES users(id),   -- persoana despre care e predicția
    current_text  VARCHAR2(4000)  NOT NULL,                        -- textul curent (după eventuale editări)
    created_at    VARCHAR2(30)    DEFAULT (datetime('now')) NOT NULL,
    updated_at    VARCHAR2(30)    DEFAULT (datetime('now')) NOT NULL
);
```

---

### PREDICTION_HISTORY

Stochează versiunile anterioare ale unei predicții ori de câte ori e editată.

```sql
CREATE TABLE prediction_history (
    id             NUMBER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    prediction_id  NUMBER          NOT NULL REFERENCES predictions(id),
    old_text       VARCHAR2(4000)  NOT NULL,   -- textul ÎNAINTE de editare
    edited_at      VARCHAR2(30)    DEFAULT (datetime('now')) NOT NULL
);
```

> Numărul de rânduri din `prediction_history` pentru o predicție = numărul de editări.
> Penalizare la scor: `-0.5 pt / editare`, minim `0.5 pt` (aplică doar dacă predicția s-a adeverit).

---

### RATINGS

Un rating per utilizator per predicție (constrângere UNIQUE compusă).

```sql
CREATE TABLE ratings (
    id             NUMBER   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    prediction_id  NUMBER   NOT NULL REFERENCES predictions(id),
    user_id        NUMBER   NOT NULL REFERENCES users(id),
    score          NUMBER   NOT NULL,   -- valoare între 0 și 100 (probabilitate percepută)

    CONSTRAINT unique_rating UNIQUE (prediction_id, user_id)
);
```

> `score` reprezintă cât de probabilă credea utilizatorul că e predicția (0% = imposibil, 100% = sigur).
> Media tuturor ratingurilor (`AVG(score)`) determină tier-ul de bonus la punctaj.

---

### OUTCOMES

Rezultatul final al unei predicții (s-a adeverit sau nu). Marcat de admin în faza Reveal.

```sql
CREATE TABLE outcomes (
    id             NUMBER        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    prediction_id  NUMBER        NOT NULL REFERENCES predictions(id),
    happened       NUMBER(1),    -- NULL = nedecis, 1 = s-a adeverit, 0 = nu s-a adeverit
    marked_by      NUMBER        NOT NULL REFERENCES users(id),   -- adminul care a marcat
    marked_at      VARCHAR2(30)  DEFAULT (datetime('now')) NOT NULL,

    CONSTRAINT unique_outcome UNIQUE (prediction_id)
);
```

---

### SETTINGS

Un singur rând (id = 1) — configurația globală a jocului.

```sql
CREATE TABLE settings (
    id                    NUMBER        PRIMARY KEY,   -- întotdeauna 1
    current_phase         VARCHAR2(20)  DEFAULT 'submission' NOT NULL,
                                        -- valori posibile: 'submission' | 'reveal' | 'done'
    submission_deadline   VARCHAR2(30),  -- ISO 8601 UTC; NULL = fără deadline
    reveal_deadline       VARCHAR2(30),  -- ISO 8601 UTC; NULL = fără deadline
    rating_threshold      NUMBER        DEFAULT 50 NOT NULL,
                                        -- pragul (%) care separă tier-urile de scoring
    auto_advance_phase    NUMBER(1)     DEFAULT 1 NOT NULL,  -- 1 = avansare automată la deadline
    admin_override        NUMBER(1)     DEFAULT 0 NOT NULL,  -- 1 = adminul vede leaderboard indiferent de fază
    anonymous_predictions NUMBER(1)     DEFAULT 1 NOT NULL,  -- 1 = numele autorului e ascuns în Rate/Leaderboard
    bonus_active          NUMBER(1)     DEFAULT 0 NOT NULL   -- 1 = runda bonus e activă (independent de fază)
);
```

---

### NOTIFICATIONS

Notificări pentru utilizatori (predicții noi despre ei, outcome-uri marcate, etc.).

```sql
CREATE TABLE notifications (
    id          NUMBER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     NUMBER          NOT NULL REFERENCES users(id),
    type        VARCHAR2(50)    NOT NULL,       -- 'prediction_about_you' | 'outcome_marked'
    author_id   NUMBER          REFERENCES users(id),
    meta        VARCHAR2(4000),                 -- JSON string cu date extra
    read        NUMBER(1)       DEFAULT 0 NOT NULL,
    dismissed   NUMBER(1)       DEFAULT 0 NOT NULL,
    created_at  VARCHAR2(30)    DEFAULT (datetime('now')) NOT NULL
);
```

---

### BONUS_CATEGORIES

Categoriile pentru runda bonus (e.g. "Best Predictor", "Most Creative").

```sql
CREATE TABLE bonus_categories (
    id          NUMBER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR2(255)   NOT NULL,
    points      NUMBER          DEFAULT 5 NOT NULL,   -- puncte acordate câștigătorului categoriei
    created_at  VARCHAR2(30)    DEFAULT (datetime('now')) NOT NULL
);
```

---

### BONUS_VOTES

Voturile din runda bonus — fiecare user alege top 3 nominalizări per categorie.

```sql
CREATE TABLE bonus_votes (
    id           NUMBER   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_id  NUMBER   NOT NULL REFERENCES bonus_categories(id),
    voter_id     NUMBER   NOT NULL REFERENCES users(id),
    nominee_id   NUMBER   NOT NULL REFERENCES users(id),
    rank         NUMBER   NOT NULL,   -- 1, 2 sau 3

    CONSTRAINT unique_vote_slot UNIQUE (category_id, voter_id, rank)
);
```

> Fiecare utilizator poate vota o dată per slot (categorie + rank).
> Rank 1 = cel mai votat, Rank 3 = al treilea.

---

## Diagrama relațiilor

```
USERS ──────────────────────────────────────────────────────┐
  │  (author_id)                                            │
  │──────────────► PREDICTIONS ──────► PREDICTION_HISTORY   │
  │  (target_id)        │                                   │
  └────────────────►    │──────────────► RATINGS            │
                        │                   │               │
                        │                   └── (user_id) ──┘
                        │
                        └──────────────► OUTCOMES
                                             │
                                         (marked_by) ───────┘

USERS ──► NOTIFICATIONS   (user_id, author_id)

USERS ──► BONUS_VOTES ◄── BONUS_CATEGORIES
           (voter_id, nominee_id)    (category_id)
```

---

## Logica de scoring

| Condiție (AVG rating al predicției) | Bonus   |
|-------------------------------------|---------|
| `avg < floor(threshold × 0.25)`     | **5 pt** |
| `avg < floor(threshold × 0.50)`     | **4 pt** |
| `avg < floor(threshold × 0.75)`     | **3 pt** |
| `avg < threshold`                   | **2 pt** |
| `avg ≥ threshold`                   | **1 pt** |
| Predicție **falsă** (`happened = 0`) | **0 pt** |

- **Penalizare editări:** `-0.5 pt` per editare (doar pentru predicții adevărate), minim `0.5 pt`.
- **Weighted score** = suma bonusurilor − penalizări → criteriu principal de clasament.
- **Score** = număr de predicții adevărate → criteriu secundar.

---

## Faze ale jocului

| Fază         | Ce se poate face                                              |
|--------------|---------------------------------------------------------------|
| `submission` | Utilizatorii scriu și editează predicții; se pot da ratinguri |
| `reveal`     | Adminul marchează outcome-urile; ratingurile sunt blocate     |
| `done`       | Leaderboard-ul devine public; Hall of Fame vizibil            |

Avansarea între faze se face manual (admin) sau automat la expirarea deadline-ului (`auto_advance_phase = 1`).

---

## Runda Bonus

`bonus_active` este un **boolean independent** de fază — runda bonus poate rula **în paralel** cu orice fază (ex: reveal + bonus simultan).

- Când `bonus_active = 1`, utilizatorii pot vota top 3 nominalizări per categorie bonus.
- Votarea bonus se blochează doar când `bonus_active = 0` sau faza este `done`.
- Categoriile și punctele sunt configurabile de admin.
