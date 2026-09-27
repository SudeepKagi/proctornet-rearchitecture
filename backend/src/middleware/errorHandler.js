/**
 * @file errorHandler.js
 * @description Centralized Express error-handling middleware.
 * Intercepts schema validation errors (Zod), database errors (PostgreSQL),
 * domain errors, and authorization errors, returning standardized user-friendly JSON.
 */

import { AppError } from '../utils/errors.js';
import { DomainError } from '../domain/shared/domainErrors.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Parses Zod validation errors into a single clean user-facing sentence and structured details array.
 * @param {object} err - Zod error object
 * @returns {{ message: string, details: Array<object> }}
 */
function parseZodErrors(err) {
  const issues = err.issues || err.errors || [];
  if (!Array.isArray(issues) || issues.length === 0) {
    return {
      message: 'Invalid request data. Please check your submission.',
      details: []
    };
  }

  const fieldSummaries = issues.map((issue) => {
    const fieldPath = issue.path?.length > 0 ? issue.path.join('.') : null;
    if (issue.code === 'unrecognized_keys') {
      const keys = issue.keys ? issue.keys.join(', ') : 'unknown';
      return `Unexpected parameter: ${keys}`;
    }
    if (fieldPath) {
      return `${fieldPath}: ${issue.message}`;
    }
    return issue.message;
  });

  const primaryMessage = fieldSummaries.length > 0
    ? fieldSummaries[0]
    : 'Invalid input data. Please check the information provided.';

  return {
    message: primaryMessage,
    details: issues.map((i) => ({
      code: i.code,
      path: i.path,
      message: i.message
    }))
  };
}

/**
 * Maps PostgreSQL error codes to friendly messages and status codes.
 * @param {object} err - Error with Postgres code
 * @returns {{ statusCode: number, errorCode: string, message: string } | null}
 */
function parsePostgresErrors(err) {
  switch (err.code) {
    case '23505': // unique_violation
      return {
        statusCode: 409,
        errorCode: 'DUPLICATE_RESOURCE',
        message: 'A record with this identifier or unique value already exists.'
      };
    case '23503': // foreign_key_violation
      return {
        statusCode: 400,
        errorCode: 'FOREIGN_KEY_VIOLATION',
        message: 'Referenced entity does not exist or has been removed.'
      };
    case '22P02': // invalid_text_representation (UUID syntax, invalid enum)
      return {
        statusCode: 400,
        errorCode: 'INVALID_INPUT_SYNTAX',
        message: 'Invalid identifier or data format provided.'
      };
    case '40001': // serialization_failure
    case '40P01': // deadlock_detected
      return {
        statusCode: 409,
        errorCode: 'TRANSACTION_CONFLICT',
        message: 'A database concurrency conflict occurred. Please retry your request.'
      };
    default:
      return null;
  }
}

/**
 * Centralized error-handling middleware.
 * Formats operational, domain, validation, and database errors into a consistent API response.
 */
export function errorHandler(err, req, res, _next) {
  const requestId = req.id || req.requestId || 'unknown';

  let statusCode = err.statusCode || (typeof err.status === 'number' ? err.status : 500);
  let errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'An unexpected error occurred';
  let details = Array.isArray(err.details) ? err.details : (err.details ? [err.details] : []);

  // 1. Zod Schema Validation Errors
  if (err.name === 'ZodError' || Array.isArray(err.errors) || Array.isArray(err.issues)) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    const parsed = parseZodErrors(err);
    message = parsed.message;
    details = parsed.details;
  }

  // 2. PostgreSQL Database Errors
  if (err.code && typeof err.code === 'string' && (err.code.length === 5 || err.routine)) {
    const pgParsed = parsePostgresErrors(err);
    if (pgParsed) {
      statusCode = pgParsed.statusCode;
      errorCode = pgParsed.errorCode;
      message = pgParsed.message;
    }
  }

  // 3. Domain Rules & Invariants
  if (err instanceof DomainError || err.name === 'DomainInvariantError' || err.name === 'InvalidStateTransitionError') {
    statusCode = 400;
    errorCode = err.code || 'DOMAIN_RULE_VIOLATION';
    message = err.message;
  }

  // 4. Multer File Upload Errors
  if (err.name === 'MulterError' || (typeof err.code === 'string' && err.code.startsWith('LIMIT_'))) {
    statusCode = 400;
    errorCode = 'FILE_UPLOAD_ERROR';
    message = `File upload failed: ${err.message}`;
  }

  // 5. HTTP Status Canonical Code Mapping
  if (statusCode === 401 && (!errorCode || errorCode === 'INTERNAL_SERVER_ERROR')) {
    errorCode = 'UNAUTHORIZED';
    if (!message || message.toLowerCase().includes('token') || message.toLowerCase().includes('jwt')) {
      message = 'Authentication required. Please sign in to continue.';
    }
  } else if (statusCode === 403 && (!errorCode || errorCode === 'INTERNAL_SERVER_ERROR')) {
    errorCode = 'FORBIDDEN';
  } else if (statusCode === 404 && (!errorCode || errorCode === 'INTERNAL_SERVER_ERROR')) {
    errorCode = 'NOT_FOUND';
  } else if (statusCode === 422 && (!errorCode || errorCode === 'INTERNAL_SERVER_ERROR')) {
    errorCode = 'UNPROCESSABLE_ENTITY';
  }

  // 6. Prevent raw stringified JSON arrays/objects from leaking as error messages
  if (typeof message === 'string' && (message.trim().startsWith('[') || message.trim().startsWith('{'))) {
    try {
      const parsedObj = JSON.parse(message);
      if (Array.isArray(parsedObj) && parsedObj.length > 0 && parsedObj[0].message) {
        message = parsedObj[0].message;
      } else {
        message = 'Invalid request data. Please check your submission.';
      }
    } catch {
      // not valid JSON string, leave intact
    }
  }

  // 7. Mask unhandled internal 500 errors in production
  const isOperational = (err instanceof AppError && err.isOperational) || statusCode < 500;
  if (config.NODE_ENV === 'production' && statusCode >= 500 && !isOperational) {
    message = 'An unexpected server error occurred. Please try again.';
  }

  // 8. Structured Logging
  const logMethod = statusCode >= 500 ? 'error' : 'warn';
  const logPayload = {
    requestId,
    statusCode,
    errorCode,
    message,
    stack: statusCode >= 500 ? err.stack : undefined,
    url: req.originalUrl || req.url,
    method: req.method
  };

  if (req.log && typeof req.log[logMethod] === 'function') {
    req.log[logMethod](logPayload, 'Handled application error');
  } else {
    logger[logMethod](logPayload, 'Handled application error');
  }

  // 9. Standardized API Response Body
  const responseBody = {
    success: false,
    message,
    code: errorCode,
    details,
    requestId,
    // Nested error object for backward compatibility with clients expecting data.error
    error: {
      code: errorCode,
      message,
      details,
      requestId
    }
  };

  // Stack trace only in local development mode for 5xx errors
  if (config.NODE_ENV === 'development' && statusCode >= 500 && err.stack) {
    responseBody.stack = err.stack;
    responseBody.error.stack = err.stack;
  }

  res.status(statusCode).json(responseBody);
}

export default errorHandler;
