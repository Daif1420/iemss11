import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold transition-colors whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        secondary: 'border-border bg-secondary text-secondary-foreground',
        destructive: 'border-[var(--destructive)]/25 bg-[var(--destructive)]/10 text-[var(--destructive)]',
        success: 'border-[var(--success)]/25 bg-[var(--success)]/10 text-[var(--success)]',
        warning: 'border-[var(--warning)]/25 bg-[var(--warning)]/10 text-[var(--warning)]',
        outline: 'border-border bg-transparent text-foreground',
      },
    },
    defaultVariants: {
      variant: 'secondary',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
