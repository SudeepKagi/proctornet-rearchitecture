/**
 * @file tokenBlacklist.js
 * @description Redis-backed session revocation blacklist for fast cross-node session invalidation.
 */

import { getRedisClient } from '../../infrastructure/redis/client.js';
import { logger } from '../../utils/logger.js';

const BLACKLIST_PREFIX = 'v1:blacklist:session:';
const DEFAULT_BLACKLIST_TTL_SECONDS = 900; // 15 minutes (matches JWT access token expiration)

/**
 * Adds a session ID to the Redis blacklist with a TTL.
 * @param {string} sessionId
 * @param {number} [ttlSeconds=900]
 * @returns {Promise<boolean>}
 */
export async function blacklistSession(sessionId, ttlSeconds = DEFAULT_BLACKLIST_TTL_SECONDS) {
  if (!sessionId) return false;

  try {
    const client = getRedisClient();
    if (!client) return false;

    const key = `${BLACKLIST_PREFIX}${sessionId}`;
    await client.set(key, '1', 'EX', Math.ceil(ttlSeconds));
    logger.debug({ sessionId, ttlSeconds }, 'Session added to Redis revocation blacklist');
    return true;
  } catch (err) {
    logger.warn(
      { sessionId, err: err.message },
      'Failed to record session in Redis blacklist; relying on PostgreSQL authoritative revocation'
    );
    return false;
  }
}

/**
 * Checks whether a session ID is in the Redis revocation blacklist.
 * Distinguishes between cache presence and Redis unavailability for PostgreSQL fallback.
 * @param {string} sessionId
 * @returns {Promise<{ available: boolean, isBlacklisted: boolean }>}
 */
export async function isSessionBlacklisted(sessionId) {
  if (!sessionId) {
    return { available: true, isBlacklisted: false };
  }

  try {
    const client = getRedisClient();
    if (!client) {
      return { available: false, isBlacklisted: false };
    }

    const key = `${BLACKLIST_PREFIX}${sessionId}`;
    const value = await client.get(key);

    return {
      available: true,
      isBlacklisted: value !== null
    };
  } catch (err) {
    logger.warn(
      { sessionId, err: err.message },
      'Redis blacklist check failed; falling back to authoritative database'
    );
    return {
      available: false,
      isBlacklisted: false
    };
  }
}
