import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn.js';

export function Sheet({ open, onOpenChange, children }) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs transition-opacity duration-300"
        onClick={() => onOpenChange?.(false)}
        aria-hidden="true"
      />
      {children}
    </div>,
    document.body
  );
}

export const SheetContent = React.forwardRef(function SheetContent(
  { side = 'right', className, children, onClose, ...props },
  ref
) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const sideStyles = {
    left: 'left-0 inset-y-0 w-full max-w-sm border-r border-slate-200 dark:border-slate-800 animate-in slide-in-from-left duration-300',
    right: 'right-0 inset-y-0 w-full max-w-md border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-300',
    top: 'top-0 inset-x-0 border-b border-slate-200 dark:border-slate-800 animate-in slide-in-from-top duration-300',
    bottom: 'bottom-0 inset-x-0 border-t border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-300',
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      className={cn(
        'fixed z-50 bg-white dark:bg-slate-900 p-6 shadow-2xl transition ease-in-out dark:text-slate-100 flex flex-col',
        sideStyles[side] || sideStyles.right,
        className
      )}
      {...props}
    >
      {children}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 rounded-md p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors cursor-pointer"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
});
SheetContent.displayName = 'SheetContent';

export function SheetHeader({ className, ...props }) {
  return <div className={cn('flex flex-col space-y-1.5 text-left mb-4', className)} {...props} />;
}

export function SheetTitle({ className, ...props }) {
  return (
    <h3
      className={cn('text-lg font-semibold text-slate-900 dark:text-slate-100', className)}
      {...props}
    />
  );
}

export function SheetDescription({ className, ...props }) {
  return (
    <p className={cn('text-sm text-slate-500 dark:text-slate-400', className)} {...props} />
  );
}

export function SheetFooter({ className, ...props }) {
  return (
    <div
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-auto pt-4', className)}
      {...props}
    />
  );
}
