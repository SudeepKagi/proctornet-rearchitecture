/**
 * @file PrivacyPage.jsx
 * @description Comprehensive Privacy Policy detailing data flows, storage locations, retention schedules, and candidate rights.
 */

import React from 'react';
import { usePageMeta } from '../../hooks/usePageMeta.js';
import { POLICY_DATA } from '../../content/policyData.js';

export function PrivacyPage() {
  usePageMeta({
    title: 'Privacy Policy & Data Retention Schedules',
    description:
      'Empirical privacy disclosures for ProctorNet: complete inventory of personal and biometric data collected, storage security, 90-day retention purges, and candidate rights.',
    canonical: '/privacy',
  });

  const { privacy } = POLICY_DATA;

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '900px' }}>
      <div style={{ marginBottom: '36px' }}>
        <span className="badge-academic" style={{ marginBottom: '12px' }}>
          Data Protection &amp; Governance
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
          {privacy.title}
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>
          Effective: {privacy.effectiveDate} • Version: {POLICY_DATA.version}
        </p>
      </div>

      {/* Summary Box */}
      <div
        className="card-interactive"
        style={{
          padding: '24px',
          backgroundColor: 'var(--color-surface-secondary)',
          borderLeft: '4px solid var(--color-brand-secondary)',
          marginBottom: '40px',
        }}
      >
        <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--color-text-body)', margin: 0 }}>
          {privacy.summary}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
        {/* Section 1: Empirical Data Inventory */}
        <section>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            1. Authoritative Data Flow &amp; Storage Inventory
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--color-text-body)', marginBottom: '20px' }}>
            In accordance with data minimization principles, ProctorNet records only information required for academic integrity:
          </p>

          <div style={{ overflowX: 'auto', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--color-surface-secondary)', borderBottom: '1px solid var(--color-border-medium)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-primary)' }}>Data Category</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-primary)' }}>Specific Items</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-primary)' }}>Storage &amp; Security</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-primary)' }}>Retention Schedule</th>
                </tr>
              </thead>
              <tbody>
                {privacy.dataInventory.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-primary)' }}>{item.category}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-body)' }}>{item.items}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-muted)' }}>{item.storage}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-body)' }}>{item.retention}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 2: Candidate Data Subject Rights */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            2. Candidate Data Rights (FERPA &amp; GDPR Alignment)
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
            {privacy.rights.map((right, rIdx) => (
              <div key={rIdx} style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
                <strong style={{ fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>{right.right}</strong>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '6px 0 0 0', lineHeight: 1.5 }}>
                  {right.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Absence of Third-Party Trackers */}
        <section className="glass-panel" style={{ padding: '24px', backgroundColor: 'var(--color-surface)' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 8px 0' }}>
            Zero Third-Party Commercial Trackers
          </h3>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--color-text-muted)', margin: 0 }}>
            ProctorNet operates with zero commercial analytics, zero advertising pixels, and zero third-party fonts or CDNs.
            All static assets and fonts are self-hosted. Your educational activity is never profiled or sold.
          </p>
        </section>
      </div>
    </div>
  );
}
