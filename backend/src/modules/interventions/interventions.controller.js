/**
 * @file interventions.controller.js
 * @description HTTP controllers for invigilator realtime interventions.
 * Conforms to Phase 26 Track 2 Workstream F.
 */

import { BadRequestError } from '../../utils/errors.js';
import {
  announcementSchema,
  candidateMessageSchema,
  pauseAttemptSchema,
  resumeAttemptSchema,
  terminateAttemptSchema,
  incidentReportSchema,
  sessionSignOffSchema
} from './interventions.schemas.js';
import * as interventionsService from './interventions.service.js';

export async function handleBroadcastAnnouncement(req, res, next) {
  try {
    const { sessionId } = req.params;
    const parseResult = announcementSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid announcement payload', parseResult.error.format());
    }

    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
    const intervention = await interventionsService.broadcastAnnouncement({
      sessionId,
      message: parseResult.data.message,
      metadata: parseResult.data.metadata,
      idempotencyKey,
      user: req.user
    });

    res.status(201).json({
      status: 'success',
      data: intervention
    });
  } catch (err) {
    next(err);
  }
}

export async function handleSendCandidateMessage(req, res, next) {
  try {
    const { attemptId } = req.params;
    const parseResult = candidateMessageSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid message payload', parseResult.error.format());
    }

    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
    const intervention = await interventionsService.sendCandidateMessage({
      attemptId,
      message: parseResult.data.message,
      reason: parseResult.data.reason,
      isWarning: parseResult.data.isWarning,
      metadata: parseResult.data.metadata,
      idempotencyKey,
      user: req.user
    });

    res.status(201).json({
      status: 'success',
      data: intervention
    });
  } catch (err) {
    next(err);
  }
}

export async function handlePauseAttempt(req, res, next) {
  try {
    const { attemptId } = req.params;
    const parseResult = pauseAttemptSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid pause payload', parseResult.error.format());
    }

    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
    const result = await interventionsService.pauseCandidateAttempt({
      attemptId,
      reason: parseResult.data.reason,
      metadata: parseResult.data.metadata,
      idempotencyKey,
      user: req.user
    });

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export async function handleResumeAttempt(req, res, next) {
  try {
    const { attemptId } = req.params;
    const parseResult = resumeAttemptSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid resume payload', parseResult.error.format());
    }

    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
    const result = await interventionsService.resumeCandidateAttempt({
      attemptId,
      reason: parseResult.data.reason,
      extensionSeconds: parseResult.data.extensionSeconds,
      metadata: parseResult.data.metadata,
      idempotencyKey,
      user: req.user
    });

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export async function handleTerminateAttempt(req, res, next) {
  try {
    const { attemptId } = req.params;
    const parseResult = terminateAttemptSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid terminate payload', parseResult.error.format());
    }

    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
    const result = await interventionsService.terminateCandidateAttempt({
      attemptId,
      reason: parseResult.data.reason,
      metadata: parseResult.data.metadata,
      idempotencyKey,
      user: req.user
    });

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetSessionInterventions(req, res, next) {
  try {
    const { sessionId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const history = await interventionsService.getSessionInterventions(sessionId, req.user, limit, offset);

    res.status(200).json({
      status: 'success',
      data: { interventions: history, count: history.length }
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetAttemptInterventions(req, res, next) {
  try {
    const { attemptId } = req.params;
    const history = await interventionsService.getAttemptInterventions(attemptId, req.user);

    res.status(200).json({
      status: 'success',
      data: { interventions: history, count: history.length }
    });
  } catch (err) {
    next(err);
  }
}

export async function handleReportIncident(req, res, next) {
  try {
    const { sessionId } = req.params;
    const parseResult = incidentReportSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid incident report payload', parseResult.error.format());
    }

    const flag = await interventionsService.reportSessionIncident({
      sessionId,
      attemptId: parseResult.data.attemptId,
      incidentType: parseResult.data.incidentType,
      severity: parseResult.data.severity,
      description: parseResult.data.description,
      evidenceIds: parseResult.data.evidenceIds,
      actionTaken: parseResult.data.actionTaken,
      metadata: parseResult.data.metadata,
      user: req.user
    });

    res.status(201).json({
      status: 'success',
      data: flag
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetSessionIncidents(req, res, next) {
  try {
    const { sessionId } = req.params;
    const incidents = await interventionsService.getSessionIncidents(sessionId, req.user);

    res.status(200).json({
      status: 'success',
      data: { incidents, count: incidents.length }
    });
  } catch (err) {
    next(err);
  }
}

export async function handleSignOffSession(req, res, next) {
  try {
    const { sessionId } = req.params;
    const parseResult = sessionSignOffSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError('Invalid sign-off payload', parseResult.error.format());
    }

    const result = await interventionsService.signOffSession({
      sessionId,
      checklist: parseResult.data.checklist,
      notes: parseResult.data.notes,
      signature: parseResult.data.signature,
      user: req.user
    });

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetSessionSignOffStatus(req, res, next) {
  try {
    const { sessionId } = req.params;
    const status = await interventionsService.getSessionSignOffStatus(sessionId, req.user);

    res.status(200).json({
      status: 'success',
      data: status
    });
  } catch (err) {
    next(err);
  }
}

