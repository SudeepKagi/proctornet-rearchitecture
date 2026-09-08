/**
 * @file antiTamperClient.js
 * @description Frontend cryptographic utility using Web Crypto API (SubtleCrypto)
 * for HMAC-SHA256 request signing and replay prevention.
 */

/**
 * Converts a hex string to a Uint8Array.
 * @param {string} hex
 * @returns {Uint8Array}
 */
export function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Converts an ArrayBuffer or Uint8Array to a hex string.
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {string}
 */
export function bytesToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Canonicalizes request body to match backend canonicalization.
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
    if (!Array.isArray(body) && Object.keys(body).length === 0) {
      return '';
    }
    return JSON.stringify(body);
  }
  return String(body);
}

/**
 * Computes SHA-256 hash of canonicalized request body via Web Crypto API.
 * @param {any} body
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
export async function computeBodySha256(body) {
  const canonical = canonicalizeBody(body);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  return bytesToHex(hashBuffer);
}

/**
 * Generates a random UUID v4 string for request nonce.
 * @returns {string}
 */
export function generateNonce() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  // Fallback RFC4122 v4 UUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Computes the HMAC-SHA256 signature for a request payload and returns the formatted header.
 *
 * @param {object} params
 * @param {string} params.keyHex - 64-character hex anti-tamper token
 * @param {string} params.method - HTTP method (PUT, POST, DELETE, etc.)
 * @param {string} params.path - URL path (e.g. /api/v1/attempts/:id/answers/:id)
 * @param {any} [params.body] - Request body
 * @param {number} [params.timestamp] - Unix timestamp in ms (defaults to Date.now())
 * @param {string} [params.nonce] - Unique request nonce (defaults to random UUID)
 * @returns {Promise<{ headerValue: string, timestamp: number, nonce: string, signature: string }>}
 */
export async function createPayloadSignature({
  keyHex,
  method,
  path,
  body = null,
  timestamp = Date.now(),
  nonce = generateNonce()
}) {
  if (!keyHex) {
    throw new Error('keyHex is required for request signing');
  }

  const bodySha256 = await computeBodySha256(body);
  const normalizedMethod = String(method).toUpperCase();
  const normalizedPath = String(path).split('?')[0];
  const stringToSign = `${timestamp}.${nonce}.${normalizedMethod}.${normalizedPath}.${bodySha256}`;

  const keyBytes = hexToBytes(keyHex);
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const encoder = new TextEncoder();
  const signatureBuffer = await globalThis.crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(stringToSign)
  );

  const signature = bytesToHex(signatureBuffer);
  const headerValue = `t=${timestamp},nonce=${nonce},v1=${signature}`;

  return {
    headerValue,
    timestamp,
    nonce,
    signature
  };
}
