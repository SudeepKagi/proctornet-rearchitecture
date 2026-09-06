import { Router } from 'express';
import { checkDatabaseHealth } from '../infrastructure/postgres/pool.js';

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
 * GET /ready
 */
healthRouter.get('/ready', async (_req, res) => {
  const dbHealth = await checkDatabaseHealth(3000);

  const isReady = dbHealth.healthy;
  const statusCode = isReady ? 200 : 503;

  res.status(statusCode).json({
    status: isReady ? 'READY' : 'NOT_READY',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbHealth.healthy
        ? { status: 'UP', latencyMs: dbHealth.latencyMs }
        : { status: 'DOWN', error: dbHealth.error }
    }
  });
});
