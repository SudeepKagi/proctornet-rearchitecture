import React from 'react';
import { cn } from '../../utils/cn.js';

export const Switch = React.forwardRef(function Switch(
  { className, checked, onChange, disabled, id, ...props },
  ref
) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
        checked ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700',
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
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
          checked ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </label>
  );
});
Switch.displayName = 'Switch';
