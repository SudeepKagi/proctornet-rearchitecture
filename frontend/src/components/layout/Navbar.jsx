/**
 * @file Navbar.jsx
 * @description Accessible header navigation bar with user profile, role pill, and logout.
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { Badge } from '../common/Badge.jsx';
import { Button } from '../common/Button.jsx';

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const primaryRole = user?.roles?.[0] || 'STUDENT';

  return (
    <header
      style={{
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border-subtle)',
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      <div
        className="container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '60px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
              textDecoration: 'none',
              color: 'var(--color-text-primary)',
              fontWeight: 700,
              fontSize: '1.125rem',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-primary)',
                color: 'var(--color-text-inverse)',
                fontSize: '0.875rem',
                fontWeight: 700,
              }}
            >
              PN
            </span>
            ProctorNet
          </Link>

          {isAuthenticated && (
            <nav style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              <Link
                to="/candidate"
                style={{
                  color: 'var(--color-text-body)',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                Candidate Portal
              </Link>

              {user?.roles?.some((r) => ['FACULTY', 'ADMIN'].includes(r)) && (
                <>
                  <Link
                    to="/faculty"
                    style={{
                      color: 'var(--color-text-body)',
                      textDecoration: 'none',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                    }}
                  >
                    Faculty Exams
                  </Link>
                  <Link
                    to="/faculty/sessions"
                    style={{
                      color: 'var(--color-text-body)',
                      textDecoration: 'none',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                    }}
                  >
                    Sessions
                  </Link>
                </>
              )}

              {user?.roles?.some((r) => ['INVIGILATOR', 'ADMIN'].includes(r)) && (
                <Link
                  to="/invigilator"
                  style={{
                    color: 'var(--color-text-body)',
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  Invigilator
                </Link>
              )}

              {user?.roles?.includes('ADMIN') && (
                <>
                  <Link
                    to="/admin"
                    style={{
                      color: 'var(--color-text-body)',
                      textDecoration: 'none',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                    }}
                  >
                    Overview
                  </Link>
                  <Link
                    to="/admin/users"
                    style={{
                      color: 'var(--color-text-body)',
                      textDecoration: 'none',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                    }}
                  >
                    Users
                  </Link>
                  <Link
                    to="/admin/verifications"
                    style={{
                      color: 'var(--color-text-body)',
                      textDecoration: 'none',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                    }}
                  >
                    Verifications
                  </Link>
                  <Link
                    to="/admin/settings"
                    style={{
                      color: 'var(--color-text-body)',
                      textDecoration: 'none',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                    }}
                  >
                    Settings
                  </Link>
                  <Link
                    to="/admin/audit"
                    style={{
                      color: 'var(--color-text-body)',
                      textDecoration: 'none',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                    }}
                  >
                    Audit
                  </Link>
                </>
              )}

              {user?.roles?.includes('DEVELOPER') && (
                <Link
                  to="/developer"
                  style={{
                    color: 'var(--color-primary)',
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                  }}
                >
                  Developer Ops
                </Link>
              )}
            </nav>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {isAuthenticated ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                  {user.name || user.email}
                </span>
                <Badge variant="primary" size="sm">
                  {primaryRole}
                </Badge>
              </div>
              <Button variant="secondary" size="sm" onClick={handleLogout}>
                Sign Out
              </Button>
            </>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button variant="primary" size="sm" onClick={() => navigate('/login')}>
                Sign In
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
