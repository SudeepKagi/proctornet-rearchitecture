/**
 * @file AiProctoringNoticePage.jsx
 * @description Formal Responsible AI and Proctoring Notice outlining assistive triage limitations and human oversight.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';
import { POLICY_DATA } from '../../content/policyData.js';

export function AiProctoringNoticePage() {
  usePageMeta({
    title: 'Responsible AI & Proctoring Notice',
    description:
      'Formal disclosure on the role and limitations of AI in ProctorNet: probabilistic triage, absence of continuous webcam AI, and mandatory human review.',
    canonical: '/ai-proctoring-notice',
  });

  const { aiNotice } = POLICY_DATA;

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '840px' }}>
      <div style={{ marginBottom: '36px' }}>
        <span className="badge-academic" style={{ marginBottom: '12px' }}>
          AI Ethics &amp; Transparency
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
          {aiNotice.title}
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>
          Effective: {aiNotice.effectiveDate} • Version: {POLICY_DATA.version}
        </p>
      </div>

      <div
        className="card-interactive"
        style={{
          padding: '24px',
          backgroundColor: 'var(--color-surface-secondary)',
          borderLeft: '4px solid var(--color-brand-accent)',
          marginBottom: '40px',
        }}
      >
        <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--color-text-body)', margin: 0 }}>
          {aiNotice.summary}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {aiNotice.commitments.map((c, idx) => (
          <section key={idx} className="card-interactive" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              {c.title}
            </h2>
            <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', margin: 0 }}>
              {c.description}
            </p>
          </section>
        ))}

        <div className="glass-panel" style={{ padding: '24px', backgroundColor: 'var(--color-surface)' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 8px 0' }}>
            Want to see the mathematical and pipeline details?
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: '0 0 16px 0' }}>
            Inspect our in-browser Web Worker heuristics and 0–100 authoritative risk calculation formulas.
          </p>
          <Link to="/ai-proctoring" className="btn-academic-primary" style={{ padding: '8px 18px', fontSize: '0.85rem' }}>
            View AI Proctoring Architecture →
          </Link>
        </div>
      </div>
    </div>
  );
}
