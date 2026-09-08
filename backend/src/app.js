import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { ForbiddenError } from './utils/errors.js';
import { securityCorsRejectionsTotal } from './infrastructure/metrics/registry.js';
import { sanitizeInputMiddleware } from './middleware/sanitizeInput.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { metricsMiddleware } from './middleware/metricsMiddleware.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rootRouter } from './routes/index.js';

/**
 * Creates and configures the Express application instance with hardened security.
 * @returns {express.Application}
 */
export function createApp() {
  const app = express();

  // 1. Fine-grained Helmet security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        reportOnly: config.CSP_REPORT_ONLY,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: config.NODE_ENV === 'production' ? ["'self'"] : ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          mediaSrc: ["'self'", 'blob:', 'mediastream:'],
          connectSrc: [
            "'self'",
            'ws:',
            'wss:',
            config.AWS_S3_ENDPOINT || `https://${config.AWS_S3_BUCKET}.s3.${config.AWS_REGION}.amazonaws.com`,
            ...(config.NODE_ENV !== 'production'
              ? ['http://localhost:4566', 'http://127.0.0.1:4566', 'http://localhost:3000', 'http://localhost:5173']
              : [])
          ],
          workerSrc: ["'self'", 'blob:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"]
        }
      },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      crossOriginEmbedderPolicy: { policy: 'credentialless' },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      frameguard: { action: 'deny' },
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    })
  );

  // 2. Strict dynamic CORS whitelist validator
  app.use(
    cors({
      origin: (origin, callback) => {
        // Permit requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) {
          return callback(null, true);
        }
        if (config.CORS_ALLOWED_ORIGINS?.includes(origin) || origin === config.CORS_ORIGIN) {
          return callback(null, true);
        }
        securityCorsRejectionsTotal.inc({ origin_type: 'unauthorized' });
        return callback(new ForbiddenError(`Origin '${origin}' not allowed by CORS policy`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Payload-Signature', 'X-Client-Timestamp'],
      exposedHeaders: ['X-Request-ID', 'Content-Range', 'Retry-After'],
      maxAge: 86400
    })
  );

  // 3. Permissions-Policy header
  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()'
    );
    next();
  });

  // 4. Cookie parsing for secure refresh token cookies
  app.use(cookieParser());

  // 5. Body parsing with safe size bounds
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 6. Non-destructive structural input sanitization (strips prototype pollution and null bytes)
  app.use(sanitizeInputMiddleware);

  // 7. Request correlation tracking, structured request logging, and Prometheus metrics
  app.use(requestIdMiddleware);
  app.use(requestLogger);
  app.use(metricsMiddleware);

  // 8. Mount application routes
  app.use(rootRouter);

  // 9. 404 handler for undefined endpoints
  app.use(notFoundHandler);

  // 10. Centralized error handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
