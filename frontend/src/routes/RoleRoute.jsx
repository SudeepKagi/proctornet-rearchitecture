/**
 * @file RoleRoute.jsx
 * @description Route wrapper enforcing required user roles.
 */

import React from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

export function RoleRoute({ allowedRoles, children }) {
  const { user, isAuthenticated, loading, hasRole } = useAuth();

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
      <div style={{
        minHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <div style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-danger-border)',
          borderRadius: 'var(--radius-md)',
          padding: '2rem',
          maxWidth: '480px',
          boxShadow: 'var(--shadow-card)'
        }}>
          <h2 style={{ color: 'var(--color-danger)', marginBottom: '0.75rem' }}>Access Denied</h2>
          <p style={{ color: 'var(--color-text-body)', marginBottom: '1.5rem' }}>
            You do not have the required permissions to access this portal.
          </p>
          <Link
            to="/"
            style={{
              display: 'inline-block',
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-text-inverse)',
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-sm)',
              textDecoration: 'none',
              fontWeight: 500
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
