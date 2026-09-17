/**
 * @file Spinner.jsx
 * @description Accessible loading spinner component mapped to shadcn/ui Spinner.
 */

import React from 'react';
import { Spinner as ShadcnSpinner } from '../ui/spinner.jsx';
import { cn } from '../../utils/cn.js';

export function Spinner({ size = 'md', className = '', label = 'Loading...' }) {
  return (
    <div role="status" aria-label={label} className={cn('inline-flex items-center justify-center', className)}>
      <ShadcnSpinner size={size} />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export default Spinner;
