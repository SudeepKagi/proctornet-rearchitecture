/**
 * @file authenticate.js
 * @description Authentication middleware that verifies JWT Access Tokens in the Authorization header.
 */

import { UnauthorizedError } from '../utils/errors.js';
import { verifyAccessToken } from '../modules/auth/token.service.js';

/**
 * Express middleware to authenticate incoming requests via Bearer JWT.
 * Populates `req.user` with `{ userId, roles, sessionId }` on success.
 */
export function authenticate(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || typeof authHeader !== 'string') {
    return next(new UnauthorizedError('Missing Authorization header'));
  }

  const parts = authHeader.trim().split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return next(new UnauthorizedError('Invalid Authorization header format. Expected Bearer <token>'));
  }

  const token = parts[1];

  try {
    const decoded = verifyAccessToken(token);

    // Attach authenticated context to request
    req.user = {
      userId: decoded.userId,
      roles: decoded.roles || [],
      sessionId: decoded.sessionId
    };

    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Access token has expired'));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(new UnauthorizedError('Invalid access token signature'));
    }
    return next(new UnauthorizedError('Authentication failed: ' + err.message));
  }
}
