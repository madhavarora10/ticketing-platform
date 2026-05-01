import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { eventsRouter } from "./routes/events";
import { bookingsRouter } from "./routes/bookings";
import { analyticsRouter } from "./routes/analytics";
import { seedRouter } from "./routes/seed";
import { adminRouter } from "./routes/admin";
import { startCleanupJob } from "./jobs/cleanup";

const app: express.Express = express();

app.use(express.json());
app.use(cors({ origin: process.env.WEB_URL ?? "http://localhost:3000", credentials: true }));

// Rate limiter — covers the rate-limiter layer from the architecture
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use(limiter);

// Routes
app.use("/events", eventsRouter);
app.use("/bookings", bookingsRouter);
app.use("/analytics", analyticsRouter);
app.use("/seed", seedRouter);
app.use("/admin", adminRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Only bind a port and start background jobs when running as the entry point.
// When imported by Jest (supertest), the app object is used directly — no port needed.
if (require.main === module) {
  startCleanupJob();
  const PORT = process.env.PORT ?? 4000;
  app.listen(PORT, () => {
    console.log(`🚀 API running on http://localhost:${PORT}`);
  });
}

export { app };
