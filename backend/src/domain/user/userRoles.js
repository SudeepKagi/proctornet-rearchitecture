/**
 * @file userRoles.js
 * @description Authoritative five roles definition for ProctorNet.
 * Zero extra roles may be introduced.
 */

import { DomainInvariantError } from '../shared/domainErrors.js';

/**
 * The strictly five authoritative system roles.
 * @readonly
 * @enum {string}
 */
export const UserRole = Object.freeze({
  ADMIN: 'ADMIN',
  DEVELOPER: 'DEVELOPER',
  FACULTY: 'FACULTY',
  INVIGILATOR: 'INVIGILATOR',
  STUDENT: 'STUDENT'
});

export const AUTHORITATIVE_ROLES = Object.freeze(Object.values(UserRole));

/**
 * Validates if a role is one of the five authoritative roles.
 * @param {string} role
 * @returns {boolean}
 */
export function isValidRole(role) {
  return typeof role === 'string' && AUTHORITATIVE_ROLES.includes(role);
}

/**
 * Asserts that a role is valid, throwing DomainInvariantError if invalid.
 * @param {string} role
 * @throws {DomainInvariantError}
 */
export function assertValidRole(role) {
  if (!isValidRole(role)) {
    throw new DomainInvariantError(
      `Invalid role '${role}'. Must be one of [${AUTHORITATIVE_ROLES.join(', ')}]`
    );
  }
}
