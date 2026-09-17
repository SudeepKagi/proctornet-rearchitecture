/**
 * @file TimerDisplay.jsx
 * @description Tabular visual countdown timer with 5-minute and 1-minute urgency styles.
 * Restyled with Tailwind CSS and shadcn tokens.
 */

import React from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { cn } from '../../utils/cn.js';

export function TimerDisplay({
  formattedTime,
  isExpired,
  isUrgent5Min,
  isUrgent1Min,
}) {
  let colorStyles = 'border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100';
  let urgencyLabel = 'Time Remaining';

  if (isExpired) {
    colorStyles = 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900/80 dark:bg-rose-950/60 dark:text-rose-300';
    urgencyLabel = 'Time Expired';
  } else if (isUrgent1Min) {
    colorStyles = 'border-rose-500 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/80 dark:text-rose-200 animate-pulse';
    urgencyLabel = 'Final Minute!';
  } else if (isUrgent5Min) {
    colorStyles = 'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-800/80 dark:bg-amber-950/60 dark:text-amber-200';
    urgencyLabel = '< 5 Minutes Remaining';
  }

  return (
    <div
      role="timer"
      aria-label={urgencyLabel}
      aria-live={isUrgent1Min ? 'assertive' : isUrgent5Min ? 'polite' : 'off'}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-2xs transition-colors',
        colorStyles
      )}
    >
      {isUrgent1Min ? (
        <AlertTriangle className="h-4 w-4 shrink-0 animate-bounce text-rose-600 dark:text-rose-400" aria-hidden="true" />
      ) : (
        <Clock className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
      )}

      <span className="font-mono font-bold text-sm sm:text-base tracking-wider tabular-nums select-none">
        {isExpired ? '00:00' : formattedTime}
      </span>
    </div>
  );
}

export default TimerDisplay;
