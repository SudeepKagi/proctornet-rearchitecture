/**
 * @file user.service.js
 * @description Centralized business service for user administration, account lifecycles, credentials, and verification review.
 */

import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import * as userRepo from './user.repository.js';
import * as authRepo from '../auth/auth.repository.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { parseUserRoster } from './excelParser.service.js';
import { transitionUserState, transitionVerificationState } from '../../domain/user/userStateMachine.js';
import {
  assertNotLastAdmin,
  assertNotSelfTarget,
  assertCanSubmitOnboarding
} from '../../domain/user/userInvariants.js';
import { assertValidRole } from '../../domain/user/userRoles.js';
import { UserStatus, VerificationStatus } from '../../domain/user/userStates.js';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  ForbiddenError
} from '../../utils/errors.js';
import { getPool } from '../../infrastructure/postgres/pool.js';

const BCRYPT_SALT_ROUNDS = 10;

/**
 * Generates a cryptographically secure random temporary password.
 * Satisfies complexity requirements: upper, lower, digits, special characters.
 * @returns {string}
 */
export function generateTemporaryPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const specials = '!@#$%^&*';

  let password = '';
  password += uppers[crypto.randomInt(uppers.length)];
  password += letters[crypto.randomInt(letters.length)];
  password += numbers[crypto.randomInt(numbers.length)];
  password += specials[crypto.randomInt(specials.length)];

  const allChars = letters + uppers + numbers + specials;
  for (let i = 4; i < 14; i++) {
    password += allChars[crypto.randomInt(allChars.length)];
  }

  // Shuffle characters
  return password.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

/**
 * Lists users with filtering, sorting, and server-side pagination.
 * @param {object} queryParams
 * @returns {Promise<object>}
 */
export async function listUsers(queryParams = {}) {
  const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
  const limit = Math.max(1, Math.min(parseInt(queryParams.limit, 10) || 20, 100));
  const offset = (page - 1) * limit;

  const filters = {
    search: queryParams.search,
    role: queryParams.role,
    status: queryParams.status,
    verification_status: queryParams.verification_status
  };

  const sorting = {
    sort_by: queryParams.sort_by || 'created_at',
    sort_order: queryParams.sort_order || 'desc'
  };

  const [users, total] = await Promise.all([
    userRepo.findUsers(filters, { limit, offset }, sorting),
    userRepo.countUsers(filters)
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages
    }
  };
}

/**
 * Retrieves a detailed user by user_id.
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getUserDetail(userId) {
  const user = await userRepo.findUserDetailById(userId);
  if (!user) {
    throw new NotFoundError(`User with ID '${userId}' not found`);
  }
  return user;
}

/**
 * Creates a single user record with temporary credentials.
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.email
 * @param {string} [params.phone]
 * @param {string} params.role
 * @param {string} [params.identifier] - USN or Employee ID
 * @param {string} params.actorUserId
 * @returns {Promise<{ user: object, temporaryPassword: string }>}
 */
export async function createSingleUser({
  name,
  email,
  phone = null,
  role,
  identifier = null,
  actorUserId
}) {
  assertValidRole(role);

  const normalizedEmail = email.toLowerCase().trim();

  // Check duplicate email
  const existingUser = await authRepo.findUserByEmail(normalizedEmail);
  if (existingUser) {
    throw new ConflictError(`User with email '${normalizedEmail}' already exists`);
  }

  // Generate secure temporary password and bcrypt hash
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_SALT_ROUNDS);

  const user = await userRepo.createMinimalUser({
    name,
    email: normalizedEmail,
    phone,
    passwordHash,
    role,
    identifier
  });

  await recordAuditEvent({
    actorUserId,
    action: 'USER_CREATED',
    resourceType: 'USER',
    resourceId: user.userId,
    metadata: {
      email: user.email,
      role,
      identifier
    }
  }).catch(() => {});

  return {
    user,
    temporaryPassword
  };
}

