/**
 * @file RoleRoute.jsx
 * @description Route wrapper enforcing required user roles.
 */

import React from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

export function RoleRoute({ allowedRoles, children }) {
  const { isAuthenticated, loading, hasRole } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '0.9375rem', color: 'var(--color-text-muted)' }}>Checking authorization...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!hasRole(allowedRoles)) {
    return (
      <div
        style={{
          minHeight: '70vh',
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
            backgroundColor: 'var(--color-surface, #ffffff)',
            border: '1px solid var(--color-danger-border, #fecaca)',
            borderRadius: 'var(--radius-md, 8px)',
            padding: '2rem',
            maxWidth: '480px',
            boxShadow: 'var(--shadow-card, 0 1px 3px rgba(0,0,0,0.05))',
          }}
        >
          <h2 style={{ color: 'var(--color-danger, #dc2626)', marginBottom: '0.75rem', fontSize: '1.25rem' }}>
            Access Denied
          </h2>
          <p style={{ color: 'var(--color-text-body, #334155)', marginBottom: '1.5rem', fontSize: '0.9375rem' }}>
            You do not have the required permissions to access this portal.
          </p>
          <Link
            to="/dashboard"
            style={{
              display: 'inline-block',
              backgroundColor: 'var(--color-primary, #1d4ed8)',
              color: '#ffffff',
              padding: '0.5rem 1.25rem',
              borderRadius: 'var(--radius-sm, 6px)',
              textDecoration: 'none',
              fontWeight: 500,
              fontSize: '0.875rem',
            }}
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return children;
}
