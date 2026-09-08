/**
 * @file antiTamper.js
 * @description Express middleware for HMAC-SHA256 request signing verification,
 * timestamp freshness validation, and Redis-backed nonce replay protection.
 */

import { config } from '../config/env.js';
import { getRedisClient } from '../infrastructure/redis/client.js';
import { securityTamperViolationsTotal } from '../infrastructure/metrics/registry.js';
import { recordAuditEvent } from '../modules/audit/audit.service.js';
import { findAttemptById } from '../modules/attempts/attempts.repository.js';
import { logger } from '../utils/logger.js';
import {
  parseSignatureHeader,
  deriveAttemptSigningKey,
  computePayloadSignature,
  verifySignatureConstantTime
} from '../utils/antiTamper.js';

// In-memory bounded cache for development/test mode only
const inMemoryNonceCache = new Map(); // key -> expireAtMs

/**
 * Checks and locks a nonce in in-memory cache (dev/test fallback only).
 * @param {string} key
 * @param {number} ttlSec
 * @returns {boolean} True if claimed, false if duplicate/replayed
 */
export function checkAndSetInMemoryNonce(key, ttlSec = 300) {
  const now = Date.now();
  if (inMemoryNonceCache.size > 10000) {
    for (const [k, exp] of inMemoryNonceCache.entries()) {
      if (exp <= now) inMemoryNonceCache.delete(k);
    }
  }

  const existing = inMemoryNonceCache.get(key);
  if (existing && existing > now) {
    return false;
  }

  inMemoryNonceCache.set(key, now + ttlSec * 1000);
  return true;
}

/**
 * Clears the in-memory nonce cache (useful in test teardowns).
 */
export function clearInMemoryNonces() {
  inMemoryNonceCache.clear();
}

export const resetInMemoryNonceCache = clearInMemoryNonces;

/**
 * Express middleware enforcing cryptographic anti-tampering and replay defense.
 * Mounts on mutating candidate routes: answers PUT/POST/DELETE and telemetry POST.
 */
