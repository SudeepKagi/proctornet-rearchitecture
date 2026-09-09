/**
 * @file PublicFooter.jsx
 * @description Accessible, comprehensive public footer for ProctorNet educational website.
 * Contains academic disclaimer, 4 categorized link columns, and open-source attribution.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { PROJECT_INFO } from '../../content/projectInfo.js';

export function PublicFooter() {
  return (
    <footer
      role="contentinfo"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border-subtle)',
        paddingTop: '64px',
        paddingBottom: '40px',
        marginTop: 'auto',
      }}
    >
      <div className="container">
        {/* Top Section: Positioning & 4 Link Columns */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '40px',
            marginBottom: '48px',
          }}
        >
          {/* Col 1: Identity & Positioning */}
          <div style={{ maxWidth: '300px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '1.4rem' }}>🎓</span>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '1.2rem',
                  color: 'var(--color-text-primary)',
                  letterSpacing: '-0.02em',
                }}
              >
                Proctor<span style={{ color: 'var(--color-primary)' }}>Net</span>
              </span>
            </div>

            <p
              style={{
                fontSize: '0.875rem',
                lineHeight: 1.6,
                color: 'var(--color-text-muted)',
                marginBottom: '16px',
              }}
            >
              {PROJECT_INFO.positioningStatement}
            </p>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '6px',
                backgroundColor: 'var(--color-surface-secondary)',
                border: '1px solid var(--color-border-subtle)',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--color-text-body)',
              }}
            >
              <span>🏛️ Non-Commercial Demo</span>
              <span>•</span>
              <span>v1.0.0</span>
            </div>
          </div>

          {/* Col 2: Architecture & Presentation */}
          <div>
            <h4
              style={{
                fontSize: '0.875rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-text-primary)',
                marginBottom: '16px',
              }}
            >
              Architecture &amp; Platform
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <li>
                <Link to="/" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Project Overview
                </Link>
              </li>
              <li>
                <Link to="/about" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  About &amp; Problem Space
                </Link>
              </li>
              <li>
                <Link to="/features" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Feature Catalog
                </Link>
              </li>
              <li>
                <Link to="/how-it-works" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Exam Lifecycle Walkthrough
                </Link>
              </li>
              <li>
                <Link to="/architecture" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  System Architecture Diagrams
                </Link>
              </li>
              <li>
                <Link to="/documentation" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Documentation Hub
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Role Guides & Research */}
          <div>
            <h4
              style={{
                fontSize: '0.875rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-text-primary)',
                marginBottom: '16px',
              }}
            >
              Guides &amp; Technical Specs
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <li>
                <Link to="/for-students" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Candidate Readiness Guide
                </Link>
              </li>
              <li>
                <Link to="/for-faculty" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Faculty &amp; Examiner Guide
                </Link>
              </li>
              <li>
                <Link to="/for-institutions" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Institutional Architecture
                </Link>
              </li>
              <li>
                <Link to="/ai-proctoring" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Client-Side Screen AI
                </Link>
              </li>
              <li>
                <Link to="/security" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Security &amp; WireGuard Perimeter
                </Link>
              </li>
              <li>
                <Link to="/accessibility" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  WCAG 2.1 AA Compliance
                </Link>
              </li>
              <li>
                <Link to="/faq" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Frequently Asked Questions
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4: Trust, Policy & Feedback */}
          <div>
            <h4
              style={{
                fontSize: '0.875rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-text-primary)',
                marginBottom: '16px',
              }}
            >
              Trust, Privacy &amp; Feedback
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <li>
                <Link to="/terms" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Terms of Use
                </Link>
              </li>
              <li>
                <Link to="/privacy" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Privacy Policy &amp; Data Flows
                </Link>
              </li>
              <li>
                <Link to="/cookies" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Cookie Policy &amp; Toggles
                </Link>
              </li>
              <li>
                <Link to="/acceptable-use" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Acceptable Use Policy
                </Link>
              </li>
              <li>
                <Link to="/academic-integrity" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Academic Integrity Code
                </Link>
              </li>
              <li>
                <Link to="/ai-proctoring-notice" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Responsible AI Notice
                </Link>
              </li>
              <li>
                <Link to="/accessibility-statement" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Accessibility Statement
                </Link>
              </li>
              <li>
                <Link to="/project-feedback" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Evaluator Feedback
                </Link>
              </li>
              <li>
                <Link to="/contact" style={{ textDecoration: 'none', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Contact Project Team
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Academic Capstone Notice Banner */}
        <div
          style={{
            padding: '16px 20px',
            borderRadius: '8px',
            backgroundColor: 'var(--color-surface-secondary)',
            border: '1px solid var(--color-border-subtle)',
            marginBottom: '32px',
            fontSize: '0.8125rem',
            lineHeight: 1.5,
            color: 'var(--color-text-muted)',
          }}
        >
          <strong style={{ color: 'var(--color-text-primary)' }}>Academic Capstone Notice: </strong>
          ProctorNet was designed and developed by undergraduate computer science and engineering students as an academic software engineering project.
          It is an open educational demonstration demonstrating server-authoritative architecture, high-concurrency answer autosave, and ethical client-side proctoring.
          It is not a commercial enterprise service and is not for sale.
        </div>

        {/* Bottom Bar: Copyright & Source Link */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            paddingTop: '24px',
            borderTop: '1px solid var(--color-border-subtle)',
            fontSize: '0.8125rem',
            color: 'var(--color-text-subtle)',
          }}
        >
          <div>
            © {new Date().getFullYear()} ProctorNet Project Contributors • Released under MIT Academic License.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <a
              href={PROJECT_INFO.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-text-muted)', textDecoration: 'none' }}
            >
              GitHub Source Repository ↗
            </a>
            <span>•</span>
            <Link to="/contact" style={{ color: 'var(--color-text-muted)', textDecoration: 'none' }}>
              Academic Inquiry
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
