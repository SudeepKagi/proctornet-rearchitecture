/**
 * @file DocumentationHubPage.jsx
 * @description Central public engineering documentation hub for ProctorNet.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';
import { PROJECT_INFO } from '../../content/projectInfo.js';

export function DocumentationHubPage() {
  usePageMeta({
    title: 'Engineering Documentation Hub & Technical Specs',
    description:
      'Authoritative engineering documentation for ProctorNet: architecture specifications, OpenAPI 3.1 schemas, operational runbooks, and disaster recovery procedures.',
    canonical: '/documentation',
  });

  const docSections = [
    {
      title: '1. Architecture & Design Specifications',
      icon: '🏛️',
      description: 'System topologies, modular monolith domain boundaries, and architectural decision records.',
      links: [
        { label: 'Master Architecture Specification (docs/ARCHITECTURE.md)', type: 'repo' },
        { label: 'ADR-0013: Public Information Architecture & Static Asset Delivery', type: 'repo' },
        { label: 'ADR-0014: Privacy-Preserving Telemetry & First-Party Consent', type: 'repo' },
        { label: 'Interactive Architecture Walkthrough', route: '/architecture' },
      ],
    },
    {
      title: '2. API Specifications & Data Contracts',
      icon: '🔌',
      description: 'OpenAPI 3.1 machine-readable schemas, data models, and optimistic concurrency contracts.',
      links: [
        { label: 'OpenAPI 3.1 Specification (docs/api/openapi.json)', type: 'repo' },
        { label: 'Exam Blueprint & OCC Revision Schema', type: 'repo' },
        { label: 'WebSocket Realtime Signaling Protocol', type: 'repo' },
      ],
    },
    {
      title: '3. Security Controls & Governance',
      icon: '🛡️',
      description: 'Defense-in-depth model, RBAC/ABAC authorization, and trigger-locked audit trails.',
      links: [
        { label: 'Security Controls & Exceptions (docs/SECURITY_AUDIT_EXCEPTIONS.md)', type: 'repo' },
        { label: 'WireGuard Isolated Operations Perimeter', route: '/security' },
        { label: 'Responsible AI & Screen Analysis Notice', route: '/ai-proctoring-notice' },
      ],
    },
    {
      title: '4. Operational Runbooks & Procedures',
      icon: '📖',
      description: 'Step-by-step production runbooks for operators, developers, and system administrators.',
      links: [
        { label: 'Master Operations Runbook (docs/runbooks/OPERATIONS_RUNBOOK.md)', type: 'repo' },
        { label: 'Disaster Recovery Runbook (docs/runbooks/DISASTER_RECOVERY_RUNBOOK.md)', type: 'repo' },
        { label: 'WireGuard Gateway Setup (docs/runbooks/WIREGUARD_RUNBOOK.md)', type: 'repo' },
        { label: 'Standard Runbooks RB-01 through RB-12', type: 'repo' },
      ],
    },
    {
      title: '5. Testing & Chaos Verification',
      icon: '🧪',
      description: 'Automated test matrices, load testing thresholds, and chaos engineering benchmarks.',
      links: [
        { label: 'E2E Public Navigation & Form Validation Suites', type: 'code' },
        { label: 'axe-core Automated WCAG 2.1 AA Audits', type: 'code' },
        { label: 'Broker Failure Chaos Verification Test ([MEASURED] 0 Loss)', type: 'code' },
      ],
    },
    {
      title: '6. Legal, Privacy & Policies',
      icon: '⚖️',
      description: 'Educational Terms of Use, empirical Privacy Policies, and Cookie inventories.',
      links: [
        { label: 'Terms of Use', route: '/terms' },
        { label: 'Privacy Policy & Data Retention', route: '/privacy' },
        { label: 'Cookie Policy & Consent Controls', route: '/cookies' },
        { label: 'Accessibility Statement', route: '/accessibility-statement' },
      ],
    },
  ];

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '1000px' }}>
      {/* Header */}
      <div style={{ marginBottom: '40px' }}>
        <span className="badge-academic" style={{ marginBottom: '12px' }}>
          Authoritative Engineering Hub
        </span>
        <h1
          style={{
            fontSize: 'clamp(2rem, 4vw, 2.75rem)',
            fontWeight: 800,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em',
            margin: '8px 0 12px 0',
          }}
        >
          Engineering Documentation Hub
        </h1>
        <p style={{ fontSize: '1.125rem', lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          Comprehensive documentation describing the final implemented system architecture,
          operational runbooks, security models, and verification suites.
        </p>
      </div>

      {/* Doc Sections Grid */}
      <div className="grid-2-col" style={{ marginBottom: '48px' }}>
        {docSections.map((sec, idx) => (
          <div
            key={idx}
            className="card-interactive"
            style={{
              padding: '28px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ fontSize: '1.5rem' }}>{sec.icon}</span>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
                  {sec.title}
                </h2>
              </div>
              <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                {sec.description}
              </p>

              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {sec.links.map((link, lIdx) => (
                  <li key={lIdx}>
                    {link.route ? (
                      <Link
                        to={link.route}
                        style={{
                          color: 'var(--color-primary)',
                          textDecoration: 'none',
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span>→</span> {link.label}
                      </Link>
                    ) : (
                      <span
                        style={{
                          color: 'var(--color-text-body)',
                          fontSize: '0.875rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span style={{ color: 'var(--color-text-muted)' }}>•</span> {link.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {/* GitHub Callout */}
      <div
        className="glass-panel"
        style={{
          padding: '32px',
          textAlign: 'center',
          backgroundColor: 'var(--color-surface)',
        }}
      >
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
          Inspect Full Source Code in GitHub
        </h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', maxWidth: '580px', margin: '0 auto 20px auto' }}>
          All source files, test suites, Docker compose topologies, and migration scripts are open source and available for academic review.
        </p>
        <a
          href={PROJECT_INFO.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-academic-primary"
          style={{ padding: '10px 24px', fontSize: '0.9375rem' }}
        >
          View Source Code on GitHub ↗
        </a>
      </div>
    </div>
  );
}
