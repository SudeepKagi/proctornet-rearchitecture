import { getRedisClient } from './client.js';
import { logger } from '../../utils/logger.js';
import { redisOperationsTotal } from '../metrics/registry.js';

/**
 * Cache-aside service providing safe, non-authoritative read acceleration.
 * Catches all Redis failures to ensure zero downtime when Redis is unavailable.
 */
export const cacheService = {
  /**
   * Retrieves and deserializes a value from Redis.
   * On cache miss, malformed data, or Redis outage, returns null (safe fail-open).
   * @param {string} key - Logical key (e.g. 'v1:exam:uuid')
   * @returns {Promise<any | null>}
   */
  async get(key) {
    try {
      const client = getRedisClient();
      if (!client) return null;

      const raw = await client.get(key);
      if (raw === null || raw === undefined) {
        try { redisOperationsTotal.inc({ operation: 'get', status: 'miss' }); } catch {}
        return null;
      }

      try {
        const parsed = JSON.parse(raw);
        try { redisOperationsTotal.inc({ operation: 'get', status: 'hit' }); } catch {}
        return parsed;
      } catch (parseErr) {
        logger.warn(
          { key, err: parseErr.message },
          'Corrupt cache entry detected; discarding key and returning miss'
        );
        // Asynchronously delete the corrupt entry to prevent repeated parse errors
        client.del(key).catch((delErr) => {
          logger.warn({ key, err: delErr.message }, 'Failed to delete corrupt cache key');
        });
        try { redisOperationsTotal.inc({ operation: 'get', status: 'miss' }); } catch {}
        return null;
      }
    } catch (err) {
      logger.warn(
        { key, err: err.message },
        'Redis cache get failed; falling back to authoritative database'
      );
      try { redisOperationsTotal.inc({ operation: 'get', status: 'error' }); } catch {}
      return null;
    }
  },

  /**
   * Serializes and stores a value in Redis with a time-to-live.
   * If ttlSeconds <= 0, caching is skipped.
   * @param {string} key - Logical key
   * @param {any} value - Serializable data
   * @param {number} ttlSeconds - Time-to-live in seconds
   * @returns {Promise<boolean>}
   */
  async set(key, value, ttlSeconds) {
    if (!ttlSeconds || ttlSeconds <= 0) {
      return false;
    }

    try {
      const client = getRedisClient();
      if (!client) return false;

      const serialized = JSON.stringify(value);
      await client.set(key, serialized, 'EX', Math.ceil(ttlSeconds));
      try { redisOperationsTotal.inc({ operation: 'set', status: 'hit' }); } catch {}
      return true;
    } catch (err) {
      logger.warn(
        { key, err: err.message },
        'Redis cache set failed; continuing without caching'
      );
      try { redisOperationsTotal.inc({ operation: 'set', status: 'error' }); } catch {}
      return false;
    }
  },

  /**
   * Deletes a key from Redis.
   * @param {string} key - Logical key
   * @returns {Promise<boolean>}
   */
  async del(key) {
    try {
      const client = getRedisClient();
      if (!client) return false;

      await client.del(key);
      try { redisOperationsTotal.inc({ operation: 'del', status: 'hit' }); } catch {}
      return true;
    } catch (err) {
      logger.warn(
        { key, err: err.message },
        'Redis cache del failed; continuing'
      );
      try { redisOperationsTotal.inc({ operation: 'del', status: 'error' }); } catch {}
      return false;
    }
  },

  /**
   * Deletes multiple keys matching a logical pattern using SCAN.
   * @param {string} pattern - Logical pattern (e.g. 'v1:exam:*')
   * @returns {Promise<number>} Number of keys deleted
   */
  async delByPattern(pattern) {
    try {
      const client = getRedisClient();
      if (!client) return 0;

      let cursor = '0';
      let deletedCount = 0;

      // Note: when using keyPrefix, SCAN matches the full physical key in Redis.
      // ioredis client.scanStream handles keyPrefix internally or raw scan can be used.
      do {
        const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys && keys.length > 0) {
          // In ioredis, when keyPrefix is set, keys returned from SCAN already have prefix stripped if using scanStream,
          // but raw SCAN returns full keys. Del handles both if keys are passed.
          // Safely delete without prefix duplication by using unlink or del:
          for (const key of keys) {
            // If ioredis keyPrefix is applied, strip prefix if present before calling client.del(key)
            const prefix = client.options?.keyPrefix || '';
            const logicalKey = prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;
            await client.del(logicalKey);
            deletedCount++;
          }
        }
      } while (cursor !== '0');

      return deletedCount;
    } catch (err) {
      logger.warn(
        { pattern, err: err.message },
        'Redis delByPattern failed; continuing'
      );
      return 0;
    }
  }
};
