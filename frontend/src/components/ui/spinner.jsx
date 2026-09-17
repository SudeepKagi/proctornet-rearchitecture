import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn.js';

export function Spinner({ className, size = 'md', ...props }) {
  const sizeMap = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
    xl: 'h-12 w-12',
  };

  return (
    <Loader2
      className={cn('animate-spin text-slate-500 dark:text-slate-400', sizeMap[size] || sizeMap.md, className)}
      aria-label="Loading"
      role="status"
      {...props}
    />
  );
}
