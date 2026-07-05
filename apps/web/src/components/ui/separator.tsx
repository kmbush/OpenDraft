/** Local shadcn-style Separator (shadcn isn't installed). */
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

export interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
}

export function Separator({ orientation = 'horizontal', className, ...props }: SeparatorProps) {
  return (
    <div
      aria-hidden
      className={cn(
        'bg-border',
        orientation === 'vertical' ? 'h-full w-px' : 'h-px w-full',
        className,
      )}
      {...props}
    />
  );
}
