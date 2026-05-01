import { Router, Request, Response, IRouter } from "express";
import { db } from "../lib/db";
import { events } from "@repo/database";

export const seedRouter: IRouter = Router();

// POST /seed — dev-only endpoint to run seed data
seedRouter.post("/", async (_req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "Seed is disabled in production" });
    return;
  }

  try {
    const now = new Date();

    const seedEvents = [
      {
        name: "Coldplay: Music of the Spheres World Tour",
        date: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
        venue: "DY Patil Stadium, Mumbai",
        description: "Coldplay brings their spectacular Music of the Spheres World Tour to India.",
        totalTickets: 500,
        bookedTickets: 420,
        basePrice: "2000.00",
        currentPrice: "2000.00",
        floorPrice: "1500.00",
        ceilingPrice: "6000.00",
        pricingRules: { timeWeight: 1.0, demandWeight: 1.0, inventoryWeight: 1.0 },
        status: "ACTIVE" as const,
      },
      {
        name: "Sunburn Festival 2025",
        date: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000),
        venue: "Vagator Beach, Goa",
        description: "Asia's biggest electronic music festival returns to Goa.",
        totalTickets: 2000,
        bookedTickets: 800,
        basePrice: "3500.00",
        currentPrice: "3500.00",
        floorPrice: "2500.00",
        ceilingPrice: "8000.00",
        pricingRules: { timeWeight: 1.0, demandWeight: 1.5, inventoryWeight: 1.0 },
        status: "ACTIVE" as const,
      },
      {
        name: "IPL Finals 2025: MI vs CSK",
        date: new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000),
        venue: "Narendra Modi Stadium, Ahmedabad",
        description: "The ultimate cricket showdown in the IPL Final.",
        totalTickets: 10000,
        bookedTickets: 2000,
        basePrice: "1000.00",
        currentPrice: "1000.00",
        floorPrice: "500.00",
        ceilingPrice: "5000.00",
        pricingRules: { timeWeight: 1.0, demandWeight: 1.0, inventoryWeight: 1.0 },
        status: "ACTIVE" as const,
      },
      {
        name: "AR Rahman Live in Concert",
        date: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000),
        venue: "Jawaharlal Nehru Stadium, Delhi",
        description: "Oscar-winning maestro AR Rahman performs his greatest hits live.",
        totalTickets: 1500,
        bookedTickets: 900,
        basePrice: "1500.00",
        currentPrice: "1500.00",
        floorPrice: "1000.00",
        ceilingPrice: "4500.00",
        pricingRules: { timeWeight: 1.2, demandWeight: 1.0, inventoryWeight: 1.0 },
        status: "ACTIVE" as const,
      },
      {
        name: "Comic Con India 2025",
        date: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
        venue: "Bangalore International Exhibition Centre",
        description: "India's biggest pop culture festival.",
        totalTickets: 3000,
        bookedTickets: 300,
        basePrice: "800.00",
        currentPrice: "800.00",
        floorPrice: "600.00",
        ceilingPrice: "2000.00",
        pricingRules: { timeWeight: 1.0, demandWeight: 1.0, inventoryWeight: 1.0 },
        status: "ACTIVE" as const,
      },
    ];

    await db.insert(events).values(seedEvents).onConflictDoNothing();
    res.status(201).json({ message: `Seeded ${seedEvents.length} events` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Seed failed" });
  }
});
