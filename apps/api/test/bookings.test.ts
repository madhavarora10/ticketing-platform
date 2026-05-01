
import request from "supertest";
import { app } from "../src/main";
import { db, queryClient } from "../src/lib/db";
import { redis } from "../src/lib/redis";
import { events, bookings } from "@repo/database";
import { eq, sql } from "drizzle-orm";

// Close ALL shared connections once after every test suite finishes.
// Without this Jest hangs because the postgres pool and Redis keep TCP sockets open.
afterAll(async () => {
  await redis.quit();       // close ioredis connection
  await queryClient.end();  // drain the postgres connection pool
});

async function createTestEvent(overrides: Partial<{
  totalTickets: number;
  bookedTickets: number;
  basePrice: string;
}> = {}) {
  const [event] = await db.insert(events).values({
    name: "Test Event",
    date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
    venue: "Test Venue",
    description: "Test description",
    totalTickets: overrides.totalTickets ?? 100,
    bookedTickets: overrides.bookedTickets ?? 0,
    basePrice: overrides.basePrice ?? "1000.00",
    currentPrice: "1000.00",
    floorPrice: "500.00",
    ceilingPrice: "5000.00",
    pricingRules: { timeWeight: 1.0, demandWeight: 1.0, inventoryWeight: 1.0 },
    status: "ACTIVE",
  }).returning();
  return event;
}

async function getEvent(id: string) {
  const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return event;
}

async function cleanup(eventId: string) {
  await db.execute(sql`DELETE FROM reservations WHERE event_id = ${eventId}`);
  await db.execute(sql`DELETE FROM bookings WHERE event_id = ${eventId}`);
  await db.execute(sql`DELETE FROM events WHERE id = ${eventId}`);
}

