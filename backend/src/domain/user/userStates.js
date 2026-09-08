/**
 * @file userStates.js
 * @description Authoritative UserStatus and VerificationStatus enumerations and transition maps.
 * Conforms to Step 13.5 and Phase 23 specifications.
 */

/**
 * Authoritative 4-state account lifecycle.
 * @readonly
 * @enum {string}
 */
export const UserStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  LOCKED: 'LOCKED',
  SUSPENDED: 'SUSPENDED',
  DISABLED: 'DISABLED'
});

/**
 * Authoritative 4-state academic verification status.
 * @readonly
 * @enum {string}
 */
export const VerificationStatus = Object.freeze({
  UNVERIFIED: 'UNVERIFIED',
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED'
});

/**
 * Strict transition map for account lifecycle states.
 */
export const ALLOWED_USER_STATUS_TRANSITIONS = Object.freeze({
  [UserStatus.ACTIVE]: new Set([
    UserStatus.LOCKED,
    UserStatus.SUSPENDED,
    UserStatus.DISABLED
  ]),
  [UserStatus.LOCKED]: new Set([
    UserStatus.ACTIVE,
    UserStatus.SUSPENDED,
    UserStatus.DISABLED
  ]),
  [UserStatus.SUSPENDED]: new Set([
    UserStatus.ACTIVE,
    UserStatus.DISABLED
  ]),
  [UserStatus.DISABLED]: new Set([
    UserStatus.ACTIVE
  ])
});

/**
 * Strict transition map for verification states.
 */
export const ALLOWED_VERIFICATION_TRANSITIONS = Object.freeze({
  [VerificationStatus.UNVERIFIED]: new Set([
    VerificationStatus.PENDING
  ]),
  [VerificationStatus.PENDING]: new Set([
    VerificationStatus.VERIFIED,
    VerificationStatus.REJECTED
  ]),
  [VerificationStatus.VERIFIED]: new Set([
    VerificationStatus.REJECTED,
    VerificationStatus.PENDING
  ]),
  [VerificationStatus.REJECTED]: new Set([
    VerificationStatus.PENDING
  ])
});
