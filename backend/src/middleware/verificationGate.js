/**
 * @file verificationGate.js
 * @description Server-side access gating middleware enforcing account status, forced password change, and academic verification.
 */

import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import * as authRepo from '../modules/auth/auth.repository.js';
import * as userRepo from '../modules/users/user.repository.js';

// Whitelisted paths for accounts requiring first-login password change or onboarding
const ONBOARDING_WHITELIST = [
  '/api/v1/users/me/onboarding-status',
  '/api/v1/users/me/onboarding',
  '/api/v1/users/me/first-login/change-password',
  '/api/v1/auth/logout',
  '/api/v1/auth/me'
];

/**
 * Express middleware enforcing server-side gating for authenticated users.
 * Verifies account active status, forced password change completion, and academic verification.
 */
export async function requireVerifiedActiveUser(req, _res, next) {
  if (!req.user || !req.user.userId) {
    return next(new UnauthorizedError('Authentication required'));
  }

  try {
    const user = await userRepo.findUserDetailById(req.user.userId);
    if (!user) {
      return next(new UnauthorizedError('User account not found'));
    }

    // 1. Account Lifecycle Check
    if (user.status !== 'ACTIVE') {
      return next(
        new ForbiddenError(
          `Account is currently ${user.status.toLowerCase()}. Access denied.`,
          'ACCOUNT_NOT_ACTIVE'
        )
      );
    }

    const currentPath = req.originalUrl?.split('?')[0];

    // 2. Forced Password Change Gate
    if (user.mustChangePassword) {
      const isAllowed = ONBOARDING_WHITELIST.some((path) => currentPath?.startsWith(path));
      if (!isAllowed) {
        return next(
          new ForbiddenError(
            'Temporary password change required before accessing platform features.',
            'PASSWORD_CHANGE_REQUIRED'
          )
        );
      }
      return next();
    }

    // 3. Verification Gate for STUDENT and FACULTY roles (ADMIN and DEVELOPER are exempt)
    const roles = user.roles || [];
    const isAdministrative = roles.includes('ADMIN') || roles.includes('DEVELOPER');

    if (!isAdministrative) {
      const isStudentOrFaculty = roles.includes('STUDENT') || roles.includes('FACULTY');

      if (isStudentOrFaculty && user.verificationStatus !== 'VERIFIED') {
      const isAllowed = ONBOARDING_WHITELIST.some((path) => currentPath?.startsWith(path));
      if (!isAllowed) {
        if (user.verificationStatus === 'UNVERIFIED') {
          return next(
            new ForbiddenError(
              'Profile onboarding required prior to accessing examination features.',
              'ONBOARDING_REQUIRED'
            )
          );
        }
        if (user.verificationStatus === 'PENDING') {
          return next(
            new ForbiddenError(
              'Academic verification pending administrator approval. Operational access is blocked.',
              'VERIFICATION_PENDING'
            )
          );
        }
        if (user.verificationStatus === 'REJECTED') {
          return next(
            new ForbiddenError(
              `Academic onboarding rejected: ${user.verificationNotes || 'Please update and resubmit your details.'}`,
              'VERIFICATION_REJECTED'
            )
          );
        }
      }
    }
  }

    // Attach fresh user details to request
    req.userDetails = user;
    return next();
  } catch (err) {
    return next(err);
  }
}
