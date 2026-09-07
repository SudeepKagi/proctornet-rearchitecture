/**
 * @file Badge.jsx
 * @description Accessible status badge component for lifecycle and state pills.
 */

import React from 'react';

export function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
  style = {},
  ...props
}) {
  const variantStyles = {
    neutral: {
      backgroundColor: 'var(--color-surface-secondary)',
      color: 'var(--color-text-muted)',
      borderColor: 'var(--color-border-subtle)',
    },
    primary: {
      backgroundColor: 'var(--color-primary-light)',
      color: 'var(--color-primary)',
      borderColor: 'var(--color-primary-border)',
    },
    success: {
      backgroundColor: 'var(--color-success-light)',
      color: 'var(--color-success)',
      borderColor: 'var(--color-success-border)',
    },
    warning: {
      backgroundColor: 'var(--color-warning-light)',
      color: 'var(--color-warning)',
      borderColor: 'var(--color-warning-border)',
    },
    danger: {
      backgroundColor: 'var(--color-danger-light)',
      color: 'var(--color-danger)',
      borderColor: 'var(--color-danger-border)',
    },
  };

  const sizeStyles = {
    sm: { padding: '0.125rem 0.375rem', fontSize: '0.6875rem' },
    md: { padding: '0.25rem 0.5rem', fontSize: '0.75rem' },
    lg: { padding: '0.375rem 0.75rem', fontSize: '0.8125rem' },
  };

  const selectedVariant = variantStyles[variant] || variantStyles.neutral;
  const selectedSize = sizeStyles[size] || sizeStyles.md;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.025em',
        borderRadius: 'var(--radius-full)',
        border: '1px solid transparent',
        ...selectedVariant,
        ...selectedSize,
        ...style,
      }}
      className={`badge badge-${variant} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

/**
 * Helper to determine badge variant by entity status string.
 */
export function getStatusBadgeVariant(status) {
  switch (status?.toUpperCase()) {
    case 'ACTIVE':
    case 'LIVE':
    case 'PASSED':
      return 'success';
    case 'READY':
    case 'CHECKED_IN':
    case 'ASSIGNED':
    case 'SCHEDULED':
      return 'primary';
    case 'PENDING':
    case 'PAUSED':
    case 'DRAFT':
      return 'warning';
    case 'EXPIRED':
    case 'FAILED':
    case 'TERMINATED':
    case 'CANCELLED':
      return 'danger';
    case 'SUBMITTED':
    case 'COMPLETED':
    case 'EVALUATED':
    case 'RESULT_PUBLISHED':
    case 'CONCLUDED':
    case 'ENDED':
    default:
      return 'neutral';
  }
}
