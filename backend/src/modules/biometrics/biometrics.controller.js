/**
 * @file biometrics.controller.js
 * @description HTTP controllers for candidate and admin biometric endpoints.
 */

import * as biometricsService from './biometrics.service.js';
import {
  enrollUrlSchema,
  enrollConfirmSchema,
  livenessChallengeSchema,
  verifyLivenessSchema,
  verifyImageUrlSchema,
  verifyFaceSchema,
  adminOverrideSchema,
  adminSessionVerificationsQuerySchema
} from './biometrics.schemas.js';

export async function requestEnrollUrlHandler(req, res, next) {
  try {
    const validated = enrollUrlSchema.parse(req.body);
    const result = await biometricsService.requestEnrollmentUploadUrl({
      userId: req.user.userId,
      ...validated
    });
    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function confirmEnrollHandler(req, res, next) {
  try {
    const validated = enrollConfirmSchema.parse(req.body);
    const result = await biometricsService.confirmEnrollment({
      userId: req.user.userId,
      biometricId: validated.biometricId
    });
    return res.status(202).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getEnrollmentStatusHandler(req, res, next) {
  try {
    const result = await biometricsService.getEnrollmentStatus(req.user.userId);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function requestLivenessChallengeHandler(req, res, next) {
  try {
    const validated = livenessChallengeSchema.parse(req.body);
    const result = await biometricsService.requestLivenessChallenge({
      userId: req.user.userId,
      sessionId: validated.sessionId
    });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function verifyLivenessHandler(req, res, next) {
  try {
    const validated = verifyLivenessSchema.parse(req.body);
    const result = await biometricsService.verifyLiveness({
      userId: req.user.userId,
      challengeId: validated.challengeId,
      nonce: validated.nonce,
      sessionId: validated.sessionId
    });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function requestVerificationImageUrlHandler(req, res, next) {
  try {
    const validated = verifyImageUrlSchema.parse(req.body);
    const result = await biometricsService.requestVerificationImageUrl({
      userId: req.user.userId,
      ...validated
    });
    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function verifyFaceHandler(req, res, next) {
  try {
    const validated = verifyFaceSchema.parse(req.body);
    const result = await biometricsService.verifyFace({
      userId: req.user.userId,
      liveImageId: validated.liveImageId,
      livenessToken: validated.livenessToken
    });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function adminOverrideHandler(req, res, next) {
  try {
    const validated = adminOverrideSchema.parse(req.body);
    const result = await biometricsService.adminOverrideVerification({
      adminUserId: req.user.userId,
      sessionId: validated.sessionId,
      studentId: validated.studentId,
      reason: validated.reason
    });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getSessionVerificationsHandler(req, res, next) {
  try {
    const query = adminSessionVerificationsQuerySchema.parse(req.query);
    const result = await biometricsService.getSessionVerifications({
      sessionId: req.params.sessionId,
      page: query.page,
      limit: query.limit,
      status: query.status
    });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}
