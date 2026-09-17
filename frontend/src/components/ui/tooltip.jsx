import React, { useState } from 'react';
import { cn } from '../../utils/cn.js';

export function Tooltip({ content, children, side = 'top', className }) {
  const [visible, setVisible] = useState(false);

  const sidePositions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && content && (
        <div
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-50 shadow-md animate-in fade-in zoom-in-95 duration-150 dark:bg-slate-50 dark:text-slate-900',
            sidePositions[side] || sidePositions.top,
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
