/**
 * @file auth.controller.js
 * @description HTTP request handlers for authentication and session endpoints.
 * Enforces secure cookie transport for refresh tokens (HttpOnly, Secure, SameSite=Strict).
 */

import { config } from '../../config/env.js';
import { BadRequestError, UnauthorizedError, ForbiddenError } from '../../utils/errors.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import * as authService from './auth.service.js';

const COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/v1/auth'
};

/**
 * Handles user registration.
 * Public self-registration is strictly disabled in Phase 23.
 */
export async function handleRegister(req, res, next) {
  try {
    throw new ForbiddenError(
      'Public self-registration is disabled. Student and Faculty accounts must be provisioned by an administrator.',
      'SELF_REGISTRATION_DISABLED'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Handles user login with password verification, lockout check, and cookie issuance.
 */
export async function handleLogin(req, res, next) {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid login credentials provided', parseResult.error.format());
    }

    const { email, password } = parseResult.data;
    const userAgent = req.headers['user-agent'] || null;
    const ipAddress = req.ip || req.socket.remoteAddress || null;

    const result = await authService.login({
      email,
      password,
      userAgent,
      ipAddress
    });

    // Attach server-controlled refresh token exclusively via secure HttpOnly cookie
    res.cookie(COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);

    res.status(200).json({
      status: 'success',
      data: {
        user: result.user,
        accessToken: result.accessToken,
        expiresIn: result.expiresIn
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles access token refresh exclusively via secure HttpOnly cookie.
 * Performs refresh token rotation and updates the HttpOnly cookie with the new token.
 */
export async function handleRefresh(req, res, next) {
  try {
    const refreshToken = req.cookies?.[COOKIE_NAME];
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new UnauthorizedError('Refresh token cookie is missing or invalid');
    }

    const result = await authService.refresh({
      refreshToken,
      userAgent: req.headers['user-agent'] || null,
      ipAddress: req.ip || null
    });

    // Update HttpOnly cookie with the newly rotated refresh token
    res.cookie(COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);

    res.status(200).json({
      status: 'success',
      data: {
        accessToken: result.accessToken,
        user: result.user,
        expiresIn: result.expiresIn
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles user logout by revoking the active session and clearing the refresh cookie.
 */
export async function handleLogout(req, res, next) {
  try {
    const sessionId = req.user?.sessionId;
    const refreshToken = req.cookies?.[COOKIE_NAME];

    await authService.logout({ sessionId, refreshToken });

    res.clearCookie(COOKIE_NAME, { path: '/api/v1/auth' });

    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves the current authenticated user's profile and roles.
 */
export async function handleGetMe(req, res, next) {
  try {
    const userId = req.user.userId;
    const user = await authService.getCurrentUser(userId);

    res.status(200).json({
      status: 'success',
      data: { user }
    });
  } catch (err) {
    next(err);
  }
}
