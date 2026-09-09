import pino from 'pino';
import { config } from '../config/env.js';

import { Writable } from 'node:stream';
import { logBuffer } from '../modules/developer/logBuffer.js';

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
  'req.headers.cookie',
  'selected_option_id',
  'selectedOptionId',
  'answer_text',
  'answerText',
  'numeric_value',
  'numericValue',
  'answers'
];

// Circular buffer stream capturing structured logs for Developer Operations
const bufferStream = new Writable({
  write(chunk, _encoding, callback) {
    try {
      const parsed = JSON.parse(chunk.toString());
      logBuffer.addEntry(parsed);
    } catch {
      // Safe non-blocking ignore for unparseable chunks
    }
    callback();
  }
});

// Configure destination streams: standard output + developer circular buffer
const streams = [
  { stream: process.stdout },
  { stream: bufferStream }
];

/**
 * Structured logger configured with sensitive field redaction and standard timestamp format.
 */
export const logger = pino(
  {
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
  },
  pino.multistream(streams)
);

/**
 * Creates a child logger with bound contextual metadata (e.g. requestId).
 * @param {Record<string, any>} context
 * @returns {pino.Logger}
 */
export function createChildLogger(context) {
  return logger.child(context);
}
