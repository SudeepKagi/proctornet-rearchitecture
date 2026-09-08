/**
 * @file Alert.jsx
 * @description Accessible notification banner for errors, warnings, and success messages.
 */

import React from 'react';

export function Alert({
  children,
  variant = 'info',
  className = '',
  style = {},
  ...props
}) {
  const variantStyles = {
    info: {
      backgroundColor: 'rgba(59, 130, 246, 0.08)',
      borderColor: 'rgba(59, 130, 246, 0.25)',
      color: 'var(--color-primary, #2563eb)',
    },
    success: {
      backgroundColor: 'rgba(16, 185, 129, 0.08)',
      borderColor: 'rgba(16, 185, 129, 0.25)',
      color: '#059669',
    },
    warning: {
      backgroundColor: 'rgba(245, 158, 11, 0.08)',
      borderColor: 'rgba(245, 158, 11, 0.25)',
      color: '#d97706',
    },
    danger: {
      backgroundColor: 'rgba(239, 68, 68, 0.08)',
      borderColor: 'rgba(239, 68, 68, 0.25)',
      color: '#dc2626',
    },
  };

  const currentStyle = variantStyles[variant] || variantStyles.info;

  return (
    <div
      role="alert"
      className={className}
      style={{
        padding: '0.75rem 1rem',
        borderRadius: 'var(--radius-md, 6px)',
        border: `1px solid ${currentStyle.borderColor}`,
        backgroundColor: currentStyle.backgroundColor,
        color: currentStyle.color,
        fontSize: '0.875rem',
        lineHeight: 1.5,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
