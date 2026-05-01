// Jest globals: describe, it, expect, beforeEach, afterEach are available without import
import {
  timeAdjustment,
  demandAdjustment,
  inventoryAdjustment,
  calculatePrice,
  calculatePriceBreakdown,
} from "../src/index";

// Helper to create a date N days from now
function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

// ─── timeAdjustment ───────────────────────────────────────────────────────────

describe("timeAdjustment", () => {
  it("returns 0.0 when event is more than 30 days away", () => {
    expect(timeAdjustment(daysFromNow(31))).toBe(0.0);
    expect(timeAdjustment(daysFromNow(60))).toBe(0.0);
    expect(timeAdjustment(daysFromNow(365))).toBe(0.0);
  });

  it("returns 0.1 when event is 8–30 days away", () => {
    expect(timeAdjustment(daysFromNow(30))).toBe(0.1);
    expect(timeAdjustment(daysFromNow(15))).toBe(0.1);
    expect(timeAdjustment(daysFromNow(8))).toBe(0.1);
  });

  it("returns 0.2 when event is 2–7 days away", () => {
    expect(timeAdjustment(daysFromNow(7))).toBe(0.2);
    expect(timeAdjustment(daysFromNow(5))).toBe(0.2);
    expect(timeAdjustment(daysFromNow(2))).toBe(0.2);
  });

  it("returns 0.5 when event is tomorrow (1 day)", () => {
    expect(timeAdjustment(daysFromNow(1))).toBe(0.5);
  });

  it("returns 0.5 when event is today or past", () => {
    expect(timeAdjustment(daysFromNow(0))).toBe(0.5);
    expect(timeAdjustment(daysFromNow(-1))).toBe(0.5);
  });
});

// ─── demandAdjustment ─────────────────────────────────────────────────────────

describe("demandAdjustment", () => {
  beforeEach(() => {
    process.env.DEMAND_THRESHOLD = "10";
  });

  afterEach(() => {
    delete process.env.DEMAND_THRESHOLD;
  });

  it("returns 0.15 when bookings exceed threshold", () => {
    expect(demandAdjustment(11)).toBe(0.15);
    expect(demandAdjustment(100)).toBe(0.15);
  });

  it("returns 0.0 when bookings are at or below threshold", () => {
    expect(demandAdjustment(10)).toBe(0.0);
    expect(demandAdjustment(0)).toBe(0.0);
    expect(demandAdjustment(9)).toBe(0.0);
  });

  it("uses default threshold of 10 when env not set", () => {
    delete process.env.DEMAND_THRESHOLD;
    expect(demandAdjustment(10)).toBe(0.0);
    expect(demandAdjustment(11)).toBe(0.15);
  });
});

// ─── inventoryAdjustment ──────────────────────────────────────────────────────

describe("inventoryAdjustment", () => {
  it("returns 0.25 when remaining < 20%", () => {
    expect(inventoryAdjustment(85, 100)).toBe(0.25); // 15% remaining
    expect(inventoryAdjustment(99, 100)).toBe(0.25); // 1% remaining
    expect(inventoryAdjustment(100, 100)).toBe(0.25); // 0% remaining
  });

  it("returns 0.25 when totalTickets is 0", () => {
    expect(inventoryAdjustment(0, 0)).toBe(0.25);
  });

  it("returns 0.1 when remaining < 50%", () => {
    expect(inventoryAdjustment(60, 100)).toBe(0.1); // 40% remaining
    expect(inventoryAdjustment(50, 100)).toBe(0.1); // 50% remaining — boundary
    expect(inventoryAdjustment(51, 100)).toBe(0.1); // 49% remaining
  });

  it("returns 0.0 when more than 50% remaining", () => {
    expect(inventoryAdjustment(0, 100)).toBe(0.0); // 100% remaining
    expect(inventoryAdjustment(49, 100)).toBe(0.0); // 51% remaining
  });
});

// ─── calculatePrice ───────────────────────────────────────────────────────────

