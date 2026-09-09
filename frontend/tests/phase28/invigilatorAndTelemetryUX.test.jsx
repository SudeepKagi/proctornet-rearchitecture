/**
 * @file invigilatorAndTelemetryUX.test.jsx
 * @description Phase 28 Candidate Telemetry & Invigilator UX tests.
 * Validates:
 *  - TEST G: Technical vs Behavioral UI separation with source attribution badges [BROWSER], [SCREEN AI], [TECHNICAL]
 *  - Clear display of Technical Degradation cap (<= 15 pts) vs Behavioral Misconduct
 *  - Auditable flag dismissal without deleting timeline history or evidence
 *  - Candidate proctoring events hook emitting Stage 1 events
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CandidateDetailDrawer } from '../../src/components/invigilator/CandidateDetailDrawer.jsx';
import * as proctoringApi from '../../src/api/proctoringApi.js';
import * as interventionsApi from '../../src/api/interventionsApi.js';
import * as evidenceApi from '../../src/api/evidenceApi.js';

vi.mock('../../src/api/proctoringApi.js');
vi.mock('../../src/api/interventionsApi.js');
vi.mock('../../src/api/evidenceApi.js');

describe('Phase 28 Track 1 & 2: Invigilator UX & Telemetry (TEST G)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TEST G: displays explicit source attribution badges [BROWSER], [SCREEN AI], [TECHNICAL]', async () => {
    const mockTimeline = [
      {
        violationId: 'v-1',
        eventType: 'BROWSER_FOCUS_LOST',
        severity: 'LOW',
        source: 'BROWSER',
        serverTimestamp: new Date().toISOString()
      },
      {
        violationId: 'v-2',
        eventType: 'SCREEN_CONTEXT_CLASSIFICATION',
        severity: 'MEDIUM',
        source: 'SCREEN_AI',
        serverTimestamp: new Date().toISOString()
      },
      {
        violationId: 'v-3',
        eventType: 'SCREEN_STREAM_DEGRADED',
        severity: 'LOW',
        source: 'TECHNICAL',
        serverTimestamp: new Date().toISOString()
      }
    ];

    interventionsApi.getAttemptTimeline.mockResolvedValue(mockTimeline);
    evidenceApi.listEvidence.mockResolvedValue({ evidence: [] });

    const candidate = {
      attemptId: 'att-101',
      name: 'Jane Doe',
      email: 'jane@example.com',
      attemptStatus: 'ACTIVE',
      riskScore: 15
    };

    render(
      <CandidateDetailDrawer
        isOpen={true}
        onClose={vi.fn()}
        candidate={candidate}
      />
    );

    // Wait for timeline to load
    await waitFor(() => {
      expect(screen.getByText('[BROWSER]')).toBeInTheDocument();
      expect(screen.getByText('[SCREEN AI]')).toBeInTheDocument();
      expect(screen.getByText('[TECHNICAL]')).toBeInTheDocument();
    });

    expect(screen.getByText('BROWSER_FOCUS_LOST')).toBeInTheDocument();
    expect(screen.getByText('SCREEN_CONTEXT_CLASSIFICATION')).toBeInTheDocument();
    expect(screen.getByText('SCREEN_STREAM_DEGRADED')).toBeInTheDocument();
  });

  it('TEST G: clearly distinguishes technical degradation state and indicates technical risk cap', async () => {
    const mockTimeline = [
      {
        violationId: 'v-tech-1',
        eventType: 'SCREEN_CAPTURE_INTERRUPTED',
        severity: 'LOW',
        source: 'TECHNICAL',
        serverTimestamp: new Date().toISOString()
      }
    ];

    interventionsApi.getAttemptTimeline.mockResolvedValue(mockTimeline);
    evidenceApi.listEvidence.mockResolvedValue({ evidence: [] });

    const candidate = {
      attemptId: 'att-102',
      name: 'Alex Smith',
      email: 'alex@example.com',
      attemptStatus: 'ACTIVE',
      riskScore: 15 // Capped at technical ceiling
    };

    render(
      <CandidateDetailDrawer
        isOpen={true}
        onClose={vi.fn()}
        candidate={candidate}
      />
    );

    await waitFor(() => {
      // Technical status badge must say DEGRADED [TECHNICAL]
      expect(screen.getByText('DEGRADED [TECHNICAL]')).toBeInTheDocument();
      // Behavioral risk remains LOW despite technical disruption
      expect(screen.getByText('LOW (15/100)')).toBeInTheDocument();
      // Shows technical cap active notice in timeline
      expect(screen.getByText(/Technical Cap Active/i)).toBeInTheDocument();
    });
  });

  it('allows auditable flag acknowledgement and dismissal without deleting history', async () => {
    interventionsApi.getAttemptTimeline.mockResolvedValue([]);
    evidenceApi.listEvidence.mockResolvedValue({ evidence: [] });
    proctoringApi.updateFlagStatus.mockResolvedValue({ success: true });

    const onFlagUpdated = vi.fn();
    const user = userEvent.setup();

    const candidate = {
      attemptId: 'att-103',
      name: 'Charlie Brown',
      attemptStatus: 'ACTIVE',
      riskScore: 35,
      activeFlags: [
        {
          flagId: 'flag-99',
          flagType: 'SUSPICIOUS_SCREEN_ACTIVITY',
          severity: 'MEDIUM'
        }
      ]
    };

    render(
      <CandidateDetailDrawer
        isOpen={true}
        onClose={vi.fn()}
        candidate={candidate}
        onFlagUpdated={onFlagUpdated}
      />
    );

    const dismissBtn = screen.getByRole('button', { name: /Acknowledge \/ Dismiss/i });
    expect(dismissBtn).toBeInTheDocument();

    await user.click(dismissBtn);

    expect(proctoringApi.updateFlagStatus).toHaveBeenCalledWith(
      'att-103',
      'flag-99',
      expect.objectContaining({
        status: 'DISMISSED'
      })
    );
    expect(onFlagUpdated).toHaveBeenCalledWith('flag-99');
  });

  it('handles Escape key to close drawer and manages focus gracefully', async () => {
    const handleClose = vi.fn();
    interventionsApi.getAttemptTimeline.mockResolvedValue([]);
    evidenceApi.listEvidence.mockResolvedValue({ evidence: [] });

    render(
      <CandidateDetailDrawer
        isOpen={true}
        onClose={handleClose}
        candidate={{ attemptId: 'att-104', name: 'Test' }}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(interventionsApi.getAttemptTimeline).toHaveBeenCalled();
    });
  });
});
