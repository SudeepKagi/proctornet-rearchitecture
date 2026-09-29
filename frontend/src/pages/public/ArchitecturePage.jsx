/**
 * @file ArchitecturePage.jsx
 * @description Deep-dive technical system architecture walkthrough featuring dedicated high-resolution SVGs.
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';

export function ArchitecturePage() {
  usePageMeta({
    title: 'System Architecture & Engineering Topologies',
    description:
      'Detailed technical walkthrough of ProctorNet system architecture: modular monolith, dual-plane separation, mediasoup WebRTC, and WireGuard network perimeters.',
    canonical: '/architecture',
  });

  const [activeDiagram, setActiveDiagram] = useState('topology');

  const diagrams = {
    topology: {
      title: 'Modular Monolith & Dual-Plane Ingress',
      subtitle: 'Complete Cloud Topology (AWS ALB, Coturn, Node.js 24, PostgreSQL, Redis, RabbitMQ, WireGuard)',
      src: '/src/assets/diagrams/system-topology.svg',
      description:
        'The backend is structured as a modular monolith running in Node.js 24 LTS. Public HTTP requests terminate at an AWS Application Load Balancer with TLS 1.3, while WebRTC video streams negotiate via Coturn STUN/TURN directly into mediasoup SFU worker processes.',
    },
    screen: {
      title: 'Client-Side Screen Analysis & Risk Triage',
      subtitle: 'Off-Thread Web Worker Inference & Authoritative 0–100 Server Risk Engine',
      src: '/src/assets/diagrams/screen-proctoring-pipeline.svg',
      description:
        'Display analysis executes locally inside candidate browser Web Workers without transmitting raw video to cloud AI services. Only compact telemetry flags are dispatched to the backend, which applies exponential decay to calculate an authoritative 0–100 risk score.',
    },
    lifecycle: {
      title: 'End-to-End Examination Lifecycle',
      subtitle: '5-Stage Lifecycle from Blueprint Authoring to Immutable Score Release',
      src: '/src/assets/diagrams/exam-lifecycle.svg',
      description:
        'Illustrates the complete operational flow: blueprint quotas, session scheduling, pre-exam biometric verification, live OCC answer synchronization, and blind rubric grading.',
    },
    security: {
      title: 'Defense-in-Depth & Network Isolation Boundary',
      subtitle: 'Tiered Perimeter with WireGuard 10.100.0.0/24 Management Network',
      src: '/src/assets/diagrams/security-boundary.svg',
      description:
        'Demonstrates how public routes are cleanly isolated from authenticated role portals and how internal developer operations telemetry endpoints are strictly walled behind a private WireGuard VPN subnet.',
    },
  };

  const current = diagrams[activeDiagram];

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '1000px' }}>
      {/* Developer notice banner */}
      <div
        style={{
          padding: '16px 20px',
          background: 'var(--color-bg-secondary, #f8fafc)',
          borderRadius: '8px',
          border: '1px solid var(--color-border-subtle, #e2e8f0)',
          marginBottom: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <strong style={{ fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>
            Developer & Systems Architecture Reference
          </strong>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            This page provides technical engineering specifications for developers, IT architects, and security reviewers. Exam takers do not need to read this page.
          </p>
        </div>
        <Link to="/how-it-works" className="btn-academic-secondary" style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
          Student Guide →
        </Link>
      </div>

      {/* Header */}
      <div style={{ marginBottom: '36px' }}>
        <span className="badge-academic" style={{ marginBottom: '12px' }}>
          Technical Specifications (Optional Reference)
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
          System Architecture Walkthrough
        </h1>
        <p style={{ fontSize: '1.125rem', lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          Detailed topological diagrams and engineering design rationales for the ProctorNet platform.
        </p>
      </div>

      {/* Diagram Selector Tabs */}
      <div
        role="tablist"
        aria-label="Architecture Diagrams"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '28px',
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeDiagram === 'topology'}
          onClick={() => setActiveDiagram('topology')}
          style={{
            padding: '10px 18px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid',
            borderColor: activeDiagram === 'topology' ? 'var(--color-primary)' : 'var(--color-border-medium)',
            backgroundColor: activeDiagram === 'topology' ? 'var(--color-primary)' : 'var(--color-surface)',
            color: activeDiagram === 'topology' ? '#ffffff' : 'var(--color-text-body)',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          1. System Topology
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeDiagram === 'screen'}
          onClick={() => setActiveDiagram('screen')}
          style={{
            padding: '10px 18px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid',
            borderColor: activeDiagram === 'screen' ? 'var(--color-primary)' : 'var(--color-border-medium)',
            backgroundColor: activeDiagram === 'screen' ? 'var(--color-primary)' : 'var(--color-surface)',
            color: activeDiagram === 'screen' ? '#ffffff' : 'var(--color-text-body)',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          2. Screen Analysis Pipeline
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeDiagram === 'lifecycle'}
          onClick={() => setActiveDiagram('lifecycle')}
          style={{
            padding: '10px 18px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid',
            borderColor: activeDiagram === 'lifecycle' ? 'var(--color-primary)' : 'var(--color-border-medium)',
            backgroundColor: activeDiagram === 'lifecycle' ? 'var(--color-primary)' : 'var(--color-surface)',
            color: activeDiagram === 'lifecycle' ? '#ffffff' : 'var(--color-text-body)',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          3. Exam Lifecycle
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeDiagram === 'security'}
          onClick={() => setActiveDiagram('security')}
          style={{
            padding: '10px 18px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid',
            borderColor: activeDiagram === 'security' ? 'var(--color-primary)' : 'var(--color-border-medium)',
            backgroundColor: activeDiagram === 'security' ? 'var(--color-primary)' : 'var(--color-surface)',
            color: activeDiagram === 'security' ? '#ffffff' : 'var(--color-text-body)',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          4. Security &amp; WireGuard Perimeter
        </button>
      </div>

      {/* Selected Diagram Display Box */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '40px',
        }}
      >
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 4px 0' }}>
            {current.title}
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-primary)', fontWeight: 600, margin: '0 0 8px 0' }}>
            {current.subtitle}
          </p>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--color-text-body)', margin: 0 }}>
            {current.description}
          </p>
        </div>

        <div
          style={{
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            border: '1px solid var(--color-border-subtle)',
            boxShadow: 'var(--shadow-sm)',
            backgroundColor: '#ffffff',
          }}
        >
          <img
            src={current.src}
            alt={current.title}
            style={{ width: '100%', height: 'auto', display: 'block' }}
            loading="lazy"
          />
        </div>
      </div>

      {/* Deep-Dive Subsystem Breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
          Subsystem Architectural Breakdown
        </h2>

        <div className="grid-2-col">
          <div className="card-interactive" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '8px' }}>
              Modular Monolith Core
            </h3>
            <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--color-text-body)', margin: 0 }}>
              Written in Node.js 24 LTS, structured with distinct domain boundaries (auth, exams, attempts, proctoring, telemetry, developer).
              Enables single-process simplicity with microservices-grade modularity.
            </p>
          </div>

          <div className="card-interactive" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-brand-secondary)', marginBottom: '8px' }}>
              mediasoup SFU Workers
            </h3>
            <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--color-text-body)', margin: 0 }}>
              C++ native mediasoup workers handle WebRTC multi-stream multiplexing. Media is routed directly between peers and SFU pipes
              without touching the Node.js V8 heap, ensuring sub-300ms glass-to-glass latency.
            </p>
          </div>

          <div className="card-interactive" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-brand-accent)', marginBottom: '8px' }}>
              Transactional Outbox &amp; RabbitMQ
            </h3>
            <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--color-text-body)', margin: 0 }}>
              Domain events are saved into PostgreSQL outbox tables within the same atomic transaction as answer mutations, then relayed
              asynchronously to RabbitMQ. Ensures zero event loss during broker downtime.
            </p>
          </div>

          <div className="card-interactive" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-success)', marginBottom: '8px' }}>
              PostgreSQL Trigger Immutability
            </h3>
            <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--color-text-body)', margin: 0 }}>
              Audit log records are defended by PostgreSQL-level triggers enforcing append-only semantics. Any UPDATE or DELETE query
              raises SQLSTATE 20000, establishing a mathematically tamper-proof assessment trail.
            </p>
          </div>
        </div>

        {/* Documentation Hub CTA */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
              Need API Schemas or Deployment Runbooks?
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
              Visit the Documentation Hub for OpenAPI 3.1 specifications and operational procedures.
            </p>
          </div>
          <Link to="/documentation" className="btn-academic-primary" style={{ padding: '8px 20px', fontSize: '0.875rem' }}>
            View Documentation Hub →
          </Link>
        </div>
      </div>
    </div>
  );
}
