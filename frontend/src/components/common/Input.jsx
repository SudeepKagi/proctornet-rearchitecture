/**
 * @file Input.jsx
 * @description Accessible form input component standardized to shadcn/ui Input primitive.
 */

import React from 'react';
import { Input as ShadcnInput } from '../ui/input.jsx';
import { cn } from '../../utils/cn.js';

export const Input = React.forwardRef(function Input(
  {
    label,
    id,
    type = 'text',
    value,
    onChange,
    placeholder,
    error,
    required = false,
    disabled = false,
    autoComplete,
    className = '',
    helperText,
    style,
    ...props
  },
  ref
) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={cn('flex flex-col space-y-1.5 text-left', className)} style={style}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-slate-700 select-none"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <ShadcnInput
        ref={ref}
        id={inputId}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={cn(error ? 'border-red-300 focus-visible:ring-red-500' : '')}
        {...props}
      />
      {error && (
        <span id={`${inputId}-error`} className="text-xs font-medium text-red-600">
          {error}
        </span>
      )}
      {helperText && !error && (
        <span className="text-xs text-slate-500">
          {helperText}
        </span>
      )}
    </div>
  );
});

Input.displayName = 'Input';
export default Input;
