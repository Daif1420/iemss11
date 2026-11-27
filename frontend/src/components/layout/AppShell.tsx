import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  BellOff,
  BellRing,
  BookOpen,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  FileBarChart2,
  FileSpreadsheet,
  FileText,
  Home,
  KeyRound,
  LogOut,
  Menu,
  Moon,
  Palette,
  PenSquare,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Sun,
  User,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import {
  showServiceWorkerNotification,
  syncAppBadge,
  usePushNotifications,
} from '@/hooks/usePushNotifications';
import { api, ApiError } from '@/lib/api';
import { downloadSystemGuidePdf } from '@/lib/export';
import { ROLE_LABELS, fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { NotificationItem } from '@/types/iems';
import { IemsLogo } from '@/components/shared/IemsLogo';
import { PWAInstallButton } from '@/components/shared/PWAInstallButton';
import { SeasonalScreenOverlay, SeasonalTopAccent } from '@/components/shared/SeasonalDecor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const EMPLOYEE_SUB_ROUTES = [
  { to: '/admin-employees.html', label: 'كل الموظفين', icon: Users },
  { to: '/employees-current.html', label: 'الحاليون', icon: UserCheck },
  { to: '/employees-left.html', label: 'المغادرون', icon: UserMinus },
  { to: '/employees-new.html', label: 'الجدد', icon: UserPlus },
];

interface AppShellProps {
  children: ReactNode;
  beforeContent?: ReactNode;
  maxWidthClass?: string;
}

