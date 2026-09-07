/**
 * @file authRateLimiter.js
 * @description Authentication rate limiter delegating to distributed rateLimiter.js.
 */

import { createRateLimiter, resetRateLimits as resetBaseLimits } from './rateLimiter.js';

/**
 * Creates an authentication rate limiter.
 * @param {object} options
 */
export function createAuthRateLimiter({
  windowMs = 60 * 1000,
  max = 10,
  message = 'Too many authentication attempts. Please try again later.'
} = {}) {
  return createRateLimiter({
    windowMs,
    max,
    message,
    keyGenerator: (req) => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
      const path = req.path || '';
      const action = path.includes('register') ? 'register' : 'login';
      return `v1:ratelimit:${action}:${ip}`;
    }
  });
}

/**
 * Default auth rate limiter: 10 requests per minute per IP.
 */
export const authRateLimiter = createAuthRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many authentication attempts. Please try again later.'
});

/**
 * Clears rate limiting store (useful for testing).
 */
export function resetRateLimits() {
  resetBaseLimits();
}
