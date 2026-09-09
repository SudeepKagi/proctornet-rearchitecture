/**
 * @file AccessibilityPage.jsx
 * @description Technical presentation of WCAG 2.1 AA accessibility implementations across ProctorNet.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';

export function AccessibilityPage() {
  usePageMeta({
    title: 'Accessibility Standards & WCAG 2.1 AA Compliance',
    description:
      'Learn how ProctorNet implements digital accessibility: full keyboard navigation, visible focus indicators, high contrast tokens, screen reader landmarks, and fluid text scaling.',
    canonical: '/accessibility',
  });

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ marginBottom: '40px' }}>
        <span className="badge-academic" style={{ marginBottom: '16px' }}>
          Inclusive Design Standards
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
          WCAG 2.1 AA Accessibility Architecture
        </h1>
        <p style={{ fontSize: '1.125rem', lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          ProctorNet was engineered from the foundation to be inclusive and barrier-free, ensuring that students
          with diverse physical, sensory, and cognitive abilities can take assessments with confidence.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
        {/* Section 1: Keyboard Navigation */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            1. Comprehensive Keyboard Navigation (WCAG 2.1.1)
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', marginBottom: '16px' }}>
            100% of interactive elements across public pages, exam workspaces, and administrative dashboards
            are fully operable via standard keyboard controls:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <code style={{ fontSize: '0.85rem', color: 'var(--color-primary)', fontWeight: 700 }}>Tab / Shift+Tab</code>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                Logical, predictable focus order matching the visual hierarchy across all layouts.
              </p>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <code style={{ fontSize: '0.85rem', color: 'var(--color-primary)', fontWeight: 700 }}>Enter / Space</code>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                Activates buttons, toggles checkboxes, selects radio options, and triggers menu drawers.
              </p>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
              <code style={{ fontSize: '0.85rem', color: 'var(--color-primary)', fontWeight: 700 }}>Escape Key</code>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                Immediately closes open dropdowns, mobile navigation drawers, and modal preference dialogs.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Visible Focus Rings */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            2. High-Contrast Focus Indicators (WCAG 2.4.7 &amp; 2.4.11)
          </h2>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', margin: '0 0 16px 0' }}>
            Focus outlines are never removed. Instead, a dedicated high-contrast token (`--focus-ring-outline: 3px solid #2563eb`)
            with a 2px offset ensures unambiguous visibility. Furthermore, Windows High Contrast Mode (`forced-colors: active`)
            is explicitly supported with `outline: 3px solid CanvasText !important`.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', backgroundColor: 'var(--color-canvas)', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>Test Focus Ring:</span>
            <button
              type="button"
              className="btn-academic-secondary"
              style={{ padding: '6px 14px', fontSize: '0.8125rem' }}
            >
              Tab to this Button
            </button>
          </div>
        </section>

        {/* Section 3: Fluid Scaling & Assistive Tech */}
        <section className="card-interactive" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
            3. Fluid Text Zoom &amp; Assistive Tech Compatibility
          </h2>
          <ul style={{ paddingLeft: '20px', fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <li>
              <strong>200% Text Zoom (WCAG 1.4.4):</strong> All layout dimensions use relative units (`rem`, `em`, `%`), allowing browsers to scale text up to 200% without horizontal scrolling or content clipping.
            </li>
            <li>
              <strong>Semantic Landmarks:</strong> Proper use of HTML5 elements (`header`, `nav`, `main`, `footer`, `section`, `article`) enables screen reader users to jump directly between regions.
            </li>
            <li>
              <strong>ARIA Live Regions:</strong> Dynamic exam timers, offline status alerts, and invigilator notifications announce status updates via `aria-live="polite"` or `aria-live="assertive"`.
            </li>
            <li>
              <strong>Prefers-Reduced-Motion:</strong> Respects candidate system preferences by forcing animation durations to near-zero (`0.01ms`), preventing vestibular trigger issues.
            </li>
          </ul>
        </section>

        {/* Statement Link */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
              Official Accessibility Statement
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
              Read our formal accessibility declaration, testing methodology, and remediation contact.
            </p>
          </div>
          <Link to="/accessibility-statement" className="btn-academic-primary" style={{ padding: '8px 20px', fontSize: '0.875rem' }}>
            Read Statement →
          </Link>
        </div>
      </div>
    </div>
  );
}
