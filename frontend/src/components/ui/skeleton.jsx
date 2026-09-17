import { cn } from '../../utils/cn.js';

/** A shape-preserving loading placeholder for pages, tables, and metrics. */
export function Skeleton({ className, ...props }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-slate-200/80', className)}
      {...props}
    />
  );
}
