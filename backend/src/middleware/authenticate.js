/**
 * @file authenticate.js
 * @description Authentication middleware that verifies JWT Access Tokens in the Authorization header.
 */

import { UnauthorizedError } from '../utils/errors.js';
import { verifyAccessToken } from '../modules/auth/token.service.js';
import { isSessionBlacklisted } from '../modules/auth/tokenBlacklist.js';
import { findSessionRevocationStatus } from '../modules/auth/auth.repository.js';
import { logger } from '../utils/logger.js';

let sessionRevocationChecker = findSessionRevocationStatus;

/**
 * Overrides the PostgreSQL session revocation lookup function (for testing).
 * @param {Function} checker
 */
export function setSessionRevocationChecker(checker) {
  sessionRevocationChecker = checker;
}

/**
 * Resets the session revocation checker to default repository function.
 */
export function resetSessionRevocationChecker() {
  sessionRevocationChecker = findSessionRevocationStatus;
}

/**
 * Express middleware to authenticate incoming requests via Bearer JWT.
 * Validates session revocation state via Redis blacklist fast-path with authoritative PostgreSQL fallback.
 * Populates `req.user` with `{ userId, roles, sessionId }` on success.
 */
export async function authenticate(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || typeof authHeader !== 'string') {
    return next(new UnauthorizedError('Missing Authorization header'));
  }

  const parts = authHeader.trim().split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return next(new UnauthorizedError('Invalid Authorization header format. Expected Bearer <token>'));
  }

  const token = parts[1];

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Access token has expired'));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(new UnauthorizedError('Invalid access token signature'));
    }
    return next(new UnauthorizedError('Authentication failed: ' + err.message));
  }

  // Session revocation validation
  const sessionId = decoded.sessionId;
  if (sessionId) {
    // 1. Fast-path check in Redis blacklist
    const blacklistResult = await isSessionBlacklisted(sessionId);

    if (blacklistResult.available) {
      if (blacklistResult.isBlacklisted) {
        return next(new UnauthorizedError('Session has been revoked'));
      }
      // Not blacklisted in Redis -> active session, continue
    } else {
      // 2. Redis unavailable: authoritative fallback to PostgreSQL user_sessions
      try {
        const sessionRecord = await sessionRevocationChecker(sessionId);
        if (!sessionRecord || sessionRecord.is_revoked) {
          return next(new UnauthorizedError('Session has been revoked'));
        }
        // Active session verified in PostgreSQL -> continue
      } catch (dbErr) {
        // 3. Dual Failure: both Redis and PostgreSQL unavailable -> FAIL CLOSED!
        logger.error(
          { sessionId, err: dbErr.message },
          'Both Redis and PostgreSQL unavailable for session verification; failing closed'
        );
        return next(new UnauthorizedError('Authentication verification unavailable'));
      }
    }
  }

  // Attach authenticated context to request
  req.user = {
    userId: decoded.userId,
    roles: decoded.roles || [],
    sessionId: decoded.sessionId
  };

  return next();
}
