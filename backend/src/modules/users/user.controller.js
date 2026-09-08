/**
 * @file user.controller.js
 * @description Express controller handling administrative user mutations and self-service onboarding flows.
 */

import * as userService from './user.service.js';
import * as userRepo from './user.repository.js';
import * as orgSettingsService from './orgSettings.service.js';
import { parseUserRoster } from './excelParser.service.js';
import {
  createUserSchema,
  updateUserStatusSchema,
  updateVerificationSchema,
  firstLoginPasswordSchema,
  onboardingProfileSchema,
  updateUserProfileSchema,
  assignRoleSchema
} from './user.schemas.js';
import { BadRequestError } from '../../utils/errors.js';

// ==========================================
// Administrative Handlers
// ==========================================

export async function handleListUsers(req, res, next) {
  try {
    const result = await userService.listUsers(req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function handleCreateSingleUser(req, res, next) {
  try {
    const validated = createUserSchema.parse(req.body);
    const result = await userService.createSingleUser({
      ...validated,
      actorUserId: req.user.userId
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function handleGetUserDetail(req, res, next) {
  try {
    const user = await userService.getUserDetail(req.params.id);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateUserProfile(req, res, next) {
  try {
    const validated = updateUserProfileSchema.parse(req.body);
    const updated = await userRepo.updateUserProfile(req.params.id, validated);
    res.status(200).json({ user: updated });
  } catch (err) {
    next(err);
  }
}

export async function handleChangeUserStatus(req, res, next) {
  try {
    const validated = updateUserStatusSchema.parse(req.body);
    const result = await userService.changeAccountStatus({
      targetUserId: req.params.id,
      newStatus: validated.status,
      reason: validated.reason,
      actorUserId: req.user.userId
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function handleResetPassword(req, res, next) {
  try {
    const result = await userService.resetPassword({
      targetUserId: req.params.id,
      actorUserId: req.user.userId
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function handleUnlockUser(req, res, next) {
  try {
    const result = await userService.unlockUserAccount({
      targetUserId: req.params.id,
      actorUserId: req.user.userId
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function handleAssignRole(req, res, next) {
  try {
    const validated = assignRoleSchema.parse(req.body);
    const updated = await userService.assignRoleToUser({
      targetUserId: req.params.id,
      role: validated.role,
      actorUserId: req.user.userId
    });
    res.status(200).json({ user: updated });
  } catch (err) {
    next(err);
  }
}

export async function handleRevokeRole(req, res, next) {
  try {
    const role = req.params.role;
    const updated = await userService.revokeRoleFromUser({
      targetUserId: req.params.id,
      role,
      actorUserId: req.user.userId
    });
    res.status(200).json({ user: updated });
  } catch (err) {
    next(err);
  }
}

export async function handleRevokeSessions(req, res, next) {
  try {
    const result = await userService.revokeUserSessions({
      targetUserId: req.params.id,
      actorUserId: req.user.userId
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function handleReviewVerification(req, res, next) {
  try {
    const validated = updateVerificationSchema.parse(req.body);
    const result = await userService.reviewVerificationStatus({
      targetUserId: req.params.id,
      decision: validated.verificationStatus,
      reviewNotes: validated.reviewNotes,
      actorUserId: req.user.userId
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function handleGetVerificationQueue(req, res, next) {
  try {
    const query = {
      ...req.query,
      verification_status: req.query.verification_status || 'PENDING'
    };
    const result = await userService.listUsers(query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function handleBulkImportPreview(req, res, next) {
  try {
    if (!req.file || !req.file.buffer) {
      throw new BadRequestError('Spreadsheet file is required (.xlsx, .xls, .csv)');
    }
    const defaultRole = req.body.defaultRole || 'STUDENT';
    const analysis = parseUserRoster(req.file.buffer, { defaultRole });
    res.status(200).json(analysis);
  } catch (err) {
    next(err);
  }
}

export async function handleBulkImport(req, res, next) {
  try {
    if (!req.file || !req.file.buffer) {
      throw new BadRequestError('Spreadsheet file is required (.xlsx, .xls, .csv)');
    }
    const defaultRole = req.body.defaultRole || 'STUDENT';
    const atomic = req.body.atomic === 'true' || req.body.atomic === true;

    const result = await userService.bulkImportUsers({
      fileBuffer: req.file.buffer,
      defaultRole,
      atomic,
      actorUserId: req.user.userId
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function handleGetOrganizationSettings(_req, res, next) {
  try {
    const settings = await orgSettingsService.fetchOrganizationSettings();
    res.status(200).json({ settings });
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateOrganizationSettings(req, res, next) {
  try {
    const settings = await orgSettingsService.saveOrganizationSettings(
      req.body,
      req.user.userId
    );
    res.status(200).json({ settings });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// User Self-Service Handlers
// ==========================================

export async function handleGetOnboardingStatus(req, res, next) {
  try {
    const user = await userService.getUserDetail(req.user.userId);
    res.status(200).json({
      userId: user.userId,
      name: user.name,
      email: user.email,
      phone: user.phone,
      roles: user.roles,
      accountStatus: user.status,
      verificationStatus: user.verificationStatus,
      verificationNotes: user.verificationNotes,
      mustChangePassword: user.mustChangePassword,
      identifier: user.identifier,
      department: user.department,
      semester: user.semester,
      designation: user.designation,
      studentProfile: user.studentProfile,
      facultyProfile: user.facultyProfile
    });
  } catch (err) {
    next(err);
  }
}

export async function handleChangeFirstLoginPassword(req, res, next) {
  try {
    const validated = firstLoginPasswordSchema.parse(req.body);
    const result = await userService.changeFirstLoginPassword({
      userId: req.user.userId,
      currentPassword: validated.currentPassword,
      newPassword: validated.newPassword
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function handleSubmitOnboarding(req, res, next) {
  try {
    const validated = onboardingProfileSchema.parse(req.body);
    const user = await userService.submitOnboardingProfile({
      userId: req.user.userId,
      profileData: validated
    });
    res.status(200).json({
      user,
      message: 'Onboarding profile submitted successfully. Awaiting administrative review.'
    });
  } catch (err) {
    next(err);
  }
}
