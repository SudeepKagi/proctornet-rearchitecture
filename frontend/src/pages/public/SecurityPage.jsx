/**
 * @file SecurityPage.jsx
 * @description Comprehensive technical disclosure of ProctorNet defense-in-depth security architecture.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';

export function SecurityPage() {
  usePageMeta({
    title: 'Defense-in-Depth Security & WireGuard Perimeter',
    description:
      'Detailed overview of ProctorNet security controls: RBAC/ABAC, JWT lifecycle with Redis blacklisting, PostgreSQL trigger immutability, and WireGuard VPN isolation.',
    canonical: '/security',
  });

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '960px' }}>
      {/* Header */}
      <div style={{ marginBottom: '40px' }}>
        <span className="badge-academic" style={{ marginBottom: '16px' }}>
          Security Architecture &amp; Controls
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
          Defense-in-Depth Security Architecture
        </h1>
        <p style={{ fontSize: '1.125rem', lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          Transparent documentation of ProctorNet authentication controls, tenant authorization gates,
          audit trail immutability, and network perimeter isolation.
        </p>
      </div>

      {/* Embedded SVG Security Diagram */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          marginBottom: '48px',
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <img
          src="/src/assets/diagrams/security-boundary.svg"
          alt="ProctorNet Security and Network Isolation Boundaries"
          style={{ width: '100%', height: 'auto', display: 'block' }}
          loading="lazy"
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
        {/* Section 1: Authentication & Session Lifecycle */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            1. Cryptographic Authentication &amp; JWT Lifecycle
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9375rem', color: 'var(--color-primary)' }}>Short-Lived Access Tokens</strong>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                15-minute expiration window signed with HMAC-SHA256, minimizing exposure window if a client token is intercepted.
              </p>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9375rem', color: 'var(--color-primary)' }}>Rotating Refresh Tokens</strong>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                7-day refresh tokens stored in HttpOnly, Secure, SameSite=Lax cookies with automatic single-use rotation.
              </p>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9375rem', color: 'var(--color-primary)' }}>Redis Real-Time Blacklisting</strong>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                Immediate token invalidation in Redis upon logout, password change, or security intervention, terminating active sessions instantly.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Authorization & BOLA Mitigation */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            2. Role &amp; Resource Tenancy Authorization (RBAC &amp; ABAC)
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', marginBottom: '16px' }}>
            To prevent Broken Object-Level Authorization (OWASP API Top 10 #1), ProctorNet enforces strict multi-layered checks:
          </p>
          <ul style={{ paddingLeft: '20px', fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li>
              <strong>Role Gates:</strong> Specific middleware checks whether the authenticated user possesses the required role (STUDENT, FACULTY, INVIGILATOR, ADMIN, DEVELOPER).
            </li>
            <li>
              <strong>Resource Ownership (BOLA Defense):</strong> Candidates can only access their own active attempt records. Even if a candidate knows another attempt UUID, backend queries bind strictly to `req.user.id`.
            </li>
            <li>
              <strong>Input Validation:</strong> Strict Zod schemas sanitize and validate 100% of request bodies, query parameters, and URL path variables before reaching business logic.
            </li>
          </ul>
        </section>

        {/* Section 3: WireGuard Zero-Trust Management Perimeter */}
        <section className="card-interactive" style={{ padding: '32px', borderLeft: '4px solid var(--color-brand-accent)' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            3. WireGuard VPN Isolated Operations Subnet (10.100.0.0/24)
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', margin: '0 0 16px 0' }}>
            Developer operations endpoints (`/api/v1/developer/*`) and administrative telemetry dashboards are completely isolated
            from the public internet. Access requires:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9rem', color: 'var(--color-text-primary)' }}>Gate 1: Cryptographic VPN Peer</strong>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                A valid WireGuard peer key mapped to the private `10.100.0.0/24` subnet. Public port 443 requests reject with 403 Forbidden.
              </p>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9rem', color: 'var(--color-text-primary)' }}>Gate 2: DEVELOPER Role JWT</strong>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                Even from inside the VPN, requests must authenticate with a valid JWT carrying the verified `DEVELOPER` role.
              </p>
            </div>
          </div>
        </section>

        {/* Section 4: Trigger-Enforced Audit Immutability */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            4. Database Trigger Immutability (SQLSTATE 20000)
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', margin: 0 }}>
            Audit records documenting exam creation, grade adjustments, proctor interventions, and incident reports are protected
            by PostgreSQL-level triggers. Any query attempting an `UPDATE` or `DELETE` on the audit log table is aborted immediately
            by the database engine with `SQLSTATE 20000`. This guarantees an append-only, tamper-proof record that cannot be manipulated
            even by a compromised application process.
          </p>
        </section>

        {/* Links */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
              Verify Security &amp; Compliance Details
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
              Read our data flow mapping, privacy policies, and operational runbooks.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Link to="/privacy" className="btn-academic-secondary" style={{ padding: '8px 16px', fontSize: '0.875rem' }}>
              Privacy Policy →
            </Link>
            <Link to="/architecture" className="btn-academic-primary" style={{ padding: '8px 16px', fontSize: '0.875rem' }}>
              System Architecture →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
