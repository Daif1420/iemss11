import { FileDown, FileSpreadsheet, Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ExportKind = 'excel' | 'pdf' | 'print';

interface ExportActionButtonProps {
  kind: ExportKind;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  className?: string;
}

const CONFIG: Record<
  ExportKind,
  {
    defaultLabel: string;
    loadingLabel: string;
    icon: typeof FileSpreadsheet;
    iconColor: string;
    hoverStyle: string;
  }
> = {
  excel: {
    defaultLabel: 'Excel',
    loadingLabel: 'جاري التصدير...',
    icon: FileSpreadsheet,
    iconColor: 'text-emerald-600 dark:text-emerald-400 group-hover:text-white transition-colors duration-150',
    hoverStyle:
      'hover:bg-emerald-600 hover:border-emerald-600 hover:text-white dark:hover:bg-emerald-600 dark:hover:border-emerald-600 dark:hover:text-white',
  },
  pdf: {
    defaultLabel: 'PDF',
    loadingLabel: 'جاري التجهيز...',
    icon: FileDown,
    iconColor: 'text-rose-600 dark:text-rose-400 group-hover:text-white transition-colors duration-150',
    hoverStyle:
      'hover:bg-rose-600 hover:border-rose-600 hover:text-white dark:hover:bg-rose-600 dark:hover:border-rose-600 dark:hover:text-white',
  },
  print: {
    defaultLabel: 'طباعة',
    loadingLabel: 'جاري الطباعة...',
    icon: Printer,
    iconColor: 'text-[#065BAB] dark:text-blue-400 group-hover:text-white transition-colors duration-150',
    hoverStyle:
      'hover:bg-[#065BAB] hover:border-[#065BAB] hover:text-white dark:hover:bg-blue-600 dark:hover:border-blue-600 dark:hover:text-white',
  },
};

export function ExportActionButton({
  kind,
  onClick,
  disabled = false,
  loading = false,
  label,
  className,
}: ExportActionButtonProps) {
  const cfg = CONFIG[kind];
  const Icon = cfg.icon;
  const text = loading ? cfg.loadingLabel : label || cfg.defaultLabel;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        'group h-8 px-3 gap-1.5 text-xs font-bold rounded-lg shadow-xs transition-all duration-150 hover:-translate-y-px hover:shadow-sm shrink-0 whitespace-nowrap',
        cfg.hoverStyle,
        className
      )}
    >
      {loading ? (
        <Loader2 className={cn('h-4 w-4 animate-spin', cfg.iconColor)} />
      ) : (
        <Icon className={cn('h-4 w-4', cfg.iconColor)} strokeWidth={2} />
      )}
      <span>{text}</span>
    </Button>
  );
}
