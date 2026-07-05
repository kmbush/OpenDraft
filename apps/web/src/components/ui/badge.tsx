/** Local shadcn-style Badge (shadcn isn't installed). */
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

type Variant = 'default' | 'secondary' | 'outline' | 'accent' | 'destructive';

const VARIANTS: Record<Variant, string> = {
  default: 'bg-primary text-primary-foreground',
  secondary: 'bg-muted text-muted-foreground',
  outline: 'border border-border text-foreground',
  accent: 'bg-accent text-accent-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({ variant = 'default', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
