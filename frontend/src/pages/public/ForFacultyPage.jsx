/**
 * @file ForFacultyPage.jsx
 * @description Faculty & Examiner guide for authoring blueprints, sessions, and subjective grading.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';

export function ForFacultyPage() {
  usePageMeta({
    title: 'Faculty & Examiner Guide — Blueprints, Scheduling & Grading',
    description:
      'Guide for faculty on ProctorNet: authoring assessment blueprints, anti-collusion randomization, live invigilator strictness, and rubric-based manual grading.',
    canonical: '/for-faculty',
  });

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ marginBottom: '40px' }}>
        <span className="badge-academic" style={{ marginBottom: '16px' }}>
          Faculty &amp; Examiner Manual
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
          Authoring, Supervision &amp; Evaluation Workflows
        </h1>
        <p style={{ fontSize: '1.125rem', lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          How educators create resilient exams, enforce academic integrity without intrusive surveillance,
          and conduct transparent rubric evaluations.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
        {/* Section 1: Question Authoring & Blueprints */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            1. Blueprint Authoring &amp; Anti-Collusion Rules
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', marginBottom: '16px' }}>
            Instead of presenting identical static exams, ProctorNet empowers faculty to design dynamic <strong>Assessment Blueprints</strong>:
          </p>
          <ul style={{ paddingLeft: '20px', fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li>
              <strong>Multi-Topic Quotas:</strong> Require specific counts of questions from distinct syllabus domains (e.g. 5 questions from Algorithms, 5 from Operating Systems).
            </li>
            <li>
              <strong>Difficulty Calibration:</strong> Specify difficulty ratios (e.g. 40% Easy, 40% Medium, 20% Hard) dynamically sampled from the question bank.
            </li>
            <li>
              <strong>Deterministic Randomization:</strong> The server generates a unique question and option permutation for each student upon attempt start, preventing screen peering and synchronized collusion.
            </li>
          </ul>
        </section>

        {/* Section 2: Session Scheduling & Strictness Thresholds */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            2. Session Management &amp; Proctoring Parameters
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', marginBottom: '16px' }}>
            Faculty configure the exact proctoring envelope appropriate for their assessment:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9375rem', color: 'var(--color-primary)' }}>Screen Blur Tolerance</strong>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                Configure allowable window switch durations before risk scoring escalates to invigilators.
              </p>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9375rem', color: 'var(--color-primary)' }}>Network Grace Period</strong>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                Set the offline reconnection window (e.g. 3 minutes) during which candidates' saved answers are securely preserved locally until reconnection.
              </p>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9375rem', color: 'var(--color-primary)' }}>Roster &amp; Invigilator Ratio</strong>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                Assign proctoring cohorts matching the 12-stream matrix capacity for optimal human vigilance.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Rubric Grading & Audit Defense */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            3. Subjective Grading &amp; Tamper-Proof Auditing
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)' }}>
            <p style={{ margin: 0 }}>
              <strong>Blind Manual Evaluation:</strong> When evaluating subjective essays, faculty can enable Blind Grading mode to mask candidate identities, eliminating implicit bias. Multi-criteria grading rubrics provide structured, defensible score allocations.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Immutable Audit Records:</strong> Once grades are published, every score adjustment is recorded with database-level tamper protection. No user can quietly overwrite past marks without leaving a verifiable audit entry.
            </p>
          </div>
        </section>

        {/* Section 4: Quick Links */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
              Explore Faculty Workflows Live
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
              Sign in to the Faculty Portal to author questions, design blueprints, or grade submissions.
            </p>
          </div>
          <Link to="/login" className="btn-academic-primary" style={{ padding: '8px 20px', fontSize: '0.875rem' }}>
            Access Faculty Portal →
          </Link>
        </div>
      </div>
    </div>
  );
}
