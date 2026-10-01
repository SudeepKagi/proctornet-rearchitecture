/**
 * @file AboutPage.jsx
 * @description Academic context, motivation, architectural design principles, and limitations for ProctorNet.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';
import { PROJECT_INFO } from '../../content/projectInfo.js';

export function AboutPage() {
  usePageMeta({
    title: 'About ProctorNet: Educational Capstone Project',
    description:
      'Learn about ProctorNet: an open-source online examination platform built for educational institutions with privacy-first student verification, autosave, and fair proctoring.',
    canonical: '/about',
  });

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ marginBottom: '40px' }}>
        <span className="badge-academic" style={{ marginBottom: '16px' }}>
          About the Project
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
          About ProctorNet
        </h1>
        <p style={{ fontSize: '1.125rem', lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          An educational examination system designed to provide honest, resilient, and privacy-respecting
          online exams for colleges and universities.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
        {/* Section 1: Motivation & Academic Problem Statement */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            1. Why We Built ProctorNet
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', marginBottom: '16px' }}>
            During the rapid transition to remote education, universities turned to third-party proctoring vendors.
            However, students and professors frequently experienced significant shortcomings:
          </p>
          <ul style={{ paddingLeft: '24px', fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li>
              <strong>Invasive Surveillance:</strong> Commercial tools often record continuous webcam video, analyze facial expressions,
              or monitor eye movements, causing high anxiety and false alarms for students.
            </li>
            <li>
              <strong>Unreliable Autosaving:</strong> Many existing portals fail when an internet connection briefly drops,
              causing students to lose hard-earned essay drafts or answers.
            </li>
            <li>
              <strong>Unclear Disciplinary Decisions:</strong> Disciplinary flags were frequently issued based on opaque algorithms
              without transparent audit records or human review.
            </li>
          </ul>
        </section>

        {/* Section 2: Architectural Principles */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            2. Core Principles
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', marginBottom: '16px' }}>
            ProctorNet was built around foundational principles that protect both academic honesty and student dignity:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
            <div style={{ padding: '16px', backgroundColor: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)', margin: '0 0 8px 0' }}>
                Dependable &amp; Fast
              </h3>
              <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--color-text-body)', margin: 0 }}>
                Built as a unified, well-structured platform with strict database safety so exams remain responsive and reliable during heavy testing hours.
              </p>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-brand-secondary)', margin: '0 0 8px 0' }}>
                Independent Media &amp; Questions
              </h3>
              <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--color-text-body)', margin: 0 }}>
                Video streams and exam questions run on separate backend services. If a camera connection hiccups, your exam questions and answers are never interrupted.
              </p>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-brand-accent)', margin: '0 0 8px 0' }}>
                Private Screen Checks
              </h3>
              <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--color-text-body)', margin: 0 }}>
                Screen monitoring runs privately in your local browser tab to detect window switches, ensuring your private screen content is never recorded or stored on remote servers.
              </p>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-success)', margin: '0 0 8px 0' }}>
                Tamper-Proof Audit Records
              </h3>
              <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--color-text-body)', margin: 0 }}>
                Every exam submission, grade change, and verification decision is permanently logged in a secure, tamper-proof audit trail for fair appeals.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Academic Boundaries & Limitations */}
        <section className="card-interactive" style={{ padding: '32px', borderLeft: '4px solid var(--color-warning)' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            3. Project Scope &amp; Privacy Commitments
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', marginBottom: '16px' }}>
            To ensure complete clarity for students, faculty, and university administrators:
          </p>
          <ul style={{ paddingLeft: '24px', fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li>
              <strong>Non-Commercial:</strong> Built for educational institutions with zero advertisements, paywalls, or commercial tracking.
            </li>
            <li>
              <strong>Focused on Student Dignity:</strong> The platform intentionally omits continuous webcam emotion AI and room audio recording to safeguard student dignity and privacy.
            </li>
            <li>
              <strong>Human-in-the-Loop:</strong> No algorithm can disqualify a student. Only a human professor or exam supervisor can review flags and make decisions.
            </li>
            <li>
              <strong>Browser-Based:</strong> Operates inside modern desktop browsers (Chrome, Firefox, or Edge) with no invasive software downloads required.
            </li>
          </ul>
        </section>

        {/* Section 4: Contributor Attributions & Open Source */}
        <section className="glass-panel" style={{ padding: '32px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '12px' }}>
            Engineering Attribution &amp; Source Code
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--color-text-muted)', maxWidth: '640px', margin: '0 auto 24px auto' }}>
            ProctorNet was created as an educational software engineering project under academic faculty supervision.
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

export default AboutPage;
