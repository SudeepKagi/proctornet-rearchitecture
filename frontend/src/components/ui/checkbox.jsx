import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../utils/cn.js';

export const Checkbox = React.forwardRef(function Checkbox(
  { className, checked = false, onChange, onCheckedChange, disabled, id, ...props },
  ref
) {
  const handleChange = (e) => {
    if (onChange) onChange(e);
    if (onCheckedChange) onCheckedChange(e.target.checked);
  };

  return (
    <span
      className={cn(
        'relative inline-flex items-center justify-center h-4 w-4 shrink-0 rounded-xs border border-slate-300 bg-white transition-colors dark:border-slate-700 dark:bg-slate-900',
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
        onChange={handleChange}
        disabled={disabled}
        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer disabled:cursor-not-allowed m-0 p-0"
        {...props}
      />
      {checked && <Check className="h-3 w-3 stroke-[3] pointer-events-none text-white" />}
    </span>
  );
});
Checkbox.displayName = 'Checkbox';
