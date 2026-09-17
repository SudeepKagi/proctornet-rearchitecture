import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react';
import { cn } from '../../utils/cn.js';

const ToastContext = createContext(null);

const styles = {
  success: { icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-950' },
  error: { icon: XCircle, className: 'border-rose-200 bg-rose-50 text-rose-950' },
  warning: { icon: AlertTriangle, className: 'border-amber-200 bg-amber-50 text-amber-950' },
  info: { icon: Info, className: 'border-sky-200 bg-sky-50 text-sky-950' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(({ title, description, variant = 'info', duration = 5000, action } = {}) => {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, title, description, variant, action }]);
    if (duration > 0) window.setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" aria-atomic="true" className="fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
        {toasts.map((item) => {
          const config = styles[item.variant] || styles.info;
          const Icon = config.icon;
          return (
            <div key={item.id} role={item.variant === 'error' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-xl border p-4 shadow-lg shadow-slate-900/10', config.className)}>
              <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1 text-sm">
                {item.title && <p className="font-semibold">{item.title}</p>}
                {item.description && <p className="mt-0.5 leading-5 opacity-80">{item.description}</p>}
                {item.action && <button type="button" onClick={item.action.onClick} className="mt-2 font-semibold underline underline-offset-2">{item.action.label}</button>}
              </div>
              <button type="button" onClick={() => dismiss(item.id)} aria-label="Dismiss notification" className="rounded p-0.5 opacity-60 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"><X className="size-4" /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
