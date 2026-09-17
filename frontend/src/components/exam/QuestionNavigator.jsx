/**
 * @file QuestionNavigator.jsx
 * @description Dynamic numbered jump palette rendering N questions with answered/current status indicators.
 * Restyled with Tailwind CSS and shadcn Card tokens.
 */

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card.jsx';
import { cn } from '../../utils/cn.js';

export function QuestionNavigator({
  questions = [],
  currentIndex = 0,
  answers = {},
  onSelect,
}) {
  const total = questions.length;
  const answeredCount = questions.filter((q) => {
    const ans = answers[q.id];
    if (!ans) return false;
    if (ans.selected_option_id !== undefined && ans.selected_option_id !== null) return true;
    if (ans.numeric_value !== undefined && ans.numeric_value !== null && ans.numeric_value !== '') return true;
    if (ans.text_value !== undefined && ans.text_value !== null && ans.text_value.trim() !== '') return true;
    return false;
  }).length;

  return (
    <Card className="border-slate-200 dark:border-slate-800 dark:bg-slate-900 shadow-sm w-full">
      <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 p-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Question Palette
          </CardTitle>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            <strong className="text-slate-900 dark:text-slate-100 font-semibold">{answeredCount}</strong> / {total} answered
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        <div
          role="navigation"
          aria-label="Question Jump Palette"
          className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-5 gap-2 max-h-72 overflow-y-auto pr-1"
        >
          {questions.map((q, idx) => {
            const isCurrent = idx === currentIndex;
            const ans = answers[q.id];
            const isAnswered =
              ans &&
              (ans.selected_option_id !== undefined && ans.selected_option_id !== null ||
                ans.numeric_value !== undefined && ans.numeric_value !== null && ans.numeric_value !== '' ||
                ans.text_value !== undefined && ans.text_value !== null && ans.text_value.trim() !== '');

            return (
              <button
                key={q.id || idx}
                type="button"
                onClick={() => onSelect?.(idx)}
                aria-current={isCurrent ? 'true' : undefined}
                aria-label={`Question ${idx + 1}${isAnswered ? ' (Answered)' : ''}`}
                className={cn(
                  'h-9 w-full rounded-md text-xs font-semibold flex items-center justify-center transition-all cursor-pointer border select-none',
                  isCurrent
                    ? 'ring-2 ring-blue-600 ring-offset-1 border-blue-600 bg-blue-600 text-white shadow-xs'
                    : isAnswered
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700'
                )}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-1 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-blue-600 shrink-0" />
            <span>Current</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500 shrink-0" />
            <span>Answered</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 shrink-0" />
            <span>Unanswered</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default QuestionNavigator;
