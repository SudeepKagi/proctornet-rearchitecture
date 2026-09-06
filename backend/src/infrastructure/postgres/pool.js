import pg from 'pg';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const { Pool } = pg;

let poolInstance = null;

/**
 * Creates or retrieves the singleton PostgreSQL connection pool.
 * @returns {pg.Pool}
 */
export function getPool() {
  if (!poolInstance) {
    const poolConfig = config.DATABASE_URL
      ? {
        connectionString: config.DATABASE_URL,
        min: config.DB_POOL_MIN,
        max: config.DB_POOL_MAX,
        connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT_MS,
        idleTimeoutMillis: config.DB_IDLE_TIMEOUT_MS
      }
      : {
        host: config.DB_HOST,
        port: config.DB_PORT,
        database: config.DB_NAME,
        user: config.DB_USER,
        password: config.DB_PASSWORD,
        min: config.DB_POOL_MIN,
        max: config.DB_POOL_MAX,
        connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT_MS,
        idleTimeoutMillis: config.DB_IDLE_TIMEOUT_MS
      };

    poolInstance = new Pool(poolConfig);

    poolInstance.on('error', (err) => {
      logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
    });
  }

  return poolInstance;
}

/**
 * Executes a parameterized SQL query on the PostgreSQL pool.
 * @param {string} text - SQL query text
 * @param {any[]} [params] - Query parameters
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params) {
  const start = process.hrtime.bigint();
  const pool = getPool();
  try {
    const res = await pool.query(text, params);
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    logger.debug(
      { query: text, rows: res.rowCount, durationMs: Number(durationMs.toFixed(2)) },
      'Executed database query'
    );
    return res;
  } catch (err) {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    logger.error(
      { query: text, durationMs: Number(durationMs.toFixed(2)), err },
      'Database query failed'
    );
    throw err;
  }
}

/**
 * Probes the database to verify connectivity for readiness checks.
 * @param {number} [timeoutMs=3000]
 * @returns {Promise<{ healthy: boolean, latencyMs?: number, error?: string }>}
 */
export async function checkDatabaseHealth(timeoutMs = 3000) {
  const start = process.hrtime.bigint();
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Database health check timeout')), timeoutMs)
    );

    const queryPromise = query('SELECT 1 AS healthy');
    await Promise.race([queryPromise, timeoutPromise]);

    const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
    return {
      healthy: true,
      latencyMs: Number(latencyMs.toFixed(2))
    };
  } catch (err) {
    return {
      healthy: false,
      error: err instanceof Error ? err.message : 'Database check failed'
    };
  }
}

/**
 * Closes all pool connections during graceful shutdown.
 * @returns {Promise<void>}
 */
export async function closePool() {
  if (poolInstance) {
    logger.info('Closing PostgreSQL connection pool...');
    await poolInstance.end();
    poolInstance = null;
    logger.info('PostgreSQL connection pool closed');
  }
}
