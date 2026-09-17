/**
 * @file SubmitConfirmModal.jsx
 * @description Irreversible submission confirmation dialog with answer summary and retry state.
 * Rebuilt with shadcn/ui Dialog and Alert primitives.
 */

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog.jsx';
import { Button } from '../ui/button.jsx';
import { Alert, AlertDescription } from '../ui/alert.jsx';
import { AlertTriangle, Send } from 'lucide-react';

export function SubmitConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  totalQuestions = 0,
  answeredCount = 0,
  unansweredCount = 0,
  submitting = false,
  errorMessage = '',
  onRetry,
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !submitting && onClose?.()}>
      <DialogContent onClose={submitting ? undefined : onClose} className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
              <Send className="h-5 w-5" />
            </div>
            <DialogTitle>Confirm Exam Submission</DialogTitle>
          </div>
          <DialogDescription className="text-xs pt-1">
            Review your progress summary before finalizing. Once submitted, your answers cannot be modified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {errorMessage && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">{errorMessage}</AlertDescription>
            </Alert>
          )}

          {/* Metric Summary Grid */}
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3 text-center">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total</span>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{totalQuestions}</div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Answered</span>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{answeredCount}</div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Unanswered</span>
              <div className={`text-xl font-bold ${unansweredCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                {unansweredCount}
              </div>
            </div>
          </div>

          {unansweredCount > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 p-2.5 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>You have <strong>{unansweredCount}</strong> unanswered questions remaining.</span>
            </div>
          )}

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal border-l-2 border-rose-500 pl-2">
            Final submission sends your evaluation responses to the scoring engine. Ensure all answers are complete before confirming.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            disabled={submitting}
            onClick={onClose}
            className="text-xs h-9"
          >
            Review Answers
          </Button>

          {errorMessage && onRetry ? (
            <Button
              variant="default"
              disabled={submitting}
              onClick={onRetry}
              className="text-xs h-9 bg-blue-600 hover:bg-blue-700"
            >
              {submitting ? 'Retrying Submission...' : 'Retry Submission'}
            </Button>
          ) : (
            <Button
              variant="destructive"
              disabled={submitting}
              onClick={onConfirm}
              className="text-xs h-9"
            >
              {submitting ? 'Finalizing Submission...' : 'Confirm & Submit Exam'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SubmitConfirmModal;
