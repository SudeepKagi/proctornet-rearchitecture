import crypto from 'node:crypto';
import { createChildLogger } from '../utils/logger.js';

const SAFE_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Express middleware to assign and propagate correlation / request IDs.
 * Accepts incoming X-Request-ID or X-Correlation-ID header if valid, otherwise generates a UUIDv4.
 */
export function requestIdMiddleware(req, res, next) {
  const incomingId =
    req.headers['x-request-id'] ||
    req.headers['x-correlation-id'];

  let requestId;
  if (typeof incomingId === 'string' && SAFE_REQUEST_ID_REGEX.test(incomingId)) {
    requestId = incomingId;
  } else {
    requestId = crypto.randomUUID();
  }

  req.id = requestId;
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  // Attach context-aware child logger to the request object
  req.log = createChildLogger({ requestId });

  next();
}
