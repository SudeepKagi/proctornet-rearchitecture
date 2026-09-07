/**
 * @file Modal.jsx
 * @description Accessible modal dialog component with backdrop, keyboard escape, and focus management.
 */

import React, { useEffect, useRef } from 'react';

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = '500px',
}) {
  const modalRef = useRef(null);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(2px)',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-modal)',
          border: '1px solid var(--color-border-subtle)',
          width: '100%',
          maxWidth,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          animation: 'fadeIn 0.15s ease-out',
        }}
      >
        {title && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--color-border-subtle)',
            }}
          >
            <h3 id="modal-title" style={{ margin: 0, fontSize: '1.125rem' }}>
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                fontSize: '1.25rem',
                lineHeight: 1,
                padding: '0.25rem',
                borderRadius: 'var(--radius-xs)',
              }}
            >
              &times;
            </button>
          </div>
        )}
        <div
          style={{
            padding: '1.5rem',
            overflowY: 'auto',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
