# Reddit Signals — DryDock AI

Finds buyer-intent threads on Reddit (plus Hacker News, GitHub, Stack Overflow
and, through Apify, X and LinkedIn), scores them, drafts a reply in DryDock's
voice, and tracks what the moderators of each community will and will not
tolerate.

**Nothing is ever posted automatically.** A named human opens the draft, reads
the moderation gate, and presses the button. That is the design, not a setting.

---

## What is inside

| | |
|---|---|
| `src/app/(app)` | The signed-in application. Everything here requires a session. |
| `src/app/login` | The only page that does not. |
| `src/lib/poll.ts` | The pipeline: fetch → resolve person → score → route → alert. |
| `src/lib/moderation.ts` | Standing with each community, the circuit breakers, the permission ledger. |
| `src/lib/playbook.ts` | What the AI is allowed to say, and the DryDock defaults. |
| `src/lib/auth.ts` | Sessions, scrypt password hashing, login throttling. |
| `prisma/migrations` | Applied in order by `scripts/migrate.mjs`, not the Prisma CLI. |

---

## Running it locally

```bash
cp .env.example .env          # fill in AUTH_SECRET at minimum
npm install
npm run db:generate           # regenerate the Prisma client after schema edits
npm run db:migrate            # apply migrations to ./dev.db
npm run db:seed               # workspace defaults
node scripts/create-user.mjs you@example.com "Your Name" --admin
npm run dev
```

`AUTH_SECRET` must be at least 32 characters or the app refuses to serve
anything — that is deliberate, since without it no session can be verified.

```bash
openssl rand -hex 32
```

To look at the UI without any credentials, set `MOCK_REDDIT=1`, `MOCK_AI=1` and
`MOCK_SOURCES=1`. Fixture threads are written to match the DryDock monitor
keywords, so a mock poll actually returns something.

---

## Deploying to a VPS

Anything that runs Docker will do — Hetzner CX22, a DigitalOcean droplet, a
small EC2 instance. Two vCPU and 2 GB of RAM is comfortable.

**1. Point DNS at the box first.** Caddy asks Let's Encrypt for a certificate on
first boot, and the challenge fails if `APP_DOMAIN` does not already resolve to
this host.

**2. Get the code and the configuration onto it.**

```bash
git clone https://github.com/Suralal001/reddit-signals.git
cd reddit-signals
cp .env.example .env
$EDITOR .env          # AUTH_SECRET, APP_DOMAIN, CRON_SECRET, ANTHROPIC_API_KEY, Reddit
```

**3. Start it.**

```bash
docker compose up -d --build
docker compose logs -f app
```

The first boot applies every migration, seeds the DryDock workspace, and — if
`ADMIN_EMAIL` is set — creates the first admin and prints a one-time password to
the log. Read it, sign in, change it.

If you would rather not have a password in the log:

```bash
docker compose exec app node scripts/create-user.mjs you@neoito.com "Your Name" --admin
```

**4. Add the people who will post.** Each operator needs their own Reddit script
app, and their credentials go in `.env` as `REDDIT_OP_<KEY>_*`. That is what
makes each comment go out under the account of the person who approved it.

### The three containers

- **app** — Next.js, standalone build, SQLite on the `data` volume at `/data`.
- **caddy** — TLS, HTTP/3, security headers. Also returns 404 for `/api/cron/*`,
  so a leaked `CRON_SECRET` is not on its own enough to make the app poll from
  the public internet.
- **scheduler** — sleeps `POLL_INTERVAL_MINUTES`, then calls the poll endpoint
  over the internal network. It is a separate container so that exactly one
  process writes to the SQLite file, which is what makes a single-file database
  a reasonable choice here.

---

## Operating it

**Back up** by copying the database out of the volume. It is one file:

```bash
docker compose exec app sh -c 'sqlite3 /data/app.db ".backup /data/backup.db"' 2>/dev/null \
  || docker compose stop app
docker compose cp app:/data/app.db ./backup-$(date +%F).db
docker compose start app
```

**Upgrade** with `git pull && docker compose up -d --build`. Migrations run on
boot and are idempotent; the volume is untouched.

**Reset somebody's password** without the UI:

```bash
docker compose exec app node scripts/create-user.mjs them@neoito.com
```

**Watch a poll**:

```bash
docker compose logs -f scheduler
```

---

## Two decisions worth knowing about

**The Prisma CLI is not in the runtime image.** `prisma migrate deploy` fetches
a schema-engine binary from `binaries.prisma.sh` at run time, and making a
container's ability to start depend on a third-party download — inside whatever
egress policy the host has — is a bad trade for a step that, on SQLite, is "run
these files in order and remember which ones you ran". `scripts/migrate.mjs`
does exactly that and writes the same `_prisma_migrations` rows, so
`prisma migrate` on a developer machine still agrees with it.

**Authentication talks to SQLite directly, not through Prisma.** The same two
tables are written by scripts that run before the app exists — the entrypoint
creating the first admin, the CLI resetting a password inside a running
container — and those cannot import the Next app. One definition of a user row
beats a Prisma model and a shell script that have to be kept in agreement.
Everything else in the app stays on Prisma; this is an exception, not a
direction of travel.

---

## Accounts

Per-person accounts, because the app posts in public under real Reddit
identities and records who overrode a moderation block. A shared password would
make every one of those records say "someone".

- Admins add and disable accounts at `/users`, and can reset a password or sign
  someone out everywhere.
- A new account gets a temporary password shown **once**, in the browser. There
  is no mail sender here, so it is handed over in person and must be changed on
  first sign-in.
- Disabling an account ends its sessions immediately rather than whenever the
  cookie expires.
- Sessions are server-side rows; the cookie is an opaque id plus an HMAC so that
  middleware can reject a forged cookie without a database round trip.