// Tests
describe("POST /bookings", () => {
  let testEventId: string;

  afterEach(async () => {
    if (testEventId) await cleanup(testEventId);
  });

  it("creates a CONFIRMED booking and snapshots price", async () => {
    const event = await createTestEvent({ totalTickets: 100, bookedTickets: 0 });
    testEventId = event.id;

    const res = await request(app)
      .post("/bookings")
      .send({
        eventId: event.id,
        userEmail: "madhav@test.com",
        quantity: 2,
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("CONFIRMED");
    expect(res.body.eventId).toBe(event.id);
    expect(res.body.quantity).toBe(2);
    expect(typeof res.body.pricePaid).toBe("number");
    expect(res.body.pricePaid).toBeGreaterThan(0);

    const updated = await getEvent(event.id);
    expect(updated.bookedTickets).toBe(2);
  });


  it("returns the same booking on duplicate idempotencyKey", async () => {
    const event = await createTestEvent({ totalTickets: 100 });
    testEventId = event.id;

    const iKey = "idem-test-key-123";

    const res1 = await request(app)
      .post("/bookings")
      .send({ eventId: event.id, userEmail: "idem@test.com", quantity: 1, idempotencyKey: iKey });

    const res2 = await request(app)
      .post("/bookings")
      .send({ eventId: event.id, userEmail: "idem@test.com", quantity: 1, idempotencyKey: iKey });

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(200); // replay
    expect(res1.body.id).toBe(res2.body.id);
  });


  it("returns 400 when tickets are insufficient", async () => {
    const event = await createTestEvent({ totalTickets: 5, bookedTickets: 4 });
    testEventId = event.id;

    const res = await request(app)
      .post("/bookings")
      .send({ eventId: event.id, userEmail: "user@test.com", quantity: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Only 1 tickets available/);
  });


  it("returns 404 for non-existent event", async () => {
    const res = await request(app)
      .post("/bookings")
      .send({
        eventId: "00000000-0000-0000-0000-000000000000",
        userEmail: "user@test.com",
        quantity: 1,
      });

    expect(res.status).toBe(404);
  });


  it("returns 400 when required fields are missing", async () => {
    const res = await request(app).post("/bookings").send({ quantity: 1 });
    expect(res.status).toBe(400);
  });
});

// ─── Concurrency Tests ────────────────────────────────────────────────────────
//
// These tests prove the two-layer protection works:
//   Layer 1 — Redis NX lock: first request to arrive wins; second gets 409 immediately
//   Layer 2 — PostgreSQL SELECT FOR UPDATE: even if Redis is bypassed or unavailable,
//             the DB transaction row-lock prevents a second concurrent write
//
// How to read the results:
//   Promise.allSettled fires both requests simultaneously (no await between them).
//   Both requests race to the server. The server processes them concurrently.
//   Exactly one must win (201 CONFIRMED) and exactly one must fail (400 or 409).
//   The DB bookedTickets must equal exactly 1 — proving no double-write occurred.

// Timeout budget for concurrency tests: each request goes through Redis lock +
// DB transaction with SELECT FOR UPDATE, so requests queue serially on the row lock.
const CONCURRENCY_TIMEOUT = 20_000;

describe("Concurrency: overbooking prevention", () => {
  let testEventId: string;

  afterEach(async () => {
    if (testEventId) await cleanup(testEventId);
  });

  // ─── Core test: 2 simultaneous requests for the last ticket ───────────────
  it("allows exactly 1 booking when 2 requests race for the last ticket", async () => {
    // SETUP: event with exactly 1 ticket remaining
    const event = await createTestEvent({ totalTickets: 1, bookedTickets: 0 });
    testEventId = event.id;

    // EXECUTE: fire both requests at the same instant with Promise.allSettled
    // (unlike Promise.all, allSettled never throws — both outcomes are captured)
    const [res1, res2] = await Promise.allSettled([
      request(app)
        .post("/bookings")
        .send({ eventId: event.id, userEmail: "user-a@test.com", quantity: 1 }),
      request(app)
        .post("/bookings")
        .send({ eventId: event.id, userEmail: "user-b@test.com", quantity: 1 }),
    ]);

    // Extract HTTP responses (both requests reached the server — no network errors)
    expect(res1.status).toBe("fulfilled");
    expect(res2.status).toBe("fulfilled");
    const r1 = (res1 as PromiseFulfilledResult<request.Response>).value;
    const r2 = (res2 as PromiseFulfilledResult<request.Response>).value;

    const statuses = [r1.status, r2.status].sort(); // e.g. [201, 400] or [201, 409]

    // ASSERT: exactly one 201, one failure
    // .sort() is lexicographic ascending: 201 < 400/409, so statuses[0]=winner, statuses[1]=loser
    expect(statuses[0]).toBe(201);      // one winner
    expect(statuses[1]).not.toBe(201);  // one loser (400 = sold out, 409 = Redis lock)

    // The losing response must carry a meaningful error — not a silent 500
    const loser = r1.status === 201 ? r2 : r1;
    expect(loser.body.error).toBeTruthy();
    // Accept either Redis lock message or DB availability message
    const validErrors = [
      /being booked/i,       // 409: Redis lock was held by the other request
      /only \d+ tickets/i,   // 400: SELECT FOR UPDATE saw 0 remaining
      /sold.?out/i,          // 400: event marked SOLD_OUT before second request ran
    ];
    expect(validErrors.some((re) => re.test(loser.body.error))).toBe(true);

    // ASSERT: DB integrity — bookedTickets is exactly 1, never 2
    const finalEvent = await getEvent(event.id);
    expect(finalEvent.bookedTickets).toBe(1);

    // ASSERT: event is now SOLD_OUT (100% booked = status transition)
    expect(finalEvent.status).toBe("SOLD_OUT");
  }, CONCURRENCY_TIMEOUT);

  // ─── Stress variant: 5 simultaneous requests for the last ticket ──────────
  it("allows exactly 1 booking when 5 requests race for the last ticket", async () => {
    const event = await createTestEvent({ totalTickets: 1, bookedTickets: 0 });
    testEventId = event.id;

    // Fire 5 concurrent requests — only one should win
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post("/bookings")
          .send({ eventId: event.id, userEmail: `racer-${i}@test.com`, quantity: 1 })
      )
    );

    const responses = results
      .filter((r): r is PromiseFulfilledResult<request.Response> => r.status === "fulfilled")
      .map((r) => r.value);

    const winners = responses.filter((r) => r.status === 201);
    const losers  = responses.filter((r) => r.status !== 201);

    expect(winners).toHaveLength(1);   // exactly 1 succeeded
    expect(losers).toHaveLength(4);    // 4 were rejected

    // All losers must have an error body
    losers.forEach((r) => expect(r.body.error).toBeTruthy());

    // DB is never oversold
    const finalEvent = await getEvent(event.id);
    expect(finalEvent.bookedTickets).toBe(1);
    expect(finalEvent.status).toBe("SOLD_OUT");
  }, CONCURRENCY_TIMEOUT);

  // ─── Partial-inventory guard: 3 requests for 2 of 2 remaining tickets ─────
  it("allows exactly 2 bookings when 3 requests race for 2 remaining tickets (qty=1 each)", async () => {
    // 2 tickets remain — 3 users try at once; 2 win, 1 loses
    const event = await createTestEvent({ totalTickets: 2, bookedTickets: 0 });
    testEventId = event.id;

    const results = await Promise.allSettled([
      request(app).post("/bookings").send({ eventId: event.id, userEmail: "p1@test.com", quantity: 1 }),
      request(app).post("/bookings").send({ eventId: event.id, userEmail: "p2@test.com", quantity: 1 }),
      request(app).post("/bookings").send({ eventId: event.id, userEmail: "p3@test.com", quantity: 1 }),
    ]);

    const responses = results
      .filter((r): r is PromiseFulfilledResult<request.Response> => r.status === "fulfilled")
      .map((r) => r.value);

    const winners = responses.filter((r) => r.status === 201);
    const losers  = responses.filter((r) => r.status !== 201);

    expect(winners).toHaveLength(2);
    expect(losers).toHaveLength(1);

    const finalEvent = await getEvent(event.id);
    expect(finalEvent.bookedTickets).toBe(2);
    expect(finalEvent.status).toBe("SOLD_OUT");
  }, CONCURRENCY_TIMEOUT);
});

