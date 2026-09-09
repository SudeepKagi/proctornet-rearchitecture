/**
 * @file LandingPage.jsx
 * @description Educational project landing page for ProctorNet.
 * Adheres strictly to non-commercial academic capstone identity.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';
import { PROJECT_INFO } from '../../content/projectInfo.js';

export function LandingPage() {
  usePageMeta({
    title: 'An Open, Resilient Architecture for Online Examinations',
    description:
      'ProctorNet is a student-built academic software engineering project demonstrating server-authoritative assessment workflows, OCC autosave, and privacy-first client-side screen analysis.',
    canonical: '/',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '80px', paddingBottom: '80px' }}>
      {/* 1. HERO SECTION (Above-the-Fold) */}
      <section
        style={{
          position: 'relative',
          paddingTop: '64px',
          paddingBottom: '64px',
          borderBottom: '1px solid var(--color-border-subtle)',
          background: 'linear-gradient(180deg, var(--color-surface) 0%, var(--color-canvas) 100%)',
          overflow: 'hidden',
        }}
      >
        <div className="container" style={{ textAlign: 'center', maxWidth: '960px' }}>
          {/* Academic Badge */}
          <div style={{ display: 'inline-flex', marginBottom: '24px' }}>
            <span className="badge-academic" style={{ fontSize: '0.875rem', padding: '6px 16px' }}>
              🎓 {PROJECT_INFO.academicBadge}
            </span>
          </div>

          {/* Main H1 Headline */}
          <h1
            style={{
              fontSize: 'clamp(2.25rem, 5vw, 3.5rem)',
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: '-0.03em',
              color: 'var(--color-text-primary)',
              marginBottom: '20px',
            }}
          >
            An Open, Resilient Architecture for <br />
            <span className="text-gradient">Online Examinations &amp; Ethical Screen Proctoring</span>
          </h1>

          {/* Sub-headline */}
          <p
            style={{
              fontSize: 'clamp(1.05rem, 2vw, 1.25rem)',
              lineHeight: 1.6,
              color: 'var(--color-text-muted)',
              marginBottom: '36px',
              maxWidth: '820px',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            {PROJECT_INFO.subheadline}
          </p>

          {/* Primary Action CTAs */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              marginBottom: '56px',
            }}
          >
            <Link
              to="/architecture"
              className="btn-academic-primary"
              style={{ fontSize: '1rem', padding: '12px 28px' }}
            >
              Explore the Architecture →
            </Link>
            <Link
              to="/documentation"
              className="btn-academic-secondary"
              style={{ fontSize: '1rem', padding: '12px 24px' }}
            >
              Read Technical Docs
            </Link>
            <a
              href={PROJECT_INFO.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-academic-ghost"
              style={{ fontSize: '1rem', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span>View Source on GitHub</span> ↗
            </a>
          </div>

          {/* Measured System Capability Strip */}
          <div
            className="glass-panel"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '24px',
              padding: '24px 32px',
              textAlign: 'center',
            }}
          >
            {PROJECT_INFO.stats.map((stat, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '2rem',
                      fontWeight: 800,
                      color: 'var(--color-primary)',
                      lineHeight: 1,
                    }}
                  >
                    {stat.value}
                  </span>
                  <span className="badge-measured">{stat.classification}</span>
                </div>
                <strong style={{ fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>
                  {stat.label}
                </strong>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>
                  {stat.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. THE ENGINEERING CHALLENGE */}
      <section className="container">
        <div
          className="card-interactive"
          style={{
            padding: '40px',
            borderLeft: '4px solid var(--color-primary)',
            backgroundColor: 'var(--color-surface)',
          }}
        >
          <div style={{ maxWidth: '840px' }}>
            <span
              style={{
                fontSize: '0.8125rem',
                fontWeight: 700,
                color: 'var(--color-primary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              The Academic Motivation
            </span>
            <h2
              style={{
                fontSize: '1.875rem',
                fontWeight: 800,
                color: 'var(--color-text-primary)',
                margin: '8px 0 16px 0',
                letterSpacing: '-0.02em',
              }}
            >
              Why ProctorNet Was Built: Solving the Proctoring Dilemma
            </h2>
            <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'var(--color-text-body)', marginBottom: '16px' }}>
              Online examinations in higher education face two problematic extremes. On one side are fragile web forms
              vulnerable to network dropouts and answer loss. On the other side are commercial proctoring platforms
              employing invasive surveillance—continuous room audio recording, black-box facial micro-expression AI, and
              automated candidate disqualification.
            </p>
            <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'var(--color-text-body)', margin: 0 }}>
              ProctorNet demonstrates an ethical, engineering-driven alternative: <strong>server-authoritative assessment integrity</strong> with
              optimistic concurrency control, combined with <strong>in-browser client-side screen analysis</strong> that protects student dignity
              under a strict human-in-the-loop governance model.
            </p>
          </div>
        </div>
      </section>

      {/* 3. FOUR CORE ARCHITECTURAL PILLARS */}
      <section className="container">
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <span
            style={{
              fontSize: '0.8125rem',
              fontWeight: 700,
              color: 'var(--color-brand-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            System Foundations
          </span>
          <h2
            style={{
              fontSize: '2rem',
              fontWeight: 800,
              color: 'var(--color-text-primary)',
              margin: '8px 0 12px 0',
              letterSpacing: '-0.02em',
            }}
          >
            The Four Pillars of ProctorNet
          </h2>
          <p style={{ fontSize: '1.05rem', color: 'var(--color-text-muted)', maxWidth: '640px', margin: '0 auto' }}>
            A cohesive architecture engineered to guarantee examination resilience, candidate privacy, and operational clarity.
          </p>
        </div>

        <div className="grid-2-col">
          {PROJECT_INFO.pillars.map((pillar) => (
            <div
              key={pillar.id}
              className="card-interactive"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '32px',
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: 'var(--color-primary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {pillar.subtitle}
                </span>
                <h3
                  style={{
                    fontSize: '1.375rem',
                    fontWeight: 700,
                    color: 'var(--color-text-primary)',
                    margin: '8px 0 12px 0',
                  }}
                >
                  {pillar.title}
                </h3>
                <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--color-text-body)', marginBottom: '20px' }}>
                  {pillar.description}
                </p>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {pillar.badges.map((badge, bIdx) => (
                  <span
                    key={bIdx}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--color-surface-secondary)',
                      border: '1px solid var(--color-border-subtle)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {badge}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. INTERACTIVE SYSTEM TOPOLOGY PREVIEW */}
      <section className="container">
        <div
          className="glass-panel"
          style={{
            padding: '48px',
            backgroundColor: 'var(--color-surface)',
            textAlign: 'center',
          }}
        >
          <div style={{ maxWidth: '720px', margin: '0 auto 32px auto' }}>
            <span
              style={{
                fontSize: '0.8125rem',
                fontWeight: 700,
                color: 'var(--color-primary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              System Topology
            </span>
            <h2
              style={{
                fontSize: '1.875rem',
                fontWeight: 800,
                color: 'var(--color-text-primary)',
                margin: '8px 0 12px 0',
              }}
            >
              Modular Monolith with Dual-Plane Ingress
            </h2>
            <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--color-text-muted)', margin: 0 }}>
              Engineered with clean domain separation: REST control plane, mediasoup WebRTC video router, Redis room multiplexing,
              and a dedicated WireGuard 10.100.0.0/24 management boundary for internal operations.
            </p>
          </div>

          {/* Embedded SVG Topology Teaser */}
          <div
            style={{
              maxWidth: '880px',
              margin: '0 auto 28px auto',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              border: '1px solid var(--color-border-subtle)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <img
              src="/src/assets/diagrams/system-topology.svg"
              alt="ProctorNet System Topology Diagram"
              style={{ width: '100%', height: 'auto', display: 'block' }}
              loading="lazy"
            />
          </div>

          <Link
            to="/architecture"
            className="btn-academic-primary"
            style={{ padding: '10px 24px' }}
          >
            View Interactive Architecture &amp; Subsystems →
          </Link>
        </div>
      </section>

      {/* 5. ETHICAL AI & PROCTORING PLEDGE */}
      <section className="container">
        <div
          style={{
            backgroundColor: 'var(--color-brand-primary)',
            color: '#ffffff',
            borderRadius: 'var(--radius-xl)',
            padding: '48px 40px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '40px',
            alignItems: 'center',
          }}
        >
          <div>
            <span
              style={{
                fontSize: '0.8125rem',
                fontWeight: 700,
                color: '#93c5fd',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Ethics &amp; Candidate Dignity
            </span>
            <h2
              style={{
                fontSize: '1.875rem',
                fontWeight: 800,
                color: '#ffffff',
                margin: '8px 0 16px 0',
                letterSpacing: '-0.02em',
              }}
            >
              The ProctorNet Privacy Commitment
            </h2>
            <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: '#e0e7ff', margin: 0 }}>
              We reject the premise that academic integrity requires invasive personal surveillance.
              ProctorNet proves that remote examination integrity can be maintained with bounded,
              client-side screen analysis without infringing on student privacy.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ fontSize: '1.25rem' }}>🛡️</span>
              <div>
                <strong style={{ color: '#ffffff', fontSize: '0.9375rem' }}>No Continuous Webcam or Audio AI</strong>
                <p style={{ fontSize: '0.8125rem', color: '#c7d2fe', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                  Zero facial emotion tracking, eye gaze inference, or ambient room audio listening algorithms.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ fontSize: '1.25rem' }}>⚖️</span>
              <div>
                <strong style={{ color: '#ffffff', fontSize: '0.9375rem' }}>Mandatory Human-in-the-Loop</strong>
                <p style={{ fontSize: '0.8125rem', color: '#c7d2fe', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                  AI heuristics never disqualify candidates. Disciplinary decisions are strictly reserved for human invigilators.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ fontSize: '1.25rem' }}>🗑️</span>
              <div>
                <strong style={{ color: '#ffffff', fontSize: '0.9375rem' }}>Automated 90-Day Retention Purge</strong>
                <p style={{ fontSize: '0.8125rem', color: '#c7d2fe', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                  Pre-exam baseline photos and vector embeddings are cryptographically purged after 90 days.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. LIVE TECHNOLOGY STACK GRID */}
      <section className="container">
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <span
            style={{
              fontSize: '0.8125rem',
              fontWeight: 700,
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Open Source Foundation
          </span>
          <h2
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: 'var(--color-text-primary)',
              margin: '8px 0 12px 0',
            }}
          >
            Engineering Stack &amp; Infrastructure
          </h2>
          <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-muted)', maxWidth: '560px', margin: '0 auto' }}>
            Built on proven open-source technologies without proprietary commercial vendor lock-in.
          </p>
        </div>

        <div className="grid-4-col">
          {PROJECT_INFO.techStack.map((tech, idx) => (
            <div
              key={idx}
              className="card-interactive"
              style={{
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                  {tech.category}
                </span>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: '4px 0 8px 0' }}>
                  {tech.name}
                </h4>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.5 }}>
                  {tech.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 7. PROJECT STATUS & REPOSITORY CALLOUT */}
      <section className="container">
        <div
          className="glass-panel"
          style={{
            padding: '40px',
            textAlign: 'center',
            backgroundColor: 'var(--color-surface)',
          }}
        >
          <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '12px' }}>
            Academic Engineering Project Status
          </h3>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--color-text-muted)', maxWidth: '640px', margin: '0 auto 24px auto' }}>
            The ProctorNet core modular monolith has reached release completion (v1.0.0-release). All 5 operational portals,
            SFU media workers, resilience buffering, and privacy controls are fully implemented and verified in the repository.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px' }}>
            <Link to="/features" className="btn-academic-secondary" style={{ padding: '8px 20px' }}>
              Explore All Features
            </Link>
            <Link to="/documentation" className="btn-academic-primary" style={{ padding: '8px 20px' }}>
              Browse Architecture &amp; Documentation
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
