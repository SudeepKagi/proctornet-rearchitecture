/**
 * @file OrganizationSettingsPage.jsx
 * @description Institutional settings and security policy configuration dashboard.
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

  // Form fields
  const [institutionName, setInstitutionName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [maxLoginAttempts, setMaxLoginAttempts] = useState('5');
  const [lockoutDurationMinutes, setLockoutDurationMinutes] = useState('15');
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState('60');

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      setError(null);
      try {
        const data = await adminUsersApi.fetchOrganizationSettings();
        setSettings(data);
        if (data) {
          setInstitutionName(data.institutionName || '');
          setContactEmail(data.contactEmail || '');
          setContactPhone(data.contactPhone || '');
          setTimezone(data.timezone || 'UTC');
          setMaxLoginAttempts(String(data.securityPolicies?.maxLoginAttempts || 5));
          setLockoutDurationMinutes(String(data.securityPolicies?.lockoutDurationMinutes || 15));
          setSessionTimeoutMinutes(String(data.securityPolicies?.sessionTimeoutMinutes || 60));
        }
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
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(),
        timezone,
        allowSelfRegistration: false, // Authoritative invariant: Self-registration cannot be enabled
        securityPolicies: {
          maxLoginAttempts: parseInt(maxLoginAttempts, 10) || 5,
          lockoutDurationMinutes: parseInt(lockoutDurationMinutes, 10) || 15,
          sessionTimeoutMinutes: parseInt(sessionTimeoutMinutes, 10) || 60
        }
      });
      setSettings(updated);
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
                label="Registrar Contact Email"
                type="email"
                required
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
              <Input
                id="inst-phone"
                label="Registrar Contact Phone"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
                Default Timezone
              </label>
              <Input
                id="inst-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </div>
          </div>
        </Card>

        {/* Security & Access Policies */}
        <Card style={{ padding: 'var(--space-xl)' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 var(--space-md) 0' }}>
            Security & Authentication Policies
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
            <Input
              id="max-login-attempts"
              label="Max Failed Attempts"
              type="number"
              min="3"
              max="20"
              value={maxLoginAttempts}
              onChange={(e) => setMaxLoginAttempts(e.target.value)}
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
            <Input
              id="session-timeout"
              label="Session Timeout (mins)"
              type="number"
              min="15"
              max="10080"
              value={sessionTimeoutMinutes}
              onChange={(e) => setSessionTimeoutMinutes(e.target.value)}
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
