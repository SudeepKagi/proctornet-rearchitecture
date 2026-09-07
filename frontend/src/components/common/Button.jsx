/**
 * @file Button.jsx
 * @description Accessible button component supporting variants, sizes, and loading state.
 */

import React from 'react';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled = false,
  loading = false,
  onClick,
  className = '',
  ...props
}) {
  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 500,
    borderRadius: 'var(--radius-sm)',
    border: '1px solid transparent',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transition: 'background-color var(--transition-fast), border-color var(--transition-fast)',
    textDecoration: 'none',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  };

  const sizeStyles = {
    sm: { padding: '0.25rem 0.625rem', fontSize: '0.8125rem' },
    md: { padding: '0.5rem 1rem', fontSize: '0.875rem' },
    lg: { padding: '0.75rem 1.5rem', fontSize: '1rem' },
  };

  const variantStyles = {
    primary: {
      backgroundColor: 'var(--color-primary)',
      color: 'var(--color-text-inverse)',
      borderColor: 'var(--color-primary)',
    },
    secondary: {
      backgroundColor: 'var(--color-surface-secondary)',
      color: 'var(--color-text-primary)',
      borderColor: 'var(--color-border-subtle)',
    },
    outline: {
      backgroundColor: 'transparent',
      color: 'var(--color-primary)',
      borderColor: 'var(--color-primary-border)',
    },
    danger: {
      backgroundColor: 'var(--color-danger)',
      color: 'var(--color-text-inverse)',
      borderColor: 'var(--color-danger)',
    },
    success: {
      backgroundColor: 'var(--color-success)',
      color: 'var(--color-text-inverse)',
      borderColor: 'var(--color-success)',
    },
  };

  const currentSize = sizeStyles[size] || sizeStyles.md;
  const currentVariant = variantStyles[variant] || variantStyles.primary;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      style={{ ...baseStyle, ...currentSize, ...currentVariant }}
      className={`btn btn-${variant} ${className}`}
      {...props}
    >
      {loading && (
        <span
          style={{
            display: 'inline-block',
            width: '1em',
            height: '1em',
            marginRight: '0.5rem',
            border: '2px solid currentColor',
            borderRightColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
          }}
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
