import React from 'react';
import { cn } from '../../utils/cn.js';

export function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}) {
  return (
    <div
      role={decorative ? 'none' : 'separator'}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        'shrink-0 bg-slate-200/80',
        orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
        className
      )}
      {...props}
    />
  );
}
