/**
 * @file PublicNotFoundPage.jsx
 * @description Accessible, branded 404 Not Found page for ProctorNet public website.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';

export function PublicNotFoundPage() {
  usePageMeta({
    title: '404 Page Not Found',
    description: 'The requested page could not be located on the ProctorNet academic platform.',
    canonical: '/404',
  });

  return (
    <div className="container" style={{ paddingTop: '80px', paddingBottom: '100px', maxWidth: '640px', textAlign: 'center' }}>
      <div className="card-interactive" style={{ padding: '48px 36px' }}>
        <span
          style={{
            display: 'inline-block',
            fontSize: '4rem',
            fontWeight: 800,
            lineHeight: 1,
            color: 'var(--color-primary)',
            marginBottom: '16px',
          }}
        >
          404
        </span>

        <h1
          style={{
            fontSize: '1.875rem',
            fontWeight: 800,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em',
            margin: '0 0 12px 0',
          }}
        >
          Page Not Found
        </h1>

        <p style={{ fontSize: '1rem', lineHeight: 1.6, color: 'var(--color-text-muted)', marginBottom: '32px' }}>
          The page or resource you requested does not exist or has been moved.
          Please check the URL or use one of the navigational shortcuts below.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px', marginBottom: '32px' }}>
          <Link to="/" className="btn-academic-primary" style={{ padding: '10px 20px' }}>
            Return to Home
          </Link>
          <Link to="/features" className="btn-academic-secondary" style={{ padding: '10px 20px' }}>
            View Features
          </Link>
          <Link to="/architecture" className="btn-academic-secondary" style={{ padding: '10px 20px' }}>
            Architecture Diagrams
          </Link>
          <Link to="/documentation" className="btn-academic-ghost" style={{ padding: '10px 16px' }}>
            Documentation Hub
          </Link>
        </div>

        <div
          style={{
            padding: '16px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-canvas)',
            fontSize: '0.85rem',
            color: 'var(--color-text-muted)',
          }}
        >
          Looking for candidate or faculty portals?{' '}
          <Link to="/login" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
            Sign In to Your Account →
          </Link>
        </div>
      </div>
    </div>
  );
}
