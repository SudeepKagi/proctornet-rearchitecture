/**
 * @file TermsPage.jsx
 * @description Educational Terms of Use clarifying non-commercial demonstration status and user conduct.
 */

import React from 'react';
import { usePageMeta } from '../../hooks/usePageMeta.js';
import { POLICY_DATA } from '../../content/policyData.js';

export function TermsPage() {
  usePageMeta({
    title: 'Terms of Use — Educational Project Guidelines',
    description:
      'Educational Terms of Use for ProctorNet: academic demonstration status, disclaimer of commercial warranties, and acceptable user conduct rules.',
    canonical: '/terms',
  });

  const { terms } = POLICY_DATA;

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '840px' }}>
      <div style={{ marginBottom: '36px' }}>
        <span className="badge-academic" style={{ marginBottom: '12px' }}>
          Educational Policy
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
          {terms.title}
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>
          Effective: {terms.effectiveDate} • Version: {POLICY_DATA.version}
        </p>
      </div>

      {/* Summary Box */}
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
          {terms.summary}
        </p>
      </div>

      {/* Policy Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {terms.sections.map((section, idx) => (
          <section key={idx}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '12px' }}>
              {section.heading}
            </h2>
            <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', margin: 0 }}>
              {section.content}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
