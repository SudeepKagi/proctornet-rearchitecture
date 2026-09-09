/**
 * @file DeveloperLayout.jsx
 * @description Application shell and tabbed navigation for Developer Operations Portal.
 * Enforces Phase 27 Track 1 UI workspace standards.
 */

import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Badge } from '../common/Badge.jsx';

const TABS = [
  { path: '/developer/overview', label: 'Overview', icon: '📊' },
  { path: '/developer/health', label: 'Health Matrix', icon: '🩺' },
  { path: '/developer/logs', label: 'System Logs', icon: '📜' },
  { path: '/developer/audit', label: 'Audit Feed', icon: '🛡️' },
  { path: '/developer/topology', label: 'Topology Map', icon: '🗺️' },
  { path: '/developer/incidents', label: 'Incident Triage', icon: '🚨' }
];

export function DeveloperLayout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          padding: '1.25rem 1.5rem',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
              Developer Operations &amp; Management Plane
            </h1>
            <Badge variant="primary" size="sm">TELEMETRY ONLY</Badge>
            <Badge variant="success" size="sm">Zero-PII Isolated</Badge>
          </div>
          <p
            style={{
              margin: '0.25rem 0 0 0',
              fontSize: '0.875rem',
              color: 'var(--color-text-muted)'
            }}
          >
            Engineering telemetry, 13-subsystem live health matrix, masked circular log stream, and WireGuard management network.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              padding: '0.375rem 0.75rem',
              backgroundColor: 'var(--color-surface-sunken)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              color: 'var(--color-text-secondary)'
            }}
          >
            VPN: <strong>10.100.0.0/24</strong> (UDP 51820)
          </div>
        </div>
      </div>

      {/* Workspace Tabs */}
      <nav
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid var(--color-border-subtle)',
          paddingBottom: '0.5rem',
          overflowX: 'auto'
        }}
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            style={({ isActive }) => ({
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-sm)',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              backgroundColor: isActive ? 'var(--color-primary-subtle)' : 'transparent',
              border: isActive
                ? '1px solid var(--color-primary)'
                : '1px solid transparent',
              transition: 'all 0.15s ease-in-out',
              whiteSpace: 'nowrap'
            })}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Main Screen Outlet */}
      <div>
        <Outlet />
      </div>
    </div>
  );
}
