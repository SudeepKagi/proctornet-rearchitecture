/**
 * @file FeaturesPage.jsx
 * @description Exhaustive, capability-oriented feature catalog for ProctorNet.
 * Adheres strictly to direct capability presentation with zero development phase numbers.
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';
import { FEATURE_CATEGORIES } from '../../content/featuresData.js';

export function FeaturesPage() {
  usePageMeta({
    title: 'Platform Capabilities & Engineering Features',
    description:
      'Detailed catalog of ProctorNet capabilities across examination engines, client-side screen analysis, real-time invigilation, biometrics, and security.',
    canonical: '/features',
  });

  const [activeCategoryId, setActiveCategoryId] = useState(FEATURE_CATEGORIES[0].id);
  const activeCategory = FEATURE_CATEGORIES.find((c) => c.id === activeCategoryId) || FEATURE_CATEGORIES[0];

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px' }}>
      {/* Header */}
      <div style={{ maxWidth: '800px', marginBottom: '40px' }}>
        <span className="badge-academic" style={{ marginBottom: '16px' }}>
          Platform Feature Catalog
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
          Comprehensive Engineering Capabilities
        </h1>
        <p style={{ fontSize: '1.125rem', lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          Every feature listed below is fully implemented and tested in the ProctorNet codebase.
          Capabilities are organized by functional domain.
        </p>
      </div>

      {/* Category Navigation Pills */}
      <div
        role="tablist"
        aria-label="Feature Domains"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          marginBottom: '36px',
          borderBottom: '1px solid var(--color-border-subtle)',
          paddingBottom: '16px',
        }}
      >
        {FEATURE_CATEGORIES.map((cat) => {
          const isActive = cat.id === activeCategoryId;
          return (
            <button
              key={cat.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveCategoryId(cat.id)}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid',
                borderColor: isActive ? 'var(--color-primary)' : 'var(--color-border-medium)',
                backgroundColor: isActive ? 'var(--color-primary)' : 'var(--color-surface)',
                color: isActive ? '#ffffff' : 'var(--color-text-body)',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              {cat.title}
            </button>
          );
        })}
      </div>

      {/* Active Category Header */}
      <div style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 8px 0' }}>
          {activeCategory.title}
        </h2>
        <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-muted)', margin: 0 }}>
          {activeCategory.description}
        </p>
      </div>

      {/* Feature Cards Grid */}
      <div className="grid-2-col" style={{ marginBottom: '48px' }}>
        {activeCategory.features.map((feature, idx) => (
          <div
            key={idx}
            className="card-interactive"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '24px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--color-primary)',
                    letterSpacing: '0.05em',
                  }}
                >
                  {feature.tag}
                </span>
                <span className="badge-measured" style={{ fontSize: '0.7rem' }}>
                  {feature.metrics}
                </span>
              </div>

              <h3 style={{ fontSize: '1.1875rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 10px 0' }}>
                {feature.name}
              </h3>
              <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--color-text-body)', margin: 0 }}>
                {feature.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Callout to Architecture */}
      <div
        className="glass-panel"
        style={{
          padding: '32px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '24px',
          backgroundColor: 'var(--color-surface)',
        }}
      >
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 6px 0' }}>
            Explore the Underlying System Architecture
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', margin: 0 }}>
            Inspect SVG topology diagrams, transactional outbox flows, and data boundary contracts.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link to="/how-it-works" className="btn-academic-secondary" style={{ padding: '8px 16px' }}>
            View Lifecycle →
          </Link>
          <Link to="/architecture" className="btn-academic-primary" style={{ padding: '8px 16px' }}>
            System Architecture →
          </Link>
        </div>
      </div>
    </div>
  );
}
