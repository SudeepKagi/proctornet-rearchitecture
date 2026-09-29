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
      'Step-by-step visual guide to how ProctorNet conducts secure online examinations: exam setup, scheduling, pre-exam check, live testing, and grading.',
    canonical: '/how-it-works',
  });

  const steps = [
    {
      step: '1',
      title: 'Exam Creation & Question Selection',
      role: 'Faculty / Examiners',
      description:
        'Faculty construct exams by choosing questions from organized topic pools, setting time limits, and defining point values. Question formats include Multiple Choice, Numerical, and Written Essay responses.',
      detail:
        'When a student starts an exam, the system delivers a fair, randomized question order so every test is balanced.',
    },
    {
      step: '2',
      title: 'Session Scheduling & Invigilator Assignment',
      role: 'Faculty / Administrators',
      description:
        'Faculty or staff schedule the exam date and window, assign eligible student rosters by department or class, and assign proctors to oversee the test.',
      detail:
        'Your exam session connects securely so an invigilator can check in if needed.',
    },
    {
      step: '3',
      title: 'Pre-Exam Check & Identity Confirmation',
      role: 'Students',
      description:
        'Prior to launching the test, students run a fast equipment check to ensure their camera, microphone, and screen sharing permissions are working properly.',
      detail:
        'A quick photo confirms your identity against your registered profile before unlocking the test questions.',
    },
    {
      step: '4',
      title: 'Taking the Exam with Automatic Autosave',
      role: 'Students & Invigilators',
      description:
        'During the exam, every answer choice and essay keystroke is automatically saved in the background. If your internet briefly drops, answers stay safe in your browser and sync the moment you reconnect.',
      detail:
        'The exam interface stays in full-screen mode to prevent accidental tab switches, with live proctors available if you need help.',
    },
    {
      step: '5',
      title: 'Evaluation, Grading & Results Release',
      role: 'Faculty & Students',
      description:
        'Multiple-choice questions are graded immediately upon submission. Written questions route to a dedicated grading workspace where professors assign marks using clear grading rubrics.',
      detail:
        'Once professors review and approve the final grades, official scorecards and score breakdowns are released to students.',
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
          A clear, straightforward walkthrough showing how exam setup, continuous autosave,
          quiet privacy-first screen checks, and human invigilation work together.
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
                <strong>Behind the scenes: </strong>
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
            Read student system requirements, readiness checklists, and privacy rights.
          </p>
          <Link to="/for-students" className="btn-academic-primary" style={{ padding: '8px 16px', fontSize: '0.875rem' }}>
            Student Guide →
          </Link>
        </div>

        <div>
          <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 6px 0' }}>
            Creating Assessments?
          </h4>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: '0 0 16px 0' }}>
            Explore question pools, exam scheduling, rubric grading, and proctoring controls.
          </p>
          <Link to="/for-faculty" className="btn-academic-secondary" style={{ padding: '8px 16px', fontSize: '0.875rem' }}>
            Faculty Guide →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default HowItWorksPage;
