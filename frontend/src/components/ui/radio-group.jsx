import React from 'react';
import { cn } from '../../utils/cn.js';

export function RadioGroup({ value, onChange, name, className, children, ...props }) {
  return (
    <div role="radiogroup" className={cn('grid gap-2', className)} {...props}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child, {
          name: name || child.props.name,
          checked: child.props.value === value,
          onChange: () => onChange?.(child.props.value),
        });
      })}
    </div>
  );
}

export const RadioGroupItem = React.forwardRef(function RadioGroupItem(
  { className, id, value, name, checked, onChange, disabled, ...props },
  ref
) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'relative inline-flex items-center justify-center h-4 w-4 shrink-0 rounded-full border border-slate-300 bg-white transition-colors cursor-pointer dark:border-slate-700 dark:bg-slate-900',
        checked && 'border-blue-600 dark:border-blue-600',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <input
        ref={ref}
        type="radio"
        id={id}
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
        {...props}
      />
      {checked && (
        <span className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-500" />
      )}
    </label>
  );
});
RadioGroupItem.displayName = 'RadioGroupItem';
