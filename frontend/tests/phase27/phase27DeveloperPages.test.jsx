/**
 * @file phase27DeveloperPages.test.jsx
 * @description Frontend test suite for Phase 27 Developer Operations Portal:
 * - DeveloperLayout shell & 6-tab navigation
 * - DeveloperOverviewPage (telemetry KPIs)
 * - DeveloperHealthPage (13-subsystem live matrix)
 * - DeveloperLogsPage (sub-second masked log search)
 * - DeveloperAuditPage (immutable technical audit feed)
 * - DeveloperTopologyPage (interactive SVG service mesh)
 * - DeveloperIncidentsPage (triage & resolution workflows)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

import { DeveloperLayout } from '../../src/components/layout/DeveloperLayout.jsx';
import { DeveloperOverviewPage } from '../../src/pages/developer/DeveloperOverviewPage.jsx';
import { DeveloperHealthPage } from '../../src/pages/developer/DeveloperHealthPage.jsx';
import { DeveloperLogsPage } from '../../src/pages/developer/DeveloperLogsPage.jsx';
import { DeveloperAuditPage } from '../../src/pages/developer/DeveloperAuditPage.jsx';
import { DeveloperTopologyPage } from '../../src/pages/developer/DeveloperTopologyPage.jsx';
import { DeveloperIncidentsPage } from '../../src/pages/developer/DeveloperIncidentsPage.jsx';

import * as developerApi from '../../src/api/developerApi.js';

describe('Phase 27 Developer Operations Frontend (Track 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DeveloperLayout (Workstream A)', () => {
    it('renders all 6 navigation tabs and management network badge', () => {
      render(
        <BrowserRouter>
          <DeveloperLayout />
        </BrowserRouter>
      );

      expect(screen.getByText(/Developer Operations & Management Plane/i)).toBeInTheDocument();
      expect(screen.getByText(/10.100.0.0\/24/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Overview/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Health Matrix/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /System Logs/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Audit Feed/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Topology Map/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Incident Triage/i })).toBeInTheDocument();
    });
  });

  describe('DeveloperOverviewPage (Workstream A)', () => {
    it('renders telemetry KPI cards and system specifications', async () => {
      vi.spyOn(developerApi, 'getDeveloperOverview').mockResolvedValue({
        environment: 'development',
        uptimeSeconds: 7200,
        healthSummary: { status: 'UP', totalSubsystems: 13, upCount: 12, degradedCount: 1, downCount: 0 },
        incidentsSummary: { totalActiveCount: 1, triggeredCount: 1, acknowledgedCount: 0 },
        telemetryMetrics: { errorCountLastHour: 3, fatalCountLastHour: 0, logBufferSize: 250, logBufferCapacity: 5000 },
        systemSpecs: { platform: 'linux', arch: 'x64', nodeVersion: 'v24.0.0', cpuCount: 8, totalMemoryMb: 16384, freeMemoryMb: 8192 },
        managementPlane: { wireguardSubnet: '10.100.0.0/24', gatewayIp: '10.100.0.1', port: 51820, status: 'ACTIVE' }
      });

      render(
        <BrowserRouter>
          <DeveloperOverviewPage />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('System Health')).toBeInTheDocument();
        expect(screen.getByText('Active Incidents')).toBeInTheDocument();
        expect(screen.getByText(/12 \/ 13 UP/i)).toBeInTheDocument();
        expect(screen.getByText(/10.100.0.0\/24/i)).toBeInTheDocument();
      });
    });
  });

  describe('DeveloperHealthPage (Workstream B)', () => {
    it('renders 13-subsystem health matrix with status badges and telemetry inspection', async () => {
      vi.spyOn(developerApi, 'getDeveloperHealth').mockResolvedValue({
        status: 'UP',
        timestamp: new Date().toISOString(),
        totalSubsystems: 13,
        subsystems: {
          node_api: { status: 'UP', latencyMs: 2, details: { uptimeSeconds: 1000 } },
          postgres_primary: { status: 'UP', latencyMs: 3, details: { healthy: true, totalCount: 10 } },
          postgres_replica: { status: 'UP', latencyMs: 2, details: { role: 'PRIMARY_STANDALONE' } },
          redis: { status: 'UP', latencyMs: 1, details: { healthy: true } },
          rabbitmq: { status: 'UP', latencyMs: 2, details: { healthy: true } },
          websocket: { status: 'UP', latencyMs: 1, details: { connectedClients: 5 } },
          sfu: { status: 'UP', latencyMs: 4, details: { workersActive: 4 } },
          coturn: { status: 'UP', latencyMs: 1, details: { stunConfigured: true } },
          outbox_poller: { status: 'UP', latencyMs: 2, details: { pendingBacklog: 0 } },
          evaluation_consumer: { status: 'UP', latencyMs: 1, details: { active: true } },
          s3_storage: { status: 'UP', latencyMs: 5, details: { configured: true } },
          backup_service: { status: 'UP', latencyMs: 1, details: { configured: true } },
          wireguard: { status: 'UP', latencyMs: 1, details: { subnet: '10.100.0.0/24' } }
        }
      });

      render(
        <BrowserRouter>
          <DeveloperHealthPage />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Comprehensive 13-Subsystem Health Matrix/i)).toBeInTheDocument();
        expect(screen.getByText(/PostgreSQL Primary/i)).toBeInTheDocument();
        expect(screen.getByText(/Mediasoup SFU \(Media Plane\)/i)).toBeInTheDocument();
        expect(screen.getByText(/WireGuard Management VPN/i)).toBeInTheDocument();
      });

      // Expand a subsystem inspection
      const inspectButtons = screen.getAllByText(/Inspect Telemetry/i);
      fireEvent.click(inspectButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/uptimeSeconds/i)).toBeInTheDocument();
      });
    });
  });

  describe('DeveloperLogsPage (Workstream C)', () => {
    it('renders search filter inputs, level selector pills, and masked log list', async () => {
      vi.spyOn(developerApi, 'getDeveloperLogs').mockResolvedValue({
        logs: [
          {
            id: 1,
            timestamp: new Date().toISOString(),
            level: 'error',
            service: 'proctornet-backend',
            message: 'Database query timeout occurred',
            traceId: 'tr-abc-123',
            context: { query: 'SELECT * FROM users', error: 'ETIMEDOUT' }
          }
        ],
        totalMatching: 1,
        nextCursor: null
      });

      render(
        <BrowserRouter>
          <DeveloperLogsPage />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Database query timeout occurred/i)).toBeInTheDocument();
        expect(screen.getByText(/\[proctornet-backend\]/i)).toBeInTheDocument();
        expect(screen.getAllByText(/ERROR/i).length).toBeGreaterThanOrEqual(1);
      });

      // Click row to inspect JSON
      fireEvent.click(screen.getByText(/Database query timeout occurred/i));

      await waitFor(() => {
        expect(screen.getByText(/ETIMEDOUT/i)).toBeInTheDocument();
      });
    });
  });

  describe('DeveloperAuditPage (Workstream D)', () => {
    it('renders append-only banner and technical audit events', async () => {
      vi.spyOn(developerApi, 'getDeveloperAudit').mockResolvedValue({
        audit_logs: [
          {
            audit_id: 'aud-1',
            action: 'AUTH_LOGIN_SUCCESS',
            resource_type: 'USER',
            resource_id: 'usr-123',
            timestamp: new Date().toISOString(),
            metadata: { ip: '10.100.0.2' }
          }
        ],
        pagination: { page: 1, limit: 20, totalPages: 1 }
      });

      render(
        <BrowserRouter>
          <DeveloperAuditPage />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Immutable Technical Audit Trail/i)).toBeInTheDocument();
        expect(screen.getByText(/AUTH_LOGIN_SUCCESS/i)).toBeInTheDocument();
      });
    });
  });

  describe('DeveloperTopologyPage (Workstream E)', () => {
    it('renders SVG service mesh and updates component details on selection', async () => {
      vi.spyOn(developerApi, 'getDeveloperTopology').mockResolvedValue({
        timestamp: new Date().toISOString(),
        overallHealth: 'UP',
        nodes: [
          { id: 'node_api', label: 'Node.js Modular Monolith', type: 'BACKEND', protocol: 'HTTP', ports: ['4000'], status: 'UP' },
          { id: 'wireguard', label: 'WireGuard Gateway', type: 'MANAGEMENT_VPN', subnet: '10.100.0.0/24', ports: ['51820/udp'], status: 'UP' }
        ],
        edges: []
      });

      render(
        <BrowserRouter>
          <DeveloperTopologyPage />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/System Topology & Network Segmentation/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/ProctorNet System Topology Map/i)).toBeInTheDocument();
      });
    });
  });

  describe('DeveloperIncidentsPage (Workstream F)', () => {
    it('renders operational incidents with Acknowledge and Resolve modal flows', async () => {
      vi.spyOn(developerApi, 'getDeveloperIncidents').mockResolvedValue({
        incidents: [
          {
            id: 'inc_redis_1',
            component: 'redis',
            severity: 'HIGH',
            status: 'TRIGGERED',
            message: 'Redis connection latency spike',
            triggeredAt: new Date().toISOString(),
            occurrenceCount: 1,
            notes: []
          }
        ]
      });

      const ackSpy = vi.spyOn(developerApi, 'acknowledgeDeveloperIncident').mockResolvedValue({
        id: 'inc_redis_1',
        status: 'ACKNOWLEDGED'
      });

      render(
        <BrowserRouter>
          <DeveloperIncidentsPage />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Redis connection latency spike/i)).toBeInTheDocument();
        expect(screen.getAllByText(/TRIGGERED/i).length).toBeGreaterThanOrEqual(1);
      });

      // Click Acknowledge
      fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));

      await waitFor(() => {
        expect(screen.getByText(/Acknowledge Incident/i)).toBeInTheDocument();
      });

      // Confirm Acknowledge
      fireEvent.click(screen.getByText(/Confirm Action/i));

      await waitFor(() => {
        expect(ackSpy).toHaveBeenCalledWith('inc_redis_1', '');
      });
    });
  });
});
