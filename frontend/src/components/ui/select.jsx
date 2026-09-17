import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn.js';

export const Select = React.forwardRef(function Select(
  { className, children, error, id, ...props },
  ref
) {
  return (
    <div className="relative w-full">
      <select
        ref={ref}
        id={id}
        className={cn(
          'flex h-9 w-full appearance-none rounded-md border border-slate-200 bg-white px-3 py-1.5 pr-8 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 cursor-pointer',
          error && 'border-rose-500 focus-visible:ring-rose-500',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
    </div>
  );
});
Select.displayName = 'Select';

export function SelectOption({ value, children, disabled }) {
  return (
    <option value={value} disabled={disabled} className="py-1 dark:bg-slate-900 dark:text-slate-100">
      {children}
    </option>
  );
}
