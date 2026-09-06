import pino from 'pino';
import { config } from '../config/env.js';

const sensitiveKeys = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'set-cookie',
  'apiKey',
  'secret',
  'req.headers.authorization',
  'req.headers.cookie'
];

/**
 * Structured logger configured with sensitive field redaction and standard timestamp format.
 */
export const logger = pino({
  level: config.LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: sensitiveKeys,
    censor: '[REDACTED]'
  },
  base: {
    service: 'proctornet-backend',
    env: config.NODE_ENV
  }
});

/**
 * Creates a child logger with bound contextual metadata (e.g. requestId).
 * @param {Record<string, any>} context
 * @returns {pino.Logger}
 */
export function createChildLogger(context) {
  return logger.child(context);
}
