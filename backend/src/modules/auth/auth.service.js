/**
 * @file auth.service.js
 * @description Core authentication service managing login, registration, token refresh with rotation, sessions, and lockout.
 */

import crypto from 'crypto';
import { config } from '../../config/env.js';
import { UnauthorizedError, ConflictError, NotFoundError, ForbiddenError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { hashPassword, verifyPassword } from './password.service.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken
} from './token.service.js';
import { blacklistSession } from './tokenBlacklist.js';
import * as authRepo from './auth.repository.js';
import { recordAuditEvent } from '../audit/audit.service.js';

// Generic failure message to prevent account enumeration
const INVALID_CREDENTIALS_MSG = 'Invalid email or password';

/**
 * Registers a new user for internal test fixture setup.
 * Public HTTP registration is blocked at the router/controller level.
 * @param {object} payload
 * @returns {Promise<object>} Created user summary
 */
export async function register(payload) {
  const existing = await authRepo.findUserByEmail(payload.email);
  if (existing) {
    throw new ConflictError('A user with this email address already exists');
  }

  const passwordHash = await hashPassword(payload.password);
  const assignedRole = 'STUDENT';

  const user = await authRepo.createUser({
    name: payload.name,
    email: payload.email,
    phone: payload.phone,
    passwordHash,
    role: assignedRole,
    studentProfile: payload.student_profile,
    facultyProfile: null
  });

  logger.info({ userId: user.user_id, role: assignedRole }, 'User registered via internal/fixture setup');

  return {
    userId: user.user_id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    roles: user.roles,
    createdAt: user.created_at
  };
}

/**
 * Authenticates a user with email/password, enforces account lockout, and creates a session.
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.password
 * @param {string} [params.userAgent]
 * @param {string} [params.ipAddress]
 * @returns {Promise<object>} Auth tokens and sanitized user info
 */