export function AppShell({
  children,
  beforeContent,
  maxWidthClass = 'max-w-[1400px]',
}: AppShellProps) {
  const {
    user,
    isCreator,
    isHrManager,
    isAdminUp,
    isSupervisorUp,
    isEmployee,
    updateUserProfile,
    logout,
  } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pushBannerDismissed, setPushBannerDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('iems_push_banner_dismissed') === '1';
    } catch {
      return false;
    }
  });
  const initialNotifLoadedRef = useRef(false);
  const seenNotifIdsRef = useRef<Set<number>>(new Set());

  // Unified Account Dropdown + Profile / Password Dialog
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountDialogMode, setAccountDialogMode] = useState<'profile' | 'password' | null>(null);
  const [profileName, setProfileName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [guideDownloading, setGuideDownloading] = useState(false);

  const handleDownloadGuide = async () => {
    if (guideDownloading) return;
    setGuideDownloading(true);
    try {
      await downloadSystemGuidePdf();
      toast.success('تم بدء تحميل دليل النظام التعريفي (PDF)');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تحميل دليل النظام');
    } finally {
      setGuideDownloading(false);
    }
  };

  const currentPath = location.pathname;

  useEffect(() => {
    setMobileNavOpen(false);
  }, [currentPath]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileNavOpen]);

  const isEmployeesRouteActive = useMemo(
    () =>
      EMPLOYEE_SUB_ROUTES.some((r) => r.to === currentPath) || currentPath === '/employee.html',
    [currentPath]
  );

  const isSystemRouteActive =
    currentPath === '/audit-logs.html' ||
    currentPath === '/themes.html' ||
    currentPath === '/settings.html';

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api<{ items: NotificationItem[]; unread: number }>('/api/notifications');
      const items = res.items || [];
      const unread = Number(res.unread || 0);

      if (initialNotifLoadedRef.current) {
        const freshUnread = items.filter(
          (n) => !n.is_read && !seenNotifIdsRef.current.has(n.id)
        );
        if (freshUnread.length > 0) {
          const newest = freshUnread[0];
          if (document.hidden) {
            void showServiceWorkerNotification({
              title: newest.title,
              body: newest.body || undefined,
              link: newest.link && !newest.link.includes('missing-data') ? newest.link : '/requests.html',
              tag: `iems-notif-${newest.id}`,
            });
          } else {
            toast.info(newest.title, {
              description: newest.body || undefined,
            });
          }
        }
      }

      initialNotifLoadedRef.current = true;
      seenNotifIdsRef.current = new Set(items.map((n) => n.id));
      setNotifications(items);
      setUnreadCount(unread);
      syncAppBadge(unread);
    } catch {
      // silent polling failure
    }
  }, [user]);

  const {
    isNotificationSupported,
    isPushSupported,
    permission: pushPermission,
    isSubscribed: pushSubscribed,
    busy: pushBusy,
    enablePushNotifications,
    disablePushNotifications,
    sendTestPush,
  } = usePushNotifications({
    enabled: Boolean(user),
    onPushReceived: (payload) => {
      void loadNotifications();
      if (!document.hidden && payload.title) {
        toast.info(payload.title, { description: payload.body || undefined });
      }
    },
    onNavigate: (url) => {
      if (url && !url.includes('missing-data')) {
        navigate(url);
      }
    },
  });

  useEffect(() => {
    initialNotifLoadedRef.current = false;
    seenNotifIdsRef.current.clear();
  }, [user?.id]);

  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(() => {
      loadNotifications();
    }, 30000);

    const onRefresh = () => {
      loadNotifications();
    };
    const onVisibilityOrFocus = () => {
      if (!document.hidden) {
        loadNotifications();
      }
    };
    window.addEventListener('iems:refresh-badges', onRefresh);
    window.addEventListener('focus', onVisibilityOrFocus);
    document.addEventListener('visibilitychange', onVisibilityOrFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('iems:refresh-badges', onRefresh);
      window.removeEventListener('focus', onVisibilityOrFocus);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
    };
  }, [loadNotifications]);

  const handleEnablePush = async () => {
    const res = await enablePushNotifications();
    if (res.ok) {
      setPushBannerDismissed(true);
      try {
        localStorage.setItem('iems_push_banner_dismissed', '1');
      } catch {
        // ignore storage error
      }
      toast.success('تم تفعيل إشعارات الجهاز بنجاح، ستصلك التنبيهات فورياً');
    } else if (res.reason === 'denied') {
      toast.error('تم رفض إذن الإشعارات من المتصفح، يمكنك تفعيلها من إعدادات الموقع');
    } else if (res.reason === 'unsupported') {
      toast.error('المتصفح الحالي لا يدعم الإشعارات');
    } else {
      toast.error('تعذّر تفعيل إشعارات الجهاز حالياً');
    }
  };

  const handleDismissPushBanner = () => {
    setPushBannerDismissed(true);
    try {
      localStorage.setItem('iems_push_banner_dismissed', '1');
    } catch {
      // ignore storage error
    }
  };

  const handleSendTestPush = async () => {
    const ok = await sendTestPush();
    if (ok) {
      toast.success('تم إرسال إشعار تجريبي إلى جهازك');
    } else {
      toast.error('تعذّر إرسال الإشعار التجريبي');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api('/api/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      syncAppBadge(0);
    } catch {
      toast.error('تعذر تحديث حالة الإشعارات');
    }
  };

  const handleOpenNotification = async (item: NotificationItem) => {
    if (!item.is_read) {
      try {
        await api(`/api/notifications/${item.id}/read`, { method: 'POST' });
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
        );
        setUnreadCount((c) => {
          const next = Math.max(0, c - 1);
          syncAppBadge(next);
          return next;
        });
      } catch {
        // ignore read mark error
      }
    }
    setNotifOpen(false);
    if (item.link && !item.link.includes('missing-data')) {
      navigate(item.link);
    }
  };

  const openAccountDialog = (mode: 'profile' | 'password') => {
    setProfileName(user?.name || '');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setAccountDialogMode(mode);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (accountDialogMode !== 'password' || !isCreator) {
      setAccountDialogMode(null);
      return;
    }

    const trimmedName = profileName.trim();
    if (!trimmedName) {
      toast.error('يرجى إدخال الاسم.');
      return;
    }

    if (newPassword || confirmPassword) {
      if (!currentPassword) {
        toast.error('أدخل كلمة المرور الحالية لتغيير كلمة المرور.');
        return;
      }
      if (newPassword.length < 4) {
        toast.error('كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل.');
        return;
      }
      if (newPassword !== confirmPassword) {
        toast.error('كلمتا المرور غير متطابقتين.');
        return;
      }
    }

    const payload: { name?: string; currentPassword?: string; newPassword?: string } = {};
    if (trimmedName !== (user?.name || '').trim()) {
      payload.name = trimmedName;
    }
    if (newPassword) {
      payload.currentPassword = currentPassword;
      payload.newPassword = newPassword;
    }

    if (Object.keys(payload).length === 0) {
      setAccountDialogMode(null);
      return;
    }

    setProfileSaving(true);
    try {
      const res = await api<{ ok: boolean; user: typeof user; message?: string }>(
        '/api/admin/me/profile',
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      );
      if (res.user) updateUserProfile(res.user);
      toast.success(res.message || 'تم تحديث إعدادات الملف الشخصي بنجاح');
      setAccountDialogMode(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر حفظ التعديلات');
    } finally {
      setProfileSaving(false);
    }
  };

  const isHomeActive = currentPath === '/home.html' || currentPath === '/dashboard.html';

  const navLinkClass = (active: boolean) =>
    cn(
      'relative inline-flex h-14 items-center gap-1.5 px-2 xl:px-2.5 text-xs xl:text-[13px] font-bold transition-colors whitespace-nowrap shrink-0',
      active
        ? 'text-primary after:absolute after:inset-x-1.5 after:bottom-0 after:h-[2.5px] after:rounded-full after:bg-primary'
        : 'text-muted-foreground hover:text-foreground'
    );

  const mobileSubNavLinkClass = (active: boolean) =>
    cn(
      'relative inline-flex h-10 w-full items-center justify-center gap-1.5 px-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0',
      active
        ? 'text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-[2.5px] after:rounded-full after:bg-primary'
        : 'text-muted-foreground hover:text-foreground'
    );

  const mobileDrawerItemClass = (active: boolean) =>
    cn(
      'flex min-h-[44px] w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] font-bold transition-colors',
      active
        ? 'border-primary/30 bg-primary/10 text-primary'
        : 'border-transparent bg-secondary/40 text-foreground hover:bg-secondary/80'
    );

  return (
    <div dir="rtl" className="min-h-screen flex flex-col bg-background text-foreground overflow-x-clip">
      <SeasonalScreenOverlay />
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-card/95 backdrop-blur-md no-print">
        <SeasonalTopAccent />
        <div
          className={cn(
            'mx-auto flex h-14 items-center justify-between gap-2 sm:gap-4 px-2.5 min-[360px]:px-3 sm:px-6',
            maxWidthClass
          )}
        >
          {/* Zone 1 (Right / Start in RTL): Mobile Menu Toggle + IEMS Brand */}
          <div className="flex items-center gap-1.5 min-[420px]:gap-2 sm:gap-2.5 shrink-0 min-w-0">
            {!isEmployee && isSupervisorUp && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setMobileNavOpen((prev) => !prev)}
                className={cn(
                  'lg:hidden h-8 w-8 min-[360px]:h-9 min-[360px]:w-9 rounded-xl border transition-colors shrink-0',
                  mobileNavOpen
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border/70 bg-secondary/40 text-foreground hover:bg-secondary/80'
                )}
                aria-label={mobileNavOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
                aria-expanded={mobileNavOpen}
              >
                {mobileNavOpen ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
              </Button>
            )}
            <Link
              to="/home.html"
              className="flex items-center shrink-0 focus:outline-none"
              title="IEMS - نظام إدارة الموظفين"
            >
              <IemsLogo size="md" className="h-4 min-[360px]:h-5 min-[420px]:h-6 sm:h-7 lg:h-8" />
            </Link>
          </div>

          {/* Zone 2 (Center): Centered & evenly distributed Nav Tabs on desktop */}
          {!isEmployee && isSupervisorUp ? (
            <nav className="hidden lg:flex flex-1 min-w-0 items-center overflow-x-auto no-scrollbar">
              <div
                className={cn(
                  'mx-auto flex items-center justify-evenly gap-1 xl:gap-2 px-1.5 xl:px-2 min-w-max',
                  isCreator
                    ? 'lg:min-w-0 lg:w-full lg:max-w-4xl'
                    : isAdminUp
                      ? 'lg:min-w-0 lg:w-full lg:max-w-3xl'
                      : isHrManager
                        ? 'lg:min-w-0 lg:w-full lg:max-w-lg'
                        : 'lg:min-w-0 lg:w-full lg:max-w-2xl'
                )}
              >
                <Link to="/home.html" className={navLinkClass(isHomeActive)}>
                  <Home className="h-3.5 w-3.5" />
                  <span>الرئيسية</span>
                </Link>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(navLinkClass(isEmployeesRouteActive), 'cursor-pointer')}
                    >
                      <Users className="h-3.5 w-3.5" />
                      <span>الموظفون</span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-48">
                    {EMPLOYEE_SUB_ROUTES.map((item) => {
                      const Icon = item.icon;
                      const active = currentPath === item.to;
                      return (
                        <DropdownMenuItem
                          key={item.to}
                          onSelect={() => navigate(item.to)}
                          className={cn(active && 'bg-accent text-accent-foreground font-bold')}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>

                {!isHrManager && (
                  <Link to="/reports.html" className={navLinkClass(currentPath === '/reports.html')}>
                    <FileBarChart2 className="h-3.5 w-3.5" />
                    <span>التقارير</span>
                  </Link>
                )}

                <Link to="/requests.html" className={navLinkClass(currentPath === '/requests.html')}>
                  <FileText className="h-3.5 w-3.5" />
                  <span>الطلبات</span>
                </Link>

                {isAdminUp && (
                  <Link
                    to="/admin-manual-entry.html"
                    className={navLinkClass(currentPath === '/admin-manual-entry.html')}
                  >
                    <PenSquare className="h-3.5 w-3.5" />
                    <span>الإدخال اليدوي</span>
                  </Link>
                )}

                {!isHrManager && (
                  <Link
                    to="/admin-import.html"
                    className={navLinkClass(currentPath === '/admin-import.html')}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    <span>تحديث البيانات</span>
                  </Link>
                )}

                {isCreator && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={cn(navLinkClass(isSystemRouteActive), 'cursor-pointer')}
                      >
                        <Settings className="h-3.5 w-3.5" />
                        <span>إعدادات النظام</span>
                        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="w-52">
                      <DropdownMenuItem
                        onSelect={() => navigate('/settings.html')}
                        className={cn(
                          currentPath === '/settings.html' &&
                            'bg-accent text-accent-foreground font-bold'
                        )}
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                        <span>الإعدادات العامة والبيانات</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => navigate('/audit-logs.html')}
                        className={cn(
                          currentPath === '/audit-logs.html' &&
                            'bg-accent text-accent-foreground font-bold'
                        )}
                      >
                        <ScrollText className="h-4 w-4" />
                        <span>سجل العمليات</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => navigate('/themes.html')}
                        className={cn(
                          currentPath === '/themes.html' &&
                            'bg-accent text-accent-foreground font-bold'
                        )}
                      >
                        <Palette className="h-4 w-4" />
                        <span>بانر الصفحة الرئيسية</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </nav>
          ) : isEmployee ? (
            <nav className="hidden sm:flex flex-1 min-w-0 items-center">
              <div className="mx-auto flex items-center justify-evenly gap-6 px-2 w-full max-w-sm">
                <Link to="/home.html" className={navLinkClass(isHomeActive)}>
                  <Home className="h-3.5 w-3.5" />
                  <span>الرئيسية</span>
                </Link>
                <Link to="/requests.html" className={navLinkClass(currentPath === '/requests.html')}>
                  <FileText className="h-3.5 w-3.5" />
                  <span>الطلبات والخدمات</span>
                </Link>
              </div>
            </nav>
          ) : (
            <div className="flex-1" />
          )}

          {/* Zone 3 (Left / End in RTL): Utility Actions + Account + Intercom Brand */}
          <div className="flex items-center gap-1 min-[420px]:gap-1.5 sm:gap-2 shrink-0">
            {/* Notifications */}
            <Popover
              open={notifOpen}
              onOpenChange={(open: boolean) => {
                setNotifOpen(open);
                if (open) loadNotifications();
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative h-8 w-8 min-[360px]:h-9 min-[360px]:w-9 rounded-xl"
                  aria-label="الإشعارات"
                >
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -left-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground tabular-nums">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={8}
                collisionPadding={12}
                className="w-[min(21rem,calc(100vw-1.5rem))] p-0 overflow-hidden"
              >
                <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5 bg-muted/40">
                  <span className="text-xs font-bold text-foreground">
                    الإشعارات {unreadCount > 0 ? `(${unreadCount})` : ''}
                  </span>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      <span>قراءة الكل</span>
                    </button>
                  )}
                </div>

                {/* Device / PWA Push Notification Status Control */}
                {isNotificationSupported && (
                  <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/40 px-3.5 py-2 text-[11px]">
                    {pushPermission === 'granted' ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                          <BellRing className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            {pushSubscribed ? 'إشعارات الجهاز مفعّلة' : 'إشعارات المتصفح مفعّلة'}
                          </span>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={pushBusy}
                            onClick={handleSendTestPush}
                            className="font-bold text-primary hover:underline cursor-pointer disabled:opacity-50"
                          >
                            تجربة إشعار
                          </button>
                          {isPushSupported && pushSubscribed && (
                            <button
                              type="button"
                              disabled={pushBusy}
                              onClick={() => void disablePushNotifications()}
                              className="text-muted-foreground hover:text-destructive cursor-pointer disabled:opacity-50"
                              title="إيقاف إشعارات هذا الجهاز"
                            >
                              إيقاف
                            </button>
                          )}
                        </div>
                      </>
                    ) : pushPermission === 'denied' ? (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <BellOff className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <span>إشعارات الجهاز محظورة من إعدادات المتصفح</span>
                      </span>
                    ) : (
                      <>
                        <span className="text-muted-foreground font-medium">
                          استلم تنبيهات الطلبات على جهازك
                        </span>
                        <button
                          type="button"
                          disabled={pushBusy}
                          onClick={handleEnablePush}
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 cursor-pointer disabled:opacity-50"
                        >
                          <BellRing className="h-3 w-3" />
                          <span>تفعيل الآن</span>
                        </button>
                      </>
                    )}
                  </div>
                )}

                <div className="max-h-80 overflow-y-auto divide-y divide-border/70">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      لا توجد إشعارات حالياً
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => handleOpenNotification(n)}
                        className={cn(
                          'w-full text-start px-3.5 py-2.5 transition-colors hover:bg-muted/50 cursor-pointer flex flex-col gap-0.5',
                          !n.is_read && 'bg-accent/35'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={cn(
                              'text-xs font-bold line-clamp-1',
                              !n.is_read ? 'text-primary' : 'text-foreground'
                            )}
                          >
                            {n.title}
                          </span>
                          {!n.is_read && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          )}
                        </div>
                        {n.body && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2">{n.body}</p>
                        )}
                        <span className="text-[10px] text-muted-foreground/80 mt-0.5">
                          {fmtDateTime(n.created_at)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-8 w-8 min-[360px]:h-9 min-[360px]:w-9 rounded-xl"
              aria-label={theme === 'dark' ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الداكن'}
              title={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>

            {/* System Guide PDF Download */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownloadGuide}
              disabled={guideDownloading}
              className="h-8 w-8 min-[360px]:h-9 min-[360px]:w-9 rounded-xl"
              aria-label="تحميل دليل استخدام النظام PDF"
              title="تحميل دليل استخدام النظام (PDF)"
            >
              <BookOpen className="h-4 w-4 text-[#065BAB] dark:text-blue-400" />
            </Button>

            {/* In-App PWA Install Button (hidden automatically in standalone mode) */}
            <PWAInstallButton variant="icon" />

            {/* Unified Account Dropdown */}
            <DropdownMenu open={accountMenuOpen} onOpenChange={(o: boolean) => setAccountMenuOpen(o)}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="حساب المستخدم"
                  className={cn(
                    'inline-flex h-8 w-8 min-[360px]:h-9 min-[360px]:w-9 md:h-10 md:w-auto md:px-2.5 items-center justify-center md:justify-start gap-2 rounded-xl border bg-secondary/40 hover:bg-secondary/75 transition-colors cursor-pointer focus:outline-none',
                    accountMenuOpen
                      ? 'border-primary ring-1 ring-primary/35'
                      : 'border-border'
                  )}
                >
                  <span className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-full bg-[#065BAB] dark:bg-blue-600 text-white">
                    <User className="h-3.5 w-3.5" />
                  </span>
                  <span className="hidden md:flex flex-col items-start text-start leading-tight max-w-[130px]">
                    <span className="text-xs font-bold text-foreground truncate w-full">
                      {user?.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {user ? ROLE_LABELS[user.role] : ''}
                    </span>
                  </span>
                  {accountMenuOpen ? (
                    <ChevronUp className="hidden md:inline-block h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="hidden md:inline-block h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="end"
                sideOffset={8}
                collisionPadding={12}
                className="w-[min(16rem,calc(100vw-1.5rem))] p-0 overflow-hidden rounded-xl border-border bg-card dark:bg-[#141417] shadow-xl"
              >
                <div className="px-4 py-3.5 border-b border-border space-y-1">
                  <div className="text-sm font-extrabold text-foreground truncate">
                    {user?.name}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <span className="text-xs font-bold text-primary">
                      {user ? ROLE_LABELS[user.role] : ''}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                      @{user?.id}
                    </span>
                  </div>
                </div>

                <div className="p-1.5 space-y-0.5">
                  <DropdownMenuItem
                    onSelect={() => openAccountDialog('profile')}
                    className="rounded-lg px-3 py-2 text-xs font-semibold gap-2.5 cursor-pointer"
                  >
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>الملف الشخصي</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={handleDownloadGuide}
                    className="rounded-lg px-3 py-2 text-xs font-semibold gap-2.5 cursor-pointer"
                  >
                    <BookOpen className="h-4 w-4 text-[#065BAB] dark:text-blue-400" />
                    <span>دليل استخدام النظام (PDF)</span>
                  </DropdownMenuItem>
                  {isCreator && (
                    <DropdownMenuItem
                      onSelect={() => openAccountDialog('password')}
                      className="rounded-lg px-3 py-2 text-xs font-semibold gap-2.5 cursor-pointer"
                    >
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                      <span>إعدادات الملف الشخصي</span>
                    </DropdownMenuItem>
                  )}
                  <div className="my-1 border-t border-border/70" />
                  <DropdownMenuItem
                    onSelect={logout}
                    className="rounded-lg px-3 py-2 text-xs font-bold gap-2.5 text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>تسجيل الخروج</span>
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Intercom Partner Logo visible on all viewports */}
            <span className="hidden min-[380px]:inline-block h-4 sm:h-5 w-[1px] bg-border mx-0.5" />
            <Link
              to="/home.html"
              className="flex items-center shrink-0 focus:outline-none"
              title="Intercom"
            >
              <img
                src={theme === 'dark' ? '/logo-dark.png' : '/logo.png'}
                alt="Intercom"
                className="h-4 min-[360px]:h-5 min-[420px]:h-6 sm:h-7 lg:h-8 w-auto object-contain"
              />
            </Link>
          </div>
        </div>

        {/* Employee Mobile Sub-Bar (< sm): Two clean centered tabs without crowding Row 1 */}
        {isEmployee && (
          <nav
            aria-label="التنقل الرئيسي"
            className="sm:hidden border-t border-border/70 bg-card/85 px-3 h-10"
          >
            <div className="mx-auto grid h-full w-full max-w-sm grid-cols-2">
              <Link to="/home.html" className={mobileSubNavLinkClass(isHomeActive)}>
                <Home className="h-3.5 w-3.5" />
                <span>الرئيسية</span>
              </Link>
              <Link
                to="/requests.html"
                className={mobileSubNavLinkClass(currentPath === '/requests.html')}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>الطلبات والخدمات</span>
              </Link>
            </div>
          </nav>
        )}
      </header>

      {/* Mobile & Tablet Navigation Drawer Overlay for Supervisors / Admins / Creator */}
      {!isEmployee && isSupervisorUp && mobileNavOpen && (
        <div className="fixed inset-x-0 top-14 bottom-0 z-30 lg:hidden no-print">
          <div
            className="absolute inset-0 bg-background/60 backdrop-blur-xs"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <nav
            aria-label="قائمة التنقل"
            className="relative mx-auto max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-border bg-card shadow-xl"
          >
            <div className={cn('mx-auto px-3 sm:px-6 py-4 space-y-4', maxWidthClass)}>
              {/* Compact User Context Strip on Phones (< md) */}
              {user && (
                <div className="flex md:hidden items-center justify-between gap-2 rounded-xl border border-border/70 bg-secondary/40 px-3.5 py-2.5 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#065BAB] dark:bg-blue-600 text-white">
                      <User className="h-3.5 w-3.5" />
                    </span>
                    <span className="font-extrabold text-foreground truncate">{user.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
                    <span className="font-bold text-primary">{ROLE_LABELS[user.role]}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums" dir="ltr">
                      @{user.id}
                    </span>
                  </div>
                </div>
              )}

              {/* Primary Links */}
              <div className="space-y-2">
                <div className="px-1 text-[11px] font-bold text-muted-foreground">الأقسام الرئيسية</div>
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    to="/home.html"
                    onClick={() => setMobileNavOpen(false)}
                    className={mobileDrawerItemClass(isHomeActive)}
                  >
                    <Home className="h-4 w-4 shrink-0" />
                    <span className="truncate">الرئيسية</span>
                  </Link>
                  {!isHrManager && (
                    <Link
                      to="/reports.html"
                      onClick={() => setMobileNavOpen(false)}
                      className={mobileDrawerItemClass(currentPath === '/reports.html')}
                    >
                      <FileBarChart2 className="h-4 w-4 shrink-0" />
                      <span className="truncate">التقارير</span>
                    </Link>
                  )}
                  <Link
                    to="/requests.html"
                    onClick={() => setMobileNavOpen(false)}
                    className={mobileDrawerItemClass(currentPath === '/requests.html')}
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate">الطلبات</span>
                  </Link>
                  {isAdminUp && (
                    <Link
                      to="/admin-manual-entry.html"
                      onClick={() => setMobileNavOpen(false)}
                      className={mobileDrawerItemClass(currentPath === '/admin-manual-entry.html')}
                    >
                      <PenSquare className="h-4 w-4 shrink-0" />
                      <span className="truncate">الإدخال اليدوي</span>
                    </Link>
                  )}
                  {!isHrManager && (
                    <Link
                      to="/admin-import.html"
                      onClick={() => setMobileNavOpen(false)}
                      className={cn(
                        mobileDrawerItemClass(currentPath === '/admin-import.html'),
                        !isAdminUp && 'col-span-2 sm:col-span-1'
                      )}
                    >
                      <FileSpreadsheet className="h-4 w-4 shrink-0" />
                      <span className="truncate">تحديث البيانات</span>
                    </Link>
                  )}
                </div>
              </div>

              {/* Employees Group */}
              <div className="border-t border-border/70 pt-3 space-y-2">
                <div className="px-1 text-[11px] font-bold text-muted-foreground">الموظفون</div>
                <div className="grid grid-cols-2 gap-2">
                  {EMPLOYEE_SUB_ROUTES.map((item) => {
                    const Icon = item.icon;
                    const active = currentPath === item.to;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileNavOpen(false)}
                        className={mobileDrawerItemClass(active)}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* System Settings Group (Creator Only) */}
              {isCreator && (
                <div className="border-t border-border/70 pt-3 space-y-2">
                  <div className="px-1 text-[11px] font-bold text-muted-foreground">
                    إعدادات النظام
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Link
                      to="/settings.html"
                      onClick={() => setMobileNavOpen(false)}
                      className={mobileDrawerItemClass(currentPath === '/settings.html')}
                    >
                      <SlidersHorizontal className="h-4 w-4 shrink-0" />
                      <span>الإعدادات العامة والبيانات</span>
                    </Link>
                    <Link
                      to="/audit-logs.html"
                      onClick={() => setMobileNavOpen(false)}
                      className={mobileDrawerItemClass(currentPath === '/audit-logs.html')}
                    >
                      <ScrollText className="h-4 w-4 shrink-0" />
                      <span>سجل العمليات</span>
                    </Link>
                    <Link
                      to="/themes.html"
                      onClick={() => setMobileNavOpen(false)}
                      className={mobileDrawerItemClass(currentPath === '/themes.html')}
                    >
                      <Palette className="h-4 w-4 shrink-0" />
                      <span>بانر الصفحة الرئيسية</span>
                    </Link>
                  </div>
                </div>
              )}

              <PWAInstallButton variant="menu-item" />
            </div>
          </nav>
        </div>
      )}

      {/* Slot immediately after topbar (e.g. Home System Banner) */}
      {beforeContent}

      {/* Main Content */}
      <main className={cn('flex-1 w-full mx-auto px-4 sm:px-6 py-6', maxWidthClass)}>
        {isNotificationSupported && pushPermission === 'default' && !pushBannerDismissed && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-2.5 text-xs no-print">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BellRing className="h-4 w-4" />
              </span>
              <div>
                <div className="font-bold text-foreground">
                  فعّل إشعارات التطبيق على جهازك
                </div>
                <div className="text-[11px] text-muted-foreground">
                  لتصلك تنبيهات الموافقة على الطلبات والإشعارات الجديدة فورياً حتى عند إغلاق التطبيق.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={pushBusy}
                onClick={handleEnablePush}
                className="h-8 gap-1.5 rounded-lg text-xs font-bold"
              >
                <BellRing className="h-3.5 w-3.5" />
                <span>تفعيل الإشعارات</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleDismissPushBanner}
                aria-label="إخفاء"
                className="h-8 w-8 rounded-lg text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/60 py-4 text-center text-[11px] text-slate-500 dark:text-zinc-400 no-print">
        <div className={cn('mx-auto space-y-0.5 px-4 sm:px-6', maxWidthClass)}>
          <div className="font-extrabold text-slate-800 dark:text-zinc-200">
            © IEMS {new Date().getFullYear()}
          </div>
          <div>Product Design &amp; Development by</div>
          <div className="font-extrabold text-[#065BAB] dark:text-blue-400">Mohamed H. Daif</div>
        </div>
      </footer>

      {/* Profile / Password Dialog */}
      <Dialog
        open={accountDialogMode !== null}
        onOpenChange={(o: boolean) => !o && setAccountDialogMode(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {accountDialogMode === 'password' ? (
                <KeyRound className="h-4 w-4 text-primary" />
              ) : (
                <User className="h-4 w-4 text-primary" />
              )}
              <span>
                {accountDialogMode === 'password' ? 'إعدادات الملف الشخصي' : 'الملف الشخصي'}
              </span>
            </DialogTitle>
            <DialogDescription>
              {accountDialogMode === 'password'
                ? 'تعديل الاسم أو كلمة المرور لحساب منشئ النظام.'
                : 'بيانات حسابك الوظيفية المسجلة في النظام.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveAccount} className="space-y-4 pt-2">
            {accountDialogMode === 'profile' ? (
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-secondary/40 p-4 text-xs">
                <div className="col-span-2">
                  <div className="text-muted-foreground">الاسم الكامل</div>
                  <div className="font-extrabold text-sm text-foreground mt-0.5">{user?.name}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">رقم التعريف (ID)</div>
                  <div className="font-bold text-foreground tabular-nums mt-0.5">{user?.id}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">الصلاحية</div>
                  <div className="font-bold text-primary mt-0.5">
                    {user ? ROLE_LABELS[user.role] : '—'}
                  </div>
                </div>
                {user?.company && (
                  <div>
                    <div className="text-muted-foreground">الشركة</div>
                    <div className="font-semibold text-foreground mt-0.5">{user.company}</div>
                  </div>
                )}
                {user?.shift && (
                  <div>
                    <div className="text-muted-foreground">الشيفت</div>
                    <div className="font-semibold text-foreground mt-0.5">{user.shift}</div>
                  </div>
                )}
                {isHrManager && (user?.hrCompanies || user?.hr_companies || []).length > 0 && (
                  <div className="col-span-2">
                    <div className="text-muted-foreground">الشركات المسندة</div>
                    <div className="font-bold text-primary mt-0.5">
                      {(user?.hrCompanies || user?.hr_companies || []).join(' · ')}
                    </div>
                  </div>
                )}
                {user?.department && (
                  <div className="col-span-2">
                    <div className="text-muted-foreground">القسم</div>
                    <div className="font-semibold text-foreground mt-0.5">{user.department}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="self-profile-name">الاسم</Label>
                  <Input
                    id="self-profile-name"
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="منشئ النظام"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="self-curr-pass">كلمة المرور الحالية</Label>
                  <Input
                    id="self-curr-pass"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="مطلوبة عند تغيير كلمة المرور"
                    required={Boolean(newPassword || confirmPassword)}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="self-new-pass">كلمة المرور الجديدة</Label>
                    <Input
                      id="self-new-pass"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="4 أحرف فأكثر (اختياري)"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="self-confirm-pass">تأكيد كلمة المرور</Label>
                    <Input
                      id="self-confirm-pass"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="أعد الإدخال"
                      required={Boolean(newPassword)}
                    />
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 pt-2">
              {accountDialogMode === 'profile' ? (
                <Button type="button" onClick={() => setAccountDialogMode(null)}>
                  إغلاق
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAccountDialogMode(null)}
                    disabled={profileSaving}
                  >
                    إلغاء
                  </Button>
                  <Button type="submit" disabled={profileSaving}>
                    {profileSaving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                  </Button>
                </>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
