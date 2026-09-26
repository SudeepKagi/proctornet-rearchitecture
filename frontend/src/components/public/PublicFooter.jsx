/**
 * @file PublicFooter.jsx
 * @description Compact, academic footer for ProctorNet Online Examination System.
 * Displays brand identity, 6 essential links (About, How It Works, FAQ, Privacy, Terms, Login), and copyright.
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

export function PublicFooter() {
  const location = useLocation();

  const footerLinks = [
    { label: 'About', href: '/about', isHash: false },
    { label: 'How It Works', href: '/#how-it-works', isHash: true, id: 'how-it-works' },
    { label: 'FAQ', href: '/#faq', isHash: true, id: 'faq' },
    { label: 'Privacy', href: '/privacy', isHash: false },
    { label: 'Terms', href: '/terms', isHash: false },
    { label: 'Login', href: '/login', isHash: false },
  ];

  const handleLinkClick = (item, e) => {
    if (item.isHash && location.pathname === '/') {
      e.preventDefault();
      const el = document.getElementById(item.id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <footer
      role="contentinfo"
      style={{
        width: '100%',
        backgroundColor: '#ffffff',
        borderTop: '1px solid #e2e8f0',
        padding: '2.5rem 0 2rem',
        marginTop: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0 clamp(1rem, 3vw, 2rem)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        {/* Top row: Brand & 6 essential links */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1.25rem',
          }}
        >
          {/* Brand Identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                backgroundColor: '#1d4ed8',
                color: '#ffffff',
              }}
            >
              <BookOpen size={16} strokeWidth={2.2} />
            </div>
            <span
              style={{
                fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif',
                fontWeight: 700,
                fontSize: '1.0625rem',
                color: '#0f172a',
                letterSpacing: '-0.01em',
              }}
            >
              Proctor<span style={{ color: '#1d4ed8' }}>Net</span>
            </span>
            <span
              style={{
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: '0.8125rem',
                color: '#64748b',
                marginLeft: '0.25rem',
              }}
            >
              • Online Examination System
            </span>
          </div>

          {/* Essential Navigation Links */}
          <nav
            aria-label="Footer Navigation"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 'clamp(0.75rem, 2vw, 1.5rem)',
            }}
          >
            {footerLinks.map((item) =>
              item.isHash ? (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={(e) => handleLinkClick(item, e)}
                  style={{
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontSize: '0.875rem',
                    color: '#475569',
                    textDecoration: 'none',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#1d4ed8')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.label}
                  to={item.href}
                  style={{
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontSize: '0.875rem',
                    color: '#475569',
                    textDecoration: 'none',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#1d4ed8')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
                >
                  {item.label}
                </Link>
              )
            )}
          </nav>
        </div>

        {/* Bottom row: Academic copyright notice */}
        <div
          style={{
            borderTop: '1px solid #f1f5f9',
            paddingTop: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.8125rem',
            color: '#64748b',
            fontFamily: 'Inter, system-ui, sans-serif',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <p style={{ margin: 0 }}>
            © {new Date().getFullYear()} ProctorNet. Academic Examination Platform. All rights reserved.
          </p>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            Built for Academic Coursework & Institutional Assessments
          </span>
        </div>
      </div>
    </footer>
  );
}