export async function login({ email, password, userAgent, ipAddress }) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await authRepo.findUserByEmail(normalizedEmail);

  if (!user) {
    // Perform dummy verify to mitigate timing attacks against non-existent accounts
    await verifyPassword(password, '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEF12345678901234567890123');
    await recordAuditEvent({
      actorUserId: null,
      action: 'AUTH_LOGIN_FAILURE',
      resourceType: 'USER',
      resourceId: 'UNKNOWN',
      metadata: {
        attemptedEmail: normalizedEmail,
        ip: ipAddress,
        userAgent,
        reason: 'USER_NOT_FOUND'
      }
    }).catch(() => {});
    throw new UnauthorizedError(INVALID_CREDENTIALS_MSG);
  }

  // 1. Check if account is DISABLED (generic error to prevent account enumeration)
  if (user.status === 'DISABLED') {
    logger.warn({ userId: user.user_id }, 'Login attempt on disabled account');
    await recordAuditEvent({
      actorUserId: user.user_id,
      action: 'AUTH_LOGIN_FAILURE',
      resourceType: 'USER',
      resourceId: user.user_id,
      metadata: {
        email: normalizedEmail,
        ip: ipAddress,
        userAgent,
        reason: 'ACCOUNT_DISABLED'
      }
    }).catch(() => {});
    throw new UnauthorizedError(INVALID_CREDENTIALS_MSG);
  }

  // 1b. Check if account is SUSPENDED
  if (user.status === 'SUSPENDED') {
    logger.warn({ userId: user.user_id }, 'Login attempt on suspended account');
    await recordAuditEvent({
      actorUserId: user.user_id,
      action: 'AUTH_LOGIN_FAILURE',
      resourceType: 'USER',
      resourceId: user.user_id,
      metadata: {
        email: normalizedEmail,
        ip: ipAddress,
        userAgent,
        reason: 'ACCOUNT_SUSPENDED'
      }
    }).catch(() => {});
    throw new UnauthorizedError('Account is currently suspended by an administrator. Please contact support.');
  }

  // 2. Check if account is locked (either status LOCKED or locked_until in the future)
  const now = new Date();
  if (user.status === 'LOCKED' || (user.locked_until && new Date(user.locked_until) > now)) {
    logger.warn({ userId: user.user_id, lockedUntil: user.locked_until }, 'Login attempt on locked account');
    await recordAuditEvent({
      actorUserId: user.user_id,
      action: 'AUTH_LOGIN_FAILURE',
      resourceType: 'USER',
      resourceId: user.user_id,
      metadata: {
        email: normalizedEmail,
        ip: ipAddress,
        userAgent,
        reason: 'ACCOUNT_LOCKED',
        lockedUntil: user.locked_until
      }
    }).catch(() => {});
    throw new UnauthorizedError('Account is temporarily locked due to repeated failed login attempts. Please try again later.');
  }

  // 3. Verify password
  const isMatch = await verifyPassword(password, user.password_hash);

  if (!isMatch) {
    const { isLocked, failedAttempts } = await authRepo.recordFailedLogin(
      user.user_id,
      user.failed_login_attempts || 0,
      config.AUTH_LOCKOUT_MAX_ATTEMPTS,
      config.AUTH_LOCKOUT_DURATION_MINUTES
    );

    logger.warn(
      { userId: user.user_id, failedAttempts, isLocked },
      'Failed password authentication attempt'
    );

    await recordAuditEvent({
      actorUserId: user.user_id,
      action: 'AUTH_LOGIN_FAILURE',
      resourceType: 'USER',
      resourceId: user.user_id,
      metadata: {
        email: normalizedEmail,
        ip: ipAddress,
        userAgent,
        reason: 'INVALID_CREDENTIALS',
        failedAttempts
      }
    }).catch(() => {});

    if (isLocked) {
      await recordAuditEvent({
        actorUserId: user.user_id,
        action: 'AUTH_LOCKOUT_TRIGGERED',
        resourceType: 'USER',
        resourceId: user.user_id,
        metadata: {
          email: normalizedEmail,
          ip: ipAddress,
          userAgent,
          failedAttempts,
          lockoutDurationMinutes: config.AUTH_LOCKOUT_DURATION_MINUTES
        }
      }).catch(() => {});

      throw new UnauthorizedError('Account is temporarily locked due to repeated failed login attempts. Please try again later.');
    }

    throw new UnauthorizedError(INVALID_CREDENTIALS_MSG);
  }

  // 4. Successful login: reset failed login tracking
  if (user.failed_login_attempts > 0 || user.locked_until) {
    await authRepo.resetFailedLogins(user.user_id);
  }

  // 5. Retrieve user roles
  const roles = await authRepo.getUserRoles(user.user_id);

  // 6. Calculate refresh token expiration (7 days)
  const refreshExpiresAt = new Date();
  refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 7);

  // 7. Temporary session generation & token issuance
  const refreshToken = generateRefreshToken({
    userId: user.user_id,
    sessionId: crypto.randomUUID()
  });
  const refreshTokenHash = hashToken(refreshToken);

  const session = await authRepo.createSession({
    userId: user.user_id,
    refreshTokenHash,
    userAgent,
    ipAddress,
    expiresAt: refreshExpiresAt
  });

  // 8. Generate short-lived access token bound to the active session
  const accessToken = generateAccessToken({
    userId: user.user_id,
    roles,
    sessionId: session.session_id
  });

  await recordAuditEvent({
    actorUserId: user.user_id,
    action: 'AUTH_LOGIN_SUCCESS',
    resourceType: 'USER',
    resourceId: user.user_id,
    metadata: {
      ip: ipAddress,
      userAgent,
      sessionId: session.session_id
    }
  }).catch((err) => {
    logger.error({ err, userId: user.user_id }, 'Failed to record AUTH_LOGIN_SUCCESS audit event');
  });

  logger.info({ userId: user.user_id, sessionId: session.session_id }, 'User logged in successfully');

  return {
    user: {
      userId: user.user_id,
      name: user.name,
      email: user.email,
      status: user.status,
      mustChangePassword: user.must_change_password || false,
      verificationStatus: user.verification_status || 'UNVERIFIED',
      roles
    },
    accessToken,
    refreshToken,
    expiresIn: config.JWT_ACCESS_EXPIRATION
  };
}

/**
 * Re-issues an access token using a valid server-controlled refresh token and performs Refresh Token Rotation.
 * Every successful refresh issues a new refresh token and immediately invalidates the old one.
 * @param {object} params
 * @param {string} params.refreshToken
 * @param {string} [params.userAgent]
 * @param {string} [params.ipAddress]
 * @returns {Promise<object>} New access token, new rotated refresh token, and user info
 */
