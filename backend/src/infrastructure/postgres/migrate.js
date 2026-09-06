import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../../../migrations');

/**
 * Resolves the active database connection string.
 * @returns {string}
 */
export function getDatabaseUrl() {
  if (config.DATABASE_URL) {
    return config.DATABASE_URL;
  }
  return `postgresql://${config.DB_USER}:${config.DB_PASSWORD}@${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME}`;
}

/**
 * Runs migrations programmatically.
 * @param {'up' | 'down' | 'redo'} direction
 * @param {number} [count]
 * @returns {Promise<any>}
 */
export async function runMigrations(direction = 'up', count = Infinity) {
  const databaseUrl = getDatabaseUrl();
  const options = {
    databaseUrl,
    dir: migrationsDir,
    direction,
    count,
    migrationsTable: 'pgmigrations',
    schema: 'public',
    createSchema: true,
    singleTransaction: true,
    checkOrder: true,
    verbose: config.LOG_LEVEL !== 'silent',
    log: (msg) => logger.info({ migrationLog: msg }, 'Migration runner output')
  };

  logger.info({ direction, migrationsDir }, 'Starting database migrations...');
  const results = await runner(options);
  logger.info({ count: results?.length || 0, direction }, 'Database migrations completed');
  return results;
}

// CLI invocation handling
if (process.argv[1] === __filename) {
  const command = process.argv[2] || 'up';
  const countArg = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;

  runMigrations(command, countArg)
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}
