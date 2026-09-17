/**
 * @file OfflineBanner.jsx
 * @description Floating amber banner notifying candidates of network loss and in-memory buffering.
 * Accessible across all viewports per shadcn/ui and WCAG specifications.
 */

import React from 'react';
import { WifiOff } from 'lucide-react';

export function OfflineBanner({ isOffline }) {
  if (!isOffline) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="sticky top-0 z-50 flex items-center justify-center gap-2.5 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900 shadow-xs dark:border-amber-800/80 dark:bg-amber-950/90 dark:text-amber-200 animate-in slide-in-from-top duration-200"
    >
      <WifiOff className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
      <span>
        <strong className="font-semibold">Connection lost:</strong> Unsynchronized answers remain in this tab only. Do not close or refresh this tab.
      </span>
    </div>
  );
}

export default OfflineBanner;
