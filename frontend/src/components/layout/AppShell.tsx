import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  FileBarChart2,
  FileSpreadsheet,
  FileText,
  Home,
  KeyRound,
  LogOut,
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
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { api, ApiError } from '@/lib/api';
import { ROLE_LABELS, fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { NotificationItem } from '@/types/iems';
import { IemsLogo } from '@/components/shared/IemsLogo';
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
  const { user, isCreator, isAdminUp, isSupervisorUp, isEmployee, updateUserProfile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Unified Account Dropdown + Profile / Password Dialog
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountDialogMode, setAccountDialogMode] = useState<'profile' | 'password' | null>(null);
  const [profileName, setProfileName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  const currentPath = location.pathname;

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
      setNotifications(res.items || []);
      setUnreadCount(Number(res.unread || 0));
    } catch {
      // silent polling failure
    }
  }, [user]);

  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(() => {
      loadNotifications();
    }, 45000);

    const onRefresh = () => {
      loadNotifications();
    };
    window.addEventListener('iems:refresh-badges', onRefresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('iems:refresh-badges', onRefresh);
    };
  }, [loadNotifications]);

  const handleMarkAllRead = async () => {
    try {
      await api('/api/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
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
        setUnreadCount((c) => Math.max(0, c - 1));
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
      'relative inline-flex h-14 items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 text-[11px] sm:text-[13px] font-bold transition-colors whitespace-nowrap shrink-0',
      active
        ? 'text-primary after:absolute after:inset-x-1 sm:after:inset-x-1.5 after:bottom-0 after:h-[2.5px] after:rounded-full after:bg-primary'
        : 'text-muted-foreground hover:text-foreground'
    );

  return (
    <div dir="rtl" className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 h-14 w-full border-b border-border bg-card/95 backdrop-blur-md no-print">
        <div
          className={cn(
            'mx-auto flex h-full items-center justify-between gap-2 sm:gap-4 px-2 sm:px-6',
            maxWidthClass
          )}
        >
          {/* Zone 1 (Right / Start in RTL): IEMS Brand */}
          <div className="flex items-center shrink-0 min-w-0">
            <Link
              to="/home.html"
              className="flex items-center shrink-0 focus:outline-none"
              title="IEMS - نظام إدارة الموظفين"
            >
              <IemsLogo size="md" className="h-6 sm:h-8" />
            </Link>
          </div>

          {/* Zone 2 (Center): Centered Nav Tabs visible across mobile, tablet, and desktop */}
          {!isEmployee && isSupervisorUp ? (
            <nav className="flex flex-1 items-center justify-start lg:justify-center gap-0.5 sm:gap-1 xl:gap-2 min-w-0 overflow-x-auto no-scrollbar">
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

              <Link to="/reports.html" className={navLinkClass(currentPath === '/reports.html')}>
                <FileBarChart2 className="h-3.5 w-3.5" />
                <span>التقارير</span>
              </Link>

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

              <Link
                to="/admin-import.html"
                className={navLinkClass(currentPath === '/admin-import.html')}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>تحديث البيانات</span>
              </Link>

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
            </nav>
          ) : isEmployee ? (
            <nav className="flex flex-1 items-center justify-center gap-1 sm:gap-2 min-w-0 overflow-x-auto no-scrollbar">
              <Link to="/home.html" className={navLinkClass(isHomeActive)}>
                <Home className="h-3.5 w-3.5" />
                <span>الرئيسية</span>
              </Link>
              <Link to="/requests.html" className={navLinkClass(currentPath === '/requests.html')}>
                <FileText className="h-3.5 w-3.5" />
                <span>الطلبات والخدمات</span>
              </Link>
            </nav>
          ) : (
            <div className="flex-1" />
          )}

          {/* Zone 3 (Left / End in RTL): Utility Actions + Account + Intercom Brand */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
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
                  className="relative h-8 w-8 sm:h-9 sm:w-9 rounded-lg"
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
              <PopoverContent align="end" className="w-[min(20rem,calc(100vw-1.5rem))] p-0 overflow-hidden">
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
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg"
              aria-label={theme === 'dark' ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الداكن'}
              title={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>

            {/* Unified Account Dropdown */}
            <DropdownMenu open={accountMenuOpen} onOpenChange={(o: boolean) => setAccountMenuOpen(o)}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'inline-flex items-center gap-1.5 sm:gap-2 rounded-xl border bg-secondary/40 hover:bg-secondary/75 px-1.5 py-1 sm:px-2.5 sm:py-1.5 transition-colors cursor-pointer focus:outline-none',
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
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="end"
                className="w-64 p-0 overflow-hidden rounded-xl border-border bg-card dark:bg-[#141417] shadow-xl"
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
            <span className="inline-block h-5 w-[1px] bg-border mx-0.5" />
            <Link
              to="/home.html"
              className="flex items-center shrink-0 focus:outline-none"
              title="Intercom"
            >
              <img
                src={theme === 'dark' ? '/logo-dark.png' : '/logo.png'}
                alt="Intercom"
                className="h-6 sm:h-8 w-auto object-contain"
              />
            </Link>
          </div>
        </div>
      </header>

      {/* Slot immediately after topbar (e.g. Home System Banner) */}
      {beforeContent}

      {/* Main Content */}
      <main className={cn('flex-1 w-full mx-auto px-4 sm:px-6 py-6', maxWidthClass)}>
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
