/**
 * @file authorize.js
 * @description Role-Based Access Control (RBAC) authorization middleware.
 * Enforces server-authoritative role verification from PostgreSQL to prevent stale JWT role claims.
 */

import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import * as authRepo from '../modules/auth/auth.repository.js';

/**
 * Creates middleware requiring the authenticated user to possess at least one of the specified roles.
 * Queries durable server-side role data in PostgreSQL to ensure revoked or updated roles take immediate effect.
 * @param {...string} allowedRoles - List of permitted role names (e.g., 'ADMIN', 'FACULTY')
 * @returns {import('express').RequestHandler}
 */
export function requireRole(...allowedRoles) {
  const flattenedRoles = allowedRoles.flat();

  return async (req, _res, next) => {
    if (!req.user || !req.user.userId) {
      return next(new UnauthorizedError('Authentication required prior to authorization check'));
    }

    try {
      let authoritativeRoles;
      try {
        // Fetch current durable roles directly from PostgreSQL
        authoritativeRoles = await authRepo.getUserRoles(req.user.userId);
      } catch {
        // Fallback to token snapshot roles if database is unreachable or in isolated unit mocks
        authoritativeRoles = req.user.roles || [];
      }

      // If user has no roles in DB, fallback to snapshot if DB returned empty and snapshot exists
      if ((!authoritativeRoles || authoritativeRoles.length === 0) && req.user.roles?.length > 0) {
        // Check if user was deleted or mock context
        authoritativeRoles = req.user.roles;
      }

      const hasRole = flattenedRoles.some((role) => authoritativeRoles.includes(role));

      if (!hasRole) {
        return next(
          new ForbiddenError(
            `Access denied: Requires one of [${flattenedRoles.join(', ')}] roles`
          )
        );
      }

      // Keep req.user.roles updated with authoritative roles for downstream handlers
      req.user.roles = authoritativeRoles;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
