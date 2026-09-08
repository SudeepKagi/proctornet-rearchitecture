/**
 * @file antiTamper.js
 * @description Core cryptographic utilities for request signing, attempt key derivation,
 * and constant-time signature verification.
 */

import crypto from 'node:crypto';

/**
 * Derives a deterministic attempt signing key scoped to candidate, attempt, and start time.
 *
 * @param {string} rootSecret - Server-only ANTI_TAMPER_SECRET
 * @param {string} attemptId - UUID of the attempt
 * @param {string} studentId - UUID of the candidate
 * @param {string|Date|number} startedAt - Attempt started_at timestamp
 * @returns {string} Hex-encoded HMAC-SHA256 signing key
 */
export function deriveAttemptSigningKey(rootSecret, attemptId, studentId, startedAt) {
  if (!rootSecret || !attemptId || !studentId || !startedAt) {
    throw new Error('All parameters (rootSecret, attemptId, studentId, startedAt) are required to derive signing key');
  }

  const startedAtMs = new Date(startedAt).getTime();
  const message = `${attemptId}:${studentId}:${startedAtMs}`;

  return crypto.createHmac('sha256', rootSecret).update(message).digest('hex');
}

/**
 * Canonicalizes request body to a deterministic string.
 *
 * @param {any} body
 * @returns {string}
 */
export function canonicalizeBody(body) {
  if (body === null || body === undefined) {
    return '';
  }
  if (typeof body === 'string') {
    return body;
  }
  if (typeof body === 'object') {
    // If empty object, treat as empty body
    if (!Array.isArray(body) && Object.keys(body).length === 0) {
      return '';
    }
    return JSON.stringify(body);
  }
  return String(body);
}

/**
 * Computes SHA-256 hash of the canonicalized request body.
 *
 * @param {any} body
 * @returns {string} Hex-encoded SHA-256 hash
 */
export function computeBodySha256(body) {
  const canonical = canonicalizeBody(body);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Computes the HMAC-SHA256 payload signature for a canonical request message.
 * Canonical string format: `${timestamp}.${nonce}.${method}.${path}.${bodySha256}`
 *
 * @param {string} key - Derived attempt signing key
 * @param {number|string} timestamp - Client Unix timestamp in milliseconds
 * @param {string} nonce - Random UUID or unique request nonce
 * @param {string} method - HTTP method (GET, PUT, POST, DELETE)
 * @param {string} path - URL pathname (e.g. /api/v1/attempts/.../answers/...)
 * @param {any} body - Request payload body
 * @returns {string} Hex-encoded HMAC-SHA256 signature
 */
export function computePayloadSignature(key, timestamp, nonce, method, path, body) {
  const bodySha256 = computeBodySha256(body);
  const normalizedMethod = String(method).toUpperCase();
  const normalizedPath = String(path).split('?')[0]; // Strip query string
  const stringToSign = `${timestamp}.${nonce}.${normalizedMethod}.${normalizedPath}.${bodySha256}`;

  return crypto.createHmac('sha256', key).update(stringToSign, 'utf8').digest('hex');
}

/**
 * Parses the X-Payload-Signature header format:
 * `t=<timestamp>,nonce=<nonce>,v1=<signatureHex>`
 *
 * @param {string} headerValue
 * @returns {{ timestamp: number, nonce: string, signature: string } | null}
 */
export function parseSignatureHeader(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') {
    return null;
  }

  const parts = headerValue.split(',').map((p) => p.trim());
  let timestamp = null;
  let nonce = null;
  let signature = null;

  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;

    const k = part.slice(0, eqIdx).trim();
    const v = part.slice(eqIdx + 1).trim();

    if (k === 't') {
      const parsed = Number(v);
      if (!Number.isNaN(parsed) && parsed > 0) {
        timestamp = parsed;
      }
    } else if (k === 'nonce') {
      if (v.length >= 8 && v.length <= 128) {
        nonce = v;
      }
    } else if (k === 'v1') {
      if (/^[0-9a-fA-F]{64}$/.test(v)) {
        signature = v.toLowerCase();
      }
    }
  }

  if (!timestamp || !nonce || !signature) {
    return null;
  }

  return { timestamp, nonce, signature };
}

/**
 * Constant-time comparison of two hex signatures to prevent timing side-channel attacks.
 *
 * @param {string} actualSignature
 * @param {string} expectedSignature
 * @returns {boolean}
 */
export function verifySignatureConstantTime(actualSignature, expectedSignature) {
  if (!actualSignature || !expectedSignature) {
    return false;
  }

  const actualBuf = Buffer.from(actualSignature, 'hex');
  const expectedBuf = Buffer.from(expectedSignature, 'hex');

  if (actualBuf.length !== expectedBuf.length || actualBuf.length !== 32) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}
