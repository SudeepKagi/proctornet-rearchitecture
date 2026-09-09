/**
 * @file developer.controller.js
 * @description Request handlers for Developer Operations control plane.
 */

import * as developerService from './developer.service.js';
import * as incidentService from './incidentService.js';
import {
  logQuerySchema,
  auditQuerySchema,
  incidentActionSchema,
  componentParamSchema
} from './developer.schemas.js';

export async function getOverview(_req, res, next) {
  try {
    const overview = await developerService.getOverview();
    res.status(200).json({ success: true, data: overview });
  } catch (err) {
    next(err);
  }
}

export async function getHealth(req, res, next) {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const health = await developerService.getHealth(null, forceRefresh);
    res.status(200).json({ success: true, data: health });
  } catch (err) {
    next(err);
  }
}

export async function getHealthComponent(req, res, next) {
  try {
    const { component } = componentParamSchema.parse(req.params);
    const forceRefresh = req.query.refresh === 'true';
    const health = await developerService.getHealth(component, forceRefresh);
    res.status(200).json({ success: true, data: health });
  } catch (err) {
    next(err);
  }
}

export function getLogs(req, res, next) {
  try {
    const query = logQuerySchema.parse(req.query);
    const logs = developerService.getLogs(query);
    res.status(200).json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
}

export async function getAudit(req, res, next) {
  try {
    const query = auditQuerySchema.parse(req.query);
    const auditFeed = await developerService.getAuditFeed(query, req.user);
    res.status(200).json({ success: true, data: auditFeed });
  } catch (err) {
    next(err);
  }
}

export async function getTopology(_req, res, next) {
  try {
    const topology = await developerService.getTopology();
    res.status(200).json({ success: true, data: topology });
  } catch (err) {
    next(err);
  }
}

export function getIncidents(req, res, next) {
  try {
    const { status, component, limit } = req.query;
    const incidents = incidentService.listIncidents({
      status,
      component,
      limit: limit ? parseInt(limit, 10) : 50
    });
    res.status(200).json({ success: true, data: { incidents } });
  } catch (err) {
    next(err);
  }
}

export async function acknowledgeIncident(req, res, next) {
  try {
    const { id } = req.params;
    const { notes } = incidentActionSchema.parse(req.body || {});
    const incident = await incidentService.acknowledgeIncident(id, req.user, notes);
    res.status(200).json({ success: true, data: { incident } });
  } catch (err) {
    next(err);
  }
}

export async function resolveIncident(req, res, next) {
  try {
    const { id } = req.params;
    const { notes } = incidentActionSchema.parse(req.body || {});
    const incident = await incidentService.resolveIncident(id, req.user, notes);
    res.status(200).json({ success: true, data: { incident } });
  } catch (err) {
    next(err);
  }
}
