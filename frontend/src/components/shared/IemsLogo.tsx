import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

interface IemsLogoProps {
  className?: string;
  variant?: 'auto' | 'light' | 'dark';
  showSubtitle?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function IemsLogo({
  className,
  variant = 'auto',
  size = 'md',
}: IemsLogoProps) {
  const { theme } = useTheme();
  const isDark = variant === 'dark' || (variant === 'auto' && theme === 'dark');

  const heightClass =
    size === 'sm' ? 'h-6 sm:h-7' : size === 'lg' ? 'h-10 sm:h-11' : 'h-8 sm:h-9';

  return (
    <img
      src={isDark ? '/iems-logo-dark.png?v=3' : '/iems-logo.png?v=3'}
      alt="IEMS - Intercom Employee Management System"
      className={cn(heightClass, 'w-auto object-contain select-none shrink-0', className)}
    />
  );
}

/**
 * High-DPI uploaded IEMS logo markup for HTML-to-Canvas PDF exports & print headers.
 */
export const IEMS_LOGO_PDF_HTML = `<img src="/iems-logo.png?v=3" alt="IEMS" crossorigin="anonymous" style="height:35px;width:auto;object-fit:contain;display:block" />`;
