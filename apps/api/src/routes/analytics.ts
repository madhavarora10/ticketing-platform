import { Router, Request, Response, IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { bookings, events } from "@repo/database";

export const analyticsRouter: IRouter = Router();

// ─── GET /analytics/events/:id ────────────────────────────────────────────────

analyticsRouter.get("/events/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.id, id))
      .limit(1);

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const result = await db.execute(
      sql`SELECT 
            COUNT(*) AS total_bookings,
            SUM(quantity) AS total_sold,
            SUM(price_paid::numeric * quantity) AS revenue,
            AVG(price_paid::numeric) AS avg_price
          FROM bookings
          WHERE event_id = ${id} AND status = 'CONFIRMED'`
    );

    const row = (result as unknown as Array<{
      total_bookings: string;
      total_sold: string;
      revenue: string;
      avg_price: string;
    }>)[0];

    res.json({
      eventId: id,
      eventName: event.name,
      totalSold: Number(row?.total_sold ?? 0),
      revenue: Number(row?.revenue ?? 0),
      avgPrice: Number(Number(row?.avg_price ?? 0).toFixed(2)),
      remaining: event.totalTickets - event.bookedTickets,
      totalTickets: event.totalTickets,
      bookedTickets: event.bookedTickets,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch event analytics" });
  }
});

// ─── GET /analytics/summary ───────────────────────────────────────────────────

analyticsRouter.get("/summary", async (_req: Request, res: Response) => {
  try {
    const [eventStats] = await db.execute(
      sql`SELECT 
            COUNT(*) AS total_events,
            COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active_events
          FROM events`
    ) as unknown as Array<{ total_events: string; active_events: string }>;

    const [bookingStats] = await db.execute(
      sql`SELECT 
            COUNT(*) AS total_bookings,
            SUM(price_paid::numeric * quantity) AS total_revenue
          FROM bookings
          WHERE status = 'CONFIRMED'`
    ) as unknown as Array<{ total_bookings: string; total_revenue: string }>;

    res.json({
      totalEvents: Number(eventStats?.total_events ?? 0),
      activeEvents: Number(eventStats?.active_events ?? 0),
      totalBookings: Number(bookingStats?.total_bookings ?? 0),
      totalRevenue: Number(Number(bookingStats?.total_revenue ?? 0).toFixed(2)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch system analytics" });
  }
});
