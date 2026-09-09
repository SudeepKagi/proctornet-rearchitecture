import Redis from 'ioredis';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

let redisInstance = null;

/**
 * Detects whether code is executing within a test runner environment.
 * Robust against environments where .env sets NODE_ENV=development.
 * Checks config.NODE_ENV, process.env.NODE_ENV, process.execArgv, process.argv, and test runner contexts.
 * @param {object} [overrideSignals] Optional signals for unit testing the detector.
 * @returns {boolean}
 */
export function isTestRunner(overrideSignals = null) {
  if (overrideSignals) {
    return Boolean(
      overrideSignals.nodeEnv === 'test' ||
      (Array.isArray(overrideSignals.execArgv) && overrideSignals.execArgv.includes('--test')) ||
      (Array.isArray(overrideSignals.argv) && overrideSignals.argv.some(arg => typeof arg === 'string' && (arg === '--test' || arg.includes('--test')))) ||
      Boolean(overrideSignals.testContext)
    );
  }

  return Boolean(
    config.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'test' ||
    (Array.isArray(process.execArgv) && process.execArgv.includes('--test')) ||
    (Array.isArray(process.argv) && process.argv.some(arg => typeof arg === 'string' && (arg === '--test' || arg.includes('--test')))) ||
    Boolean(process.env.NODE_TEST_CONTEXT)
  );
}

/**
 * Default reconnect strategy for Redis.
 * - Test environment: stops reconnecting after bounded retries (times > 1) with small initial delay,
 *   preventing unhandled reconnection loops from keeping the Node test process alive.
 * - Non-test environment: exponential backoff capped at 3000ms with a bounded maximum retry count (times > 10).
 * @param {number} times - 1-based reconnection attempt counter.
 * @param {boolean} [isTest] - Optional flag indicating test mode.
 * @returns {number | null} Delay in milliseconds, or null to terminate reconnecting.
 */
export function defaultRetryStrategy(times, isTest = isTestRunner()) {
  if (isTest) {
    if (times > 1) {
      return null;
    }
    return 50;
  }

  // Non-test environment: bounded maximum retry count (10 attempts)
  if (times > 10) {
    return null;
  }

  // Bounded exponential backoff capped at 3000ms
  return Math.min(times * 100, 3000);
}

/**
 * Creates a configured ioredis client instance.
 * @param {object} [customConfig]
 * @returns {Redis}
 */
export function createRedisClient(customConfig = {}) {
  const redisOptions = {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || undefined,
    db: config.REDIS_DB,
    connectTimeout: config.REDIS_CONNECT_TIMEOUT_MS,
    keyPrefix: 'proctornet:',
    enableOfflineQueue: false,
    ...(config.REDIS_TLS ? { tls: {} } : {}),
    retryStrategy(times) {
      return defaultRetryStrategy(times);
    },
    ...customConfig
  };

  const client = new Redis(redisOptions);

  client.on('connect', () => {
    logger.info('Redis client connection established');
  });

  client.on('ready', () => {
    logger.info('Redis client ready');
  });

  client.on('error', (err) => {
    logger.warn({ err: err.message }, 'Redis client error');
  });

  client.on('close', () => {
    logger.warn('Redis client connection closed');
  });

  client.on('reconnecting', (delay) => {
    logger.info({ delay }, 'Redis client reconnecting');
  });

  return client;
}

/**
 * Gets or creates the singleton Redis client instance.
 * @returns {Redis | null} Returns null if REDIS_ENABLED is false.
 */
export function getRedisClient() {
  if (!config.REDIS_ENABLED) {
    return null;
  }
  if (!redisInstance) {
    redisInstance = createRedisClient();
  }
  return redisInstance;
}

/**
 * Overrides the Redis singleton client (useful for unit testing with ioredis-mock).
 * @param {any} client
 */
export function setRedisClient(client) {
  redisInstance = client;
}

/**
 * Probes the Redis server to verify connectivity for readiness checks.
 * @param {number} [timeoutMs=2000]
 * @returns {Promise<{ healthy: boolean, status: string, latencyMs?: number, error?: string }>}
 */
export async function checkRedisHealth(timeoutMs = 2000) {
  if (!config.REDIS_ENABLED) {
    return {
      healthy: false,
      status: 'DISABLED',
      error: 'Redis is disabled by configuration'
    };
  }

  const client = getRedisClient();
  if (!client) {
    return {
      healthy: false,
      status: 'DOWN',
      error: 'Redis client not initialized'
    };
  }

  // If client status is tracked and not ready, report DOWN without waiting for timeout
  if (client.status && client.status !== 'ready') {
    return {
      healthy: false,
      status: 'DOWN',
      error: `Redis connection state: ${client.status}`
    };
  }

  const start = process.hrtime.bigint();
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis health check timeout')), timeoutMs)
    );

    const pingPromise = client.ping();
    await Promise.race([pingPromise, timeoutPromise]);

    const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
    return {
      healthy: true,
      status: 'UP',
      latencyMs: Number(latencyMs.toFixed(2))
    };
  } catch (err) {
    return {
      healthy: false,
      status: 'DOWN',
      error: err instanceof Error ? err.message : 'Redis ping failed'
    };
  }
}

/**
 * Closes the Redis connection during graceful shutdown.
 * @returns {Promise<void>}
 */
export async function closeRedis() {
  if (redisInstance) {
    logger.info('Closing Redis client connection...');
    try {
      if (redisInstance.status === 'ready' && typeof redisInstance.quit === 'function') {
        await Promise.race([
          redisInstance.quit(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Redis quit timeout')), 1000))
        ]);
      } else if (typeof redisInstance.disconnect === 'function') {
        redisInstance.disconnect(false);
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Error during clean Redis quit, forcing disconnect');
      if (typeof redisInstance.disconnect === 'function') {
        redisInstance.disconnect(false);
      }
    } finally {
      redisInstance = null;
      logger.info('Redis client connection closed');
    }
  }
}
