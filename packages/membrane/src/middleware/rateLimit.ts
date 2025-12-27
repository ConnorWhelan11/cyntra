/**
 * Rate Limiting Middleware
 *
 * Simple sliding window rate limiter using SQLite for persistence.
 * Provides both IP-based and address-based rate limiting.
 */

import type { Context, Next } from "hono";
import { getDatabase } from "../lib/database.js";

interface RateLimitConfig {
  /** Window size in milliseconds */
  windowMs: number;
  /** Maximum requests per window */
  max: number;
  /** Key prefix for different limit types */
  keyPrefix?: string;
  /** Custom key generator function */
  keyGenerator?: (c: Context) => string;
  /** Message to return when rate limited */
  message?: string;
  /** Skip rate limiting for this request */
  skip?: (c: Context) => boolean;
}

interface RateLimitEntry {
  key: string;
  count: number;
  window_start: number;
}

// Initialize rate limit table
let tableInitialized = false;

function ensureTable() {
  if (tableInitialized) return;

  const db = getDatabase();
  db.run(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 1,
      window_start INTEGER NOT NULL
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start)");
  tableInitialized = true;
}

/**
 * Get rate limit entry for a key
 */
function getRateLimitEntry(key: string): RateLimitEntry | null {
  ensureTable();
  const db = getDatabase();
  const stmt = db.prepare("SELECT key, count, window_start FROM rate_limits WHERE key = ?");
  return stmt.get(key) as RateLimitEntry | null;
}

/**
 * Increment or create rate limit entry
 * Returns the new count
 */
function incrementRateLimit(key: string, windowMs: number): number {
  ensureTable();
  const db = getDatabase();
  const now = Date.now();
  const windowStart = now - (now % windowMs); // Align to window boundary

  const existing = getRateLimitEntry(key);

  if (existing && existing.window_start === windowStart) {
    // Same window, increment
    const stmt = db.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?");
    stmt.run(key);
    return existing.count + 1;
  } else {
    // New window or first request
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO rate_limits (key, count, window_start)
      VALUES (?, 1, ?)
    `);
    stmt.run(key, windowStart);
    return 1;
  }
}

/**
 * Clean up old rate limit entries
 */
function cleanupRateLimits(windowMs: number): number {
  ensureTable();
  const db = getDatabase();
  const cutoff = Date.now() - windowMs;
  const stmt = db.prepare("DELETE FROM rate_limits WHERE window_start < ?");
  const result = stmt.run(cutoff);
  return result.changes;
}

/**
 * Default key generator - uses IP address
 */
function defaultKeyGenerator(c: Context): string {
  // Try various headers for real IP
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = c.req.header("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback to a generic key for local development
  return "local";
}

/**
 * Create a rate limiting middleware
 */
export function rateLimit(config: RateLimitConfig) {
  const {
    windowMs = 60 * 1000, // 1 minute default
    max = 100, // 100 requests per window default
    keyPrefix = "rl:",
    keyGenerator = defaultKeyGenerator,
    message = "Too many requests, please try again later",
    skip,
  } = config;

  // Periodically clean up old entries (every 10 windows)
  let cleanupCounter = 0;
  const cleanupInterval = 10;

  return async (c: Context, next: Next) => {
    // Check if we should skip
    if (skip && skip(c)) {
      return next();
    }

    // Generate key
    const baseKey = keyGenerator(c);
    const key = `${keyPrefix}${baseKey}`;

    // Increment and check limit
    const count = incrementRateLimit(key, windowMs);

    // Set rate limit headers
    c.header("X-RateLimit-Limit", max.toString());
    c.header("X-RateLimit-Remaining", Math.max(0, max - count).toString());
    c.header("X-RateLimit-Reset", Math.ceil((Date.now() + windowMs) / 1000).toString());

    if (count > max) {
      // Rate limited
      c.header("Retry-After", Math.ceil(windowMs / 1000).toString());
      return c.json(
        {
          error: message,
          code: "RATE_LIMITED",
          retryAfter: Math.ceil(windowMs / 1000),
        },
        429
      );
    }

    // Periodic cleanup
    cleanupCounter++;
    if (cleanupCounter >= cleanupInterval) {
      cleanupCounter = 0;
      cleanupRateLimits(windowMs);
    }

    return next();
  };
}

/**
 * Pre-configured rate limiters for common use cases
 */

/** General API rate limit: 100 requests per minute */
export const generalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  keyPrefix: "rl:general:",
});

/** Auth endpoints: 10 requests per minute (stricter) */
export const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: "rl:auth:",
  message: "Too many authentication attempts, please try again later",
});

/** Nonce generation: 20 requests per minute */
export const nonceRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyPrefix: "rl:nonce:",
  message: "Too many nonce requests, please try again later",
});

/** Transaction execution: 30 requests per minute */
export const executeRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: "rl:execute:",
  message: "Too many transaction requests, please try again later",
});

/** Upload endpoints: 5 requests per minute (expensive operations) */
export const uploadRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyPrefix: "rl:upload:",
  message: "Too many upload requests, please try again later",
});
