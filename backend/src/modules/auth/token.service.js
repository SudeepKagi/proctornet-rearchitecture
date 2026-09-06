/**
 * @file token.service.js
 * @description JWT Access and Refresh token generation, verification, and SHA-256 hashing.
 */

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env.js';

/**
 * Generates a short-lived signed JWT Access Token.
 * @param {object} payload
 * @param {string} payload.userId
 * @param {string[]} payload.roles
 * @param {string} payload.sessionId
 * @returns {string} Signed JWT string
 */
export function generateAccessToken({ userId, roles, sessionId }) {
  if (!userId || !sessionId) {
    throw new Error('userId and sessionId are required to issue an access token');
  }

  return jwt.sign(
    {
      userId,
      roles: Array.isArray(roles) ? roles : [],
      sessionId,
      tokenType: 'access'
    },
    config.JWT_ACCESS_SECRET,
    {
      subject: userId,
      expiresIn: config.JWT_ACCESS_EXPIRATION,
      issuer: 'proctornet-auth'
    }
  );
}

/**
 * Verifies and decodes a JWT Access Token.
 * @param {string} token
 * @returns {object} Decoded JWT payload
 */
export function verifyAccessToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Access token is required');
  }

  const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET, {
    issuer: 'proctornet-auth'
  });

  if (decoded.tokenType !== 'access') {
    throw new Error('Invalid token type');
  }

  return decoded;
}

/**
 * Generates a signed JWT Refresh Token with unique token ID.
 * @param {object} payload
 * @param {string} payload.userId
 * @param {string} payload.sessionId
 * @returns {string} Signed JWT string
 */
export function generateRefreshToken({ userId, sessionId }) {
  if (!userId || !sessionId) {
    throw new Error('userId and sessionId are required to issue a refresh token');
  }

  return jwt.sign(
    {
      userId,
      sessionId,
      tokenId: crypto.randomUUID(),
      tokenType: 'refresh'
    },
    config.JWT_REFRESH_SECRET,
    {
      subject: userId,
      expiresIn: config.JWT_REFRESH_EXPIRATION,
      issuer: 'proctornet-auth'
    }
  );
}

/**
 * Verifies and decodes a JWT Refresh Token.
 * @param {string} token
 * @returns {object} Decoded refresh token payload
 */
export function verifyRefreshToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Refresh token is required');
  }

  const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET, {
    issuer: 'proctornet-auth'
  });

  if (decoded.tokenType !== 'refresh') {
    throw new Error('Invalid token type');
  }

  return decoded;
}

/**
 * Computes a deterministic SHA-256 hash of a token for secure database storage and fast lookup.
 * @param {string} token
 * @returns {string} Hex-encoded SHA-256 hash
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
