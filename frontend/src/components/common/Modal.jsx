/**
 * @file Modal.jsx
 * @description Accessible modal dialog component mapped directly to shadcn/ui Dialog.
 */

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.jsx';

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = '500px',
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent onClose={onClose} style={{ maxWidth }}>
        {title && (
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
        )}
        <div className="overflow-y-auto max-h-[80vh]">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
