/**
 * @file ForStudentsPage.jsx
 * @description Candidate preparation guide, readiness checklists, and privacy commitments for ProctorNet.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';

export function ForStudentsPage() {
  usePageMeta({
    title: 'Candidate Guide & Pre-Exam Readiness',
    description:
      'Candidate guide for ProctorNet online exams: hardware checks, browser requirements, privacy commitments, offline resilience, and test-day tips.',
    canonical: '/for-students',
  });

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ marginBottom: '40px' }}>
        <span className="badge-academic" style={{ marginBottom: '16px' }}>
          Candidate Information
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
          Candidate Preparation &amp; Readiness Guide
        </h1>
        <p style={{ fontSize: '1.125rem', lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          Everything you need to know before taking an examination on ProctorNet: equipment checks,
          during-exam procedures, privacy protections, and offline autosave.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
        {/* Section 1: System & Browser Requirements */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            1. Equipment &amp; Browser Requirements
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>Supported Browsers</strong>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '6px 0 0 0', lineHeight: 1.5 }}>
                Google Chrome (recommended), Mozilla Firefox, or Microsoft Edge. Safari and mobile browsers are not supported for proctored sessions.
              </p>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>Webcam &amp; Microphone</strong>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '6px 0 0 0', lineHeight: 1.5 }}>
                Functional webcam for pre-exam identity verification and live invigilator supervision. No continuous audio AI is run.
              </p>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>Screen Sharing Support</strong>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '6px 0 0 0', lineHeight: 1.5 }}>
                Permission to share your active desktop screen for client-side heuristic analysis via browser Web APIs.
              </p>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>Network Speed</strong>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '6px 0 0 0', lineHeight: 1.5 }}>
                Stable broadband connection with at least 2 Mbps upload speed for smooth WebRTC video streaming.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Pre-Exam Readiness Steps */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            2. Before Exam Day: What to Expect
          </h2>
          <ol style={{ paddingLeft: '20px', fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <li>
              <strong>Biometric Baseline Enrollment:</strong> Complete your one-time face enrollment in the Candidate Portal prior to exam day.
              A photo is captured and converted into a 512-dimensional vector embedding.
            </li>
            <li>
              <strong>Pre-Exam Diagnostics:</strong> Access the examination room 15 minutes prior to the start time.
              The system will verify camera, microphone, and screen capture permissions.
            </li>
            <li>
              <strong>Identity Confirmation:</strong> A live camera snapshot is compared against your enrolled baseline to confirm identity before unlocking the test.
            </li>
          </ol>
        </section>

        {/* Section 3: During the Exam & Resilience */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            3. During the Exam: Resilience &amp; Privacy
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)' }}>
            <p style={{ margin: 0 }}>
              <strong>Optimistic Concurrency Control (OCC) Autosave:</strong> You never have to worry about manually saving your progress.
              Every answer choice or essay keystroke is automatically synchronized in the background. If you lose internet access, your answers
              are safely stored in browser storage and uploaded immediately once reconnected.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Respect for Your Dignity:</strong> You are not being monitored by automated emotion-detection or gaze-tracking AI.
              The client-side screen analysis only monitors window blur and full-screen exits. Disciplinary actions cannot be taken automatically;
              only your human invigilator can issue warnings or interventions.
            </p>
          </div>
        </section>

        {/* Section 4: Candidate Rights & Dispute Resolution */}
        <section className="glass-panel" style={{ padding: '32px', borderLeft: '4px solid var(--color-brand-secondary)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '12px' }}>
            Candidate Rights &amp; Appeals
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--color-text-body)', marginBottom: '16px' }}>
            Every proctoring flag and intervention generates an immutable audit entry in the database.
            If you believe an anomaly was incorrectly flagged (e.g. accidental browser notification or system update),
            you have the right to request a formal human review of the session timeline with your faculty advisor.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <Link to="/ai-proctoring-notice" className="btn-academic-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
              Responsible AI Policy →
            </Link>
            <Link to="/privacy" className="btn-academic-ghost" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
              Privacy &amp; Data Subject Rights →
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
