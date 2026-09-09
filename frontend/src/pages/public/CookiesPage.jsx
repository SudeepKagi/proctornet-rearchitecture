/**
 * @file CookiesPage.jsx
 * @description Cookie Policy with interactive consent toggles for ProctorNet.
 */

import React, { useState, useEffect } from 'react';
import { usePageMeta } from '../../hooks/usePageMeta.js';
import { POLICY_DATA } from '../../content/policyData.js';

const STORAGE_KEY = 'proctornet_cookie_consent';

export function CookiesPage() {
  usePageMeta({
    title: 'Cookie Policy & Consent Settings',
    description:
      'Transparent breakdown of all cookies utilized by ProctorNet, with live preference controls for optional first-party analytics.',
    canonical: '/cookies',
  });

  const { cookies } = POLICY_DATA;
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setAnalyticsConsent(!!parsed.analytics);
      }
    } catch (e) {
      // Storage error
    }
  }, []);

  const handleUpdatePreference = (newVal) => {
    setAnalyticsConsent(newVal);
    try {
      const payload = {
        essential: true,
        analytics: newVal,
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } catch (e) {
      // Storage error
    }
  };

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '880px' }}>
      <div style={{ marginBottom: '36px' }}>
        <span className="badge-academic" style={{ marginBottom: '12px' }}>
          Cookie Compliance
        </span>
        <h1
          style={{
            fontSize: 'clamp(2rem, 4vw, 2.5rem)',
            fontWeight: 800,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em',
            margin: '8px 0 12px 0',
          }}
        >
          {cookies.title}
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>
          Effective: {cookies.effectiveDate} • Version: {POLICY_DATA.version}
        </p>
      </div>

      {/* Summary */}
      <div
        className="card-interactive"
        style={{
          padding: '24px',
          backgroundColor: 'var(--color-surface-secondary)',
          borderLeft: '4px solid var(--color-primary)',
          marginBottom: '40px',
        }}
      >
        <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--color-text-body)', margin: 0 }}>
          {cookies.summary}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
        {/* Interactive Preference Controls */}
        <section className="glass-panel" style={{ padding: '32px', backgroundColor: 'var(--color-surface)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '12px' }}>
            Live Cookie Consent Controls
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '24px' }}>
            Adjust your preferences below. Essential authentication cookies cannot be disabled as they are required for security.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Essential */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px',
                backgroundColor: 'var(--color-canvas)',
                borderRadius: '8px',
              }}
            >
              <div>
                <strong style={{ fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>Strictly Essential Cookies</strong>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                  JWT session tokens and CSRF defenses. Necessary for account login and exam attempts.
                </p>
              </div>
              <span className="badge-academic" style={{ fontSize: '0.75rem' }}>ALWAYS ACTIVE</span>
            </div>

            {/* Optional Analytics */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px',
                backgroundColor: 'var(--color-canvas)',
                borderRadius: '8px',
              }}
            >
              <div>
                <strong style={{ fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>Anonymous First-Party Analytics</strong>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                  Anonymous page view duration metrics to verify system responsiveness. Zero third-party data sharing.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleUpdatePreference(!analyticsConsent)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: analyticsConsent ? 'var(--color-success)' : 'var(--color-border-medium)',
                  backgroundColor: analyticsConsent ? 'var(--color-success-light)' : 'var(--color-surface)',
                  color: analyticsConsent ? 'var(--color-success)' : 'var(--color-text-muted)',
                }}
              >
                {analyticsConsent ? 'Enabled (Click to Disable)' : 'Disabled (Click to Enable)'}
              </button>
            </div>
          </div>

          {savedNotice && (
            <div style={{ marginTop: '16px', fontSize: '0.85rem', color: 'var(--color-success)', fontWeight: 600 }}>
              ✓ Cookie preferences saved successfully to your browser.
            </div>
          )}
        </section>

        {/* Cookie Inventory Table */}
        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            Complete Cookie Inventory
          </h2>
          <div style={{ overflowX: 'auto', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--color-surface-secondary)', borderBottom: '1px solid var(--color-border-medium)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-primary)' }}>Cookie Name</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-primary)' }}>Classification</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-primary)' }}>Purpose</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-primary)' }}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {cookies.cookieList.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-family-mono)', color: 'var(--color-primary)', fontWeight: 600 }}>
                      {item.name}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-muted)' }}>{item.type}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-body)' }}>{item.purpose}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-muted)' }}>{item.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
