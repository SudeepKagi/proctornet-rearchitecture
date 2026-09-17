import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../utils/cn.js';

export const Checkbox = React.forwardRef(function Checkbox(
  { className, checked, onChange, disabled, id, ...props },
  ref
) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'relative inline-flex items-center justify-center h-4 w-4 shrink-0 rounded-xs border border-slate-300 bg-white transition-colors cursor-pointer dark:border-slate-700 dark:bg-slate-900',
        checked && 'bg-blue-600 border-blue-600 text-white dark:bg-blue-600 dark:border-blue-600',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        id={id}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
        {...props}
      />
      {checked && <Check className="h-3 w-3 stroke-[3]" />}
    </label>
  );
});
Checkbox.displayName = 'Checkbox';
