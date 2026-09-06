/**
 * @file resourceAuthorization.js
 * @description Resource-level authorization primitives providing Broken Object Level Authorization (BOLA/IDOR) defense.
 */

import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';

/**
 * Creates middleware verifying that the authenticated user is the owner of the target resource.
 * Explicitly guards against BOLA / IDOR attacks where a user tampers with resource IDs in paths or parameters.
 * @param {string | ((req: import('express').Request) => string | Promise<string>)} ownerIdResolver
 * @param {object} [options={ allowAdmin: true }]
 * @param {boolean} [options.allowAdmin=true] - Whether ADMIN role bypasses strict ownership check
 * @returns {import('express').RequestHandler}
 */
export function requireOwnership(ownerIdResolver, options = { allowAdmin: true }) {
  return async (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    try {
      let targetOwnerId;
      if (typeof ownerIdResolver === 'function') {
        targetOwnerId = await ownerIdResolver(req);
      } else if (typeof ownerIdResolver === 'string') {
        targetOwnerId = req.params[ownerIdResolver] || req.body?.[ownerIdResolver] || req.query?.[ownerIdResolver];
      }

      if (!targetOwnerId) {
        return next(new ForbiddenError('Resource owner identifier could not be determined'));
      }

      // Check if user is the resource owner
      const isOwner = req.user.userId === targetOwnerId;

      // Check if admin bypass is allowed and user is ADMIN
      const isAdmin = options.allowAdmin && (req.user.roles || []).includes('ADMIN');

      if (!isOwner && !isAdmin) {
        return next(
          new ForbiddenError('Access denied: You do not have permission to access or modify this resource')
        );
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Creates middleware verifying that the user meets custom resource scope or assignment rules.
 * @param {(req: import('express').Request, user: object) => boolean | Promise<boolean>} scopeValidator
 * @param {string} [failureMessage='Access denied for this resource scope']
 * @returns {import('express').RequestHandler}
 */
export function requireResourceScope(scopeValidator, failureMessage = 'Access denied for this resource scope') {
  return async (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    try {
      const isAllowed = await scopeValidator(req, req.user);
      if (!isAllowed) {
        return next(new ForbiddenError(failureMessage));
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
