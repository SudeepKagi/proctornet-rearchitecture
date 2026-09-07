/**
 * @file NotFoundPage.jsx
 * @description 404 page for unmatched application routes.
 */

import React from 'react';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div
      style={{
        minHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '2.5rem',
          maxWidth: '440px',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <span
          style={{
            fontSize: '3rem',
            fontWeight: 800,
            color: 'var(--color-primary)',
            lineHeight: 1,
            display: 'block',
            marginBottom: '0.5rem',
          }}
        >
          404
        </span>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: 'var(--color-text-primary)' }}>
          Page Not Found
        </h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem', fontSize: '0.9375rem' }}>
          The page you requested could not be found or has moved.
        </p>
        <Link
          to="/"
          style={{
            display: 'inline-block',
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-text-inverse)',
            padding: '0.5rem 1.25rem',
            borderRadius: 'var(--radius-sm)',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          Go to Home
        </Link>
      </div>
    </div>
  );
}
