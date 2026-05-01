import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export const redis = new Redis(redisUrl, {
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("error", (err) => console.error("❌ Redis error:", err.message));

// ─── Cache helpers ────────────────────────────────────────────────────────────

export const CACHE_TTL = {
  EVENT_DETAILS: 3600,   // 1 hour
  EVENT_PRICE: 10,       // 10 seconds
  EVENT_LIST: 30,        // 30 seconds
} as const;

export const CACHE_KEYS = {
  eventDetails: (id: string) => `event:${id}:details`,
  eventPrice: (id: string) => `event:${id}:price`,
  eventList: () => `event:list`,
} as const;

export const LOCK_KEYS = {
  booking: (eventId: string, userEmail: string) =>
    `booking:event:${eventId}:${userEmail}`,
} as const;

// ─── Distributed lock ─────────────────────────────────────────────────────────

const LOCK_TTL = 300; // 5 min (matches article)

/**
 * Attempt to acquire a Redis lock using SET NX EX.
 * Returns the lock token on success, null on failure.
 */
export async function acquireLock(
  key: string,
  token: string
): Promise<boolean> {
  const result = await redis.set(key, token, "EX", LOCK_TTL, "NX");
  return result === "OK";
}

/**
 * Release a lock — only if the token matches (prevents releasing other owners' locks).
 */
export async function releaseLock(key: string, token: string): Promise<void> {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(script, 1, key, token);
}

// ─── Cache wrappers ───────────────────────────────────────────────────────────

export async function getCache<T>(key: string): Promise<T | null> {
  const value = await redis.get(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function setCache(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
}

export async function invalidateCache(...keys: string[]): Promise<void> {
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
