/**
 * @file studentConfig.service.js
 * @description Service for managing per-student accommodations and proctoring strictness configuration.
 * Enforces admin authorization, bounds validation, and immutable audit logging.
 */

import * as studentConfigRepo from './studentConfig.repository.js';
import * as candidateIdentityRepo from './candidateIdentity.repository.js';
import {
  assertValidTimeMultiplier,
  assertValidBreakAllowance,
  assertValidProctoringStrictness,
  assertValidAssistiveTechnology
} from '../../domain/student/studentConfigInvariants.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { NotFoundError } from '../../utils/errors.js';

/**
 * Retrieves per-student configuration or returns authoritative defaults if unconfigured.
 * @param {string} studentId
 * @returns {Promise<object>}
 */
export async function getStudentConfiguration(studentId) {
  const profile = await candidateIdentityRepo.findStudentProfile(studentId);
  if (!profile) {
    throw new NotFoundError(`Student '${studentId}' not found`);
  }

  const config = await studentConfigRepo.findConfigurationByStudentId(studentId);
  if (!config) {
    return {
      studentId,
      extraTimeMultiplier: 1.00,
      breakAllowanceMinutes: 0,
      maxBreaksAllowed: 0,
      assistiveTechnology: { screenReader: false, speechToText: false, keyboardOnly: false },
      proctoringStrictness: 'STANDARD',
      isConfigured: false
    };
  }

  return {
    studentId: config.student_id,
    extraTimeMultiplier: Number(config.extra_time_multiplier),
    breakAllowanceMinutes: config.break_allowance_minutes,
    maxBreaksAllowed: config.max_breaks_allowed,
    assistiveTechnology: config.assistive_technology,
    proctoringStrictness: config.proctoring_strictness,
    createdAt: config.created_at,
    updatedAt: config.updated_at,
    isConfigured: true
  };
}

/**
 * Administrative: Creates or updates a student's accommodation and proctoring settings.
 * @param {object} params
 * @param {string} params.studentId
 * @param {number} [params.extraTimeMultiplier=1.00]
 * @param {number} [params.breakAllowanceMinutes=0]
 * @param {number} [params.maxBreaksAllowed=0]
 * @param {object} [params.assistiveTechnology]
 * @param {string} [params.proctoringStrictness='STANDARD']
 * @param {string} params.actorUserId
 * @returns {Promise<object>}
 */
export async function updateStudentConfiguration({
  studentId,
  extraTimeMultiplier = 1.00,
  breakAllowanceMinutes = 0,
  maxBreaksAllowed = 0,
  assistiveTechnology = { screenReader: false, speechToText: false, keyboardOnly: false },
  proctoringStrictness = 'STANDARD',
  actorUserId
}) {
  const profile = await candidateIdentityRepo.findStudentProfile(studentId);
  if (!profile) {
    throw new NotFoundError(`Student '${studentId}' not found`);
  }

  assertValidTimeMultiplier(extraTimeMultiplier);
  assertValidBreakAllowance(breakAllowanceMinutes, maxBreaksAllowed);
  assertValidProctoringStrictness(proctoringStrictness);
  assertValidAssistiveTechnology(assistiveTechnology);

  const updated = await studentConfigRepo.upsertConfiguration({
    studentId,
    extraTimeMultiplier,
    breakAllowanceMinutes,
    maxBreaksAllowed,
    assistiveTechnology,
    proctoringStrictness,
    actorUserId
  });

  await recordAuditEvent({
    actorUserId,
    action: 'STUDENT_CONFIGURATION_UPDATED',
    resourceType: 'STUDENT_CONFIGURATION',
    resourceId: studentId,
    metadata: {
      extraTimeMultiplier,
      breakAllowanceMinutes,
      maxBreaksAllowed,
      proctoringStrictness
    }
  }).catch(() => {});

  return {
    studentId: updated.student_id,
    extraTimeMultiplier: Number(updated.extra_time_multiplier),
    breakAllowanceMinutes: updated.break_allowance_minutes,
    maxBreaksAllowed: updated.max_breaks_allowed,
    assistiveTechnology: updated.assistive_technology,
    proctoringStrictness: updated.proctoring_strictness,
    updatedAt: updated.updated_at
  };
}
