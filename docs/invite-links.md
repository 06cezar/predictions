# Invite Links

## What is this?

Instead of the admin manually creating accounts and handing out tokens, the admin can generate a
one-use invite link and send it to the new user. The new user opens the link, picks their own name
and optionally their own token, and gets registered automatically.

---

## Perspectives

### Admin

- Goes to **Admin panel > Invites tab**
- Clicks **+ Generate Link** - a unique link is created (e.g. `https://app.com/join/CzB8Z7KhuR-1`)
- Clicks **Copy Link** and sends it to the new user (WhatsApp, email, etc.)
- The link shows as **Active** until someone uses it, then **Used** with the name of who registered
- Can **Revoke** an unused link at any time (cannot revoke one that was already used)

### New user - no token conflict

1. Opens the link in their browser
2. Sees a form with two fields: **name** (required) and **token** (optional)
3. If they leave the token blank - one is auto-generated (e.g. `swift-lion-42`)
4. If they type a token that no one else has - it is accepted
5. They are registered and immediately logged in
6. The link becomes **Used** - nobody else can register through it

### New user - token conflict (someone else already has that token)

1. They type a token that already belongs to another user
2. They see the error: **"That token is already in use - please choose a different one"**
3. They are **NOT** registered
4. The link stays **Active** - they can try again with a different token

### Old user (the one whose token was taken)

This is the most important and subtle case. The reasoning:

> If the new user types your token and we just show them an error, they now **know your token**.
> They could use it to log into your account.

So when a conflict happens:

1. The old user's token is **silently regenerated** to a new random one (e.g. `brave-elk-73`)
   - The system loops random tokens until it finds one that nobody else has
2. The old user's **active session is not affected** - they stay logged in
3. They will only notice something changed the next time their session expires and they try to log
   in with their old token - it will no longer work
4. **The admin is notified** and must send the old user their new token

---

## Admin notification on conflict

When a token conflict happens, the admin receives a notification in their panel:

> `[OldName]'s token was regenerated - conflict with [NewName] (invite link)`

The admin is responsible for reaching out to the old user and giving them their new token.
The new token is visible in **Admin > Users** (Copy Token button).

---

## Solved issue - double attempt on conflict

When a token conflict happens, the old user's token is freed (regenerated to something else).
This means the freed token is now available in the database.

If the new user tries the **same token a second time**, there is no longer a conflict - they
register successfully with that token.

This creates a secondary problem: **the old user, not knowing their token changed, tries to log
in with their old token and ends up logging into the new user's account** (same token = same
login, sessions are userId-based once logged in, but the login lookup is by token).

In short:
- Attacker retries with freed token → gets a new account with that token
- Old user retries login with old token → logs into the attacker's new account by mistake

**Fix:** the freed token is immediately inserted into the `blocked_tokens` table at the moment
of conflict. Any subsequent attempt to use it - via invite join or admin create-user - returns
409. Auto-generation also skips blocked tokens.

---

## Why one-use links?

A link that can be used multiple times would allow anyone who gets hold of it to create as many
accounts as they want. One-use means one link = one new user.

---


## Edge cases

| Situation | What happens |
|---|---|
| User opens an already-used link | Page shows "This invite link has already been used" |
| User opens a non-existent / revoked link | Page shows "Invite link not found" |
| User submits without a name | Error: "Name is required" |
| Logged-in user visits a join link | Redirected to home (`/`) |
| Token conflict with admin's token | Admin's token is also regenerated - same flow |

---

## Technical details

### Database tables

#### `invite_links`

| Column | Type | Description |
|---|---|---|
| `id` | integer PK | auto-increment |
| `code` | text UNIQUE | random 12-char code (nanoid), used in the URL |
| `created_by` | FK → users | admin who generated the link |
| `used_by` | FK → users | user who registered (null if unused) |
| `used_at` | text | ISO timestamp of registration |
| `created_at` | text | ISO timestamp of creation |

#### `blocked_tokens`

| Column | Type | Description |
|---|---|---|
| `id` | integer PK | auto-increment |
| `token` | text UNIQUE | token that can never be used again |
| `created_at` | text | ISO timestamp of when it was blocked |

Populated automatically whenever a token conflict occurs. Checked by both the invite join flow
and the admin create-user flow.

### API endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/invite` | Admin | List all links with status |
| `POST` | `/api/invite` | Admin | Generate a new link |
| `DELETE` | `/api/invite/:id` | Admin | Revoke an unused link |
| `GET` | `/api/invite/join/:code` | Public | Check if a link is valid |
| `POST` | `/api/invite/join/:code` | Public | Register through a link |

### Token auto-generation

Format: `adjective-noun-NN` (e.g. `swift-lion-42`, `calm-fox-18`).
On conflict, the old user's new token is generated in a loop until a unique one is found
(max 100 attempts, then falls back to `user-{nanoid8}`).

### Client route

`/join/:code` - accessible only when not logged in. Logged-in users are redirected to `/`.
