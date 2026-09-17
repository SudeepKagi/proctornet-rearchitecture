/**
 * @file Alert.jsx
 * @description Accessible notification banner mapped to shadcn/ui Alert primitive.
 */

import React from 'react';
import { Alert as ShadcnAlert, AlertDescription } from '../ui/alert.jsx';
import { cn } from '../../utils/cn.js';

export function Alert({
  children,
  variant = 'info',
  className = '',
  style = {},
  ...props
}) {
  const variantMap = {
    info: 'default',
    success: 'success',
    warning: 'warning',
    danger: 'destructive',
    destructive: 'destructive',
  };

  const resolvedVariant = variantMap[variant] || 'default';

  return (
    <ShadcnAlert
      variant={resolvedVariant}
      className={cn(className)}
      style={style}
      {...props}
    >
      <AlertDescription>{children}</AlertDescription>
    </ShadcnAlert>
  );
}

export default Alert;
