/**
 * @file AccessibilityStatementPage.jsx
 * @description Formal accessibility statement, supported assistive technologies, and remediation contacts.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';
import { POLICY_DATA } from '../../content/policyData.js';

export function AccessibilityStatementPage() {
  usePageMeta({
    title: 'Accessibility Statement — WCAG 2.1 AA',
    description:
      'Formal accessibility declaration for ProctorNet: commitment to WCAG 2.1 Level AA conformance, supported assistive features, and accessibility feedback contacts.',
    canonical: '/accessibility-statement',
  });

  const { accessibility } = POLICY_DATA;

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '840px' }}>
      <div style={{ marginBottom: '36px' }}>
        <span className="badge-academic" style={{ marginBottom: '12px' }}>
          Conformance Declaration
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
          {accessibility.title}
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>
          Effective: {accessibility.effectiveDate} • Version: {POLICY_DATA.version}
        </p>
      </div>

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
          {accessibility.summary}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <section className="card-interactive" style={{ padding: '28px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            Supported Accessibility Implementations
          </h2>
          <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)' }}>
            {accessibility.features.map((feat, idx) => (
              <li key={idx}>
                {feat}
              </li>
            ))}
          </ul>
        </section>

        <section className="card-interactive" style={{ padding: '28px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '12px' }}>
            Known Limitations &amp; Accommodations
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', margin: '0 0 12px 0' }}>
            While objective examinations and public documentation conform to WCAG 2.1 AA standards, subjective drawing or diagram
            questions require specific pointer inputs. Students requiring alternative assessment formats or assistive proctoring
            accommodations (e.g. extended time limits, text-to-speech exam readers) may have these accommodations applied to their
            candidate profile by an administrator.
          </p>
        </section>

        <section className="glass-panel" style={{ padding: '24px', backgroundColor: 'var(--color-surface)' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 8px 0' }}>
            Feedback &amp; Remediation Requests
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: '0 0 16px 0' }}>
            If you encounter an accessibility barrier or have difficulty operating any aspect of ProctorNet with assistive technology,
            please let our engineering team know so we can address it promptly.
          </p>
          <Link to="/contact" className="btn-academic-primary" style={{ padding: '8px 18px', fontSize: '0.85rem' }}>
            Submit Accessibility Feedback →
          </Link>
        </section>
      </div>
    </div>
  );
}
