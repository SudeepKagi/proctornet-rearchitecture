/**
 * @file OrganizationSettingsPage.jsx
 * @description Institutional settings and security policy configuration dashboard.
 * Conforms directly to the authoritative organization_settings backend schema.
 */

import React, { useState, useEffect, useCallback } from 'react';
import * as adminUsersApi from '../../api/adminUsersApi.js';
import { StateBoundary } from '@/components/common/StateBoundary.jsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Settings,
  Building2,
  ShieldCheck,
  Lock,
  Clock,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  ShieldAlert,
} from 'lucide-react';

export function OrganizationSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);
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

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminUsersApi.fetchOrganizationSettings();
      setSettings(data);
      populateFields(data);
    } catch (err) {
      setError(err?.data || err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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
          lockoutDurationMinutes: parseInt(lockoutDurationMinutes, 10) || 15,
        },
        sessionPolicy: {
          accessTokenTtlMinutes: parseInt(accessTokenTtlMinutes, 10) || 15,
          refreshTokenTtlDays: parseInt(refreshTokenTtlDays, 10) || 7,
        },
        featureFlags: {
          allowSelfRegistration: false, // Invariant: Self-registration strictly forbidden
          requireVerificationBeforeExam: true,
        },
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

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Settings className="h-7 w-7 text-primary" />
          Institutional & Security Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure university identity, authentication rate limits, and access governance policies.
        </p>
      </div>

      <StateBoundary
        isLoading={loading}
        error={error}
        isEmpty={!settings}
        emptyTitle="Institutional Settings Unavailable"
        emptyDescription="Unable to load configuration profiles from the server."
        onRetry={loadSettings}
      >
        {saveError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Configuration Error</AlertTitle>
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-4 border-emerald-500 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>Institutional settings and policies successfully saved.</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSave} className="space-y-6">
        {/* Institutional Profile */}
        <Card className="shadow-xs border-border/80">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Institutional Profile</CardTitle>
            </div>
            <CardDescription>
              Legal organization identity displayed across candidate portals and official certificates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="inst-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Institution Name *
              </label>
              <Input
                id="inst-name"
                required
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="inst-email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Support Email Address *
                </label>
                <Input
                  id="inst-email"
                  type="email"
                  required
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="inst-domains" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Allowed Email Domains (CSV)
                </label>
                <Input
                  id="inst-domains"
                  placeholder="university.edu, college.edu"
                  value={allowedDomains}
                  onChange={(e) => setAllowedDomains(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security & Authentication Policies */}
        <Card className="shadow-xs border-border/80">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Password & Lockout Policy</CardTitle>
            </div>
            <CardDescription>
              Enforce cryptographic complexity and brute-force lockouts across all accounts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="min-length" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Min Password Length
                </label>
                <Input
                  id="min-length"
                  type="number"
                  min="8"
                  max="64"
                  value={minLength}
                  onChange={(e) => setMinLength(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="max-login-attempts" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Max Failed Attempts
                </label>
                <Input
                  id="max-login-attempts"
                  type="number"
                  min="3"
                  max="20"
                  value={maxFailedAttempts}
                  onChange={(e) => setMaxFailedAttempts(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="lockout-duration" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Lockout Duration (mins)
                </label>
                <Input
                  id="lockout-duration"
                  type="number"
                  min="5"
                  max="1440"
                  value={lockoutDurationMinutes}
                  onChange={(e) => setLockoutDurationMinutes(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
            </div>

            <div className="border-t border-border/60 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-primary" />
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Session Token Policies
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="access-token-ttl" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Access Token TTL (mins)
                  </label>
                  <Input
                    id="access-token-ttl"
                    type="number"
                    min="5"
                    max="1440"
                    value={accessTokenTtlMinutes}
                    onChange={(e) => setAccessTokenTtlMinutes(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="refresh-token-ttl" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Refresh Token TTL (days)
                  </label>
                  <Input
                    id="refresh-token-ttl"
                    type="number"
                    min="1"
                    max="90"
                    value={refreshTokenTtlDays}
                    onChange={(e) => setRefreshTokenTtlDays(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Self-Registration Notice */}
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3.5 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-foreground">Public Self-Registration</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Institutional accounts must be provisioned exclusively by administrators or via verified roster ingestion.
                </div>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                DISABLED (LOCKED)
              </Badge>
            </div>
          </CardContent>

          <CardFooter className="flex justify-end border-t border-border/60 p-4">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </CardFooter>
        </Card>
      </form>
      </StateBoundary>
    </div>
  );
}
