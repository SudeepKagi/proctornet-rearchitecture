/**
 * @file ForInstitutionsPage.jsx
 * @description Institutional guide for academic evaluators, university departments, and colleges.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';

export function ForInstitutionsPage() {
  usePageMeta({
    title: 'For Institutions — Private & Self-Hosted Exams',
    description:
      'How educational institutions can host resilient, privacy-first examination platforms with complete control over student data.',
    canonical: '/for-institutions',
  });

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ marginBottom: '40px' }}>
        <span className="badge-academic" style={{ marginBottom: '16px' }}>
          For Colleges &amp; Universities
        </span>
        <h1
          style={{
            fontSize: 'clamp(2rem, 4vw, 2.75rem)',
            fontWeight: 800,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em',
            margin: '12px 0 16px 0',
          }}
        >
          Institutional Data Ownership &amp; Integrity
        </h1>
        <p style={{ fontSize: '1.125rem', lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          A clear case study on how universities can operate their own examination infrastructure,
          eliminate per-student subscription fees, and keep student data strictly private.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
        {/* Academic Evaluation Disclaimer */}
        <div
          style={{
            padding: '20px 24px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-surface-secondary)',
            borderLeft: '4px solid var(--color-primary)',
            fontSize: '0.9375rem',
            lineHeight: 1.6,
            color: 'var(--color-text-body)',
          }}
        >
          <strong style={{ color: 'var(--color-text-primary)' }}>Overview for Academic Evaluators: </strong>
          ProctorNet demonstrates how a university examination system can be built with standard, proven open-source
          technologies to keep examination data private, cost-effective, and fully under institutional control.
        </div>

        {/* Section 1: Eliminating Commercial Vendor Lock-In */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            1. Keeping Exam Data Within Your College
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', marginBottom: '16px' }}>
            Universities often rely on expensive third-party vendors that store student photos and test data in external
            commercial clouds. ProctorNet demonstrates how a college can keep full ownership of its examination data:
          </p>
          <ul style={{ paddingLeft: '20px', fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li>
              <strong>Standard Open Technologies:</strong> Built on industry-standard web and database foundations with zero dependence on proprietary third-party proctoring vendors.
            </li>
            <li>
              <strong>Private Data Ownership:</strong> Exam questions, student answers, verification photos, and audit logs remain strictly inside the institution's own database and private storage.
            </li>
            <li>
              <strong>No Per-Seat Metering:</strong> Eliminates recurring commercial per-exam or per-minute subscription costs in favor of standard institutional server hosting.
            </li>
          </ul>
        </section>

        {/* Section 2: Privacy Alignment with FERPA & GDPR */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            2. Privacy-First Educational Standards
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', marginBottom: '16px' }}>
            The system is designed around standard educational privacy and data protection principles:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9375rem', color: 'var(--color-brand-secondary)' }}>Data Minimization</strong>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                Only window focus flags are checked during tests. No continuous webcam video or room audio recordings are stored on servers.
              </p>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9375rem', color: 'var(--color-brand-secondary)' }}>Purpose Limitation</strong>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                Your photo used for identity checks is automatically deleted after 90 days.
              </p>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9375rem', color: 'var(--color-brand-secondary)' }}>Security &amp; Encryption</strong>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                Data is encrypted both in transit and at rest, with administrative controls restricted to authorized college staff.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Compute Economics */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            3. Efficient, Predictable Infrastructure
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', margin: 0 }}>
            By checking screen focus directly in the student's browser rather than running costly server-side video AI,
            server overhead is kept minimal. The university can run exams smoothly on modest, cost-predictable infrastructure
            without expensive server GPUs or heavy third-party licensing.
          </p>
        </section>

        {/* Links */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
              Technical Engineering Details
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
              For engineering teams: optional system architecture and operational specifications.
            </p>
          </div>
          <Link to="/architecture" className="btn-academic-secondary" style={{ padding: '8px 20px', fontSize: '0.875rem' }}>
            Optional Technical Specs →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ForInstitutionsPage;