/**
 * Transitions an account's authoritative lifecycle state.
 * @param {object} params
 * @param {string} params.targetUserId
 * @param {string} params.newStatus
 * @param {string} [params.reason]
 * @param {string} params.actorUserId
 * @returns {Promise<object>}
 */
export async function changeAccountStatus({ targetUserId, newStatus, reason = null, actorUserId }) {
  const targetUser = await userRepo.findUserDetailById(targetUserId);
  if (!targetUser) {
    throw new NotFoundError(`User with ID '${targetUserId}' not found`);
  }

  // Self-target check
  assertNotSelfTarget({
    actorUserId,
    targetUserId,
    action: newStatus === UserStatus.SUSPENDED ? 'SUSPEND' : newStatus === UserStatus.DISABLED ? 'DISABLE' : null
  });

  // Last admin protection if disabling or suspending an admin
  if (targetUser.roles.includes('ADMIN') && [UserStatus.SUSPENDED, UserStatus.DISABLED].includes(newStatus)) {
    const activeAdmins = await userRepo.countActiveAdmins();
    assertNotLastAdmin({
      activeAdminCount: activeAdmins,
      isDisablingAdmin: true
    });
  }

  // Validate state machine transition
  const validatedStatus = transitionUserState(targetUser.status, newStatus);

  const updated = await userRepo.updateUserStatus(targetUserId, validatedStatus, reason);

  // Invalidate all active sessions on suspension or deactivation
  let revokedCount = 0;
  if ([UserStatus.SUSPENDED, UserStatus.DISABLED, UserStatus.LOCKED].includes(validatedStatus)) {
    await authRepo.revokeAllUserSessions(targetUserId);
    revokedCount = targetUser.activeSessionsCount || 0;
  }

  await recordAuditEvent({
    actorUserId,
    action: `USER_STATUS_${validatedStatus}`,
    resourceType: 'USER',
    resourceId: targetUserId,
    metadata: {
      beforeState: targetUser.status,
      afterState: validatedStatus,
      reason
    }
  }).catch(() => {});

  return {
    userId: targetUserId,
    status: updated.status,
    statusReason: updated.status_reason,
    statusUpdatedAt: updated.status_updated_at,
    revokedSessionsCount: revokedCount
  };
}

/**
 * Resets a user's password, generating a new temporary password and revoking sessions.
 * @param {object} params
 * @param {string} params.targetUserId
 * @param {string} params.actorUserId
 * @returns {Promise<{ temporaryPassword: string }>}
 */
export async function resetPassword({ targetUserId, actorUserId }) {
  const targetUser = await userRepo.findUserDetailById(targetUserId);
  if (!targetUser) {
    throw new NotFoundError(`User with ID '${targetUserId}' not found`);
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_SALT_ROUNDS);

  await userRepo.updateUserPassword(targetUserId, passwordHash, true);
  await authRepo.revokeAllUserSessions(targetUserId);

  await recordAuditEvent({
    actorUserId,
    action: 'USER_PASSWORD_RESET',
    resourceType: 'USER',
    resourceId: targetUserId,
    metadata: {
      targetEmail: targetUser.email,
      mustChangePassword: true
    }
  }).catch(() => {});

  return {
    userId: targetUserId,
    temporaryPassword,
    mustChangePassword: true,
    message: 'Password reset successfully. Active sessions revoked.'
  };
}

/**
 * Unlocks a locked user account.
 * @param {object} params
 * @param {string} params.targetUserId
 * @param {string} params.actorUserId
 * @returns {Promise<object>}
 */
