import { NotFoundError } from '../utils/errors.js';

/**
 * Catches any unhandled routes and forwards a NotFoundError to the centralized error handler.
 */
export function notFoundHandler(req, res, next) {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl || req.url} not found`));
}
