/**
 * @file developer.routes.js
 * @description Express routes for Developer Operations control plane.
 * Strictly gated by authenticate and requireRole('DEVELOPER').
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import * as controller from './developer.controller.js';

export const developerRouter = Router();

// Gated strictly for authenticated DEVELOPER role
developerRouter.use(authenticate, requireRole('DEVELOPER'));

// 1. Overview
developerRouter.get('/overview', controller.getOverview);

// 2. Health Monitor (all probes or individual probe)
developerRouter.get('/health', controller.getHealth);
developerRouter.get('/health/:component', controller.getHealthComponent);

// 3. Centralized System Logs Viewer
developerRouter.get('/logs', controller.getLogs);

// 4. Technical Audit Stream
developerRouter.get('/audit', controller.getAudit);

// 5. Infrastructure Topology Map
developerRouter.get('/topology', controller.getTopology);

// 6. Incident Triage & Alerts
developerRouter.get('/incidents', controller.getIncidents);
developerRouter.post('/incidents/:id/acknowledge', controller.acknowledgeIncident);
developerRouter.post('/incidents/:id/resolve', controller.resolveIncident);
