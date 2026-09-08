/**
 * @file OrganizationSettingsPage.jsx
 * @description Institutional settings and security policy configuration dashboard.
 * Conforms directly to the authoritative organization_settings backend schema.
 */

import React, { useState, useEffect } from 'react';
import * as adminUsersApi from '../../api/adminUsersApi.js';
import { Button } from '../../components/common/Button.jsx';
import { Card } from '../../components/common/Card.jsx';
import { Input } from '../../components/common/Input.jsx';
import { Alert } from '../../components/common/Alert.jsx';
import { Badge } from '../../components/common/Badge.jsx';

export function OrganizationSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Authoritative Backend Form Fields
  const [institutionName, setInstitutionName] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [allowedDomains, setAllowedDomains] = useState('');
  const [minLength, setMinLength] = useState('8');
  const [maxFailedAttempts, setMaxFailedAttempts] = useState('5');
  const [lockoutDurationMinutes, setLockoutDurationMinutes] = useState('15');
  const [accessTokenTtlMinutes, setAccessTokenTtlMinutes] = useState('15');
  const [refreshTokenTtlDays, setRefreshTokenTtlDays] = useState('7');

  const populateFields = (data) => {
    if (!data) return;
    setInstitutionName(data.institutionName || '');
    setSupportEmail(data.supportEmail || '');
    setAllowedDomains(Array.isArray(data.allowedDomains) ? data.allowedDomains.join(', ') : '');
    setMinLength(String(data.passwordPolicy?.minLength || 8));
    setMaxFailedAttempts(String(data.passwordPolicy?.maxFailedAttempts || 5));
    setLockoutDurationMinutes(String(data.passwordPolicy?.lockoutDurationMinutes || 15));
    setAccessTokenTtlMinutes(String(data.sessionPolicy?.accessTokenTtlMinutes || 15));
    setRefreshTokenTtlDays(String(data.sessionPolicy?.refreshTokenTtlDays || 7));
  };

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      setError(null);
      try {
        const data = await adminUsersApi.fetchOrganizationSettings();
        setSettings(data);
        populateFields(data);
      } catch (err) {
        setError(err?.message || 'Failed to load organization settings');
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const updated = await adminUsersApi.updateOrganizationSettings({
        institutionName: institutionName.trim(),
        supportEmail: supportEmail.trim(),
        allowedDomains: allowedDomains
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean),
        passwordPolicy: {
          minLength: parseInt(minLength, 10) || 8,
          maxFailedAttempts: parseInt(maxFailedAttempts, 10) || 5,
          lockoutDurationMinutes: parseInt(lockoutDurationMinutes, 10) || 15
        },
        sessionPolicy: {
          accessTokenTtlMinutes: parseInt(accessTokenTtlMinutes, 10) || 15,
          refreshTokenTtlDays: parseInt(refreshTokenTtlDays, 10) || 7
        },
        featureFlags: {
          allowSelfRegistration: false, // Authoritative invariant: Self-registration strictly forbidden
          requireVerificationBeforeExam: true
        }
      });

      setSettings(updated);
      populateFields(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--color-text-muted)' }}>Loading institutional configuration...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 'var(--space-xl)', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--color-text-base)' }}>
          Institutional & Security Settings
        </h1>
        <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 0 0', fontSize: '0.875rem' }}>
          Configure university identity, authentication rate limits, and access governance policies.
        </p>
      </div>

      {error && <Alert variant="danger" style={{ marginBottom: 'var(--space-md)' }}>{error}</Alert>}
      {success && <Alert variant="success" style={{ marginBottom: 'var(--space-md)' }}>Settings saved successfully.</Alert>}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        {/* Institutional Identity Card */}
        <Card style={{ padding: 'var(--space-xl)' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 var(--space-md) 0' }}>
            Institution Profile
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <Input
              id="inst-name"
              label="Institution Name"
              required
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
              <Input
                id="inst-email"
                label="Institutional Support Email"
                type="email"
                required
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
              />
              <Input
                id="inst-domains"
                label="Allowed Email Domains (comma separated)"
                placeholder="university.edu, college.edu"
                value={allowedDomains}
                onChange={(e) => setAllowedDomains(e.target.value)}
              />
            </div>
          </div>
        </Card>

        {/* Security & Authentication Policies */}
        <Card style={{ padding: 'var(--space-xl)' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 var(--space-md) 0' }}>
            Password & Lockout Policy
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
            <Input
              id="min-length"
              label="Min Password Length"
              type="number"
              min="8"
              max="64"
              value={minLength}
              onChange={(e) => setMinLength(e.target.value)}
            />
            <Input
              id="max-login-attempts"
              label="Max Failed Attempts"
              type="number"
              min="3"
              max="20"
              value={maxFailedAttempts}
              onChange={(e) => setMaxFailedAttempts(e.target.value)}
            />
            <Input
              id="lockout-duration"
              label="Lockout Duration (mins)"
              type="number"
              min="5"
              max="1440"
              value={lockoutDurationMinutes}
              onChange={(e) => setLockoutDurationMinutes(e.target.value)}
            />
          </div>

          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 'var(--space-md) 0' }}>
            Session Policies
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
            <Input
              id="access-token-ttl"
              label="Access Token TTL (mins)"
              type="number"
              min="5"
              max="1440"
              value={accessTokenTtlMinutes}
              onChange={(e) => setAccessTokenTtlMinutes(e.target.value)}
            />
            <Input
              id="refresh-token-ttl"
              label="Refresh Token TTL (days)"
              type="number"
              min="1"
              max="90"
              value={refreshTokenTtlDays}
              onChange={(e) => setRefreshTokenTtlDays(e.target.value)}
            />
          </div>

          {/* Registration Policy Notice */}
          <div style={{
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-md)',
            fontSize: '0.8125rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Public Self-Registration:</strong>
                <div style={{ color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  Student and Faculty accounts must be provisioned exclusively by administrators or via verified bulk roster ingestion.
                </div>
              </div>
              <Badge variant="neutral">DISABLED (LOCKED)</Badge>
            </div>
          </div>
        </Card>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="submit" variant="primary" loading={saving}>
            Save Configuration
          </Button>
        </div>
      </form>
    </div>
  );
}
