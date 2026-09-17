import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { cn } from '../../utils/cn.js';
import { Button } from './button.jsx';

export function AlertDialog({ open, onOpenChange, children }) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-150">
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
        onClick={() => onOpenChange?.(false)}
        aria-hidden="true"
      />
      <div className="relative z-50 w-full max-w-md">{children}</div>
    </div>,
    document.body
  );
}

export const AlertDialogContent = React.forwardRef(function AlertDialogContent(
  { className, children, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      role="alertdialog"
      aria-modal="true"
      className={cn(
        'relative w-full rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
AlertDialogContent.displayName = 'AlertDialogContent';

export function AlertDialogHeader({ className, ...props }) {
  return <div className={cn('flex flex-col space-y-2 text-left', className)} {...props} />;
}

export function AlertDialogTitle({ className, children, ...props }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="p-2 rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h2
        className={cn('text-lg font-semibold text-slate-900 dark:text-slate-100', className)}
        {...props}
      >
        {children}
      </h2>
    </div>
  );
}

export function AlertDialogDescription({ className, ...props }) {
  return (
    <p className={cn('text-sm text-slate-500 dark:text-slate-400 mt-2', className)} {...props} />
  );
}

export function AlertDialogFooter({ className, ...props }) {
  return (
    <div
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-2 mt-6', className)}
      {...props}
    />
  );
}

export function AlertDialogAction({ className, variant = 'destructive', ...props }) {
  return <Button variant={variant} className={cn(className)} {...props} />;
}

export function AlertDialogCancel({ className, onClick, ...props }) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className={cn('mt-2 sm:mt-0', className)}
      {...props}
    />
  );
}
