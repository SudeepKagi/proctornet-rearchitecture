import React from 'react';
import { cn } from '../../utils/cn.js';

export function Avatar({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full bg-slate-100 border border-slate-200 text-slate-700 items-center justify-center text-xs font-semibold select-none',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
