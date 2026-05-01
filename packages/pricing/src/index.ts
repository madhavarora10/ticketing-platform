import type { PriceBreakdown } from "@repo/types";

// ─── Adjustment Rules ─────────────────────────────────────────────────────────

/**
 * Returns adjustment factor based on how many days until the event.
 * daysUntil > 30  → 0.0
 * daysUntil 8–30  → 0.10
 * daysUntil 2–7   → 0.20
 * daysUntil 1     → 0.50
 */
export function timeAdjustment(eventDate: Date): number {
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / msPerDay);

  if (daysUntil <= 1) return 0.5;
  if (daysUntil <= 7) return 0.2;
  if (daysUntil <= 30) return 0.1;
  return 0.0;
}

/**
 * Returns adjustment factor based on recent bookings (demand surge).
 * recentBookings > DEMAND_THRESHOLD → 0.15
 * else → 0.0
 */
export function demandAdjustment(recentBookings: number, threshold = 10): number {
  return recentBookings > threshold ? 0.15 : 0.0;
}

/**
 * Returns adjustment factor based on inventory remaining.
 * remaining < 20% → 0.25
 * remaining < 50% → 0.10
 * else → 0.0
 */
export function inventoryAdjustment(booked: number, total: number): number {
  if (total === 0) return 0.25;
  const remaining = (total - booked) / total;
  if (remaining < 0.2) return 0.25;
  if (remaining <= 0.5) return 0.1;
  return 0.0;
}

// ─── Combined Calculator ──────────────────────────────────────────────────────

export interface PriceCalculationInput {
  basePrice: number;
  floorPrice: number;
  ceilingPrice: number;
  eventDate: Date;
  recentBookings: number;
  bookedTickets: number;
  totalTickets: number;
  pricingRules?: {
    timeWeight?: number;
    demandWeight?: number;
    inventoryWeight?: number;
  };
}

/**
 * Calculates the current price using the three adjustment rules and weights.
 * currentPrice = basePrice × (1 + (timeAdj × TIME_WEIGHT) + (demandAdj × DEMAND_WEIGHT) + (inventoryAdj × INVENTORY_WEIGHT))
 * → clamped to [floorPrice, ceilingPrice]
 */
export function calculatePrice(input: PriceCalculationInput): number {
  const {
    basePrice,
    floorPrice,
    ceilingPrice,
    eventDate,
    recentBookings,
    bookedTickets,
    totalTickets,
    pricingRules,
  } = input;

  const timeWeight = pricingRules?.timeWeight ?? 1.0;
  const demandWeight = pricingRules?.demandWeight ?? 1.0;
  const inventoryWeight = pricingRules?.inventoryWeight ?? 1.0;

  const timeAdj = timeAdjustment(eventDate);
  const demandAdj = demandAdjustment(recentBookings);
  const inventoryAdj = inventoryAdjustment(bookedTickets, totalTickets);

  const rawPrice =
    basePrice *
    (1 +
      timeAdj * timeWeight +
      demandAdj * demandWeight +
      inventoryAdj * inventoryWeight);

  return Math.min(Math.max(rawPrice, floorPrice), ceilingPrice);
}

/**
 * Returns a full price breakdown with individual contributions per rule.
 */
export function calculatePriceBreakdown(
  input: PriceCalculationInput
): PriceBreakdown {
  const {
    basePrice,
    floorPrice,
    ceilingPrice,
    eventDate,
    recentBookings,
    bookedTickets,
    totalTickets,
    pricingRules,
  } = input;

  const timeWeight = pricingRules?.timeWeight ?? 1.0;
  const demandWeight = pricingRules?.demandWeight ?? 1.0;
  const inventoryWeight = pricingRules?.inventoryWeight ?? 1.0;

  const timeFactor = timeAdjustment(eventDate);
  const demandFactor = demandAdjustment(recentBookings);
  const inventoryFactor = inventoryAdjustment(bookedTickets, totalTickets);

  const rawPrice =
    basePrice *
    (1 +
      timeFactor * timeWeight +
      demandFactor * demandWeight +
      inventoryFactor * inventoryWeight);

  const currentPrice = Math.min(Math.max(rawPrice, floorPrice), ceilingPrice);

  return {
    basePrice,
    currentPrice,
    breakdown: {
      timeAdjustment: {
        factor: timeFactor,
        weight: timeWeight,
        contribution: basePrice * timeFactor * timeWeight,
      },
      demandAdjustment: {
        factor: demandFactor,
        weight: demandWeight,
        contribution: basePrice * demandFactor * demandWeight,
      },
      inventoryAdjustment: {
        factor: inventoryFactor,
        weight: inventoryWeight,
        contribution: basePrice * inventoryFactor * inventoryWeight,
      },
    },
  };
}
