/** Local shadcn-style Alert (shadcn isn't installed). */
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

type Variant = 'default' | 'destructive' | 'warning' | 'success';

const VARIANTS: Record<Variant, string> = {
  default: 'bg-card text-card-foreground border-border',
  destructive: 'bg-red-50 text-red-800 border-red-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
}

export function Alert({ variant = 'default', className, ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-lg border p-4 text-sm',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h4 className={cn('font-semibold leading-none', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 leading-relaxed', className)} {...props} />;
}
