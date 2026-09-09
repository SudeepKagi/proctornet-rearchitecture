/**
 * @file manualGrading.controller.js
 * @description HTTP Controllers for Manual Grading and Score Override endpoints.
 * Conforms to Phase 26 Track 1 Workstream C.
 */

import * as manualGradingService from './manualGrading.service.js';
import { submitManualGradeSchema } from './manualGrading.schemas.js';

export async function handleGetEvaluation(req, res, next) {
  try {
    const { resultId } = req.params;
    const evaluation = await manualGradingService.getEvaluation(resultId, req.user.user_id, req.user.role);
    res.status(200).json({ success: true, data: evaluation });
  } catch (err) {
    next(err);
  }
}

export async function handleSubmitGrade(req, res, next) {
  try {
    const { resultId } = req.params;
    const validated = submitManualGradeSchema.parse(req.body);
    const result = await manualGradingService.submitManualGrade(
      resultId,
      validated,
      req.user.user_id,
      req.user.role,
      req.ip
    );
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function handleGetAudits(req, res, next) {
  try {
    const { resultId } = req.params;
    const audits = await manualGradingService.getAuditHistory(resultId, req.user.user_id, req.user.role);
    res.status(200).json({ success: true, data: audits });
  } catch (err) {
    next(err);
  }
}
