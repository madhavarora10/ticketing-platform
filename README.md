# TicketFlow

A live event ticketing platform with dynamic pricing. Prices go up the closer you get to the event, the more people are buying, and the fewer seats are left. It uses Redis locks and Postgres row-level locking to make sure two people can never book the same last ticket.

---

## Prerequisites

- **Node.js** v20+
- **pnpm** v9+ (`npm install -g pnpm`)
- **Docker** (for Postgres + Redis — the only things that need to be running)

---

## Getting started (5 commands)

```bash
# 1. Clone and enter the project
git clone https://github.com/madhavarora10/ticketing-platform.git && cd ticketing-platform-monorepo-main

# 2. Install all dependencies across the monorepo
pnpm install

# 3. Start Postgres and Redis in the background
docker compose up -d

# 4. Copy the env file, run database migrations, and seed data
cp apps/api/.env.example apps/api/.env
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 5. Start everything
pnpm dev
```

The app is now running at:
- **Frontend** → http://localhost:3000
- **API** → http://localhost:4000

> **Seed sample events** — run this once after startup to load sample events:
> ```bash
> pnpm db:seed
> ```

---

## Running the application


pnpm dev          # starts both the Next.js frontend and the Express API together


Or run them individually:


pnpm --filter api dev   # API only (port 4000)
pnpm --filter web dev   # Frontend only (port 3000)

## Running the tests

There are two test suites:

**Pricing engine unit tests** (pure logic, no DB or Redis needed):
```bash
pnpm --filter @repo/pricing test
```

**API integration tests** (needs Docker running):
```bash
pnpm --filter api test
```

The integration tests cover:
- Creating a confirmed booking and snapshotting the price
- Idempotency key replay (same request twice → same booking ID)
- Insufficient inventory rejection
- Non-existent event handling
- **Concurrency tests** — 2, 5, and 3-racer scenarios proving zero overbooking

---

## Environment variables

Copy `apps/api/.env.example` to `apps/api/.env`. Here's what each variable does:

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_URL` | — | Postgres connection string |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection string |
| `PORT` | `4000` | Port the API listens on |
| `NODE_ENV` | `development` | Affects logging and error verbosity |
| `WEB_URL` | `http://localhost:3000` | Allowed CORS origin for the frontend |
| `ADMIN_API_KEY` | `dev-admin-key-...` | Bearer token required for admin routes (`POST /events`, config changes) |
| `DEMAND_THRESHOLD` | `10` | How many bookings in the last hour triggers the demand surge pricing |
| `TIME_WEIGHT` | `1.0` | Multiplier for the time-based price adjustment (0 = disabled) |
| `DEMAND_WEIGHT` | `1.0` | Multiplier for the demand-based adjustment |
| `INVENTORY_WEIGHT` | `1.0` | Multiplier for the scarcity-based adjustment |

The weight variables let you tune how aggressively each factor affects the price without touching code. Set a weight to `0` to disable that factor entirely.

---

## Project structure

```
ticketing-platform-monorepo-main/
├── apps/
│   ├── api/          Express API (bookings, events, admin, analytics)
│   └── web/          Next.js frontend (event listing, booking flow, admin dashboard)
├── packages/
│   ├── pricing/      Pure pricing engine (fully unit-tested, no side effects)
│   ├── database/     Drizzle ORM schema + migrations
│   └── types/        Shared TypeScript interfaces
└── docker-compose.yml  Postgres + Redis
```

---

## Admin dashboard

Go to http://localhost:3000/admin to:

- **Create events** with custom pricing rules
- **Run the pricing test suite** and see results inline
- **Tweak pricing weights** (demand threshold, time/demand/inventory weights) without restarting

---

## API quick reference

```
GET    /events              List all events with live prices
GET    /events/:id          Single event with full price breakdown
POST   /events              Create event (admin key required)
POST   /bookings            Book tickets
GET    /bookings?eventId=   All bookings for an event
GET    /bookings/user?email= Your booking history
GET    /analytics/summary   Platform-wide stats
POST   /seed                Load sample data
GET    /health              Health check
```
