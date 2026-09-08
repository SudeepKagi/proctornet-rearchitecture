/**
 * @file orgSettings.service.js
 * @description Service for managing platform-wide organization settings and auditing modifications.
 */

import * as orgRepo from './orgSettings.repository.js';
import { recordAuditEvent } from '../audit/audit.service.js';

/**
 * Retrieves the current organization settings.
 * @returns {Promise<object>}
 */
export async function fetchOrganizationSettings() {
  return orgRepo.getOrganizationSettings();
}

/**
 * Updates organization settings and records an audit log event.
 * @param {object} newSettings
 * @param {string} actorUserId
 * @returns {Promise<object>}
 */
export async function saveOrganizationSettings(newSettings, actorUserId) {
  const previous = await orgRepo.getOrganizationSettings();
  const updated = await orgRepo.updateOrganizationSettings(newSettings, actorUserId);

  await recordAuditEvent({
    actorUserId,
    action: 'ORGANIZATION_SETTINGS_UPDATED',
    resourceType: 'ORGANIZATION',
    resourceId: updated.settingId || 'SYSTEM',
    metadata: {
      before: previous,
      after: updated
    }
  }).catch(() => {});

  return updated;
}
