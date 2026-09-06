import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';

export const rootRouter = Router();

// Liveness & Readiness checks
rootRouter.use(healthRouter);

// Versioned API namespace (/api/v1)
const v1Router = Router();

v1Router.get('/', (_req, res) => {
  res.status(200).json({
    name: 'ProctorNet API',
    version: 'v1',
    status: 'ACTIVE'
  });
});

// Authentication & Session endpoints
v1Router.use('/auth', authRouter);

// Mount /api/v1
rootRouter.use('/api/v1', v1Router);
