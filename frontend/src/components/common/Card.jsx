/**
 * @file Card.jsx
 * @description Accessible surface container standardized to shadcn/ui Card.
 */

import React from 'react';
import { Card as ShadcnCard } from '../ui/card.jsx';
import { cn } from '../../utils/cn.js';

export function Card({
  children,
  elevation = 'card',
  padding = 'normal',
  style = {},
  className = '',
  ...props
}) {
  const paddingClasses = {
    none: 'p-0',
    compact: 'p-3 sm:p-4',
    normal: 'p-5 sm:p-6',
    spacious: 'p-6 sm:p-8',
  };

  const resolvedPadding = paddingClasses[padding] || paddingClasses.normal;

  return (
    <ShadcnCard
      className={cn(resolvedPadding, className)}
      style={style}
      {...props}
    >
      {children}
    </ShadcnCard>
  );
}

export default Card;