export async function unlockUserAccount({ targetUserId, actorUserId }) {
  const targetUser = await userRepo.findUserDetailById(targetUserId);
  if (!targetUser) {
    throw new NotFoundError(`User with ID '${targetUserId}' not found`);
  }

  await userRepo.unlockUser(targetUserId);

  await recordAuditEvent({
    actorUserId,
    action: 'USER_UNLOCKED',
    resourceType: 'USER',
    resourceId: targetUserId,
    metadata: {
      previousFailedAttempts: targetUser.failedLoginAttempts,
      previousLockedUntil: targetUser.lockedUntil
    }
  }).catch(() => {});

  return {
    userId: targetUserId,
    status: 'ACTIVE',
    message: 'Account unlocked successfully.'
  };
}

/**
 * Assigns a role to a user.
 * @param {object} params
 * @param {string} params.targetUserId
 * @param {string} params.role
 * @param {string} params.actorUserId
 * @returns {Promise<object>}
 */
export async function assignRoleToUser({ targetUserId, role, actorUserId }) {
  assertValidRole(role);
  const targetUser = await userRepo.findUserDetailById(targetUserId);
  if (!targetUser) {
    throw new NotFoundError(`User with ID '${targetUserId}' not found`);
  }

  await userRepo.assignRole(targetUserId, role);

  await recordAuditEvent({
    actorUserId,
    action: 'USER_ROLE_ASSIGNED',
    resourceType: 'USER',
    resourceId: targetUserId,
    metadata: { assignedRole: role }
  }).catch(() => {});

  return userRepo.findUserDetailById(targetUserId);
}

/**
 * Revokes a role from a user.
 * @param {object} params
 * @param {string} params.targetUserId
 * @param {string} params.role
 * @param {string} params.actorUserId
 * @returns {Promise<object>}
 */
export async function revokeRoleFromUser({ targetUserId, role, actorUserId }) {
  assertValidRole(role);
  const targetUser = await userRepo.findUserDetailById(targetUserId);
  if (!targetUser) {
    throw new NotFoundError(`User with ID '${targetUserId}' not found`);
  }

  if (role === 'ADMIN') {
    const activeAdmins = await userRepo.countActiveAdmins();
    assertNotLastAdmin({
      activeAdminCount: activeAdmins,
      isRemovingAdminRole: true
    });
  }

  await userRepo.revokeRole(targetUserId, role);

  await recordAuditEvent({
    actorUserId,
    action: 'USER_ROLE_REVOKED',
    resourceType: 'USER',
    resourceId: targetUserId,
    metadata: { revokedRole: role }
  }).catch(() => {});

  return userRepo.findUserDetailById(targetUserId);
}

/**
 * Revokes all active sessions for a given user.
 * @param {object} params
 * @param {string} params.targetUserId
 * @param {string} params.actorUserId
 * @returns {Promise<object>}
 */
export async function revokeUserSessions({ targetUserId, actorUserId }) {
  const targetUser = await userRepo.findUserDetailById(targetUserId);
  if (!targetUser) {
    throw new NotFoundError(`User with ID '${targetUserId}' not found`);
  }

  await authRepo.revokeAllUserSessions(targetUserId);

  await recordAuditEvent({
    actorUserId,
    action: 'USER_SESSIONS_REVOKED',
    resourceType: 'USER',
    resourceId: targetUserId,
    metadata: { revokedCount: targetUser.activeSessionsCount }
  }).catch(() => {});

  return {
    userId: targetUserId,
    message: 'All active sessions have been revoked.'
  };
}

/**
 * Self-service: Changes password upon first login.
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.currentPassword
 * @param {string} params.newPassword
 * @returns {Promise<object>}
 */
export async function changeFirstLoginPassword({ userId, currentPassword, newPassword }) {
  const authUser = await authRepo.findUserById(userId);
  if (!authUser) {
    throw new NotFoundError('User not found');
  }

  const fullUser = await authRepo.findUserByEmail(authUser.email);
  const isMatch = await bcrypt.compare(currentPassword, fullUser.password_hash);
  if (!isMatch) {
    throw new BadRequestError('Current temporary password is incorrect');
  }

  if (currentPassword === newPassword) {
    throw new BadRequestError('New password must differ from temporary password');
  }

  if (!newPassword || newPassword.length < 8) {
    throw new BadRequestError('Password must be at least 8 characters long');
  }

  const newHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  await userRepo.updateUserPassword(userId, newHash, false);

  await recordAuditEvent({
    actorUserId: userId,
    action: 'AUTH_FIRST_LOGIN_PASSWORD_CHANGED',
    resourceType: 'USER',
    resourceId: userId,
    metadata: { email: authUser.email }
  }).catch(() => {});

  return {
    success: true,
    mustChangePassword: false,
    message: 'Password changed successfully. You may now complete your profile onboarding.'
  };
}

