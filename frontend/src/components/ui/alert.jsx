import React from 'react';
import { cn } from '../../utils/cn.js';

const alertVariants = {
  default: 'bg-white text-slate-900 border-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-800',
  destructive: 'border-red-200 text-red-900 bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:bg-red-950/40 [&>svg]:text-red-600 dark:[&>svg]:text-red-400',
  success: 'border-emerald-200 text-emerald-900 bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-300 dark:bg-emerald-950/40 [&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-400',
  warning: 'border-amber-200 text-amber-900 bg-amber-50 dark:border-amber-900/50 dark:text-amber-300 dark:bg-amber-950/40 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400',
  info: 'border-blue-200 text-blue-900 bg-blue-50 dark:border-blue-900/50 dark:text-blue-300 dark:bg-blue-950/40 [&>svg]:text-blue-600 dark:[&>svg]:text-blue-400',
};

export const Alert = React.forwardRef(function Alert(
  { className, variant = 'default', children, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      role="alert"
      className={cn(
        'relative w-full rounded-lg border p-4 text-sm [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4',
        alertVariants[variant] || alertVariants.default,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
Alert.displayName = 'Alert';

export const AlertTitle = React.forwardRef(function AlertTitle({ className, ...props }, ref) {
  return (
    <h5
      ref={ref}
      className={cn('mb-1 font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-100', className)}
      {...props}
    />
  );
});
AlertTitle.displayName = 'AlertTitle';

export const AlertDescription = React.forwardRef(function AlertDescription({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn('text-sm [&_p]:leading-relaxed text-slate-600 dark:text-slate-400', className)}
      {...props}
    />
  );
});
AlertDescription.displayName = 'AlertDescription';
