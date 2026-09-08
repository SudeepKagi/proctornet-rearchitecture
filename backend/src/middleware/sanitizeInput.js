/**
 * @file sanitizeInput.js
 * @description Non-destructive structural input sanitizer middleware.
 * Prevents Prototype Pollution and null-byte injection attacks without altering
 * legitimate candidate answers, programming code, math notation, or Markdown.
 */

import { securityInputSanitizationsTotal } from '../infrastructure/metrics/registry.js';

const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

/**
 * Recursively cleans structural hazards from an object or array.
 * Rejects prototype pollution keys and strips null bytes.
 * Does NOT strip HTML tags, script tags, math symbols, or quotes in legitimate answer payloads.
 *
 * @param {any} target - The object or value to sanitize
 * @param {boolean} [stripControlChars=false] - Whether to strip non-printable control characters
 * @returns {any} Sanitized target
 */
export function cleanStructuralHazards(target, stripControlChars = false) {
  if (target === null || target === undefined || typeof target !== 'object') {
    if (typeof target === 'string') {
      let cleaned = target;
      if (cleaned.includes('\0')) {
        cleaned = cleaned.replace(/\0/g, '');
        securityInputSanitizationsTotal.inc({ action: 'null_byte_stripped' });
      }
      if (stripControlChars) {
        cleaned = cleaned.replace(CONTROL_CHARS_REGEX, '');
      }
      return cleaned;
    }
    return target;
  }

  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; i++) {
      target[i] = cleanStructuralHazards(target[i], stripControlChars);
    }
    return target;
  }

  // Target is a plain object
  const keys = Object.keys(target);
  for (const key of keys) {
    if (PROTOTYPE_POLLUTION_KEYS.has(key)) {
      delete target[key];
      securityInputSanitizationsTotal.inc({ action: 'proto_pollution_stripped' });
      continue;
    }

    target[key] = cleanStructuralHazards(target[key], stripControlChars);
  }

  return target;
}

export const sanitizeObject = cleanStructuralHazards;

/**
 * Express middleware executing structural sanitization before route handlers.
 * Deterministic execution order: express.json() -> sanitizeInput -> Zod validation.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} _res
 * @param {import('express').NextFunction} next
 */
export function sanitizeInputMiddleware(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    cleanStructuralHazards(req.body, false);
  }

  if (req.query && typeof req.query === 'object') {
    cleanStructuralHazards(req.query, true);
  }

  next();
}
