/**
 * @file authRateLimiter.js
 * @description In-memory sliding window rate limiter for bounded login abuse protection.
 * Protects authentication endpoints against rapid automated brute-force attempts without requiring Redis.
 */

import { AppError } from '../utils/errors.js';

class TooManyRequestsError extends AppError {
  constructor(message = 'Too many authentication attempts. Please try again later.') {
    super(message, 429, 'TOO_MANY_REQUESTS', true);
  }
}

// Map of IP/route key -> Array of request timestamps (in milliseconds)
const requestHistory = new Map();
const MAX_MAP_ENTRIES = 1000;

/**
 * Lazy cleanup of stale rate limiter entries to bound memory usage without background intervals.
 */
function pruneStaleEntries(now, windowMs) {
  if (requestHistory.size > MAX_MAP_ENTRIES) {
    for (const [key, timestamps] of requestHistory.entries()) {
      const validTimestamps = timestamps.filter((t) => now - t < windowMs * 2);
      if (validTimestamps.length === 0) {
        requestHistory.delete(key);
      } else {
        requestHistory.set(key, validTimestamps);
      }
    }
  }
}

/**
 * Creates an Express rate limiting middleware with sliding window algorithm.
 * @param {object} options
 * @param {number} [options.windowMs=60000] - Time window in milliseconds (default: 1 min)
 * @param {number} [options.max=10] - Maximum allowed requests per window
 * @param {string} [options.message] - Error message on threshold breach
 * @returns {import('express').RequestHandler}
 */
export function createAuthRateLimiter({
  windowMs = 60 * 1000,
  max = 10,
  message = 'Too many authentication attempts. Please try again later.'
} = {}) {
  return (req, res, next) => {
    if (process.env.DISABLE_RATE_LIMIT === 'true') {
      return next();
    }

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown-ip';
    const routeKey = `${clientIp}:${req.baseUrl || ''}${req.path || ''}`;
    const now = Date.now();

    pruneStaleEntries(now, windowMs);

    let timestamps = requestHistory.get(routeKey) || [];
    // Filter timestamps within current sliding window
    timestamps = timestamps.filter((t) => now - t < windowMs);

    if (timestamps.length >= max) {
      const oldestInWindow = timestamps[0];
      const retryAfterSec = Math.max(1, Math.ceil((oldestInWindow + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return next(new TooManyRequestsError(message));
    }

    timestamps.push(now);
    requestHistory.set(routeKey, timestamps);
    return next();
  };
}

/**
 * Default login rate limiter: 10 requests per minute per IP
 */
export const authRateLimiter = createAuthRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many authentication attempts. Please try again later.'
});

/**
 * Clears in-memory rate limiting store (useful for unit and integration testing)
 */
export function resetRateLimits() {
  requestHistory.clear();
}
