/**
 * @file PublicNavbar.jsx
 * @description Accessible public navigation header for ProctorNet educational website.
 * Features mobile drawer, keyboard accessibility, and dynamic auth state awareness.
 */

import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { PROJECT_INFO } from '../../content/projectInfo.js';

export function PublicNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [guidesDropdownOpen, setGuidesDropdownOpen] = useState(false);
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setGuidesDropdownOpen(false);
  }, [location.pathname]);

  // Determine user dashboard route
  const getDashboardRoute = () => {
    if (!user) return '/login';
    if (user.roles?.includes('ADMIN')) return '/admin';
    if (user.roles?.includes('DEVELOPER')) return '/developer/overview';
    if (user.roles?.includes('FACULTY')) return '/faculty';
    if (user.roles?.includes('INVIGILATOR')) return '/invigilator';
    return '/candidate';
  };

  return (
    <header
      role="banner"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backgroundColor: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        borderBottom: '1px solid var(--color-border-subtle)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div
        className="container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '68px',
        }}
      >
        {/* Brand & Academic Identity Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              textDecoration: 'none',
              color: 'var(--color-brand-primary)',
              fontWeight: 800,
              fontSize: '1.25rem',
            }}
            aria-label="ProctorNet Home"
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'var(--color-primary)',
                color: '#ffffff',
                fontSize: '1.1rem',
              }}
            >
              🎓
            </span>
            <span style={{ letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
              Proctor<span style={{ color: 'var(--color-primary)' }}>Net</span>
            </span>
          </Link>
          <span
            className="badge-academic"
            style={{
              display: 'none',
              fontSize: '0.72rem',
              padding: '2px 8px',
            }}
            id="navbar-academic-badge"
          >
            Academic Demo
          </span>
        </div>

        {/* Desktop Navigation Links */}
        <nav
          role="navigation"
          aria-label="Main Navigation"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
          }}
          className="desktop-nav"
        >
          <Link
            to="/about"
            style={{
              textDecoration: 'none',
              color: location.pathname === '/about' ? 'var(--color-primary)' : 'var(--color-text-body)',
              fontWeight: location.pathname === '/about' ? 600 : 500,
              fontSize: '0.9rem',
              transition: 'color var(--transition-fast)',
            }}
          >
            About
          </Link>

          <Link
            to="/features"
            style={{
              textDecoration: 'none',
              color: location.pathname === '/features' ? 'var(--color-primary)' : 'var(--color-text-body)',
              fontWeight: location.pathname === '/features' ? 600 : 500,
              fontSize: '0.9rem',
              transition: 'color var(--transition-fast)',
            }}
          >
            Features
          </Link>

          <Link
            to="/how-it-works"
            style={{
              textDecoration: 'none',
              color: location.pathname === '/how-it-works' ? 'var(--color-primary)' : 'var(--color-text-body)',
              fontWeight: location.pathname === '/how-it-works' ? 600 : 500,
              fontSize: '0.9rem',
              transition: 'color var(--transition-fast)',
            }}
          >
            How It Works
          </Link>

          {/* Guides Dropdown */}
          <div
            style={{ position: 'relative' }}
            onMouseEnter={() => setGuidesDropdownOpen(true)}
            onMouseLeave={() => setGuidesDropdownOpen(false)}
          >
            <button
              type="button"
              onClick={() => setGuidesDropdownOpen(!guidesDropdownOpen)}
              aria-expanded={guidesDropdownOpen}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-body)',
                fontWeight: 500,
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 0',
              }}
            >
              Guides ▾
            </button>
            {guidesDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  width: '210px',
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  padding: '8px 0',
                  zIndex: 60,
                }}
              >
                <Link
                  to="/for-students"
                  style={{
                    display: 'block',
                    padding: '8px 16px',
                    textDecoration: 'none',
                    color: 'var(--color-text-body)',
                    fontSize: '0.875rem',
                  }}
                >
                  Candidate Guide
                </Link>
                <Link
                  to="/for-faculty"
                  style={{
                    display: 'block',
                    padding: '8px 16px',
                    textDecoration: 'none',
                    color: 'var(--color-text-body)',
                    fontSize: '0.875rem',
                  }}
                >
                  Faculty &amp; Examiner Guide
                </Link>
                <Link
                  to="/for-institutions"
                  style={{
                    display: 'block',
                    padding: '8px 16px',
                    textDecoration: 'none',
                    color: 'var(--color-text-body)',
                    fontSize: '0.875rem',
                  }}
                >
                  Institutional Overview
                </Link>
              </div>
            )}
          </div>

          <Link
            to="/architecture"
            style={{
              textDecoration: 'none',
              color: location.pathname === '/architecture' ? 'var(--color-primary)' : 'var(--color-text-body)',
              fontWeight: location.pathname === '/architecture' ? 600 : 500,
              fontSize: '0.9rem',
              transition: 'color var(--transition-fast)',
            }}
          >
            Architecture
          </Link>

          <Link
            to="/ai-proctoring"
            style={{
              textDecoration: 'none',
              color: location.pathname === '/ai-proctoring' ? 'var(--color-primary)' : 'var(--color-text-body)',
              fontWeight: location.pathname === '/ai-proctoring' ? 600 : 500,
              fontSize: '0.9rem',
              transition: 'color var(--transition-fast)',
            }}
          >
            AI Ethics &amp; Screen
          </Link>

          <Link
            to="/documentation"
            style={{
              textDecoration: 'none',
              color: location.pathname.startsWith('/documentation') ? 'var(--color-primary)' : 'var(--color-text-body)',
              fontWeight: location.pathname.startsWith('/documentation') ? 600 : 500,
              fontSize: '0.9rem',
              transition: 'color var(--transition-fast)',
            }}
          >
            Docs
          </Link>

          <Link
            to="/faq"
            style={{
              textDecoration: 'none',
              color: location.pathname === '/faq' ? 'var(--color-primary)' : 'var(--color-text-body)',
              fontWeight: location.pathname === '/faq' ? 600 : 500,
              fontSize: '0.9rem',
              transition: 'color var(--transition-fast)',
            }}
          >
            FAQ
          </Link>
        </nav>

        {/* Action CTAs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isAuthenticated ? (
            <Link
              to={getDashboardRoute()}
              className="btn-academic-primary"
              style={{ padding: '8px 16px', fontSize: '0.875rem' }}
            >
              Go to Dashboard →
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="btn-academic-secondary"
                style={{ padding: '8px 16px', fontSize: '0.875rem' }}
              >
                Sign In
              </Link>
              <a
                href={PROJECT_INFO.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-academic-ghost"
                style={{ padding: '8px 12px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                aria-label="View source code on GitHub"
              >
                <span>GitHub</span> ↗
              </a>
            </>
          )}

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle Mobile Navigation Menu"
            style={{
              display: 'none',
              background: 'none',
              border: '1px solid var(--color-border-medium)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 10px',
              fontSize: '1.25rem',
              cursor: 'pointer',
            }}
            className="mobile-menu-btn"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          style={{
            backgroundColor: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border-subtle)',
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
          className="mobile-menu-drawer"
        >
          <Link to="/" style={{ textDecoration: 'none', color: 'var(--color-text-primary)', fontWeight: 600 }}>Home</Link>
          <Link to="/about" style={{ textDecoration: 'none', color: 'var(--color-text-primary)' }}>About Project</Link>
          <Link to="/features" style={{ textDecoration: 'none', color: 'var(--color-text-primary)' }}>Features</Link>
          <Link to="/how-it-works" style={{ textDecoration: 'none', color: 'var(--color-text-primary)' }}>How It Works</Link>
          <Link to="/for-students" style={{ textDecoration: 'none', color: 'var(--color-text-muted)' }}>Candidate Guide</Link>
          <Link to="/for-faculty" style={{ textDecoration: 'none', color: 'var(--color-text-muted)' }}>Faculty Guide</Link>
          <Link to="/for-institutions" style={{ textDecoration: 'none', color: 'var(--color-text-muted)' }}>Institutional Overview</Link>
          <Link to="/architecture" style={{ textDecoration: 'none', color: 'var(--color-text-primary)' }}>System Architecture</Link>
          <Link to="/ai-proctoring" style={{ textDecoration: 'none', color: 'var(--color-text-primary)' }}>AI Ethics &amp; Screen</Link>
          <Link to="/documentation" style={{ textDecoration: 'none', color: 'var(--color-text-primary)' }}>Documentation Hub</Link>
          <Link to="/faq" style={{ textDecoration: 'none', color: 'var(--color-text-primary)' }}>FAQ</Link>
          <Link to="/contact" style={{ textDecoration: 'none', color: 'var(--color-text-primary)' }}>Contact &amp; Feedback</Link>
        </div>
      )}

      {/* Responsive media query styling */}
      <style>{`
        @media (min-width: 900px) {
          #navbar-academic-badge {
            display: inline-flex !important;
          }
        }
        @media (max-width: 899px) {
          .desktop-nav {
            display: none !important;
          }
          .mobile-menu-btn {
            display: block !important;
          }
        }
      `}</style>
    </header>
  );
}