export async function refresh({ refreshToken }) {
  if (!refreshToken) {
    throw new UnauthorizedError('Refresh token is required');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (err) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const refreshTokenHash = hashToken(refreshToken);
  const session = await authRepo.findSessionByRefreshHash(refreshTokenHash);

  if (!session) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  if (session.is_revoked) {
    logger.warn({ userId: session.user_id, sessionId: session.session_id }, 'Attempted reuse of revoked session');
    throw new UnauthorizedError('Session has been revoked');
  }

  const now = new Date();
  if (new Date(session.expires_at) <= now) {
    throw new UnauthorizedError('Session has expired. Please log in again.');
  }

  if (session.user_status === 'DISABLED') {
    throw new UnauthorizedError('User account is not active');
  }

  if (session.user_status === 'LOCKED' || (session.locked_until && new Date(session.locked_until) > now)) {
    throw new UnauthorizedError('Account is temporarily locked');
  }

  if (session.user_status !== 'ACTIVE') {
    throw new UnauthorizedError('User account is not active');
  }

  // 1. Generate new rotated refresh token
  const newRefreshToken = generateRefreshToken({
    userId: session.user_id,
    sessionId: session.session_id
  });
  const newRefreshTokenHash = hashToken(newRefreshToken);

  const newRefreshExpiresAt = new Date();
  newRefreshExpiresAt.setDate(newRefreshExpiresAt.getDate() + 7);

  // 2. Atomically update session in DB with new refresh token hash (invalidates old refresh token)
  const updatedSession = await authRepo.updateSessionRefreshToken(
    session.session_id,
    newRefreshTokenHash,
    newRefreshExpiresAt
  );

  if (!updatedSession) {
    throw new UnauthorizedError('Session is invalid or has been revoked');
  }

  // 3. Fetch authoritative server-side user data and roles
  const roles = await authRepo.getUserRoles(session.user_id);
  const user = await authRepo.findUserById(session.user_id);

  // 4. Generate new short-lived access token
  const newAccessToken = generateAccessToken({
    userId: session.user_id,
    roles,
    sessionId: session.session_id
  });

  logger.debug({ userId: session.user_id, sessionId: session.session_id }, 'Refreshed access token with rotation successfully');

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    user: {
      userId: session.user_id,
      name: user.name,
      email: user.email,
      roles,
      status: session.user_status
    },
    expiresIn: config.JWT_ACCESS_EXPIRATION
  };
}

/**
 * Revokes a session upon user logout.
 * @param {object} params
 * @param {string} [params.sessionId]
 * @param {string} [params.refreshToken]
 * @returns {Promise<void>}
 */
export async function logout({ sessionId, refreshToken }) {
  if (sessionId) {
    await authRepo.revokeSession(sessionId);
    await blacklistSession(sessionId);
    await recordAuditEvent({
      actorUserId: null,
      action: 'AUTH_LOGOUT',
      resourceType: 'SESSION',
      resourceId: sessionId,
      metadata: { sessionId }
    }).catch(() => {});
    logger.info({ sessionId }, 'User logged out and session revoked');
    return;
  }

  if (refreshToken) {
    try {
      const hash = hashToken(refreshToken);
      const session = await authRepo.findSessionByRefreshHash(hash);
      if (session) {
        await authRepo.revokeSession(session.session_id);
        await blacklistSession(session.session_id);
        await recordAuditEvent({
          actorUserId: session.user_id,
          action: 'AUTH_LOGOUT',
          resourceType: 'SESSION',
          resourceId: session.session_id,
          metadata: { sessionId: session.session_id }
        }).catch(() => {});
        logger.info({ sessionId: session.session_id }, 'Session revoked via refresh token on logout');
      }
    } catch {
      // Ignore token decode errors on logout
    }
  }
}

/**
 * Revokes all sessions for a user (e.g., on password change, account lock, or security breach).
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function revokeAllSessions(userId) {
  await authRepo.revokeAllUserSessions(userId);
  await recordAuditEvent({
    actorUserId: userId,
    action: 'AUTH_SESSION_REVOKED',
    resourceType: 'USER',
    resourceId: userId,
    metadata: { reason: 'ALL_SESSIONS_REVOKED' }
  }).catch(() => {});
  logger.info({ userId }, 'All user sessions revoked');
}

/**
 * Retrieves the current authenticated user's profile and roles.
 * @param {string} userId
 * @returns {Promise<object>} Sanitized user object
 */
export async function getCurrentUser(userId) {
  const user = await authRepo.findUserById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const roles = await authRepo.getUserRoles(userId);

  return {
    userId: user.user_id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    mustChangePassword: user.must_change_password,
    verificationStatus: user.verification_status,
    roles,
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
}
