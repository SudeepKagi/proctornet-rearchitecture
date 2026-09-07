/**
 * @file audit.controller.js
 * @description HTTP REST Controller for Audit Log Inspection.
 * Conforms to Step 13.5 and Phase 13 specifications.
 */

import * as auditService from './audit.service.js';

/**
 * Handles GET /api/v1/audit-logs
 * Retrieves paginated audit logs with optional filters.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function handleGetAuditLogs(req, res, next) {
  try {
    const filters = {
      actor_user_id: req.query.actor_user_id,
      action: req.query.action,
      resource_type: req.query.resource_type,
      resource_id: req.query.resource_id,
      attempt_id: req.query.attempt_id,
      start_date: req.query.start_date,
      end_date: req.query.end_date,
      page: req.query.page,
      limit: req.query.limit
    };

    const result = await auditService.queryAuditLogs(filters, req.user);

    return res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (err) {
    return next(err);
  }
}
