import { Router, Request, Response, IRouter } from "express";
import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";

export const adminRouter: IRouter = Router();

// ─── Admin key guard ──────────────────────────────────────────────────────────

function adminOnly(req: Request, res: Response, next: () => void) {
  const key = req.headers.authorization?.replace("Bearer ", "");
  if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ─── GET /admin/config ────────────────────────────────────────────────────────
// Returns the four pricing env vars currently active in the process

adminRouter.get("/config", adminOnly, (_req: Request, res: Response) => {
  res.json({
    DEMAND_THRESHOLD: process.env.DEMAND_THRESHOLD ?? "10",
    TIME_WEIGHT: process.env.TIME_WEIGHT ?? "1.0",
    DEMAND_WEIGHT: process.env.DEMAND_WEIGHT ?? "1.0",
    INVENTORY_WEIGHT: process.env.INVENTORY_WEIGHT ?? "1.0",
  });
});

// ─── PATCH /admin/config ──────────────────────────────────────────────────────
// Writes the four pricing env vars to the .env file AND updates process.env live

const ENV_FILE = path.resolve(process.cwd(), ".env");

const PRICING_KEYS = [
  "DEMAND_THRESHOLD",
  "TIME_WEIGHT",
  "DEMAND_WEIGHT",
  "INVENTORY_WEIGHT",
] as const;

type PricingKey = (typeof PRICING_KEYS)[number];

adminRouter.patch("/config", adminOnly, (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<Record<PricingKey, string>>;

    // Validate all submitted keys
    for (const key of PRICING_KEYS) {
      if (body[key] !== undefined) {
        const n = parseFloat(body[key]!);
        if (isNaN(n) || n < 0) {
          res.status(400).json({ error: `Invalid value for ${key}` });
          return;
        }
      }
    }

    // Read current .env file, update matching lines
    let envContent = fs.existsSync(ENV_FILE)
      ? fs.readFileSync(ENV_FILE, "utf-8")
      : "";

    for (const key of PRICING_KEYS) {
      const value = body[key];
      if (value === undefined) continue;

      // Apply to live process
      process.env[key] = value;

      // Update or append in .env
      const regex = new RegExp(`^${key}=.*$`, "m");
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    }

    fs.writeFileSync(ENV_FILE, envContent, "utf-8");

    res.json({
      DEMAND_THRESHOLD: process.env.DEMAND_THRESHOLD ?? "10",
      TIME_WEIGHT: process.env.TIME_WEIGHT ?? "1.0",
      DEMAND_WEIGHT: process.env.DEMAND_WEIGHT ?? "1.0",
      INVENTORY_WEIGHT: process.env.INVENTORY_WEIGHT ?? "1.0",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update config" });
  }
});

// ─── POST /admin/run-tests ────────────────────────────────────────────────────
// Runs pnpm test:pricing and streams results as JSON

adminRouter.post("/run-tests", adminOnly, (_req: Request, res: Response) => {
  const monorepoRoot = path.resolve(process.cwd(), "..", "..");

  execFile(
    "pnpm",
    ["--filter", "@repo/pricing", "test", "--", "--json", "--no-coverage"],
    {
      cwd: monorepoRoot,
      shell: true,
      timeout: 60_000,
    },
    (error, stdout, stderr) => {
      // Jest --json outputs a JSON object to stdout; errors go to stderr
      let parsed: unknown = null;
      try {
        // Jest JSON output starts with a '{' but may have log lines before it
        const jsonStart = stdout.indexOf("{");
        if (jsonStart !== -1) {
          parsed = JSON.parse(stdout.slice(jsonStart));
        }
      } catch {
        // Could not parse JSON — fall through
      }

      res.json({
        success: !error || (error as NodeJS.ErrnoException & { status?: number }).status === 1,
        raw: stdout,
        stderr,
        parsed,
      });
    }
  );
});
