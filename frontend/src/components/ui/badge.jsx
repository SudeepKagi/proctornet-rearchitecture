import React from 'react';
import { cn } from '../../utils/cn.js';

const badgeVariants = {
  default: 'border-transparent bg-slate-900 text-slate-50 dark:bg-slate-100 dark:text-slate-900',
  secondary: 'border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200',
  outline: 'border-slate-200 text-slate-700 bg-white dark:border-slate-800 dark:text-slate-300 dark:bg-slate-900',
  success: 'border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/50 dark:text-emerald-300',
  warning: 'border-amber-200/80 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-300',
  destructive: 'border-red-200/80 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300',
  info: 'border-blue-200/80 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/50 dark:text-blue-300',
};

const badgeSizes = {
  default: 'px-2.5 py-0.5 text-xs',
  sm: 'px-2 py-0.5 text-[11px]',
  lg: 'px-3 py-1 text-sm font-semibold',
};

export function Badge({ className, variant = 'default', size = 'default', ...props }) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2',
        badgeVariants[variant] || badgeVariants.default,
        badgeSizes[size] || badgeSizes.default,
        className
      )}
      {...props}
    />
  );
}