/**
 * Self-service: Submits profile onboarding details.
 * @param {object} params
 * @param {string} params.userId
 * @param {object} params.profileData
 * @returns {Promise<object>}
 */
export async function submitOnboardingProfile({ userId, profileData }) {
  const user = await userRepo.findUserDetailById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  assertCanSubmitOnboarding({
    mustChangePassword: user.mustChangePassword,
    currentVerificationStatus: user.verificationStatus
  });

  const isStudent = user.roles.includes('STUDENT');
  const isFaculty = user.roles.includes('FACULTY') || user.roles.includes('INVIGILATOR');

  if (isStudent) {
    if (!profileData.department || typeof profileData.department !== 'string' || profileData.department.trim() === '') {
      throw new BadRequestError('Department is required for student onboarding');
    }
    const sem = parseInt(profileData.semester, 10);
    if (isNaN(sem) || sem < 1 || sem > 12) {
      throw new BadRequestError('Semester must be an integer between 1 and 12');
    }
    await userRepo.updateStudentOnboardingProfile(userId, {
      department: profileData.department,
      semester: sem,
      phone: profileData.phone,
      metadata: profileData.metadata
    });
  } else if (isFaculty) {
    if (!profileData.department || typeof profileData.department !== 'string' || profileData.department.trim() === '') {
      throw new BadRequestError('Department is required for faculty onboarding');
    }
    if (!profileData.designation || typeof profileData.designation !== 'string' || profileData.designation.trim() === '') {
      throw new BadRequestError('Designation is required for faculty onboarding');
    }
    await userRepo.updateFacultyOnboardingProfile(userId, {
      department: profileData.department,
      designation: profileData.designation,
      phone: profileData.phone,
      metadata: profileData.metadata
    });
  }

  // Transition verification state to PENDING
  const newVerificationStatus = transitionVerificationState(
    user.verificationStatus,
    VerificationStatus.PENDING
  );
  await userRepo.updateVerificationStatus(userId, newVerificationStatus, null);

  await recordAuditEvent({
    actorUserId: userId,
    action: 'USER_ONBOARDING_SUBMITTED',
    resourceType: 'USER',
    resourceId: userId,
    metadata: {
      verificationStatus: newVerificationStatus,
      roles: user.roles
    }
  }).catch(() => {});

  return userRepo.findUserDetailById(userId);
}

/**
 * Admin action: Reviews a pending verification submission.
 * @param {object} params
 * @param {string} params.targetUserId
 * @param {'VERIFIED' | 'REJECTED'} params.decision
 * @param {string} [params.reviewNotes]
 * @param {string} params.actorUserId
 * @returns {Promise<object>}
 */
