# GD Roulette

A level grinder tracker for Geometry Dash. Choose a difficulty and rating tier, get assigned a random matching level, log your progress (best %, attempts, notes), and track your history over time. Download your full records as JSON at any time.

## Stack

- **Next.js 16** (App Router) — frontend + API routes
- **Drizzle ORM** + **libsql** — SQLite for dev (file), [Turso](https://turso.tech) for production
- **Auth.js v5** — email/password + JWT sessions (no adapter, no extra tables)
- **Level data** — proxies the real GD servers (boomlings.com), same as GDBrowser does internally. Synced into a local cache; never called live on user requests.

## Quick start

### 1. Install

```bash
npm install
```

### 2. Configure env

```bash
cp .env.example .env.local
```

Fill in `AUTH_SECRET` (run: `openssl rand -base64 32`) and `SYNC_SECRET` (any string). Leave `DATABASE_URL=file:./dev.db` for local SQLite.

### 3. Create tables

```bash
npx drizzle-kit push
```

Reads `db/schema.ts` and creates the `users`, `levels`, and `attempts` tables. No migration files needed for local dev with SQLite.

### 4. Populate the level cache

The roulette draws from the local `levels` table. Seed it once the dev server is running:

```bash
npm run dev
# in another terminal:
curl -X POST http://localhost:3000/api/sync-levels \
  -H "Authorization: Bearer <your SYNC_SECRET>"
```

This calls boomlings.com across all difficulty/type combos and upserts into your local DB. Takes ~30 seconds. Re-run to refresh data.

### 5. Run

```bash
npm run dev
```

Go to `http://localhost:3000`, create an account, and start grinding.

---

## Production (Vercel + Turso)

1. Create a free [Turso](https://turso.tech) database and note the URL + auth token.
2. Run `npx drizzle-kit push` pointing at Turso to create tables.
3. Set in Vercel: `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `AUTH_SECRET`, `SYNC_SECRET`, `NEXTAUTH_URL`
4. Deploy. Add a `vercel.json` cron to call `/api/sync-levels` daily with the bearer token.

---

## API reference

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/auth/register` | POST | none | Create account |
| `/api/auth/[...nextauth]` | GET/POST | — | Auth.js handler |
| `/api/levels/random` | POST | session | Get a random level; creates pending attempt |
| `/api/attempts` | GET | session | List attempts (`?status=pending|completed|skipped|abandoned`) |
| `/api/attempts` | PATCH | session | Update progress or resolve attempt |
| `/api/stats` | GET | session | Aggregate completion stats |
| `/api/export` | GET | session | Download full history as JSON |
| `/api/sync-levels` | POST | SYNC_SECRET bearer | Sync levels from GD servers |

## Architecture notes

- **Author names**: GD's search response sends `playerID`, not the username string. The author field stores the playerID unless you add a profile-lookup enrichment step to the sync job.
- **Level cache**: The app never touches boomlings.com on a live user request — only the sync job does. This keeps request latency predictable and avoids rate-limiting.
- **Switching to Postgres**: swap `drizzle-orm/libsql` for `drizzle-orm/postgres-js` in `db/client.ts` and set `dialect: "postgresql"` in `drizzle.config.ts`. The schema is unchanged.
