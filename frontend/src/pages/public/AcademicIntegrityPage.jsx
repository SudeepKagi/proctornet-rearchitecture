/**
 * @file AcademicIntegrityPage.jsx
 * @description Educational framework on academic misconduct, collusion, and evidence handling.
 */

import React from 'react';
import { usePageMeta } from '../../hooks/usePageMeta.js';
import { POLICY_DATA } from '../../content/policyData.js';

export function AcademicIntegrityPage() {
  usePageMeta({
    title: 'Academic Integrity Policy & Honor Code',
    description:
      'ProctorNet academic integrity framework: individual authorship standards, anti-collusion blueprint rules, and objective dispute resolution.',
    canonical: '/academic-integrity',
  });

  const { academicIntegrity } = POLICY_DATA;

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '840px' }}>
      <div style={{ marginBottom: '36px' }}>
        <span className="badge-academic" style={{ marginBottom: '12px' }}>
          Honor Code
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
          {academicIntegrity.title}
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>
          Effective: {academicIntegrity.effectiveDate} • Version: {POLICY_DATA.version}
        </p>
      </div>

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
          {academicIntegrity.summary}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {academicIntegrity.principles.map((p, idx) => (
          <section key={idx} className="card-interactive" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              {p.title}
            </h2>
            <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', margin: 0 }}>
              {p.detail}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