export async function reviewVerificationStatus({
  targetUserId,
  decision,
  reviewNotes = null,
  actorUserId
}) {
  if (!['VERIFIED', 'REJECTED'].includes(decision)) {
    throw new BadRequestError(`Invalid verification decision '${decision}'. Must be VERIFIED or REJECTED.`);
  }

  if (decision === 'REJECTED' && (!reviewNotes || typeof reviewNotes !== 'string' || reviewNotes.trim() === '')) {
    throw new BadRequestError('Mandatory review notes are required when rejecting an onboarding submission.');
  }

  const targetUser = await userRepo.findUserDetailById(targetUserId);
  if (!targetUser) {
    throw new NotFoundError(`User with ID '${targetUserId}' not found`);
  }

  const nextStatus = transitionVerificationState(targetUser.verificationStatus, decision);
  const updated = await userRepo.updateVerificationStatus(targetUserId, nextStatus, reviewNotes);

  await recordAuditEvent({
    actorUserId,
    action: `ADMIN_VERIFICATION_${decision}`,
    resourceType: 'USER',
    resourceId: targetUserId,
    metadata: {
      beforeStatus: targetUser.verificationStatus,
      afterStatus: nextStatus,
      reviewNotes
    }
  }).catch(() => {});

  return {
    userId: targetUserId,
    verificationStatus: updated.verification_status,
    verificationNotes: updated.verification_notes,
    verificationUpdatedAt: updated.verification_updated_at
  };
}

/**
 * Executes bulk Excel/CSV import.
 * @param {object} params
 * @param {Buffer} params.fileBuffer
 * @param {'STUDENT' | 'FACULTY'} [params.defaultRole='STUDENT']
 * @param {boolean} [params.atomic=false]
 * @param {string} params.actorUserId
 * @returns {Promise<object>}
 */
export async function bulkImportUsers({
  fileBuffer,
  defaultRole = 'STUDENT',
  atomic = false,
  actorUserId
}) {
  const { validRows, invalidRows, totalRows } = parseUserRoster(fileBuffer, { defaultRole });

  // If atomic mode and any invalid rows exist: fail entire import
  if (atomic && invalidRows.length > 0) {
    return {
      summary: {
        total: totalRows,
        created: 0,
        failed: invalidRows.length
      },
      errors: invalidRows,
      credentials: []
    };
  }

  const credentials = [];
  const errors = [...invalidRows];

  const pool = getPool();
  const client = await pool.connect();

  try {
    if (atomic) {
      await client.query('BEGIN');
    }

    for (const row of validRows) {
      // Check database duplicate email
      const existingEmail = await authRepo.findUserByEmail(row.email);
      if (existingEmail) {
        errors.push({
          rowNumber: row.rowNumber,
          data: row,
          error: `User with email '${row.email}' already exists in the system`
        });
        if (atomic) {
          throw new ConflictError(`Duplicate email '${row.email}' in atomic import`);
        }
        continue;
      }

      // Generate temporary password and hash
      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_SALT_ROUNDS);

      try {
        await userRepo.createMinimalUser(
          {
            name: row.name,
            email: row.email,
            phone: row.phone,
            passwordHash,
            role: row.role,
            identifier: row.identifier
          },
          atomic ? client : null
        );

        // Record credential ONLY for successfully committed row
        credentials.push({
          rowNumber: row.rowNumber,
          email: row.email,
          name: row.name,
          identifier: row.identifier,
          role: row.role,
          temporaryPassword
        });
      } catch (insertErr) {
        errors.push({
          rowNumber: row.rowNumber,
          data: row,
          error: insertErr.message
        });
        if (atomic) {
          throw insertErr;
        }
      }
    }

    if (atomic) {
      await client.query('COMMIT');
    }

    await recordAuditEvent({
      actorUserId,
      action: 'USER_BULK_IMPORT',
      resourceType: 'USER',
      resourceId: 'BULK',
      metadata: {
        totalRows,
        createdCount: credentials.length,
        failedCount: errors.length,
        atomic
      }
    }).catch(() => {});

    return {
      summary: {
        total: totalRows,
        created: credentials.length,
        failed: errors.length
      },
      errors,
      credentials
    };
  } catch (err) {
    if (atomic) {
      await client.query('ROLLBACK');
    }
    return {
      summary: {
        total: totalRows,
        created: 0,
        failed: totalRows
      },
      errors: [
        ...errors,
        {
          rowNumber: 0,
          data: {},
          error: `Atomic import aborted: ${err.message}`
        }
      ],
      credentials: []
    };
  } finally {
    client.release();
  }
}
