/**
 * @file ForStudentsPage.jsx
 * @description Student preparation guide, equipment checklists, and privacy commitments for ProctorNet.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';

export function ForStudentsPage() {
  usePageMeta({
    title: 'Student Guide & Exam Readiness',
    description:
      'Student guide for ProctorNet online exams: camera and microphone checks, browser requirements, privacy commitments, automatic saving, and test-day tips.',
    canonical: '/for-students',
  });

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ marginBottom: '40px' }}>
        <span className="badge-academic" style={{ marginBottom: '16px' }}>
          Student Guide
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
          Student Preparation &amp; Readiness Guide
        </h1>
        <p style={{ fontSize: '1.125rem', lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          Everything you need to know before taking an exam on ProctorNet: equipment checks,
          what to expect on exam day, your privacy rights, and automatic autosave.
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
                Google Chrome (recommended), Mozilla Firefox, or Microsoft Edge on a laptop or desktop computer. Phones and tablets are not supported for exams.
              </p>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>Webcam &amp; Microphone</strong>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '6px 0 0 0', lineHeight: 1.5 }}>
                A working webcam to verify your identity before the exam begins and to allow your invigilator to check in if needed. No continuous audio AI is run.
              </p>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>Screen Sharing</strong>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '6px 0 0 0', lineHeight: 1.5 }}>
                Permission to share your screen so your browser can detect if you accidentally switch windows or leave full-screen mode during the exam.
              </p>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>Internet Connection</strong>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '6px 0 0 0', lineHeight: 1.5 }}>
                A standard internet connection (at least 2 Mbps) so your exam connects smoothly and your work saves in real time.
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
              <strong>Photo Identity Setup:</strong> Complete your one-time photo setup in your student portal before exam day.
              We take a quick photo to confirm it's really you before your exam starts.
            </li>
            <li>
              <strong>Quick System Check:</strong> Join the exam room 10–15 minutes before the start time.
              The system will test your camera, microphone, and screen sharing permissions.
            </li>
            <li>
              <strong>Fast Identity Check:</strong> A quick photo snapshot confirms your identity against your registered profile before unlocking the test questions.
            </li>
          </ol>
        </section>

        {/* Section 3: During the Exam & Resilience */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            3. During the Exam: Autosave &amp; Privacy
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)' }}>
            <p style={{ margin: 0 }}>
              <strong>Automatic Continuous Saving:</strong> Your answers save automatically as you go — you'll never lose your work.
              Every answer choice and essay response is continuously synchronized in the background. If your internet briefly drops, your answers
              are safely stored in your browser and sync the moment you reconnect.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Respect for Your Privacy:</strong> You are never monitored by invasive emotion-detection or gaze-tracking software.
              The exam system only checks if you leave the exam tab or exit full-screen mode. No software can disqualify you automatically — only
              your professor or exam invigilator can review flags and speak with you.
            </p>
          </div>
        </section>

        {/* Section 4: Candidate Rights & Dispute Resolution */}
        <section className="glass-panel" style={{ padding: '32px', borderLeft: '4px solid var(--color-brand-secondary)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '12px' }}>
            Student Rights &amp; Appeals
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--color-text-body)', marginBottom: '16px' }}>
            Every session event and supervisor note is recorded in an official, tamper-proof audit log.
            If you believe an accidental notification or popup caused an unintended flag, you have the right to request a fair,
            transparent human review of your session timeline with your professor or department head.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <Link to="/ai-proctoring-notice" className="btn-academic-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
              Responsible Monitoring Policy →
            </Link>
            <Link to="/privacy" className="btn-academic-ghost" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
              Privacy &amp; Data Rights →
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

export default ForStudentsPage;
