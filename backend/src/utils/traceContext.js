/**
 * @file traceContext.js
 * @description Pure utility for W3C Traceparent parsing, validation, and child span generation.
 * Conforms to W3C Trace Context (Level 1) specification: version '00', 16-byte traceId, 8-byte spanId.
 */

import crypto from 'node:crypto';

const TRACE_ID_REGEX = /^[0-9a-f]{32}$/i;
const SPAN_ID_REGEX = /^[0-9a-f]{16}$/i;
const TRACEPARENT_REGEX = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;
const ALL_ZEROS_TRACE = '00000000000000000000000000000000';
const ALL_ZEROS_SPAN = '0000000000000000';

/**
 * Checks if a string is a valid 32-hex character traceId and non-zero.
 * @param {string} traceId
 * @returns {boolean}
 */
export function isValidTraceId(traceId) {
  return typeof traceId === 'string' && TRACE_ID_REGEX.test(traceId) && traceId !== ALL_ZEROS_TRACE;
}

/**
 * Checks if a string is a valid 16-hex character spanId and non-zero.
 * @param {string} spanId
 * @returns {boolean}
 */
export function isValidSpanId(spanId) {
  return typeof spanId === 'string' && SPAN_ID_REGEX.test(spanId) && spanId !== ALL_ZEROS_SPAN;
}

/**
 * Generates a random 16-byte hex trace ID (32 characters).
 * @returns {string}
 */
export function generateTraceId() {
  let id = crypto.randomBytes(16).toString('hex');
  while (id === ALL_ZEROS_TRACE) {
    id = crypto.randomBytes(16).toString('hex');
  }
  return id;
}

/**
 * Generates a random 8-byte hex span ID (16 characters).
 * @returns {string}
 */
export function generateSpanId() {
  let id = crypto.randomBytes(8).toString('hex');
  while (id === ALL_ZEROS_SPAN) {
    id = crypto.randomBytes(8).toString('hex');
  }
  return id;
}

/**
 * Generates a random 8-byte hex child span ID (alias to generateSpanId).
 * @returns {string}
 */
export function createChildSpanId() {
  return generateSpanId();
}

/**
 * Formats trace parameters into a standard W3C traceparent header string.
 * @param {string} traceId - 32-hex character trace ID
 * @param {string} spanId - 16-hex character span ID
 * @param {string} [flags='01'] - 2-hex character trace flags
 * @returns {string}
 */
export function formatTraceparent(traceId, spanId, flags = '01') {
  return `00-${traceId}-${spanId}-${flags}`;
}

/**
 * Generates a fresh W3C traceparent header string.
 * @param {string} [traceId]
 * @param {string} [spanId]
 * @param {string} [flags='01']
 * @returns {string}
 */
export function generateTraceparent(traceId = generateTraceId(), spanId = generateSpanId(), flags = '01') {
  return formatTraceparent(traceId, spanId, flags);
}

/**
 * Parses and validates an incoming W3C traceparent header.
 * Returns null if invalid or missing, or a parsed context object if valid.
 *
 * @param {string|null|undefined} header - Raw traceparent header string
 * @returns {{
 *   version: string,
 *   traceId: string,
 *   parentId: string,
 *   spanId: string,
 *   traceFlags: string,
 *   flags: string,
 *   traceparent: string,
 *   isValid: boolean
 * } | null}
 */
export function parseTraceparent(header) {
  if (typeof header !== 'string') {
    return null;
  }

  const trimmed = header.trim();
  const match = TRACEPARENT_REGEX.exec(trimmed);
  if (!match) {
    return null;
  }

  const traceId = match[1].toLowerCase();
  const parentId = match[2].toLowerCase();
  const flags = match[3].toLowerCase();

  if (traceId === ALL_ZEROS_TRACE || parentId === ALL_ZEROS_SPAN) {
    return null;
  }

  const spanId = generateSpanId();
  return {
    version: '00',
    traceId,
    parentId,
    spanId,
    traceFlags: flags,
    flags,
    traceparent: formatTraceparent(traceId, spanId, flags),
    isValid: true
  };
}

/**
 * Extracts incoming trace context or generates a fallback fresh context.
 *
 * @param {string|null|undefined} header
 * @returns {{
 *   version: string,
 *   traceId: string,
 *   parentId: string|null,
 *   spanId: string,
 *   traceFlags: string,
 *   flags: string,
 *   traceparent: string,
 *   isValid: boolean
 * }}
 */
export function getOrCreateTraceContext(header) {
  const parsed = parseTraceparent(header);
  if (parsed) {
    return parsed;
  }

  const traceId = generateTraceId();
  const spanId = generateSpanId();
  const flags = '01';
  return {
    version: '00',
    traceId,
    parentId: null,
    spanId,
    traceFlags: flags,
    flags,
    traceparent: formatTraceparent(traceId, spanId, flags),
    isValid: false
  };
}
