import { Router } from 'express';
import { checkDatabaseHealth } from '../infrastructure/postgres/pool.js';
import { checkRedisHealth } from '../infrastructure/redis/client.js';
import { checkRabbitMQHealth } from '../infrastructure/rabbitmq/client.js';

export const healthRouter = Router();

/**
 * Liveness Probe: Checks whether the Node process is running.
 * GET /health
 */
healthRouter.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    service: 'proctornet-backend'
  });
});

/**
 * Readiness Probe: Checks whether critical infrastructure dependencies (PostgreSQL) are reachable.
 * Redis and RabbitMQ health are non-fatal: if Redis or RabbitMQ is down, returns 200 READY with DOWN status reported.
 * GET /ready
 */
healthRouter.get('/ready', async (_req, res) => {
  const [dbHealth, redisHealth, rabbitmqHealth] = await Promise.all([
    checkDatabaseHealth(3000),
    checkRedisHealth(2000),
    checkRabbitMQHealth(2000)
  ]);

  // PostgreSQL health is strictly mandatory for readiness
  const isReady = dbHealth.healthy;
  const statusCode = isReady ? 200 : 503;

  const checks = {
    database: dbHealth.healthy
      ? { status: 'UP', latencyMs: dbHealth.latencyMs }
      : { status: 'DOWN', error: dbHealth.error }
  };

  if (redisHealth.status === 'DISABLED') {
    checks.redis = { status: 'DISABLED', error: redisHealth.error };
  } else if (redisHealth.healthy) {
    checks.redis = { status: 'UP', latencyMs: redisHealth.latencyMs };
  } else {
    checks.redis = { status: 'DOWN', error: redisHealth.error };
  }

  if (rabbitmqHealth.status === 'DISABLED') {
    checks.rabbitmq = { status: 'DISABLED', error: rabbitmqHealth.error };
  } else if (rabbitmqHealth.healthy) {
    checks.rabbitmq = { status: 'UP', latencyMs: rabbitmqHealth.latencyMs };
  } else {
    checks.rabbitmq = { status: 'DOWN', error: rabbitmqHealth.error };
  }

  res.status(statusCode).json({
    status: isReady ? 'READY' : 'NOT_READY',
    timestamp: new Date().toISOString(),
    checks
  });
});
