# Design Notes

## Pricing algorithm

The pricing engine lives in `packages/pricing` as a pure, side-effect-free package. It takes numbers in and returns a number out no database calls, no HTTP requests. This made it trivial to unit test exhaustively (20 tests covering every boundary condition) and easy to reuse across the API and frontend without circular dependencies.

The formula is:

```
currentPrice = basePrice × (1 + timeAdj×tW + demandAdj×dW + inventoryAdj×iW)
             → clamped to [floorPrice, ceilingPrice]
```

Three independent signals feed into it:

- **Time** — how many days until the event. The closer the date, the higher the multiplier (0 → 0.1 → 0.2 → 0.5). The intuition is that last-minute buyers are less price-sensitive.
- **Demand** — if more than `DEMAND_THRESHOLD` confirmed bookings happened in the last hour, we add 15%. This is a blunt instrument by design; it reacts fast to genuine spikes without needing a moving average.
- **Inventory** — below 50% remaining tickets adds 10%, below 20% adds 25%. Scarcity is the most reliable signal that the market would bear a higher price.

Each signal is multiplied by a configurable weight (`TIME_WEIGHT`, `DEMAND_WEIGHT`, `INVENTORY_WEIGHT`). Setting a weight to 0 disables that factor without touching code. This lets the admin tune pricing behaviour live from the dashboard.

I chose step-function tiers over a continuous curve deliberately. They're predictable, easy to explain to a product team, and the boundary conditions are easy to test. A smooth curve would feel more "fair" to users but would make it much harder to reason about what price you'll get.

## Solving the concurrency problem

The booking flow uses two independent layers of protection, not one.

**Layer 1 — Redis NX lock.** When a booking request arrives, the API tries to `SET booking:event:{id}:{email} token EX 300 NX`. Only one request per (event, user) pair gets `OK` back. The second gets a `409` immediately, without touching the database. This is the fast path it stops most double-taps and retry storms at the Redis layer before they become DB load.

**Layer 2 — PostgreSQL `SELECT FOR UPDATE`.** Inside the transaction, we lock the event row. Even if two requests have different emails (so different Redis lock keys), only one can hold the row lock at a time. The second waits, then reads the committed state at which point the ticket count is already updated and it correctly gets a "not enough tickets" error.

The two layers are designed to be independent. If Redis goes down, the Postgres lock alone prevents overbooking (just slower). If you have a bug in lock key generation, the DB catches it. Neither layer trusts the other.

## Monorepo decisions

The workspace is split into `apps/` (things that run) and `packages/` (things that are shared). The pricing engine, DB schema, and types are all packages because they're consumed by multiple apps the API imports all three, the frontend imports types for TypeScript safety.

Using pnpm workspaces means a single `pnpm install` at the root handles all dependencies and the packages reference each other as `workspace:*`. The tradeoff is that `moduleNameMapper` and `tsconfig paths` need to be configured in each app's test setup, because tools like Jest and the TypeScript compiler don't automatically follow workspace symlinks without help. That was the source of most of the early test failures.

## Trade-offs

**Lock key is per (event, user), not per event.** This means two different users can try to book the same last ticket simultaneously. Redis won't stop them only the database will. I made this choice because a per-event Redis lock would serialise all bookings for a popular event, destroying throughput. The DB `SELECT FOR UPDATE` is the correct tool for enforcing the actual inventory constraint; Redis is just a fast pre-filter.

**Step-function pricing tiers over continuous curves.** Covered above predictable wins over elegant.

## Real-time updates

The frontend uses Server-Sent Events (SSE) instead of polling. When a booking confirms, the API publishes the new `bookedTickets` count to a Redis pub/sub channel (`event:updates:<id>`). The SSE endpoint (`GET /events/:id/stream`) holds an open HTTP connection to each browser tab and relays those messages instantly.

Each SSE connection gets its own dedicated Redis subscriber because ioredis puts a connection into subscriber mode on `.subscribe()`, which blocks all other commands on that connection. Duplicating the connection keeps the main Redis client free for cache reads/writes.

A 25-second heartbeat comment is sent on idle connections so that reverse proxies (nginx, Cloudflare) don't close what looks like a stale connection. When the user navigates away, the browser fires a `close` event, the subscriber unsubscribes, and the connection is cleaned up.

## Background cleanup job

The booking API uses a two-phase write: it first inserts a booking record with `status = PENDING` inside the database transaction, immediately marks it `CONFIRMED` after the transaction commits, then releases the Redis lock and invalidates the cache. This happens in milliseconds under normal conditions.

However, the `PENDING` state exists to handle failure between those phases. If the API process crashes, runs out of memory, or loses its database connection after the `INSERT` but before the `UPDATE to CONFIRMED`, the booking is left hanging — inventory is decremented but no confirmed booking exists. Without a recovery mechanism, those tickets are gone forever.

The cleanup job (`apps/api/src/jobs/cleanup.ts`) runs every minute via `node-cron` and performs the following for any booking stuck in `PENDING` for more than 10 minutes:

1. **Mark the booking `FAILED`** — closes the dangling record.
2. **Roll back `bookedTickets`** on the event — returns the inventory.
3. **Re-activate the event** — if the event was marked `SOLD_OUT` because of the now-failed booking, its status flips back to `ACTIVE`.
4. **Expire the linked reservation** — marks the `reservations` row as `EXPIRED`.
5. **Force-delete the Redis lock** — releases the NX lock so future requests aren't blocked by a ghost lock that will never release itself.

The 10-minute threshold is intentionally generous. It covers transient database blips, slow network timeouts, and deployment restarts without incorrectly reclaiming tickets from bookings that are legitimately processing. The checkout page enforces a matching 5-minute price-lock countdown on the frontend, so a user who starts but never submits the checkout form will have their reservation expire within that window.

## What I'd improve with more time

**Smarter demand signal.** The current demand check (`bookings > threshold in last hour`) is on/off. A sliding-window rate with exponential decay would react more smoothly to genuine spikes and calm down faster after they pass.

**Distributed test isolation.** The integration tests currently share a live database and require Docker. I'd add a test-specific database that's created fresh per run (or use a transaction rollback approach where each test runs inside a transaction that's never committed), removing the dependency on Docker being up.

**Price history.** Store `(eventId, price, timestamp)` snapshots so the frontend can show a price trend graph. Right now you can see the current price breakdown but not how it's moved over time.