describe("calculatePrice", () => {
  const baseInput = {
    basePrice: 1000,
    floorPrice: 800,
    ceilingPrice: 3000,
    eventDate: daysFromNow(3), // 0.2 time adj
    recentBookings: 5, // 0.0 demand adj
    bookedTickets: 85, // 0.25 inventory adj (15% remaining)
    totalTickets: 100,
    pricingRules: { timeWeight: 1.0, demandWeight: 1.0, inventoryWeight: 1.0 },
  };

  it("calculates combined price correctly", () => {
    // time: 0.2 × 1.0 = 0.2
    // demand: 0.0 × 1.0 = 0.0
    // inventory: 0.25 × 1.0 = 0.25
    // total: 1000 × (1 + 0.45) = 1450
    const price = calculatePrice(baseInput);
    expect(price).toBeCloseTo(1450, 0);
  });

  it("clamps to ceilingPrice when raw price exceeds ceiling", () => {
    const input = {
      ...baseInput,
      basePrice: 5000,
      ceilingPrice: 3000,
    };
    expect(calculatePrice(input)).toBe(3000);
  });

  it("clamps to floorPrice when raw price is below floor", () => {
    const input = {
      ...baseInput,
      eventDate: daysFromNow(60), // 0.0 time adj
      recentBookings: 0, // 0.0 demand
      bookedTickets: 0, // 0.0 inventory
      basePrice: 1000,
      floorPrice: 1200, // floor higher than base
    };
    expect(calculatePrice(input)).toBe(1200);
  });

  it("applies custom weights from pricingRules", () => {
    const input = {
      ...baseInput,
      pricingRules: { timeWeight: 2.0, demandWeight: 1.0, inventoryWeight: 0.5 },
    };
    // time: 0.2 × 2.0 = 0.4
    // demand: 0.0 × 1.0 = 0.0
    // inventory: 0.25 × 0.5 = 0.125
    // total: 1000 × (1 + 0.525) = 1525
    expect(calculatePrice(input)).toBeCloseTo(1525, 0);
  });
});

// ─── calculatePriceBreakdown ──────────────────────────────────────────────────

describe("calculatePriceBreakdown", () => {
  it("returns correct breakdown shape", () => {
    const input = {
      basePrice: 1000,
      floorPrice: 800,
      ceilingPrice: 3000,
      eventDate: daysFromNow(3), // 0.2
      recentBookings: 15, // 0.15 (threshold = 10)
      bookedTickets: 85, // 0.25
      totalTickets: 100,
      pricingRules: { timeWeight: 1.0, demandWeight: 1.0, inventoryWeight: 1.0 },
    };

    process.env.DEMAND_THRESHOLD = "10";
    const breakdown = calculatePriceBreakdown(input);
    delete process.env.DEMAND_THRESHOLD;

    expect(breakdown.basePrice).toBe(1000);
    expect(breakdown.breakdown.timeAdjustment.factor).toBe(0.2);
    expect(breakdown.breakdown.timeAdjustment.contribution).toBeCloseTo(200);
    expect(breakdown.breakdown.demandAdjustment.factor).toBe(0.15);
    expect(breakdown.breakdown.demandAdjustment.contribution).toBeCloseTo(150);
    expect(breakdown.breakdown.inventoryAdjustment.factor).toBe(0.25);
    expect(breakdown.breakdown.inventoryAdjustment.contribution).toBeCloseTo(250);
    // currentPrice = 1000 × (1 + 0.2 + 0.15 + 0.25) = 1600
    expect(breakdown.currentPrice).toBeCloseTo(1600, 0);
  });

  it("matches the article example: base=1000, time=0.20, demand=0.15, inventory=0.25 → 1600", () => {
    process.env.DEMAND_THRESHOLD = "10";
    const breakdown = calculatePriceBreakdown({
      basePrice: 1000,
      floorPrice: 500,
      ceilingPrice: 5000,
      eventDate: daysFromNow(3), // triggers 0.20
      recentBookings: 15, // triggers 0.15
      bookedTickets: 85, // 85% booked → 15% remaining → triggers 0.25
      totalTickets: 100,
      pricingRules: { timeWeight: 1.0, demandWeight: 1.0, inventoryWeight: 1.0 },
    });
    delete process.env.DEMAND_THRESHOLD;

    expect(breakdown.currentPrice).toBeCloseTo(1600, 0);
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles event tomorrow with 0 tickets remaining and high demand", () => {
    process.env.DEMAND_THRESHOLD = "10";
    const result = calculatePrice({
      basePrice: 1000,
      floorPrice: 500,
      ceilingPrice: 5000,
      eventDate: daysFromNow(1),
      recentBookings: 100,
      bookedTickets: 100,
      totalTickets: 100,
      pricingRules: { timeWeight: 1.0, demandWeight: 1.0, inventoryWeight: 1.0 },
    });
    delete process.env.DEMAND_THRESHOLD;

    // time: 0.5, demand: 0.15, inventory: 0.25
    // raw = 1000 × 1.9 = 1900
    expect(result).toBeCloseTo(1900, 0);
  });

  it("handles demand at exact threshold (should return 0.0)", () => {
    process.env.DEMAND_THRESHOLD = "10";
    expect(demandAdjustment(10)).toBe(0.0);
    delete process.env.DEMAND_THRESHOLD;
  });
});
