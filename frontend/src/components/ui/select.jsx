import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn.js';

export const Select = React.forwardRef(function Select(
  { className, wrapperClassName, children, error, id, size = 'default', ...props },
  ref
) {
  const isSm = size === 'sm';
  return (
    <div className={cn('relative w-full', wrapperClassName)}>
      <select
        ref={ref}
        id={id}
        className={cn(
          'flex w-full appearance-none rounded-md border border-slate-200 bg-white shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 text-slate-900 cursor-pointer',
          isSm ? 'h-8 px-2.5 py-1 pr-7 text-xs' : 'h-9 px-3 py-1.5 pr-8 text-sm',
          error && 'border-rose-500 focus-visible:ring-rose-500',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className={cn(
          'pointer-events-none absolute right-2.5 text-slate-400 dark:text-slate-500',
          isSm ? 'top-2 h-3.5 w-3.5 right-2' : 'top-2.5 h-4 w-4'
        )}
      />
    </div>
  );
});
Select.displayName = 'Select';

export function SelectOption({ value, children, disabled }) {
  return (
    <option
      value={value}
      disabled={disabled}
      className="py-1 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
    >
      {children}
    </option>
  );
}
