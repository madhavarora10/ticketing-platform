import { Router, Request, Response, IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { events } from "@repo/database";
import {
  redis,
  getCache,
  setCache,
  CACHE_KEYS,
  CACHE_TTL,
} from "../lib/redis";
import { calculatePriceBreakdown } from "@repo/pricing";
import type { CreateEventDto } from "@repo/types";

export const eventsRouter: IRouter = Router();

// ─── Admin guard middleware ───────────────────────────────────────────────────

function adminOnly(req: Request, res: Response, next: () => void) {
  const key = req.headers.authorization?.replace("Bearer ", "");
  if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ─── GET /events ──────────────────────────────────────────────────────────────

eventsRouter.get("/", async (_req: Request, res: Response) => {
  try {
    // Try cache first
    const cached = await getCache<unknown[]>(CACHE_KEYS.eventList());
    if (cached) {
      res.json(cached);
      return;
    }

    const rows = await db.select().from(events).orderBy(events.date);

    // Recalculate current price for each event
    const result = rows.map((event) => {
      const breakdown = calculatePriceBreakdown({
        basePrice: Number(event.basePrice),
        floorPrice: Number(event.floorPrice),
        ceilingPrice: Number(event.ceilingPrice),
        eventDate: event.date,
        recentBookings: 0, // simplified for list view
        bookedTickets: event.bookedTickets,
        totalTickets: event.totalTickets,
        pricingRules: event.pricingRules ?? undefined,
      });

      return {
        ...event,
        currentPrice: breakdown.currentPrice,
        availableTickets: event.totalTickets - event.bookedTickets,
      };
    });

    await setCache(CACHE_KEYS.eventList(), result, CACHE_TTL.EVENT_LIST);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// ─── GET /events/:id ─────────────────────────────────────────────────────────

eventsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    // Try detail cache
    const cachedDetails = await getCache<unknown>(CACHE_KEYS.eventDetails(id));
    const cachedPrice = await getCache<unknown>(CACHE_KEYS.eventPrice(id));

    if (cachedDetails && cachedPrice) {
      res.json({ ...(cachedDetails as object), priceBreakdown: cachedPrice });
      return;
    }

    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.id, id))
      .limit(1);

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    // Count recent bookings in last hour for demand adjustment
    const recentBookingsResult = await db.execute(
      sql`SELECT COUNT(*) as count FROM bookings 
          WHERE event_id = ${id} 
          AND status = 'CONFIRMED' 
          AND created_at > NOW() - INTERVAL '1 hour'`
    );
    const recentBookings = Number(
      (recentBookingsResult as unknown as Array<{ count: string }>)[0]?.count ?? 0
    );

    const breakdown = calculatePriceBreakdown({
      basePrice: Number(event.basePrice),
      floorPrice: Number(event.floorPrice),
      ceilingPrice: Number(event.ceilingPrice),
      eventDate: event.date,
      recentBookings,
      bookedTickets: event.bookedTickets,
      totalTickets: event.totalTickets,
      pricingRules: event.pricingRules ?? undefined,
    });

    const eventData = {
      ...event,
      availableTickets: event.totalTickets - event.bookedTickets,
    };

    await setCache(CACHE_KEYS.eventDetails(id), eventData, CACHE_TTL.EVENT_DETAILS);
    await setCache(CACHE_KEYS.eventPrice(id), breakdown, CACHE_TTL.EVENT_PRICE);

    res.json({ ...eventData, priceBreakdown: breakdown });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch event" });
  }
});

// ─── POST /events (admin) ─────────────────────────────────────────────────────

eventsRouter.post("/", adminOnly, async (req: Request, res: Response) => {
  try {
    const body = req.body as CreateEventDto;

    if (
      !body.name ||
      !body.date ||
      !body.venue ||
      !body.description ||
      !body.totalTickets ||
      !body.basePrice ||
      !body.floorPrice ||
      !body.ceilingPrice
    ) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const pricingRules = {
      timeWeight: body.pricingRules?.timeWeight ?? 1.0,
      demandWeight: body.pricingRules?.demandWeight ?? 1.0,
      inventoryWeight: body.pricingRules?.inventoryWeight ?? 1.0,
    };

    const [newEvent] = await db
      .insert(events)
      .values({
        name: body.name,
        date: new Date(body.date),
        venue: body.venue,
        description: body.description,
        totalTickets: body.totalTickets,
        bookedTickets: 0,
        basePrice: String(body.basePrice),
        currentPrice: String(body.basePrice),
        floorPrice: String(body.floorPrice),
        ceilingPrice: String(body.ceilingPrice),
        pricingRules,
        status: "ACTIVE",
      })
      .returning();

    // Invalidate list cache
    const { invalidateCache, CACHE_KEYS: CK } = await import("../lib/redis");
    await invalidateCache(CK.eventList());

    res.status(201).json(newEvent);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create event" });
  }
});
// ─── GET /events/:id/stream  (Server-Sent Events) ───────────────────────────
//
// Clients connect once and receive pushed updates whenever a booking completes
// for this event.  Each connection gets its own Redis subscriber connection
// because ioredis puts a client into "subscriber mode" on .subscribe(), which
// blocks all other commands on that connection.

eventsRouter.get("/:id/stream", (req: Request, res: Response) => {
  const id = req.params.id as string;

  // SSE headers — keep the HTTP connection alive indefinitely
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", process.env.WEB_URL ?? "http://localhost:3000");
  res.flushHeaders();

  // Send a heartbeat comment every 25s so proxies don't close idle connections
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 25_000);

  // Each subscriber must be its own connection
  const subscriber = redis.duplicate();

  subscriber.subscribe(`event:updates:${id}`, (err) => {
    if (err) {
      console.error("SSE subscribe error:", err.message);
      res.end();
    }
  });

  subscriber.on("message", (_channel: string, message: string) => {
    res.write(`data: ${message}\n\n`);
  });

  // Clean up when the browser tab closes or navigates away
  req.on("close", () => {
    clearInterval(heartbeat);
    subscriber.unsubscribe().finally(() => subscriber.disconnect());
  });
});
