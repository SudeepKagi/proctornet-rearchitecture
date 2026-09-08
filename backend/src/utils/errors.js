/**
 * Base Application Error class for operational errors.
 */
export class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} statusCode
   * @param {string} code
   * @param {any} [details=null]
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', details = null) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details = null) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', codeOrDetails = 'FORBIDDEN', details = null) {
    if (typeof codeOrDetails === 'string') {
      super(message, 403, codeOrDetails, details);
    } else {
      super(message, 403, 'FORBIDDEN', codeOrDetails);
    }
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource Not Found', codeOrDetails = 'NOT_FOUND', details = null) {
    if (typeof codeOrDetails === 'string') {
      super(message, 404, codeOrDetails, details);
    } else {
      super(message, 404, 'NOT_FOUND', codeOrDetails);
    }
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', codeOrDetails = 'CONFLICT', details = null) {
    if (typeof codeOrDetails === 'string') {
      super(message, 409, codeOrDetails, details);
    } else {
      super(message, 409, 'CONFLICT', codeOrDetails);
    }
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message = 'Unprocessable Entity', details = null) {
    super(message, 422, 'UNPROCESSABLE_ENTITY', details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too Many Requests', details = null) {
    super(message, 429, 'TOO_MANY_REQUESTS', details);
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Internal Server Error', details = null) {
    super(message, 500, 'INTERNAL_SERVER_ERROR', details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service Unavailable', details = null) {
    super(message, 503, 'SERVICE_UNAVAILABLE', details);
  }
}
