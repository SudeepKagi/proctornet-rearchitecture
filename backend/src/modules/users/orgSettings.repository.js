/**
 * @file orgSettings.repository.js
 * @description PostgreSQL data access repository for institutional settings and policies.
 */

import { query } from '../../infrastructure/postgres/pool.js';

/**
 * Retrieves the institutional configuration record.
 * @returns {Promise<object>}
 */
export async function getOrganizationSettings() {
  const sql = `
    SELECT 
      setting_id,
      institution_name,
      support_email,
      allowed_domains,
      password_policy,
      session_policy,
      feature_flags,
      updated_by,
      updated_at
    FROM organization_settings
    ORDER BY updated_at DESC
    LIMIT 1;
  `;
  const res = await query(sql);
  const row = res.rows[0];

  if (!row) {
    return {
      institutionName: 'ProctorNet University',
      supportEmail: 'admin@proctornet.edu',
      allowedDomains: [],
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumber: true,
        requireSpecial: true,
        maxFailedAttempts: 5,
        lockoutDurationMinutes: 15
      },
      sessionPolicy: {
        accessTokenTtlMinutes: 15,
        refreshTokenTtlDays: 7,
        enforceSingleActiveSession: false
      },
      featureFlags: {
        allowSelfRegistration: false,
        requireVerificationBeforeExam: true
      },
      updatedAt: new Date().toISOString()
    };
  }

  return {
    settingId: row.setting_id,
    institutionName: row.institution_name,
    supportEmail: row.support_email,
    allowedDomains: row.allowed_domains || [],
    passwordPolicy: row.password_policy || {},
    sessionPolicy: row.session_policy || {},
    featureFlags: row.feature_flags || {},
    updatedBy: row.updated_by,
    updatedAt: row.updated_at
  };
}

/**
 * Updates the institutional configuration record.
 * @param {object} settings
 * @param {string} [actorUserId]
 * @returns {Promise<object>}
 */
export async function updateOrganizationSettings(settings, actorUserId = null) {
  const current = await getOrganizationSettings();

  const institutionName = settings.institutionName || current.institutionName;
  const supportEmail = settings.supportEmail || current.supportEmail;
  const allowedDomains = Array.isArray(settings.allowedDomains)
    ? settings.allowedDomains
    : current.allowedDomains;
  const passwordPolicy = { ...current.passwordPolicy, ...(settings.passwordPolicy || {}) };
  const sessionPolicy = { ...current.sessionPolicy, ...(settings.sessionPolicy || {}) };
  // Enforce invariant: allowSelfRegistration is FALSE by default and cannot bypass admin creation
  const featureFlags = {
    ...current.featureFlags,
    ...(settings.featureFlags || {}),
    allowSelfRegistration: false // Invariant: Student/Faculty self-registration forbidden
  };

  const sql = `
    UPDATE organization_settings
    SET institution_name = $1,
        support_email = $2,
        allowed_domains = $3,
        password_policy = $4,
        session_policy = $5,
        feature_flags = $6,
        updated_by = $7,
        updated_at = CURRENT_TIMESTAMP
    WHERE setting_id = (SELECT setting_id FROM organization_settings LIMIT 1)
    RETURNING *;
  `;

  const res = await query(sql, [
    institutionName,
    supportEmail,
    allowedDomains,
    JSON.stringify(passwordPolicy),
    JSON.stringify(sessionPolicy),
    JSON.stringify(featureFlags),
    actorUserId
  ]);

  const row = res.rows[0];
  return {
    settingId: row.setting_id,
    institutionName: row.institution_name,
    supportEmail: row.support_email,
    allowedDomains: row.allowed_domains,
    passwordPolicy: row.password_policy,
    sessionPolicy: row.session_policy,
    featureFlags: row.feature_flags,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at
  };
}
