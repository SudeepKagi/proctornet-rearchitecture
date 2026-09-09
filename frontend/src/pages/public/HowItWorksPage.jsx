/**
 * @file HowItWorksPage.jsx
 * @description Step-by-step walkthrough of the examination lifecycle in ProctorNet.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';

export function HowItWorksPage() {
  usePageMeta({
    title: 'How It Works — Examination Lifecycle Walkthrough',
    description:
      'Step-by-step visual guide to how ProctorNet conducts secure online examinations: blueprint authoring, session setup, pre-exam verification, live exam, and atomic grading.',
    canonical: '/how-it-works',
  });

  const steps = [
    {
      step: '1',
      title: 'Blueprint Authoring & Question Banks',
      role: 'Faculty / Examiners',
      description:
        'Faculty construct assessment blueprints specifying topic quotas, difficulty targets (Easy, Medium, Hard), and sectional time limits. Questions are selected from reusable question banks with support for Multiple Choice, Numerical, and Subjective formats.',
      detail:
        'When an attempt is initialized, the server-authoritative blueprint engine dynamically generates a unique, balanced question sequence per candidate.',
    },
    {
      step: '2',
      title: 'Session Scheduling & Invigilator Rostering',
      role: 'Faculty / Administrators',
      description:
        'Administrators or faculty schedule exam windows, allocate candidate rosters, and link assigned proctors. Strictness rules are configured, including grace period duration and permissible screen blur tolerance.',
      detail:
        'The backend provisions WebRTC media rooms in mediasoup SFU and sets up Redis Pub/Sub channels for live telemetry multiplexing.',
    },
    {
      step: '3',
      title: 'Pre-Exam Verification & Readiness Diagnostics',
      role: 'Candidates',
      description:
        'Prior to launching the test, candidates undergo an automated readiness check: network bandwidth validation, camera/mic checks, and screen capture permission grants.',
      detail:
        'Candidate identity is verified by matching a fresh snapshot against enrolled facial vector embeddings stored with SSE-S256 encryption.',
    },
    {
      step: '4',
      title: 'Live Assessment with OCC & Screen Analysis',
      role: 'Candidates & Invigilators (Dual)',
      description:
        'During the exam, every answer selection is auto-saved in background using Optimistic Concurrency Control (OCC). An in-browser Web Worker analyzes desktop context switches (full-screen loss, window blur) without recording webcam video.',
      detail:
        'Signals are dispatched to the server risk engine (0–100 scale), updating the real-time 12-stream invigilator console for live supervision.',
    },
    {
      step: '5',
      title: 'Atomic Evaluation, Manual Grading & Publication',
      role: 'Faculty & Candidates',
      description:
        'Objective items are graded instantly upon submission. Subjective responses route to a blind grading workspace where faculty assign scores based on defined rubrics.',
      detail:
        'All grade adjustments are committed to PostgreSQL with trigger-locked immutable audit records, after which final scorecards are published.',
    },
  ];

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '960px' }}>
      {/* Header */}
      <div style={{ marginBottom: '40px' }}>
        <span className="badge-academic" style={{ marginBottom: '16px' }}>
          Assessment Lifecycle
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
          How ProctorNet Delivers Secure Exams
        </h1>
        <p style={{ fontSize: '1.125rem', lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          A transparent walkthrough illustrating how blueprints, resilient answer persistence,
          client-side screen analysis, and invigilator oversight operate together.
        </p>
      </div>

      {/* Embedded SVG Lifecycle Diagram */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          marginBottom: '56px',
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <img
          src="/src/assets/diagrams/exam-lifecycle.svg"
          alt="ProctorNet Examination Lifecycle Diagram"
          style={{ width: '100%', height: 'auto', display: 'block' }}
          loading="lazy"
        />
      </div>

      {/* Step by Step Breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', marginBottom: '56px' }}>
        {steps.map((item) => (
          <div
            key={item.step}
            className="card-interactive"
            style={{
              display: 'flex',
              gap: '24px',
              padding: '32px',
              alignItems: 'flex-start',
            }}
          >
            {/* Step Number Circle */}
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-primary)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '1.25rem',
                flexShrink: 0,
              }}
            >
              {item.step}
            </div>

            {/* Content */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
                  {item.title}
                </h3>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--color-surface-secondary)',
                    color: 'var(--color-text-muted)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  {item.role}
                </span>
              </div>

              <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--color-text-body)', margin: '0 0 12px 0' }}>
                {item.description}
              </p>

              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-canvas)',
                  borderLeft: '3px solid var(--color-brand-secondary)',
                  fontSize: '0.85rem',
                  lineHeight: 1.5,
                  color: 'var(--color-text-muted)',
                }}
              >
                <strong>Under the hood: </strong>
                {item.detail}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Role Navigation CTAs */}
      <div
        className="glass-panel"
        style={{
          padding: '32px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '24px',
          backgroundColor: 'var(--color-surface)',
        }}
      >
        <div>
          <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 6px 0' }}>
            Preparing for an Exam?
          </h4>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: '0 0 16px 0' }}>
            Read candidate system requirements, readiness checklists, and privacy rights.
          </p>
          <Link to="/for-students" className="btn-academic-primary" style={{ padding: '8px 16px', fontSize: '0.875rem' }}>
            Candidate Guide →
          </Link>
        </div>

        <div>
          <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 6px 0' }}>
            Authoring Assessments?
          </h4>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: '0 0 16px 0' }}>
            Explore blueprint randomization, rubric grading, and session strictness thresholds.
          </p>
          <Link to="/for-faculty" className="btn-academic-secondary" style={{ padding: '8px 16px', fontSize: '0.875rem' }}>
            Faculty Guide →
          </Link>
        </div>
      </div>
    </div>
  );
}
