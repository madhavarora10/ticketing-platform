import { Router, Request, Response, IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "../lib/db";
import { bookings, events, reservations } from "@repo/database";
import {
  redis,
  acquireLock,
  releaseLock,
  invalidateCache,
  LOCK_KEYS,
  CACHE_KEYS,
} from "../lib/redis";
import { calculatePrice } from "@repo/pricing";
import type { CreateBookingDto } from "@repo/types";

export const bookingsRouter: IRouter = Router();

// ─── POST /bookings — Full booking lifecycle ──────────────────────────────────
// Implements the exact flow from the article:
// 1. Acquire Redis lock (NX)
// 2. BEGIN DB transaction + SELECT FOR UPDATE
// 3. Check availability
// 4. Calculate price
// 5. INSERT booking (PENDING) + UPDATE bookedTickets
// 6. COMMIT → mark CONFIRMED, release lock, invalidate cache

bookingsRouter.post("/", async (req: Request, res: Response) => {
  const body = req.body as CreateBookingDto;

  // Validate input
  if (!body.eventId || !body.userEmail || !body.quantity) {
    res.status(400).json({ error: "eventId, userEmail and quantity are required" });
    return;
  }
  if (body.quantity < 1 || !Number.isInteger(body.quantity)) {
    res.status(400).json({ error: "quantity must be a positive integer" });
    return;
  }

  const idempotencyKey = body.idempotencyKey ?? uuidv4();
  const lockToken = uuidv4();
  const lockKey = LOCK_KEYS.booking(body.eventId, body.userEmail);

  // ─── Step 1: Check idempotency ──────────────────────────────────────────
  const [existing] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.idempotencyKey, idempotencyKey))
    .limit(1);

  if (existing) {
    res.status(200).json(existing); // Replay same response
    return;
  }

  // ─── Step 2: Acquire Redis lock (fast first gate) ───────────────────────
  const lockAcquired = await acquireLock(lockKey, lockToken);
  if (!lockAcquired) {
    res
      .status(409)
      .json({ error: "Event is currently being booked by someone else, try again" });
    return;
  }

  // ─── Step 2b: Verify event exists before creating reservation ─────────────
  // Must happen BEFORE the reservation INSERT, because reservations.event_id has
  // a FK constraint — inserting for a missing event throws a DB error (500), not 404.
  const [existingEvent] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.id, body.eventId))
    .limit(1);

  if (!existingEvent) {
    await releaseLock(lockKey, lockToken);
    res.status(404).json({ error: "Event not found" });
    return;
  }

  // Create PENDING reservation record (two-phase: lock → reservation → confirm)
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min TTL
  let reservationId: string | null = null;

  try {
    const [reservation] = await db
      .insert(reservations)
      .values({
        eventId: body.eventId,
        userEmail: body.userEmail,
        quantity: body.quantity,
        status: "PENDING",
        expiresAt,
        lockKey,
      })
      .returning();
    reservationId = reservation.id;
  } catch {
    await releaseLock(lockKey, lockToken);
    res.status(500).json({ error: "Failed to create reservation" });
    return;
  }

  // ─── Step 3: DB transaction with SELECT FOR UPDATE (safety net) ─────────
  try {
    const result = await db.transaction(async (tx) => {
      // Row-level lock: prevents race conditions even if Redis fails
      const [event] = await tx.execute(
        sql`SELECT * FROM events WHERE id = ${body.eventId} FOR UPDATE`
      ) as unknown as Array<{
        id: string;
        name: string;
        total_tickets: number;
        booked_tickets: number;
        base_price: string;
        floor_price: string;
        ceiling_price: string;
        date: Date;
        pricing_rules: { timeWeight: number; demandWeight: number; inventoryWeight: number };
        status: string;
      }>;

      if (!event) {
        throw { status: 404, message: "Event not found" };
      }

      if (event.status !== "ACTIVE") {
        throw { status: 400, message: `Event is ${event.status.toLowerCase()}` };
      }

      const available = event.total_tickets - event.booked_tickets;
      if (available < body.quantity) {
        throw {
          status: 400,
          message: `Only ${available} tickets available, requested ${body.quantity}`,
        };
      }

      // Count recent bookings for demand pricing
      const recentResult = await tx.execute(
        sql`SELECT COUNT(*) as count FROM bookings 
            WHERE event_id = ${body.eventId} 
            AND status = 'CONFIRMED' 
            AND created_at > NOW() - INTERVAL '1 hour'`
      );
      const recentBookings = Number(
        (recentResult as unknown as Array<{ count: string }>)[0]?.count ?? 0
      );

      // ─── Step 4: Calculate price ──────────────────────────────────────
      const pricePaid = calculatePrice({
        basePrice: Number(event.base_price),
        floorPrice: Number(event.floor_price),
        ceilingPrice: Number(event.ceiling_price),
        eventDate: new Date(event.date),
        recentBookings,
        bookedTickets: event.booked_tickets,
        totalTickets: event.total_tickets,
        pricingRules: event.pricing_rules,
      });

      // ─── Step 5: INSERT booking (PENDING) + UPDATE bookedTickets ─────
      const [booking] = await tx
        .insert(bookings)
        .values({
          eventId: body.eventId,
          userEmail: body.userEmail,
          quantity: body.quantity,
          pricePaid: String(pricePaid),
          status: "PENDING",
          idempotencyKey,
        })
        .returning();

      const newBooked = event.booked_tickets + body.quantity;
      const newStatus =
        newBooked >= event.total_tickets ? "SOLD_OUT" : "ACTIVE";

      await tx.execute(
        sql`UPDATE events 
            SET booked_tickets = ${newBooked}, 
                status = ${newStatus},
                updated_at = NOW()
            WHERE id = ${body.eventId}`
      );

      return { booking, pricePaid, newBooked };
    });

    // ─── Step 6: Mark CONFIRMED, release lock, invalidate cache ─────────
    await db
      .update(bookings)
      .set({ status: "CONFIRMED", updatedAt: new Date() })
      .where(eq(bookings.id, result.booking.id));

    // Mark reservation as COMPLETED
    if (reservationId) {
      await db
        .update(reservations)
        .set({ status: "COMPLETED" })
        .where(eq(reservations.id, reservationId));
    }

    await releaseLock(lockKey, lockToken);
    await invalidateCache(
      CACHE_KEYS.eventDetails(body.eventId),
      CACHE_KEYS.eventPrice(body.eventId),
      CACHE_KEYS.eventList()
    );

    // Publish live update to all SSE subscribers watching this event
    await redis.publish(
      `event:updates:${body.eventId}`,
      JSON.stringify({
        eventId: body.eventId,
        bookedTickets: result.newBooked,
      })
    );

    res.status(201).json({
      ...result.booking,
      status: "CONFIRMED",
      pricePaid: result.pricePaid,
    });
  } catch (err: unknown) {
    // Release lock and expire reservation on any failure
    await releaseLock(lockKey, lockToken);
    if (reservationId) {
      await db
        .update(reservations)
        .set({ status: "EXPIRED" })
        .where(eq(reservations.id, reservationId));
    }

    const apiError = err as { status?: number; message?: string };
    if (apiError.status && apiError.message) {
      res.status(apiError.status).json({ error: apiError.message });
    } else {
      console.error(err);
      res.status(500).json({ error: "Booking failed due to an internal error" });
    }
  }
});

// ─── GET /bookings?eventId=:id ────────────────────────────────────────────────

bookingsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { eventId } = req.query;
    if (!eventId || typeof eventId !== "string") {
      res.status(400).json({ error: "eventId query param is required" });
      return;
    }

    const rows = await db
      .select()
      .from(bookings)
      .where(eq(bookings.eventId, eventId))
      .orderBy(bookings.createdAt);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// ─── GET /bookings/user?email=:email ─────────────────────────────────────────

bookingsRouter.get("/user", async (req: Request, res: Response) => {
  try {
    const { email } = req.query;
    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "email query param is required" });
      return;
    }

    const rows = await db
      .select()
      .from(bookings)
      .where(eq(bookings.userEmail, email))
      .orderBy(bookings.createdAt);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch user bookings" });
  }
});
