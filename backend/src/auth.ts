import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Access control for the endpoints that can spend real USDC.
 *
 * Every settlement is funded by this service's own payer wallet, so an
 * unauthenticated /session/start is an open invitation to drain it. The shared
 * secret below is the gate, and the rate limiter is the backstop for a caller
 * that holds a valid key but misbehaves.
 *
 * The secret is shipped in the dashboard bundle, so it is not a secret from a
 * determined user, only from casual and automated traffic. It is deliberately
 * paired with the rate limiter rather than relied on alone.
 */

const API_KEY_HEADER = "x-api-key";

/**
 * Read at call time rather than module load, so a missing secret fails the
 * request loudly instead of being captured as undefined at import.
 */
function configuredSecret(): string | null {
  const value = process.env.API_SHARED_SECRET;
  return value && value.trim() !== "" ? value : null;
}

/** Fail-closed startup check, so the service cannot boot wide open. */
export function assertAuthConfigured(): void {
  if (!configuredSecret()) {
    throw new Error(
      "API_SHARED_SECRET is not set. The session endpoints spend real USDC from " +
        "the payer wallet, so the service refuses to start without one."
    );
  }
}

/** Constant-time compare that tolerates unequal lengths without leaking them. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const expected = configuredSecret();
  if (!expected) {
    // Should be unreachable given assertAuthConfigured, but never fall open.
    console.error("auth: API_SHARED_SECRET missing at request time");
    res.status(503).json({ error: "service is not configured for authentication" });
    return;
  }

  const header = req.header(API_KEY_HEADER);
  if (typeof header !== "string" || !secretMatches(header, expected)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  next();
}

interface Bucket {
  hits: number[];
}

/**
 * Fixed-window-per-caller limiter held in memory.
 *
 * In memory is the right scope here: the limit exists to stop one caller
 * hammering one process, and this service runs as a single instance. A restart
 * clearing the window is acceptable, since a restart also clears every feed.
 */
export function rateLimit(options: {
  windowMs: number;
  max: number;
  label: string;
}): (req: Request, res: Response, next: NextFunction) => void {
  const buckets = new Map<string, Bucket>();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? "unknown";
    const bucket = buckets.get(key) ?? { hits: [] };

    // Drop anything that has aged out before deciding.
    bucket.hits = bucket.hits.filter((at) => now - at < options.windowMs);

    if (bucket.hits.length >= options.max) {
      const retryAfter = Math.ceil(
        (options.windowMs - (now - bucket.hits[0])) / 1000
      );
      res.setHeader("Retry-After", String(Math.max(retryAfter, 1)));
      res.status(429).json({
        error: `too many requests, retry in ${Math.max(retryAfter, 1)}s`,
      });
      return;
    }

    bucket.hits.push(now);
    buckets.set(key, bucket);

    // Keep the map from growing without bound on a long-running process.
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) {
        if (v.hits.every((at) => now - at >= options.windowMs)) buckets.delete(k);
      }
    }

    next();
  };
}
