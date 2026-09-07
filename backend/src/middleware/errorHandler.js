import { AppError } from '../utils/errors.js';
import { DomainError } from '../domain/shared/domainErrors.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Centralized error-handling middleware.
 * Formats operational, domain, and unexpected errors into a consistent API response.
 */
export function errorHandler(err, req, res, _next) {
  const requestId = req.id || req.requestId || 'unknown';
  const isZodError = err.name === 'ZodError' || Array.isArray(err.errors);
  const isDomainError = err instanceof DomainError || err.name === 'DomainInvariantError' || err.name === 'InvalidStateTransitionError';
  const isOperational = (err instanceof AppError && err.isOperational) || isDomainError || isZodError;
  const statusCode = err.statusCode || (err.status && typeof err.status === 'number' ? err.status : (isDomainError || isZodError) ? 400 : 500);
  const errorCode = err.code || (statusCode === 404 ? 'NOT_FOUND' : statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');

  // Log server errors (5xx) with error level, client errors (4xx) with warn level
  const logMethod = statusCode >= 500 ? 'error' : 'warn';
  const logPayload = {
    requestId,
    statusCode,
    errorCode,
    message: err.message,
    stack: statusCode >= 500 ? err.stack : undefined,
    url: req.originalUrl || req.url,
    method: req.method
  };

  if (req.log && typeof req.log[logMethod] === 'function') {
    req.log[logMethod](logPayload, 'Handled application error');
  } else {
    logger[logMethod](logPayload, 'Handled application error');
  }

  // Determine client-facing message
  let clientMessage = err.message || 'An unexpected error occurred';
  if (!isOperational && config.NODE_ENV === 'production' && statusCode >= 500) {
    clientMessage = 'An internal server error occurred';
  }

  const responseBody = {
    success: false,
    error: {
      code: errorCode,
      message: clientMessage,
      details: err.details || null,
      requestId
    }
  };

  // Attach stack trace only in local development for easier debugging
  if (config.NODE_ENV === 'development' && statusCode >= 500 && err.stack) {
    responseBody.error.stack = err.stack;
  }

  res.status(statusCode).json(responseBody);
}
