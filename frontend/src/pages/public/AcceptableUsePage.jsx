/**
 * @file AcceptableUsePage.jsx
 * @description Acceptable Use Policy governing ProctorNet system access and security rules.
 */

import React from 'react';
import { usePageMeta } from '../../hooks/usePageMeta.js';
import { POLICY_DATA } from '../../content/policyData.js';

export function AcceptableUsePage() {
  usePageMeta({
    title: 'Acceptable Use Policy — Platform Conduct',
    description:
      'Acceptable Use Policy for ProctorNet: rules prohibiting unauthorized testing, session manipulation, and reverse engineering.',
    canonical: '/acceptable-use',
  });

  const { acceptableUse } = POLICY_DATA;

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '840px' }}>
      <div style={{ marginBottom: '36px' }}>
        <span className="badge-academic" style={{ marginBottom: '12px' }}>
          Platform Standards
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
          {acceptableUse.title}
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>
          Effective: {acceptableUse.effectiveDate} • Version: {POLICY_DATA.version}
        </p>
      </div>

      <div
        className="card-interactive"
        style={{
          padding: '24px',
          backgroundColor: 'var(--color-surface-secondary)',
          borderLeft: '4px solid var(--color-danger)',
          marginBottom: '40px',
        }}
      >
        <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--color-text-body)', margin: 0 }}>
          {acceptableUse.summary}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
          Core Rules of Conduct
        </h2>
        <ul style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)' }}>
          {acceptableUse.rules.map((rule, idx) => (
            <li key={idx}>
              {rule}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
