/**
 * @file Input.jsx
 * @description Accessible form input component with label, error feedback, and focus ring.
 */

import React from 'react';

export function Input({
  label,
  id,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  required = false,
  disabled = false,
  autoComplete,
  className = '',
  helperText,
  ...props
}) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column' }} className={className}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            marginBottom: '0.375rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: 'var(--color-text-primary)',
          }}
        >
          {label} {required && <span style={{ color: 'var(--color-danger)' }}>*</span>}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        style={{
          width: '100%',
          padding: '0.5rem 0.75rem',
          fontSize: '0.9375rem',
          color: 'var(--color-text-primary)',
          backgroundColor: disabled ? 'var(--color-surface-secondary)' : 'var(--color-surface)',
          border: `1px solid ${error ? 'var(--color-danger)' : 'var(--color-border-subtle)'}`,
          borderRadius: 'var(--radius-sm)',
          boxShadow: 'var(--shadow-sm)',
          transition: 'border-color var(--transition-fast)',
        }}
        {...props}
      />
      {error && (
        <span
          id={`${inputId}-error`}
          role="alert"
          style={{
            marginTop: '0.375rem',
            fontSize: '0.8125rem',
            color: 'var(--color-danger)',
          }}
        >
          {error}
        </span>
      )}
      {helperText && !error && (
        <span
          style={{
            marginTop: '0.375rem',
            fontSize: '0.8125rem',
            color: 'var(--color-text-muted)',
          }}
        >
          {helperText}
        </span>
      )}
    </div>
  );
}
