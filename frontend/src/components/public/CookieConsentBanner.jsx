/**
 * @file CookieConsentBanner.jsx
 * @description WCAG-compliant cookie consent banner with granular preferences.
 * Manages first-party session tokens vs. optional anonymous telemetry without third-party trackers.
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'proctornet_cookie_consent';

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        // Delay showing banner slightly to avoid layout shift on initial paint
        const timer = setTimeout(() => setVisible(true), 800);
        return () => clearTimeout(timer);
      } else {
        const parsed = JSON.parse(stored);
        setAnalyticsEnabled(!!parsed.analytics);
      }
    } catch (e) {
      // Fallback if localStorage is inaccessible
      setVisible(false);
    }
  }, []);

  const handleSaveConsent = (analyticsOptIn) => {
    try {
      const consentPayload = {
        essential: true,
        analytics: analyticsOptIn,
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(consentPayload));
      setAnalyticsEnabled(analyticsOptIn);
    } catch (e) {
      // Storage error fallback
    }
    setVisible(false);
    setPreferencesOpen(false);
  };

  if (!visible) return null;

  return (
    <aside
      aria-label="Cookie and Privacy Consent"
      role="region"
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        right: '20px',
        maxWidth: '720px',
        margin: '0 auto',
        zIndex: 9999,
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-medium)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-modal)',
        padding: '20px 24px',
      }}
      className="glass-panel"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
              🍪 Privacy &amp; Cookie Preferences
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-body)', margin: '6px 0 0 0', lineHeight: 1.5 }}>
              ProctorNet uses strictly necessary session cookies for authentication and CSRF security.
              We do <strong>not</strong> use third-party advertising or commercial tracking cookies.
              Optional first-party analytics help evaluate capstone performance metrics. Read our{' '}
              <Link to="/cookies" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>
                Cookie Policy
              </Link>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleSaveConsent(false)}
            aria-label="Close and reject optional cookies"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.25rem',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal / Preferences Toggle View */}
        {preferencesOpen && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: 'var(--color-surface-secondary)',
              border: '1px solid var(--color-border-subtle)',
              marginTop: '4px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div>
                <strong style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>Essential Cookies</strong>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                  Required for JWT login sessions and CSRF protection. Always active.
                </p>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>MANDATORY</span>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--color-border-subtle)', margin: '8px 0' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>First-Party Telemetry</strong>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                  Anonymous page visit telemetry to verify system performance. No third-party data transmission.
                </p>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={analyticsEnabled}
                  onChange={(e) => setAnalyticsEnabled(e.target.checked)}
                  aria-label="Allow anonymous first-party analytics"
                />
                <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Enable</span>
              </label>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
          <button
            type="button"
            onClick={() => setPreferencesOpen(!preferencesOpen)}
            className="btn-academic-ghost"
            style={{ padding: '6px 12px', fontSize: '0.8125rem' }}
          >
            {preferencesOpen ? 'Hide Preferences' : 'Customize'}
          </button>
          <button
            type="button"
            onClick={() => handleSaveConsent(false)}
            className="btn-academic-secondary"
            style={{ padding: '6px 14px', fontSize: '0.8125rem' }}
          >
            Essential Only
          </button>
          <button
            type="button"
            onClick={() => handleSaveConsent(preferencesOpen ? analyticsEnabled : true)}
            className="btn-academic-primary"
            style={{ padding: '6px 16px', fontSize: '0.8125rem' }}
          >
            Accept All
          </button>
        </div>
      </div>
    </aside>
  );
}
