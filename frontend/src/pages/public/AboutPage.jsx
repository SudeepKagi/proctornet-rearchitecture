/**
 * @file AboutPage.jsx
 * @description In-depth About page detailing academic context, problem motivation, and engineering decisions.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';
import { PROJECT_INFO } from '../../content/projectInfo.js';

export function AboutPage() {
  usePageMeta({
    title: 'About the Project & Academic Context',
    description:
      'Learn why ProctorNet was engineered: academic motivations, architectural trade-offs, privacy-first proctoring principles, and student team credits.',
    canonical: '/about',
  });

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '900px' }}>
      {/* Header Banner */}
      <div style={{ marginBottom: '40px' }}>
        <span className="badge-academic" style={{ marginBottom: '16px' }}>
          🎓 Academic Context &amp; Purpose
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
          Engineering Ethical Online Assessments
        </h1>
        <p style={{ fontSize: '1.125rem', lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          {PROJECT_INFO.positioningStatement}
        </p>
      </div>

      {/* Main Narrative Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
        {/* Section 1: The Problem Space */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            1. The Problem Space in Remote Examinations
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', marginBottom: '16px' }}>
            With the rapid shift toward remote learning, universities and educational institutions worldwide adopted online
            examination platforms. However, existing commercial solutions created significant friction:
          </p>
          <ul style={{ paddingLeft: '24px', fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li>
              <strong>Surveillance Creep:</strong> Commercial vendors deployed invasive webcam facial expression analysis, gaze tracking,
              and continuous room audio monitoring that caused severe anxiety and false-positive flags among students.
            </li>
            <li>
              <strong>Fragile Persistence:</strong> Many web examination platforms suffered catastrophic data loss during brief network
              fluctuations, causing students to lose partially completed essays and objective answers.
            </li>
            <li>
              <strong>Lack of Auditability:</strong> Disciplinary penalties were frequently applied based on opaque, proprietary AI risk
              scores without human verification or transparent audit trails.
            </li>
          </ul>
        </section>

        {/* Section 2: Architectural Principles */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            2. Core Architectural Design Decisions
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', marginBottom: '16px' }}>
            To address these challenges rigorously, the ProctorNet project adopted several foundational engineering principles:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
            <div style={{ padding: '16px', backgroundColor: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)', margin: '0 0 8px 0' }}>
                Modular Monolith Architecture
              </h3>
              <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--color-text-body)', margin: 0 }}>
                Avoiding premature microservices complexity by implementing strict internal domain boundaries in Node.js 24 LTS
                with PostgreSQL transactional integrity.
              </p>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-brand-secondary)', margin: '0 0 8px 0' }}>
                Dual-Plane Separation
              </h3>
              <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--color-text-body)', margin: 0 }}>
                Decoupling the HTTP/REST control plane from the real-time WebRTC media plane (mediasoup SFU). A media worker crash
                never disrupts exam submission.
              </p>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-brand-accent)', margin: '0 0 8px 0' }}>
                Client-Side Screen AI
              </h3>
              <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--color-text-body)', margin: 0 }}>
                Executing lightweight display anomaly heuristics inside in-browser Web Workers. Keeps raw screen video off cloud servers
                while sending only ephemeral telemetry.
              </p>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-success)', margin: '0 0 8px 0' }}>
                Database Trigger Immutability
              </h3>
              <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--color-text-body)', margin: 0 }}>
                Protecting audit records with database-level PostgreSQL triggers that abort unauthorized UPDATE and DELETE operations
                with SQLSTATE 20000.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Academic Boundaries & Limitations */}
        <section className="card-interactive" style={{ padding: '32px', borderLeft: '4px solid var(--color-warning)' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            3. Explicit Academic Limitations
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', marginBottom: '16px' }}>
            To ensure complete truth in presentation, we document the intentional boundaries of this demonstration release:
          </p>
          <ul style={{ paddingLeft: '24px', fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li>
              <strong>Non-Commercial Scope:</strong> The platform contains no payment processors, commercial billing mechanisms, or enterprise licensing tiers.
            </li>
            <li>
              <strong>Single-Region Demonstration:</strong> The reference deployment is calibrated for single-region AWS hosting rather than global multi-region replication.
            </li>
            <li>
              <strong>Screen-Only Proctoring:</strong> The platform intentionally omits continuous webcam AI and audio transcription to maintain candidate privacy.
            </li>
            <li>
              <strong>Academic Sandbox:</strong> Live proctoring sessions require supported desktop web browsers with WebRTC and Screen Capture APIs.
            </li>
          </ul>
        </section>

        {/* Section 4: Contributor Attributions & Open Source */}
        <section className="glass-panel" style={{ padding: '32px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '12px' }}>
            Student Engineering Team &amp; Attribution
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--color-text-muted)', maxWidth: '640px', margin: '0 auto 24px auto' }}>
            ProctorNet was authored as an undergraduate software engineering capstone project under academic faculty supervision.
            The complete source code, test suites, and documentation are available on GitHub under the MIT License.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '16px' }}>
            <a
              href={PROJECT_INFO.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-academic-primary"
              style={{ padding: '10px 20px' }}
            >
              View GitHub Repository ↗
            </a>
            <Link to="/contact" className="btn-academic-secondary" style={{ padding: '10px 20px' }}>
              Submit Feedback or Inquiries
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
