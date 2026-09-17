/**
 * @file AutosaveIndicator.jsx
 * @description Subtle visual status indicator for autosave progress and offline queue.
 * Restyled with Tailwind CSS and shadcn tokens.
 */

import React from 'react';
import { Check, Loader2, CloudOff } from 'lucide-react';

export function AutosaveIndicator({ status = 'saved' }) {
  if (status === 'saving') {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        <span>Saving...</span>
      </div>
    );
  }

  if (status === 'offline') {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
        <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Offline — buffered</span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
      <Check className="h-3.5 w-3.5 stroke-[2.5]" aria-hidden="true" />
      <span>All changes saved</span>
    </div>
  );
}

export default AutosaveIndicator;
