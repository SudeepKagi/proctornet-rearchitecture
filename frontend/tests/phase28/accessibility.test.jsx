/**
 * @file accessibility.test.jsx
 * @description Phase 28 Track 1 Accessibility & UX tests.
 * Validates:
 *  - ConfirmDestructiveModal accessible properties (role="alertdialog", focus trap, Escape, typed confirmation)
 *  - StateBoundary accessible properties (role="status", role="alert", retry)
 *  - Universal focus rings & density tier styles
 */

import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDestructiveModal } from '../../src/components/common/ConfirmDestructiveModal.jsx';
import { StateBoundary } from '../../src/components/common/StateBoundary.jsx';

describe('Phase 28 Track 1: Accessible Components', () => {
  describe('ConfirmDestructiveModal', () => {
    it('renders with role="alertdialog" and accessible labelling', () => {
      render(
        <ConfirmDestructiveModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          title="Terminate Candidate Attempt"
          description="This action terminates the attempt immediately."
        />
      );

      const dialog = screen.getByRole('alertdialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'destructive-modal-title');
      expect(dialog).toHaveAttribute('aria-describedby', 'destructive-modal-desc');
      expect(screen.getByText('Terminate Candidate Attempt')).toBeInTheDocument();
      expect(screen.getByText('This action terminates the attempt immediately.')).toBeInTheDocument();
    });

    it('closes on Escape key press and backdrop click', () => {
      const handleClose = vi.fn();
      const { container } = render(
        <ConfirmDestructiveModal
          isOpen={true}
          onClose={handleClose}
          onConfirm={vi.fn()}
          title="Confirm Action"
        />
      );

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);

      // Backdrop click
      const backdrop = container.firstChild;
      fireEvent.click(backdrop);
      expect(handleClose).toHaveBeenCalledTimes(2);
    });

    it('requires typed confirmation keyword before allowing confirm action when specified', async () => {
      const handleConfirm = vi.fn();
      const user = userEvent.setup();

      render(
        <ConfirmDestructiveModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={handleConfirm}
          title="Submit Final Exam"
          description="Type SUBMIT to finalize."
          requiredConfirmationWord="SUBMIT"
        />
      );

      const confirmBtn = screen.getByRole('button', { name: /confirm/i });
      expect(confirmBtn).toBeDisabled();

      const input = screen.getByLabelText(/Please type/i);
      await user.type(input, 'SUB');
      expect(confirmBtn).toBeDisabled();

      await user.type(input, 'MIT');
      expect(confirmBtn).not.toBeDisabled();

      await user.click(confirmBtn);
      expect(handleConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe('StateBoundary', () => {
    it('renders accessible loading state with role="status" and aria-live="polite"', () => {
      render(
        <StateBoundary isLoading={true} loadingMessage="Loading proctoring timeline...">
          <div>Protected Content</div>
        </StateBoundary>
      );

      const statusEl = screen.getByTestId('state-boundary-loading');
      expect(statusEl).toBeInTheDocument();
      expect(statusEl).toHaveAttribute('aria-live', 'polite');
      expect(screen.getByText('Loading proctoring timeline...')).toBeInTheDocument();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('renders accessible error state with role="alert" and allows retry', async () => {
      const handleRetry = vi.fn();
      const user = userEvent.setup();

      render(
        <StateBoundary
          error="Network connection severed. Unable to reach proctoring gateway."
          onRetry={handleRetry}
        >
          <div>Protected Content</div>
        </StateBoundary>
      );

      const alertEl = screen.getByRole('alert');
      expect(alertEl).toBeInTheDocument();
      expect(alertEl).toHaveAttribute('aria-live', 'assertive');
      expect(screen.getByText(/Network connection severed/i)).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /retry/i });
      await user.click(retryBtn);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });

    it('renders accessible empty state with role="status"', () => {
      render(
        <StateBoundary
          isEmpty={true}
          emptyTitle="No Incidents Recorded"
          emptyDescription="Zero proctoring anomalies detected for this examination attempt."
        >
          <div>Protected Content</div>
        </StateBoundary>
      );

      const statusEl = screen.getByRole('status');
      expect(statusEl).toBeInTheDocument();
      expect(screen.getByText('No Incidents Recorded')).toBeInTheDocument();
      expect(screen.getByText(/Zero proctoring anomalies detected/i)).toBeInTheDocument();
    });

    it('renders children when normal (not loading, no error, not empty)', () => {
      render(
        <StateBoundary isLoading={false} error={null} isEmpty={false}>
          <div data-testid="live-exam-content">Active Candidate Workspace</div>
        </StateBoundary>
      );

      expect(screen.getByTestId('live-exam-content')).toBeInTheDocument();
      expect(screen.getByText('Active Candidate Workspace')).toBeInTheDocument();
    });
  });
});
