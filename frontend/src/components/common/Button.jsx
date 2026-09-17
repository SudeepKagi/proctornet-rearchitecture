/**
 * @file Button.jsx
 * @description Accessible button component standardized to shadcn/ui design tokens.
 */

import React from 'react';
import { Button as ShadcnButton } from '../ui/button.jsx';
import { RefreshCw } from 'lucide-react';
import { cn } from '../../utils/cn.js';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled = false,
  loading = false,
  onClick,
  className = '',
  style,
  ...props
}) {
  const variantMap = {
    primary: 'default',
    secondary: 'secondary',
    outline: 'outline',
    ghost: 'ghost',
    danger: 'destructive',
    destructive: 'destructive',
    link: 'link',
  };

  const sizeMap = {
    sm: 'sm',
    md: 'default',
    lg: 'lg',
    icon: 'icon',
  };

  const resolvedVariant = variantMap[variant] || 'default';
  const resolvedSize = sizeMap[size] || 'default';

  return (
    <ShadcnButton
      type={type}
      variant={resolvedVariant}
      size={resolvedSize}
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(className)}
      style={style}
      {...props}
    >
      {loading && <RefreshCw size={14} className="animate-spin mr-1" />}
      {children}
    </ShadcnButton>
  );
}

export default Button;
