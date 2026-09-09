/**
 * @file studentConfig.controller.js
 * @description HTTP controllers for administrative student accommodations and configuration management.
 */

import * as studentConfigService from './studentConfig.service.js';

/**
 * GET /api/v1/admin/students/:id/configuration
 */
export async function handleGetStudentConfiguration(req, res, next) {
  try {
    const config = await studentConfigService.getStudentConfiguration(req.params.id);
    res.json(config);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/admin/students/:id/configuration
 */
export async function handleUpdateStudentConfiguration(req, res, next) {
  try {
    const {
      extraTimeMultiplier,
      breakAllowanceMinutes,
      maxBreaksAllowed,
      assistiveTechnology,
      proctoringStrictness
    } = req.body;

    const updated = await studentConfigService.updateStudentConfiguration({
      studentId: req.params.id,
      extraTimeMultiplier,
      breakAllowanceMinutes,
      maxBreaksAllowed,
      assistiveTechnology,
      proctoringStrictness,
      actorUserId: req.user.userId
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}
