import React from 'react';
import { cn } from '../../utils/cn.js';

export function Progress({
  value = 0,
  max = 100,
  className,
  indicatorClassName,
  ...props
}) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-slate-100 border border-slate-200/50',
        className
      )}
      {...props}
    >
      <div
        className={cn(
          'h-full bg-slate-900 transition-all duration-300 ease-in-out',
          indicatorClassName
        )}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
