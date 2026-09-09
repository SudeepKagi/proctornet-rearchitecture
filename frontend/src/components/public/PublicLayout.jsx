/**
 * @file PublicLayout.jsx
 * @description Master layout wrapper for all public-facing pages in ProctorNet.
 * Includes skip links for accessibility, PublicNavbar, CookieConsentBanner, and PublicFooter.
 */

import React from 'react';
import { Outlet } from 'react-router-dom';
import { PublicNavbar } from './PublicNavbar.jsx';
import { PublicFooter } from './PublicFooter.jsx';
import { CookieConsentBanner } from './CookieConsentBanner.jsx';

export function PublicLayout() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        backgroundColor: 'var(--color-canvas)',
        color: 'var(--color-text-body)',
      }}
    >
      {/* WCAG 2.4.1 Skip Link */}
      <a
        href="#main-content"
        className="sr-only"
        style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          zIndex: 99999,
          padding: '8px 16px',
          backgroundColor: 'var(--color-primary)',
          color: '#ffffff',
          borderRadius: 'var(--radius-sm)',
          textDecoration: 'none',
          fontWeight: 600,
        }}
        onFocus={(e) => {
          e.target.style.position = 'fixed';
          e.target.style.width = 'auto';
          e.target.style.height = 'auto';
          e.target.style.clip = 'auto';
        }}
        onBlur={(e) => {
          e.target.style.position = 'absolute';
          e.target.style.width = '1px';
          e.target.style.height = '1px';
          e.target.style.clip = 'rect(0, 0, 0, 0)';
        }}
      >
        Skip to main content
      </a>

      {/* Navigation Header */}
      <PublicNavbar />

      {/* Main Content Area */}
      <main
        id="main-content"
        tabIndex="-1"
        style={{
          flex: 1,
          outline: 'none',
        }}
      >
        <Outlet />
      </main>

      {/* Cookie Consent Banner */}
      <CookieConsentBanner />

      {/* Global Footer */}
      <PublicFooter />
    </div>
  );
}
