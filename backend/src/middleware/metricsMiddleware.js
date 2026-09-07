/**
 * @file metricsMiddleware.js
 * @description Express middleware to measure HTTP request duration and record request counts.
 * Uses strictly normalized route templates to avoid label cardinality explosion.
 */

import { httpRequestDuration, httpRequestsTotal } from '../infrastructure/metrics/registry.js';
import { config } from '../config/env.js';

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Normalizes an Express request route to a low-cardinality template.
 * Prefers req.baseUrl + req.route.path if available; otherwise falls back to
 * sanitizing UUIDs and numeric IDs from req.originalUrl.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
export function normalizeRoute(req) {
  if (typeof req === 'string') {
    const rawUrl = req.split('?')[0];
    return (
      rawUrl
        .replace(UUID_REGEX, ':id')
        .replace(/\/\d+(?=\/|$)/g, '/:id') || '/'
    );
  }

  if (req?.route?.path) {
    const basePath = req.baseUrl || '';
    const routePath = typeof req.route.path === 'string' ? req.route.path : req.route.path.toString();
    return `${basePath}${routePath}` || '/';
  }

  // Fallback for unrouted requests (e.g. 404s) or routes before matching
  const rawUrl = (req?.originalUrl || req?.url || '/').split('?')[0];
  return (
    rawUrl
      .replace(UUID_REGEX, ':id')
      .replace(/\/\d+(?=\/|$)/g, '/:id') || '/'
  );
}

/**
 * Express middleware to record Prometheus HTTP metrics on response completion.
 */
export function metricsMiddleware(req, res, next) {
  if (!config.METRICS_ENABLED) {
    return next();
  }

  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    try {
      const endTime = process.hrtime.bigint();
      const durationSeconds = Number(endTime - startTime) / 1e9;
      const route = normalizeRoute(req);
      const method = req.method;
      const statusCode = String(res.statusCode);

      const labels = {
        method,
        route,
        status_code: statusCode
      };

      httpRequestDuration.observe(labels, durationSeconds);
      httpRequestsTotal.inc(labels);
    } catch {
      // Metric recording failures must never affect application traffic
    }
  });

  next();
}
