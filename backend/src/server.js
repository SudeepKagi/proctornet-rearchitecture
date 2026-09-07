import http from 'node:http';
import { app } from './app.js';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import { closePool } from './infrastructure/postgres/pool.js';
import { closeRedis } from './infrastructure/redis/client.js';
import {
  getRabbitMQConnection,
  createConfirmChannel,
  closeRabbitMQ,
  registerReconnectHook
} from './infrastructure/rabbitmq/client.js';
import { assertTopology } from './infrastructure/rabbitmq/topology.js';
import { startOutboxPoller, stopOutboxPoller } from './modules/outbox/outbox.service.js';
import { startEvaluationConsumer, stopEvaluationConsumer } from './modules/evaluation/evaluation.consumer.js';

const server = http.createServer(app);

let isShuttingDown = false;

/**
 * Initiates graceful shutdown of the HTTP server and infrastructure connections.
 * @param {string} signal - The triggering signal (e.g. 'SIGTERM', 'SIGINT')
 */
async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    logger.warn({ signal }, 'Shutdown already in progress, ignoring duplicate signal');
    return;
  }

  isShuttingDown = true;
  logger.info({ signal }, 'Received termination signal, starting graceful shutdown...');

  // Force shutdown if cleanup takes longer than 10 seconds
  const forceShutdownTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out after 10s. Forcing process exit.');
    process.exit(1);
  }, 10000);
  forceShutdownTimer.unref();

  try {
    // 1. Stop accepting new HTTP connections
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          logger.error({ err }, 'Error closing HTTP server');
          return reject(err);
        }
        logger.info('HTTP server stopped accepting new connections');
        resolve();
      });
    });

    // 2. Stop outbox poller
    stopOutboxPoller();

    // 3. Stop evaluation consumer and drain in-flight jobs (up to 5000ms)
    await stopEvaluationConsumer({ maxDrainMs: 5000 });

    // 4. Close RabbitMQ connections and channels
    await closeRabbitMQ();

    // 5. Close Redis client connection
    await closeRedis();

    // 6. Drain and close database connection pool
    await closePool();

    logger.info('Graceful shutdown completed cleanly. Exiting process.');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error occurred during graceful shutdown');
    process.exit(1);
  }
}

// Attach shutdown signal listeners
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Process-level unhandled exception safety
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception detected at process level');
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled promise rejection detected at process level');
  gracefulShutdown('unhandledRejection');
});

// Start listening and initialize background workers
server.listen(config.PORT, async () => {
  logger.info(
    {
      port: config.PORT,
      env: config.NODE_ENV,
      nodeVersion: process.version
    },
    `ProctorNet Backend Server started successfully on port ${config.PORT}`
  );

  // Initialize RabbitMQ infrastructure & consumers if enabled
  if (config.RABBITMQ_ENABLED) {
    startOutboxPoller();
    try {
      const conn = await getRabbitMQConnection();
      if (conn) {
        const channel = await createConfirmChannel(conn);
        await assertTopology(channel);
        await channel.close().catch(() => {});
        await startEvaluationConsumer();
        logger.info('RabbitMQ infrastructure, outbox poller, and evaluation consumer initialized');
      }
    } catch (err) {
      logger.warn(
        { err: err.message },
        'Failed to initialize RabbitMQ during server boot; non-fatal background retry will continue'
      );
      // Register reconnect hook to start consumer once RabbitMQ connects
      registerReconnectHook(async (newConn) => {
        try {
          await startEvaluationConsumer({ connection: newConn });
          logger.info('RabbitMQ connected post-boot; evaluation consumer initialized');
        } catch (consumerErr) {
          logger.error({ err: consumerErr.message }, 'Failed to initialize consumer after post-boot reconnect');
        }
      });
    }
  }
});
