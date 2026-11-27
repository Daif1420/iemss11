import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      dir="rtl"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-amber-400/50 bg-amber-600 px-3 py-2 text-xs font-bold text-white shadow-lg"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>وضع عدم الاتصال — يتم استخدام النسخة المحفوظة مؤقتاً</span>
    </div>
  );
}
