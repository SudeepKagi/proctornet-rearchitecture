/**
 * @file AiProctoringPage.jsx
 * @description In-depth technical exploration of client-side screen analysis and biometric verification.
 * Strictly adheres to direct capability terminology and ethical AI governance.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';

export function AiProctoringPage() {
  usePageMeta({
    title: 'Client-Side Screen Analysis & Ethical AI Architecture',
    description:
      'Technical breakdown of ProctorNet ethical proctoring: in-browser Web Worker heuristics, server-authoritative 0–100 risk scoring, and mandatory human-in-the-loop governance.',
    canonical: '/ai-proctoring',
  });

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '960px' }}>
      {/* Header */}
      <div style={{ marginBottom: '40px' }}>
        <span className="badge-academic" style={{ marginBottom: '16px' }}>
          Ethical AI &amp; Heuristic Architecture
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
          Client-Side Screen Analysis &amp; Ethical Governance
        </h1>
        <p style={{ fontSize: '1.125rem', lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          How ProctorNet balances academic integrity and candidate dignity: in-browser Web Worker triage,
          server-authoritative risk scoring, and zero continuous facial or audio surveillance.
        </p>
      </div>

      {/* Embedded SVG Screen Pipeline Diagram */}
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
          src="/src/assets/diagrams/screen-proctoring-pipeline.svg"
          alt="ProctorNet Screen Proctoring and Analysis Pipeline"
          style={{ width: '100%', height: 'auto', display: 'block' }}
          loading="lazy"
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
        {/* Section 1: Ethical Boundary Comparison */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            1. Ethical Boundary Setting: Commercial Panopticon vs. ProctorNet
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border-medium)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-primary)' }}>Dimension</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-danger)' }}>Invasive Commercial Panopticon</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-success)' }}>ProctorNet Ethical Architecture</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>Webcam Surveillance</td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text-muted)' }}>Continuous facial emotion AI &amp; gaze tracking</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Pre-exam identity check only; no continuous video AI</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>Microphone Audio</td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text-muted)' }}>Continuous ambient audio streaming &amp; speech AI</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Zero ambient audio listening; 0 audio models</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>Screen Processing</td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text-muted)' }}>Continuous raw desktop video recorded to vendor cloud</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Client-side Web Worker analysis; only ephemeral flags sent</td>
                </tr>
                <tr>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>Disciplinary Action</td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text-muted)' }}>Automated test termination on algorithmic trigger</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Human-in-the-loop strictly required; AI only triages</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 2: In-Browser Web Worker Inference */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            2. Client-Side Web Worker Inference Architecture
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', marginBottom: '16px' }}>
            To protect candidate privacy and preserve smooth frontend performance, screen analysis executes entirely
            off the browser main thread in dedicated <strong>Web Workers</strong>:
          </p>
          <ul style={{ paddingLeft: '20px', fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li>
              <strong>Zero UI Stutter:</strong> Display frame analysis runs asynchronously without blocking user input or exam navigation.
            </li>
            <li>
              <strong>Context Switch Classification:</strong> Detects full-screen drops, window blurs, tab switching, and virtual desktop changes.
            </li>
            <li>
              <strong>Lightweight Telemetry Payloads:</strong> Instead of transmitting high-bandwidth video streams to cloud AI endpoints, the worker transmits compact, periodic anomaly events.
            </li>
          </ul>
        </section>

        {/* Section 3: Authoritative 0-100 Risk Engine */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            3. Server-Authoritative 0–100 Risk Engine
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', marginBottom: '16px' }}>
            Because client-reported telemetry cannot be unconditionally trusted, raw flags are evaluated on the backend server:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <span className="badge-measured" style={{ marginBottom: '8px' }}>Risk &lt; 20</span>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-risk-low)', margin: '4px 0' }}>Low Risk Tier</h4>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: 0 }}>
                Normal exam activity with zero or isolated transient focus events. Standard priority in invigilator matrix.
              </p>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <span className="badge-measured" style={{ marginBottom: '8px' }}>Risk 20–50</span>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-risk-medium)', margin: '4px 0' }}>Elevated Risk Tier</h4>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: 0 }}>
                Multiple blur events or full-screen exit. Candidate tile promoted to upper ranks in invigilator matrix.
              </p>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <span className="badge-measured" style={{ marginBottom: '8px' }}>Risk &gt; 50</span>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-risk-high)', margin: '4px 0' }}>High Risk Tier</h4>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: 0 }}>
                Prolonged absence from exam context. Triggers immediate visual alert on invigilator console for live intervention.
              </p>
            </div>
          </div>
        </section>

        {/* Section 4: Human-in-the-Loop Pledge */}
        <section className="glass-panel" style={{ padding: '32px', borderLeft: '4px solid var(--color-primary)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '10px' }}>
            Mandatory Human Oversight &amp; Auditability
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--color-text-body)', marginBottom: '16px' }}>
            In ProctorNet, algorithms do not pass judgment. The 0–100 risk score exists purely to help human invigilators
            navigate a 12-stream video matrix efficiently. Any warning, exam pause, or re-verification demand requires explicit
            human proctor action, and all events are recorded with PostgreSQL trigger immutability (`SQLSTATE 20000`).
          </p>
          <Link to="/ai-proctoring-notice" className="btn-academic-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
            Read Responsible AI Disclosure →
          </Link>
        </section>
      </div>
    </div>
  );
}
