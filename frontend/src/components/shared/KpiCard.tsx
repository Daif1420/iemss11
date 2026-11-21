import type { LucideIcon } from 'lucide-react';
import { ArrowUpLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

type KpiTone = 'default' | 'primary' | 'success' | 'warning' | 'danger';

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  tone?: KpiTone;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}

const TONE_ICON_BG: Record<KpiTone, string> = {
  default: 'bg-secondary text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  danger: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

const TONE_VALUE: Record<KpiTone, string> = {
  default: 'text-foreground',
  primary: 'text-primary',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
};

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'default',
  onClick,
  active = false,
  className,
}: KpiCardProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button', onClick } : {})}
      className={cn(
        'group relative w-full text-start rounded-xl border border-border bg-card p-4 transition-colors',
        onClick && 'cursor-pointer hover:border-primary/40 hover:bg-muted/30',
        active && 'border-primary ring-1 ring-primary/30 bg-accent/20',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground leading-snug">{label}</span>
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
            TONE_ICON_BG[tone]
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>

      <div className="mt-2.5 flex items-baseline justify-between gap-2">
        <span className={cn('text-2xl font-extrabold tracking-tight tabular-nums', TONE_VALUE[tone])}>
          {value}
        </span>
        {onClick && (
          <ArrowUpLeft className="h-3.5 w-3.5 text-muted-foreground/50 transition-transform group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
        )}
      </div>

      {sub && <div className="mt-1 text-[11px] font-medium text-muted-foreground truncate">{sub}</div>}
    </Tag>
  );
}
