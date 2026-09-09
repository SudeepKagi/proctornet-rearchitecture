/**
 * @file ConfirmDestructiveModal.jsx
 * @description Accessible two-step destructive action confirmation modal dialog.
 * Conforms to WCAG 2.1 AA (role="alertdialog", focus trapping, Escape key, return focus).
 * Supports optional confirmation text matching for critical irreversible operations.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button.jsx';

export function ConfirmDestructiveModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Destructive Action',
  description = 'Are you sure you want to proceed? This action cannot be undone.',
  confirmButtonText = 'Confirm',
  cancelButtonText = 'Cancel',
  requiredConfirmationWord = '',
  isLoading = false,
  danger = true
}) {
  const [typedInput, setTypedInput] = useState('');
  const modalRef = useRef(null);
  const triggerElementRef = useRef(null);
  const confirmButtonRef = useRef(null);

  // Store trigger element on open and restore on close
  useEffect(() => {
    if (isOpen) {
      triggerElementRef.current = document.activeElement;
      setTypedInput('');
      document.body.style.overflow = 'hidden';

      // Focus modal or first interactive element on next tick
      requestAnimationFrame(() => {
        if (requiredConfirmationWord) {
          const inputEl = modalRef.current?.querySelector('input');
          inputEl?.focus();
        } else {
          confirmButtonRef.current?.focus();
        }
      });
    } else {
      document.body.style.overflow = '';
      if (triggerElementRef.current && typeof triggerElementRef.current.focus === 'function') {
        triggerElementRef.current.focus();
      }
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, requiredConfirmationWord]);

  // Handle Escape key and focus trap
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        if (!modalRef.current) return;
        const focusableElements = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const focusable = Array.prototype.filter.call(
          focusableElements,
          (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
        );

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isConfirmedWordValid = requiredConfirmationWord
    ? typedInput.trim().toUpperCase() === requiredConfirmationWord.toUpperCase()
    : true;

  const isConfirmDisabled = isLoading || !isConfirmedWordValid;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        padding: '1rem'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="destructive-modal-title"
        aria-describedby="destructive-modal-desc"
        style={{
          backgroundColor: 'var(--color-surface, #ffffff)',
          borderRadius: 'var(--radius-lg, 12px)',
          boxShadow: 'var(--shadow-modal, 0 20px 25px -5px rgba(0, 0, 0, 0.2))',
          border: '1px solid var(--color-border-subtle, #e2e8f0)',
          width: '100%',
          maxWidth: '480px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-border-subtle, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: danger ? 'var(--color-danger-light, #fef2f2)' : 'var(--color-surface, #ffffff)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {danger && (
              <span
                aria-hidden="true"
                style={{
                  color: 'var(--color-danger, #dc2626)',
                  fontSize: '1.25rem',
                  lineHeight: 1
                }}
              >
                ⚠️
              </span>
            )}
            <h3
              id="destructive-modal-title"
              style={{
                margin: 0,
                fontSize: '1.125rem',
                fontWeight: 600,
                color: danger ? 'var(--color-danger, #dc2626)' : 'var(--color-text-primary, #0f172a)'
              }}
            >
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close dialog"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted, #64748b)',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '1.25rem',
              lineHeight: 1,
              padding: '0.25rem',
              borderRadius: 'var(--radius-xs, 4px)'
            }}
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p
            id="destructive-modal-desc"
            style={{
              margin: 0,
              fontSize: '0.9375rem',
              color: 'var(--color-text-body, #334155)',
              lineHeight: 1.5
            }}
          >
            {description}
          </p>

          {requiredConfirmationWord && (
            <div>
              <label
                htmlFor="confirmation-input"
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                  color: 'var(--color-text-body, #334155)'
                }}
              >
                Please type <strong style={{ color: 'var(--color-danger, #dc2626)' }}>{requiredConfirmationWord}</strong> to confirm:
              </label>
              <input
                id="confirmation-input"
                type="text"
                value={typedInput}
                onChange={(e) => setTypedInput(e.target.value)}
                placeholder={requiredConfirmationWord}
                autoComplete="off"
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-md, 8px)',
                  border: '1px solid var(--color-border-medium, #cbd5e1)',
                  backgroundColor: 'var(--color-surface, #ffffff)',
                  color: 'var(--color-text-primary, #0f172a)',
                  fontSize: '0.875rem'
                }}
              />
            </div>
          )}
        </div>

        {/* Actions Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--color-border-subtle, #e2e8f0)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            backgroundColor: 'var(--color-surface-secondary, #f8fafc)'
          }}
        >
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelButtonText}
          </Button>
          <Button
            ref={confirmButtonRef}
            type="button"
            variant={danger ? 'danger' : 'primary'}
            size="md"
            onClick={onConfirm}
            disabled={isConfirmDisabled}
          >
            {isLoading ? 'Processing...' : confirmButtonText}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDestructiveModal;
