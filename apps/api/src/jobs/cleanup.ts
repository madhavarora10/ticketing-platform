import cron from "node-cron";
import { sql } from "drizzle-orm";
import { db } from "../lib/db";
import { releaseLock } from "../lib/redis";

/**
 * Background cleanup job — runs every minute.
 *
 * From the article's background job section:
 * - Find PENDING bookings older than 10 minutes
 * - Mark them FAILED
 * - Release the Redis lock (if still held)
 * - Rollback bookedTickets on the event
 */
export function startCleanupJob() {
  cron.schedule("* * * * *", async () => {
    try {
      // Find stale PENDING bookings
      const stalePending = await db.execute(
        sql`SELECT b.id, b.event_id, b.user_email, b.quantity, r.lock_key
            FROM bookings b
            LEFT JOIN reservations r 
              ON r.event_id = b.event_id 
              AND r.user_email = b.user_email 
              AND r.status = 'PENDING'
            WHERE b.status = 'PENDING'
              AND b.created_at < NOW() - INTERVAL '10 minutes'`
      ) as unknown as Array<{
        id: string;
        event_id: string;
        user_email: string;
        quantity: number;
        lock_key: string | null;
      }>;

      if (stalePending.length === 0) return;

      console.log(`🧹 Cleanup: found ${stalePending.length} stale PENDING bookings`);

      for (const booking of stalePending) {
        try {
          // Mark booking FAILED
          await db.execute(
            sql`UPDATE bookings SET status = 'FAILED', updated_at = NOW() WHERE id = ${booking.id}`
          );

          // Rollback bookedTickets and reset status to ACTIVE if it was SOLD_OUT
          await db.execute(
            sql`UPDATE events 
                SET booked_tickets = GREATEST(booked_tickets - ${booking.quantity}, 0),
                    status = CASE 
                      WHEN status = 'SOLD_OUT' THEN 'ACTIVE' 
                      ELSE status 
                    END,
                    updated_at = NOW()
                WHERE id = ${booking.event_id}`
          );

          // Expire related PENDING reservations
          await db.execute(
            sql`UPDATE reservations 
                SET status = 'EXPIRED' 
                WHERE event_id = ${booking.event_id} 
                  AND user_email = ${booking.user_email}
                  AND status = 'PENDING'`
          );

          // Release Redis lock if still held (use empty token to force del)
          if (booking.lock_key) {
            await releaseLock(booking.lock_key, ""); // Attempt cleanup
            // Force delete since we don't have the original token
            const { redis } = await import("../lib/redis");
            await redis.del(booking.lock_key);
          }

          console.log(`  ✓ Cleaned booking ${booking.id}`);
        } catch (innerErr) {
          console.error(`  ✗ Failed to clean booking ${booking.id}:`, innerErr);
        }
      }
    } catch (err) {
      console.error("❌ Cleanup job error:", err);
    }
  });

  console.log("⏰ Background cleanup job started (runs every minute)");
}
