/**
 * @file rateLimiter.js
 * @description Distributed atomic sliding-window rate limiter via Redis Lua script with local in-memory fallback.
 */

import { randomUUID } from 'node:crypto';
import { AppError } from '../utils/errors.js';
import { getRedisClient } from '../infrastructure/redis/client.js';
import { logger } from '../utils/logger.js';

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests. Please try again later.') {
    super(message, 429, 'TOO_MANY_REQUESTS', true);
  }
}

export const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

local clearBefore = now - window
redis.call('ZREMRANGEBYSCORE', key, 0, clearBefore)
local currentRequests = redis.call('ZCARD', key)

if currentRequests < limit then
    redis.call('ZADD', key, now, member)
    redis.call('EXPIRE', key, math.ceil(window / 1000))
    return { 1, limit - currentRequests - 1, 0 }
else
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retryAfter = 0
    if #oldest > 0 then
        local oldestScore = tonumber(oldest[2])
        retryAfter = math.ceil((oldestScore + window - now) / 1000)
    end
    if retryAfter <= 0 then retryAfter = 1 end
    return { 0, 0, retryAfter }
end
`;

// In-memory fallback state
const requestHistory = new Map();
const MAX_MAP_ENTRIES = 5000;

function pruneStaleEntries(now, windowMs) {
  if (requestHistory.size > MAX_MAP_ENTRIES) {
    for (const [key, timestamps] of requestHistory.entries()) {
      const valid = timestamps.filter((t) => now - t < windowMs * 2);
      if (valid.length === 0) {
        requestHistory.delete(key);
      } else {
        requestHistory.set(key, valid);
      }
    }
  }
}

/**
 * Executes local in-memory sliding-window rate limit check.
 */
function checkInMemoryFallback(key, now, windowMs, max) {
  pruneStaleEntries(now, windowMs);

  let timestamps = requestHistory.get(key) || [];
  timestamps = timestamps.filter((t) => now - t < windowMs);

  if (timestamps.length >= max) {
    const oldest = timestamps[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { allowed: false, remaining: 0, retryAfter };
  }

  timestamps.push(now);
  requestHistory.set(key, timestamps);
  return { allowed: true, remaining: max - timestamps.length, retryAfter: 0 };
}

/**
 * Creates a rate limiter middleware instance.
 * @param {object} options
 * @param {number} [options.windowMs=60000]
 * @param {number} [options.max=10]
 * @param {string} [options.message='Too many requests. Please try again later.']
 * @param {(req: import('express').Request) => string} [options.keyGenerator]
 * @returns {import('express').RequestHandler}
 */
export function createRateLimiter({
  windowMs = 60 * 1000,
  max = 10,
  message = 'Too many requests. Please try again later.',
  keyGenerator = (req) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
    return `v1:ratelimit:ip:${ip}`;
  }
} = {}) {
  return async (req, res, next) => {
    if (process.env.DISABLE_RATE_LIMIT === 'true') {
      return next();
    }

    try {
      const logicalKey = keyGenerator(req);
      const now = Date.now();
      let allowed = true;
      let remaining = max;
      let retryAfter = 0;

      const client = getRedisClient();

      if (client) {
        try {
          if (typeof client.slidingWindowRateLimit !== 'function') {
            client.defineCommand('slidingWindowRateLimit', {
              numberOfKeys: 1,
              lua: SLIDING_WINDOW_LUA
            });
          }

          const member = `${now}:${randomUUID()}`;
          const result = await client.slidingWindowRateLimit(
            logicalKey,
            now,
            windowMs,
            max,
            member
          );

          allowed = Number(result[0]) === 1;
          remaining = Number(result[1]);
          retryAfter = Number(result[2]);
        } catch (redisErr) {
          logger.warn(
            { key: logicalKey, err: redisErr.message },
            'Redis rate limit execution failed; falling back to in-memory sliding window'
          );
          // Fall back to in-memory check
          const fallback = checkInMemoryFallback(logicalKey, now, windowMs, max);
          allowed = fallback.allowed;
          remaining = fallback.remaining;
          retryAfter = fallback.retryAfter;
        }
      } else {
        // Redis disabled or uninitialized; use in-memory limiter
        const fallback = checkInMemoryFallback(logicalKey, now, windowMs, max);
        allowed = fallback.allowed;
        remaining = fallback.remaining;
        retryAfter = fallback.retryAfter;
      }

      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining)));

      if (!allowed) {
        res.setHeader('Retry-After', String(retryAfter));
        return next(new TooManyRequestsError(message));
      }

      return next();
    } catch (err) {
      // Fail-open policy for unexpected errors to ensure candidate exam actions are never blocked
      logger.error({ err: err.message }, 'Rate limiter encountered fatal error; failing open');
      return next();
    }
  };
}

/**
 * Resets in-memory rate limiting state (for testing).
 */
export function resetRateLimits() {
  requestHistory.clear();
}
