/**
 * @file Badge.jsx
 * @description Accessible status badge standardized to shadcn/ui Badge primitive.
 */

import React from 'react';
import { Badge as ShadcnBadge } from '../ui/badge.jsx';
import { cn } from '../../utils/cn.js';

export function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
  style,
  ...props
}) {
  const variantMap = {
    neutral: 'secondary',
    primary: 'default',
    secondary: 'secondary',
    outline: 'outline',
    success: 'success',
    warning: 'warning',
    danger: 'destructive',
    destructive: 'destructive',
    info: 'info',
  };

  const sizeMap = {
    sm: 'sm',
    md: 'default',
    lg: 'lg',
  };

  const resolvedVariant = variantMap[variant] || 'secondary';
  const resolvedSize = sizeMap[size] || 'default';

  return (
    <ShadcnBadge
      variant={resolvedVariant}
      size={resolvedSize}
      className={cn('uppercase font-semibold tracking-wider text-[11px]', className)}
      style={style}
      {...props}
    >
      {children}
    </ShadcnBadge>
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

export default Badge;
