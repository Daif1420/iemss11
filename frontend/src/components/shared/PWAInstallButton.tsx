import { useState } from 'react';
import { Download, Share, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface PWAInstallButtonProps {
  variant?: 'icon' | 'button' | 'menu-item';
  className?: string;
}

export function PWAInstallButton({
  variant = 'button',
  className,
}: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (!isInstallable && !isIOS) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        toast.success('تم تثبيت التطبيق على جهازك بنجاح');
      }
      return;
    }
    if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  const label = isIOS ? 'تثبيت على الآيفون' : 'تثبيت التطبيق';

  return (
    <>
      {variant === 'icon' ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClick}
          aria-label={label}
          title={label}
          className={cn(
            'h-8 w-8 min-[360px]:h-9 min-[360px]:w-9 rounded-xl',
            className
          )}
        >
          <Download className="h-4 w-4 text-[#065BAB] dark:text-blue-400" />
        </Button>
      ) : variant === 'menu-item' ? (
        <button
          type="button"
          onClick={handleClick}
          className={cn(
            'flex min-h-[44px] w-full items-center gap-2.5 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2.5 text-[13px] font-bold text-primary transition-colors hover:bg-primary/15 cursor-pointer',
            className
          )}
        >
          <Smartphone className="h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClick}
          className={cn(
            'h-9 gap-1.5 rounded-lg border-[#065BAB]/30 text-[#065BAB] hover:bg-[#065BAB]/10 dark:border-blue-500/40 dark:text-blue-400 dark:hover:bg-blue-500/10 font-bold text-xs',
            className
          )}
        >
          <Download className="h-3.5 w-3.5" />
          <span>{label}</span>
        </Button>
      )}

      {isIOS && (
        <Dialog open={showIOSGuide} onOpenChange={setShowIOSGuide}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-primary" />
                <span>تثبيت التطبيق على iPhone / iPad</span>
              </DialogTitle>
              <DialogDescription>
                اتبع الخطوات التالية لإضافة نظام IEMS إلى الشاشة الرئيسية والوصول إليه كتطبيق مستقل:
              </DialogDescription>
            </DialogHeader>
            <ol className="space-y-2.5 rounded-xl border border-border bg-secondary/40 p-3.5 text-xs leading-relaxed text-foreground">
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                  1
                </span>
                <span>
                  اضغط على زر <strong>المشاركة (Share)</strong>{' '}
                  <Share className="inline h-3.5 w-3.5 text-primary align-text-bottom" /> في شريط متصفح Safari.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                  2
                </span>
                <span>
                  مرر للأسفل واختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                  3
                </span>
                <span>
                  اضغط على <strong>إضافة (Add)</strong> في أعلى الشاشة لتثبيت التطبيق.
                </span>
              </li>
            </ol>
            <DialogFooter>
              <Button type="button" onClick={() => setShowIOSGuide(false)} className="w-full">
                حسناً
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
