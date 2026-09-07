/**
 * @file SubmitConfirmModal.jsx
 * @description Irreversible submission confirmation modal with answer summary, offline messaging, and retry.
 */

import React from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { Badge } from '../common/Badge.jsx';

export function SubmitConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  totalQuestions = 0,
  answeredCount = 0,
  unansweredCount = 0,
  submitting = false,
  errorMessage = '',
  onRetry,
}) {
  return (
    <Modal isOpen={isOpen} onClose={submitting ? () => {} : onClose} title="Confirm Exam Submission">
      <div>
        {errorMessage ? (
          <div
            role="alert"
            style={{
              marginBottom: '1.25rem',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-warning-light)',
              border: '1px solid var(--color-warning-border)',
              color: '#92400e',
              fontSize: '0.875rem',
              lineHeight: 1.5,
            }}
          >
            <strong>Submission Notice:</strong> {errorMessage}
          </div>
        ) : null}

        <p style={{ color: 'var(--color-text-body)', fontSize: '0.9375rem', marginBottom: '1.25rem' }}>
          Are you ready to submit your exam attempt? Please review your progress before finalizing:
        </p>

        <div
          style={{
            backgroundColor: 'var(--color-surface-secondary)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem',
            textAlign: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
              TOTAL
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {totalQuestions}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
              ANSWERED
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-success)' }}>
              {answeredCount}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
              UNANSWERED
            </div>
            <div
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: unansweredCount > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)',
              }}
            >
              {unansweredCount}
            </div>
          </div>
        </div>

        {unansweredCount > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.25rem',
              padding: '0.75rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-warning-light)',
              border: '1px solid var(--color-warning-border)',
              fontSize: '0.8125rem',
              color: 'var(--color-warning)',
            }}
          >
            <span>You have {unansweredCount} unanswered questions remaining.</span>
          </div>
        )}

        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-surface-secondary)',
            borderLeft: '3px solid var(--color-danger)',
            fontSize: '0.8125rem',
            color: 'var(--color-text-body)',
            marginBottom: '1.5rem',
          }}
        >
          <strong>Warning:</strong> Submission is permanent and irreversible. Once confirmed, you will no longer be able to modify any responses.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <Button
            variant="secondary"
            disabled={submitting}
            onClick={onClose}
          >
            Review Answers
          </Button>

          {errorMessage && onRetry ? (
            <Button
              variant="primary"
              loading={submitting}
              onClick={onRetry}
            >
              Retry Submission
            </Button>
          ) : (
            <Button
              variant="danger"
              loading={submitting}
              onClick={onConfirm}
            >
              Confirm & Submit Exam
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
