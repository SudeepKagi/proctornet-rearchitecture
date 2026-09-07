/**
 * @file AppLayout.jsx
 * @description Application shell wrapping Navbar and main content layout.
 */

import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar.jsx';

export function AppLayout() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <main style={{ flex: 1, padding: '2rem 0' }}>
        <Outlet />
      </main>
      <footer
        style={{
          borderTop: '1px solid var(--color-border-subtle)',
          backgroundColor: 'var(--color-surface)',
          padding: '1.25rem 0',
          textAlign: 'center',
          fontSize: '0.8125rem',
          color: 'var(--color-text-muted)',
        }}
      >
        <div className="container">
          ProctorNet Assessment Engine &copy; {new Date().getFullYear()} — Secure Academic Integrity Platform
        </div>
      </footer>
    </div>
  );
}
