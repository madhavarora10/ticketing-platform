// ─── Event ────────────────────────────────────────────────────────────────────

export type EventStatus = "ACTIVE" | "CANCELLED" | "SOLD_OUT";

export interface PricingRules {
  timeWeight: number;
  demandWeight: number;
  inventoryWeight: number;
}

export interface Event {
  id: string;
  name: string;
  date: Date;
  venue: string;
  description: string;
  totalTickets: number;
  bookedTickets: number;
  basePrice: number;
  currentPrice: number;
  floorPrice: number;
  ceilingPrice: number;
  pricingRules: PricingRules;
  status: EventStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Booking ──────────────────────────────────────────────────────────────────

export type BookingStatus = "PENDING" | "CONFIRMED" | "FAILED";

export interface Booking {
  id: string;
  eventId: string;
  userEmail: string;
  quantity: number;
  pricePaid: number;
  status: BookingStatus;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Reservation ──────────────────────────────────────────────────────────────

export type ReservationStatus = "PENDING" | "EXPIRED" | "COMPLETED";

export interface Reservation {
  id: string;
  eventId: string;
  userEmail: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: Date;
  lockKey: string;
  createdAt: Date;
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

export interface PriceAdjustment {
  factor: number;
  weight: number;
  contribution: number;
}

export interface PriceBreakdown {
  basePrice: number;
  currentPrice: number;
  breakdown: {
    timeAdjustment: PriceAdjustment;
    demandAdjustment: PriceAdjustment;
    inventoryAdjustment: PriceAdjustment;
  };
}

// ─── API Payloads ─────────────────────────────────────────────────────────────

export interface CreateEventDto {
  name: string;
  date: string; // ISO date string
  venue: string;
  description: string;
  totalTickets: number;
  basePrice: number;
  floorPrice: number;
  ceilingPrice: number;
  pricingRules?: Partial<PricingRules>;
}

export interface CreateBookingDto {
  eventId: string;
  userEmail: string;
  quantity: number;
  idempotencyKey?: string;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface EventAnalytics {
  eventId: string;
  eventName: string;
  totalSold: number;
  revenue: number;
  avgPrice: number;
  remaining: number;
}

export interface SystemAnalytics {
  totalEvents: number;
  totalBookings: number;
  totalRevenue: number;
  activeEvents: number;
}
