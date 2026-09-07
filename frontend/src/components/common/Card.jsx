/**
 * @file Card.jsx
 * @description Accessible surface container component with subtle border and crisp shadow.
 */

import React from 'react';

export function Card({
  children,
  elevation = 'card',
  padding = 'normal',
  style = {},
  className = '',
  ...props
}) {
  const paddingMap = {
    none: '0',
    compact: '1rem',
    normal: '1.5rem',
    spacious: '2rem',
  };

  const shadowMap = {
    none: 'none',
    card: 'var(--shadow-card)',
    md: 'var(--shadow-md)',
    lg: 'var(--shadow-lg)',
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        boxShadow: shadowMap[elevation] || shadowMap.card,
        padding: paddingMap[padding] || paddingMap.normal,
        ...style,
      }}
      className={`card ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
