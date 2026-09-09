/**
 * @file ForInstitutionsPage.jsx
 * @description High-level architectural analysis for academic evaluators and institutions exploring self-hosted exam systems.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';

export function ForInstitutionsPage() {
  usePageMeta({
    title: 'Institutional Architecture & Data Sovereignty',
    description:
      'Architectural analysis of how educational institutions can self-host resilient, privacy-first examination platforms with zero vendor lock-in.',
    canonical: '/for-institutions',
  });

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ marginBottom: '40px' }}>
        <span className="badge-academic" style={{ marginBottom: '16px' }}>
          Institutional Evaluation
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
          Data Sovereignty &amp; Self-Hosted Integrity
        </h1>
        <p style={{ fontSize: '1.125rem', lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          A conceptual case study on how universities can own their assessment infrastructure,
          eliminate recurring per-seat vendor licensing, and ensure strict compliance with student privacy principles.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
        {/* Academic Evaluation Disclaimer */}
        <div
          style={{
            padding: '20px 24px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-surface-secondary)',
            borderLeft: '4px solid var(--color-primary)',
            fontSize: '0.9375rem',
            lineHeight: 1.6,
            color: 'var(--color-text-body)',
          }}
        >
          <strong style={{ color: 'var(--color-text-primary)' }}>Notice to Academic Evaluators: </strong>
          ProctorNet is an open-source educational engineering demonstration. This page explores how the architecture was
          specifically designed to satisfy institutional requirements for data sovereignty, cost control, and ethical governance.
        </div>

        {/* Section 1: Eliminating Commercial Vendor Lock-In */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            1. Eliminating Commercial SaaS Lock-In
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', marginBottom: '16px' }}>
            Universities currently spend millions on closed-source proctoring vendors that control student biometric data
            in proprietary clouds. ProctorNet demonstrates how an institution can maintain absolute sovereignty:
          </p>
          <ul style={{ paddingLeft: '20px', fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li>
              <strong>100% Open Infrastructure:</strong> Built on Node.js 24 LTS, PostgreSQL 16, Redis 7, RabbitMQ 3.13, and mediasoup 3. Zero dependency on proprietary third-party proctoring APIs.
            </li>
            <li>
              <strong>Self-Hosted Data Boundary:</strong> Exam blueprints, candidate responses, biometric embeddings, and audit logs reside strictly within institutional databases or private S3 buckets.
            </li>
            <li>
              <strong>No Per-Seat Metering:</strong> Eliminates commercial per-exam or per-minute billing models in favor of predictable cloud or on-premise compute allocation.
            </li>
          </ul>
        </section>

        {/* Section 2: Privacy Alignment with FERPA & GDPR */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            2. Foundational Compliance Alignment (FERPA &amp; GDPR)
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', marginBottom: '16px' }}>
            While an uncertified academic capstone, the system’s architecture was deliberately designed around foundational data protection principles:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9375rem', color: 'var(--color-brand-secondary)' }}>Data Minimization</strong>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                Only ephemeral screen context flags are collected. No continuous raw webcam video or microphone audio is persisted.
              </p>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9375rem', color: 'var(--color-brand-secondary)' }}>Purpose Limitation</strong>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                Candidate biometric baseline embeddings are utilized strictly for pre-exam identity verification and auto-purged after 90 days.
              </p>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.9375rem', color: 'var(--color-brand-secondary)' }}>Integrity &amp; Confidentiality</strong>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                Data encrypted at rest via AES-256 and in transit via TLS 1.3 with strict WireGuard management isolation.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Compute Economics */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            3. Operational Compute Economics
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', margin: 0 }}>
            By moving screen inference to candidate browser Web Workers, backend infrastructure compute requirements are drastically reduced.
            Instead of executing thousands of heavy computer vision neural networks on expensive GPU servers, institutional infrastructure
            focuses on lightweight WebRTC packet forwarding via mediasoup SFU workers and transaction persistence in PostgreSQL.
          </p>
        </section>

        {/* Links */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
              Review the Technical Architecture
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
              Inspect topological diagrams, security boundaries, and disaster recovery runbooks.
            </p>
          </div>
          <Link to="/architecture" className="btn-academic-primary" style={{ padding: '8px 20px', fontSize: '0.875rem' }}>
            System Architecture →
          </Link>
        </div>
      </div>
    </div>
  );
}
