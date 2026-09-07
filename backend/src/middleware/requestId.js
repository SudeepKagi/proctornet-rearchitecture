import crypto from 'node:crypto';
import { createChildLogger } from '../utils/logger.js';
import { getOrCreateTraceContext } from '../utils/traceContext.js';

const SAFE_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Express middleware to assign and propagate correlation / request IDs and W3C trace context.
 * Accepts incoming traceparent, X-Request-ID, or X-Correlation-ID headers.
 * Binds { requestId, traceId, spanId } to req.log and sets response headers.
 */
export function requestIdMiddleware(req, res, next) {
  // 1. Process W3C Trace Context
  const traceContext = getOrCreateTraceContext(req.headers['traceparent']);
  req.traceId = traceContext.traceId;
  req.spanId = traceContext.spanId;
  req.traceparent = traceContext.traceparent;

  // 2. Process X-Request-ID / X-Correlation-ID
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

  // 3. Set response correlation headers
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('traceparent', traceContext.traceparent);

  // 4. Attach context-aware child logger to the request object
  req.log = createChildLogger({
    requestId,
    traceId: traceContext.traceId,
    spanId: traceContext.spanId
  });

  next();
}
