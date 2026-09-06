import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rootRouter } from './routes/index.js';

/**
 * Creates and configures the Express application instance.
 * @returns {express.Application}
 */
export function createApp() {
  const app = express();

  // Basic security headers
  app.use(helmet());

  // Cross-Origin Resource Sharing
  app.use(
    cors({
      origin: config.CORS_ORIGIN,
      credentials: true
    })
  );

  // Cookie parsing for secure refresh token cookies
  app.use(cookieParser());

  // Body parsing with safe size bounds
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Request correlation tracking and structured request logging
  app.use(requestIdMiddleware);
  app.use(requestLogger);

  // Mount application routes
  app.use(rootRouter);

  // 404 handler for undefined endpoints
  app.use(notFoundHandler);

  // Centralized error handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
