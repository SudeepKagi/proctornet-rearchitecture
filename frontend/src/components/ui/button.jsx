import React from 'react';
import { cn } from '../../utils/cn.js';

const buttonVariants = {
  default: 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm active:translate-y-[1px]',
  secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200/80 border border-slate-200/60 active:translate-y-[1px]',
  outline: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-sm active:translate-y-[1px]',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  destructive: 'bg-red-600 text-white hover:bg-red-700 shadow-sm active:translate-y-[1px]',
  link: 'text-blue-600 underline-offset-4 hover:underline p-0 h-auto',
};

const buttonSizes = {
  default: 'h-9 px-4 py-2 text-sm',
  sm: 'h-8 rounded-md px-3 text-xs font-medium',
  lg: 'h-10 rounded-md px-6 text-sm font-semibold',
  icon: 'h-9 w-9 p-0',
};

export const Button = React.forwardRef(function Button(
  {
    className,
    variant = 'default',
    size = 'default',
    type = 'button',
    disabled = false,
    children,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
        buttonVariants[variant] || buttonVariants.default,
        buttonSizes[size] || buttonSizes.default,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});

Button.displayName = 'Button';
