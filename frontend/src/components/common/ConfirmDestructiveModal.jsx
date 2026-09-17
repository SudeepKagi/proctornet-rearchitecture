/**
 * @file ConfirmDestructiveModal.jsx
 * @description Accessible two-step destructive action confirmation modal dialog mapped to shadcn/ui AlertDialog.
 */

import React, { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '../ui/alert-dialog.jsx';
import { Input } from '../ui/input.jsx';

export function ConfirmDestructiveModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Destructive Action',
  description = 'Are you sure you want to proceed? This action cannot be undone.',
  confirmButtonText = 'Confirm',
  cancelButtonText = 'Cancel',
  requiredConfirmationWord = '',
  isLoading = false,
  danger = true,
}) {
  const [typedInput, setTypedInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTypedInput('');
    }
  }, [isOpen]);

  const isConfirmed = requiredConfirmationWord
    ? typedInput.trim().toUpperCase() === requiredConfirmationWord.toUpperCase()
    : true;

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose?.()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {requiredConfirmationWord && (
          <div className="mt-4 space-y-2">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Please type <strong className="font-semibold text-rose-600 dark:text-rose-400 select-all">{requiredConfirmationWord}</strong> to confirm:
            </label>
            <Input
              value={typedInput}
              onChange={(e) => setTypedInput(e.target.value)}
              placeholder={requiredConfirmationWord}
              autoFocus
              className="font-mono text-sm"
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={isLoading}>
            {cancelButtonText}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={danger ? 'destructive' : 'default'}
            disabled={!isConfirmed || isLoading}
            onClick={onConfirm}
          >
            {isLoading ? 'Processing...' : confirmButtonText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ConfirmDestructiveModal;
