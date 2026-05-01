import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  jsonb,
  pgEnum,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const eventStatusEnum = pgEnum("event_status", [
  "ACTIVE",
  "CANCELLED",
  "SOLD_OUT",
]);

export const bookingStatusEnum = pgEnum("booking_status", [
  "PENDING",
  "CONFIRMED",
  "FAILED",
]);

export const reservationStatusEnum = pgEnum("reservation_status", [
  "PENDING",
  "EXPIRED",
  "COMPLETED",
]);

// ─── Events ───────────────────────────────────────────────────────────────────

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  venue: varchar("venue", { length: 255 }).notNull(),
  description: text("description").notNull(),
  totalTickets: integer("total_tickets").notNull(),
  bookedTickets: integer("booked_tickets").notNull().default(0),
  basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull(),
  currentPrice: numeric("current_price", { precision: 10, scale: 2 }).notNull(),
  floorPrice: numeric("floor_price", { precision: 10, scale: 2 }).notNull(),
  ceilingPrice: numeric("ceiling_price", { precision: 10, scale: 2 }).notNull(),
  pricingRules: jsonb("pricing_rules")
    .$type<{ timeWeight: number; demandWeight: number; inventoryWeight: number }>()
    .notNull()
    .default({ timeWeight: 1.0, demandWeight: 1.0, inventoryWeight: 1.0 }),
  status: eventStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Bookings ─────────────────────────────────────────────────────────────────

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id),
  userEmail: varchar("user_email", { length: 255 }).notNull(),
  quantity: integer("quantity").notNull(),
  pricePaid: numeric("price_paid", { precision: 10, scale: 2 }).notNull(),
  status: bookingStatusEnum("status").notNull().default("PENDING"),
  idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Reservations ─────────────────────────────────────────────────────────────

export const reservations = pgTable("reservations", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id),
  userEmail: varchar("user_email", { length: 255 }).notNull(),
  quantity: integer("quantity").notNull(),
  status: reservationStatusEnum("status").notNull().default("PENDING"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lockKey: varchar("lock_key", { length: 512 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const eventsRelations = relations(events, ({ many }) => ({
  bookings: many(bookings),
  reservations: many(reservations),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  event: one(events, {
    fields: [bookings.eventId],
    references: [events.id],
  }),
}));

export const reservationsRelations = relations(reservations, ({ one }) => ({
  event: one(events, {
    fields: [reservations.eventId],
    references: [events.id],
  }),
}));