export async function antiTamperMiddleware(req, res, next) {
  const attemptId = req.params?.attemptId;
  const user = req.user;

  if (!user || !user.userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Authentication required',
      code: 'ERR_UNAUTHORIZED'
    });
  }

  if (!attemptId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required attemptId route parameter',
      code: 'ERR_INVALID_ROUTE_PARAMS'
    });
  }

  // 1. Parse signature header
  const rawHeader = req.headers['x-payload-signature'];
  const enforceSignature = config.NODE_ENV === 'production' || process.env.ENFORCE_ANTI_TAMPER === 'true';

  if (!rawHeader) {
    if (!enforceSignature) {
      return next();
    }
    securityTamperViolationsTotal.inc({ reason: 'missing_header' });
    return res.status(400).json({
      success: false,
      error: 'X-Payload-Signature header is required for this mutating endpoint',
      code: 'ERR_SIGNATURE_MISSING'
    });
  }

  const parsed = parseSignatureHeader(rawHeader);
  if (!parsed) {
    securityTamperViolationsTotal.inc({ reason: 'invalid_format' });
    return res.status(400).json({
      success: false,
      error: 'Malformed X-Payload-Signature header format; expected t=<timestamp>,nonce=<nonce>,v1=<signature>',
      code: 'ERR_SIGNATURE_INVALID_FORMAT'
    });
  }

  const { timestamp, nonce, signature } = parsed;

  // 2. Timestamp freshness window verification
  const now = Date.now();
  const drift = Math.abs(now - timestamp);
  const maxDrift = config.ANTI_TAMPER_MAX_DRIFT_MS || 300000;

  if (drift > maxDrift) {
    securityTamperViolationsTotal.inc({ reason: 'expired_ts' });
    return res.status(403).json({
      success: false,
      error: 'Request timestamp expired or excessive clock drift',
      code: 'ERR_SIGNATURE_EXPIRED',
      serverTime: new Date(now).toISOString()
    });
  }

  // 3. Shared Replay Protection (Redis primary, with production fail-closed)
  const redisKey = `v1:antitamper:nonce:${attemptId}:${nonce}`;
  let nonceClaimed = false;

  try {
    const redis = getRedisClient();
    if (redis && redis.status === 'ready') {
      const result = await redis.set(redisKey, '1', 'EX', 300, 'NX');
      nonceClaimed = result === 'OK';
    } else {
      // Redis unavailable or disconnected
      if (config.NODE_ENV === 'production' || process.env.NODE_ENV === 'production' || !config.ALLOW_IN_MEMORY_NONCE_FALLBACK) {
        securityTamperViolationsTotal.inc({ reason: 'redis_unavailable' });
        res.setHeader('Retry-After', '5');
        return res.status(503).json({
          success: false,
          error: 'Shared replay defense service temporarily unavailable; please retry shortly',
          code: 'ERR_REPLAY_SERVICE_UNAVAILABLE'
        });
      }

      // Non-production development/test fallback
      nonceClaimed = checkAndSetInMemoryNonce(redisKey, 300);
    }
  } catch (redisErr) {
    logger.error({ err: redisErr.message }, 'Redis replay check failed with exception');
    if (config.NODE_ENV === 'production' || process.env.NODE_ENV === 'production' || !config.ALLOW_IN_MEMORY_NONCE_FALLBACK) {
      securityTamperViolationsTotal.inc({ reason: 'redis_unavailable' });
      res.setHeader('Retry-After', '5');
      return res.status(503).json({
        success: false,
        error: 'Shared replay defense service temporarily unavailable; please retry shortly',
        code: 'ERR_REPLAY_SERVICE_UNAVAILABLE'
      });
    }
    nonceClaimed = checkAndSetInMemoryNonce(redisKey, 300);
  }

  if (!nonceClaimed) {
    securityTamperViolationsTotal.inc({ reason: 'replay_detected' });
    recordAuditEvent({
      actorUserId: user.userId,
      action: 'SECURITY_REPLAY_DETECTED',
      resourceType: 'ATTEMPT',
      resourceId: attemptId,
      attemptId,
      requestId: req.id || null,
      metadata: { method: req.method, path: req.originalUrl, nonce },
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null
    }).catch(() => {});

    return res.status(409).json({
      success: false,
      error: 'Replay attack detected: request nonce already processed',
      code: 'ERR_REPLAY_DETECTED'
    });
  }

  // 4. Verify Candidate Attempt & Derive Signing Key
  let attempt;
  try {
    attempt = await findAttemptById(attemptId);
  } catch (dbErr) {
    logger.error({ err: dbErr.message, attemptId }, 'Failed to query attempt in anti-tamper middleware');
    return next(dbErr);
  }

  if (!attempt || attempt.student_id !== user.userId) {
    return res.status(403).json({
      success: false,
      error: 'Access denied: You do not own this exam attempt',
      code: 'ERR_ATTEMPT_FORBIDDEN'
    });
  }

  // 5. Derive Attempt Signing Key & Verify HMAC
  const rootSecret = config.ANTI_TAMPER_SECRET;
  const key = deriveAttemptSigningKey(rootSecret, attempt.attempt_id, user.userId, attempt.started_at);
  const expectedSignature = computePayloadSignature(
    key,
    timestamp,
    nonce,
    req.method,
    req.originalUrl,
    req.body
  );

  const isValid = verifySignatureConstantTime(signature, expectedSignature);

  if (!isValid) {
    securityTamperViolationsTotal.inc({ reason: 'signature_mismatch' });
    recordAuditEvent({
      actorUserId: user.userId,
      action: 'SECURITY_PAYLOAD_TAMPERED',
      resourceType: 'ATTEMPT',
      resourceId: attemptId,
      attemptId,
      requestId: req.id || null,
      metadata: { method: req.method, path: req.originalUrl, nonce },
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null
    }).catch(() => {});

    return res.status(403).json({
      success: false,
      error: 'Payload signature verification failed: anti-tampering validation error',
      code: 'ERR_SIGNATURE_INVALID'
    });
  }

  next();
}
