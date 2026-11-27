import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Award,
  BookOpen,
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  Moon,
  Send,
  Sparkles,
  Sun,
  TrendingUp,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { api, ApiError } from '@/lib/api';
import { downloadSystemGuidePdf } from '@/lib/export';
import type { AuthUser } from '@/types/iems';
import { PWAInstallButton } from '@/components/shared/PWAInstallButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function LoginPage() {
  const { user, token, loginSession } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [empId, setEmpId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
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

  // Forgot Password Interactive Request Form
  const [forgotOpen, setForgotOpen] = useState(false);
  const [fpStages, setFpStages] = useState<string[]>([
    'تجهيز',
    'إسكان',
    'تجميع',
    'تحقق',
    'ربط الباليت',
    'سيستم',
    'ملاحظات السيستم',
    'مراجعه',
    'أخرى',
  ]);
  const [fpReasons, setFpReasons] = useState<string[]>([
    'نسيان كلمة المرور',
    'كلمة المرور لا تعمل عند تسجيل الدخول',
    'الحساب غير مفعّل أو موظف جديد',
    'مشكلة في الرقم التعريفي (ID)',
    'طلب تغيير كلمة المرور',
    'أخرى',
  ]);
  const [fpShifts, setFpShifts] = useState<string[]>(['A', 'B', 'C', 'D', 'OTHER']);
  const [allowForgotPassword, setAllowForgotPassword] = useState(true);
  const [supportWhatsappNumber, setSupportWhatsappNumber] = useState('201099843057');
  const [systemName, setSystemName] = useState('IEMS');

  const [fpName, setFpName] = useState('');
  const [fpId, setFpId] = useState('');
  const [fpShift, setFpShift] = useState('A');
  const [fpDept, setFpDept] = useState('');
  const [fpReason, setFpReason] = useState('نسيان كلمة المرور');
  const [fpNote, setFpNote] = useState('');
  const [copiedFp, setCopiedFp] = useState(false);

  const [policyDialog, setPolicyDialog] = useState<'terms' | 'privacy' | null>(null);

  useEffect(() => {
    let active = true;
    api<{
      stages?: string[];
      reasons?: string[];
      shifts?: string[];
      allowForgotPassword?: boolean;
      supportWhatsappNumber?: string;
      systemName?: string;
    }>('/api/auth/forgot-password-options')
      .then((res) => {
        if (!active) return;
        if (Array.isArray(res.stages) && res.stages.length) {
          setFpStages(res.stages);
          setFpDept((prev) => prev || res.stages![0]);
        }
        if (Array.isArray(res.reasons) && res.reasons.length) {
          setFpReasons(res.reasons);
          setFpReason((prev) => prev || res.reasons![0]);
        }
        if (Array.isArray(res.shifts) && res.shifts.length) {
          setFpShifts(res.shifts);
          setFpShift((prev) => (res.shifts!.includes(prev) ? prev : res.shifts![0]));
        }
        if (typeof res.allowForgotPassword === 'boolean') {
          setAllowForgotPassword(res.allowForgotPassword);
        }
        if (res.supportWhatsappNumber) {
          setSupportWhatsappNumber(String(res.supportWhatsappNumber).replace(/[^\d]/g, '') || '201099843057');
        }
        if (res.systemName) {
          setSystemName(res.systemName);
        }
      })
      .catch(() => {
        // fallback defaults already populated
      });
    return () => {
      active = false;
    };
  }, []);

  const forgotMessageText = useMemo(() => {
    return [
      `طلب استعادة / إعادة تعيين كلمة المرور — منصة ${systemName}`,
      `الاسم الثلاثي: ${fpName.trim() || '—'}`,
      `الرقم التعريفي (ID): ${fpId.trim() || '—'}`,
      `الشيفت: ${fpShift || '—'}`,
      `المرحلة: ${fpDept.trim() || '—'}`,
      `سبب المشكلة: ${fpReason.trim() || '—'}`,
      fpReason === 'أخرى' && fpNote.trim() ? `توضيح إضافي: ${fpNote.trim()}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }, [systemName, fpName, fpId, fpShift, fpDept, fpReason, fpNote]);

  const whatsappUrl = useMemo(() => {
    const num = supportWhatsappNumber || '201099843057';
    return `https://wa.me/${num}?text=${encodeURIComponent(forgotMessageText)}`;
  }, [supportWhatsappNumber, forgotMessageText]);

  if (token && user) {
    return <Navigate to="/home.html" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const idTrim = empId.trim();
    if (!idTrim || !password) {
      setErrorMsg('من فضلك أدخل معرّف المستخدم (ID) وكلمة المرور.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api<{ token: string; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ id: Number(idTrim), password }),
      });
      loginSession(res.token, res.user);
      toast.success(`أهلاً بك، ${res.user.name}`);
      navigate('/home.html', { replace: true });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'تعذّر تسجيل الدخول';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyForgotRequest = async () => {
    if (!fpName.trim() || !fpId.trim()) {
      toast.error('يرجى إدخال الاسم الثلاثي والرقم التعريفي (ID) أولاً.');
      return;
    }
    try {
      await navigator.clipboard.writeText(forgotMessageText);
      setCopiedFp(true);
      toast.success('تم نسخ تفاصيل الطلب');
      setTimeout(() => setCopiedFp(false), 2000);
    } catch {
      toast.error('تعذر النسخ التلقائي');
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen grid lg:grid-cols-2 bg-white dark:bg-[#000000] text-slate-900 dark:text-zinc-100"
    >
      {/* Right Column in RTL: Sign-in Form Panel */}
      <div className="relative flex flex-col justify-between p-6 sm:p-10 bg-white dark:bg-[#000000] lg:border-l border-slate-200 dark:border-zinc-900">
        {/* Top right corner theme switch + PWA install */}
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={toggleTheme}
            aria-label="تبديل المظهر"
            className="h-9 w-9 rounded-lg border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-400" />
            ) : (
              <Moon className="h-4 w-4 text-slate-600" />
            )}
          </Button>
          <PWAInstallButton variant="button" />
        </div>

        {/* Centered Login Form Stack */}
        <div className="mx-auto w-full max-w-[385px] my-auto py-8">
          <div className="text-center mb-8">
            <img
              src={theme === 'dark' ? '/logo-dark.png' : '/logo.png'}
              alt="Intercom"
              className="h-8 w-auto mx-auto mb-5 object-contain"
            />
            <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-slate-900 dark:text-white">
              تسجيل الدخول
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div
                role="alert"
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs font-semibold text-red-600 dark:text-red-400 text-center"
              >
                {errorMsg}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="login-id" className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                معرّف المستخدم
              </Label>
              <div className="relative">
                <User className="h-4 w-4 text-slate-400 dark:text-zinc-500 absolute right-3.5 top-3.5 pointer-events-none" />
                <Input
                  id="login-id"
                  type="text"
                  inputMode="numeric"
                  autoComplete="username"
                  placeholder="أدخل الرقم التعريفي (ID)"
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
                  className="h-11 pr-10 rounded-lg bg-slate-50 dark:bg-[#0D0E12] border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus-visible:ring-[#065BAB] dark:focus-visible:ring-blue-500 tabular-nums"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login-password" className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                كلمة المرور
              </Label>
              <div className="relative">
                <Lock className="h-4 w-4 text-slate-400 dark:text-zinc-500 absolute right-3.5 top-3.5 pointer-events-none" />
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="أدخل كلمة المرور (أرقام أو حروف)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pr-10 pl-10 rounded-lg bg-slate-50 dark:bg-[#0D0E12] border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus-visible:ring-[#065BAB] dark:focus-visible:ring-blue-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute left-3 top-3 text-slate-400 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-white cursor-pointer p-0.5 transition-colors"
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {allowForgotPassword && (
              <div className="flex justify-start pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setFpId(empId);
                    setForgotOpen(true);
                  }}
                  className="text-xs font-semibold text-[#065BAB] dark:text-blue-400 hover:underline cursor-pointer"
                >
                  هل نسيت كلمة المرور؟
                </button>
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-11 rounded-lg bg-[#065BAB] hover:bg-[#054c91] dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-bold text-sm transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>جاري تسجيل الدخول...</span>
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  <span>تسجيل الدخول</span>
                </>
              )}
            </Button>
          </form>

          <p className="mt-4 text-center text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
            بتسجيل الدخول، أنت توافق على{' '}
            <button
              type="button"
              onClick={() => setPolicyDialog('terms')}
              className="text-[#065BAB] dark:text-blue-400 hover:underline font-semibold cursor-pointer"
            >
              شروط الخدمة
            </button>{' '}
            و{' '}
            <button
              type="button"
              onClick={() => setPolicyDialog('privacy')}
              className="text-[#065BAB] dark:text-blue-400 hover:underline font-semibold cursor-pointer"
            >
              سياسة الخصوصية
            </button>
            .
          </p>

          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={handleDownloadGuide}
              disabled={guideDownloading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50/90 dark:bg-zinc-900/70 px-3 py-1.5 text-[11px] font-bold text-[#065BAB] dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-60"
            >
              {guideDownloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <BookOpen className="h-3.5 w-3.5" />
              )}
              <span>تحميل دليل استخدام النظام (PDF)</span>
            </button>
          </div>
        </div>

        {/* Bottom Copyright matching classic footer */}
        <div className="text-center text-[11px] text-slate-500 dark:text-zinc-400 space-y-0.5 pb-2">
          <div className="font-extrabold text-slate-800 dark:text-zinc-200">
            © IEMS {new Date().getFullYear()}
          </div>
          <div>Product Design &amp; Development by</div>
          <div className="font-extrabold text-[#065BAB] dark:text-blue-400">Mohamed H. Daif</div>
        </div>
      </div>

      {/* Left Column in RTL: Architectural Corporate Backdrop + Showcase Card */}
      <div className="hidden lg:block relative overflow-hidden bg-gradient-to-br from-slate-100 via-slate-200 to-slate-300 dark:from-slate-900 dark:via-[#061830] dark:to-zinc-950">
        <img
          src="/login-bg.jpg?v=2"
          alt="المقر المؤسسي لمنصة IEMS"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/55 via-slate-900/20 to-transparent dark:from-black/90 dark:via-black/35 dark:to-black/20" />

        {/* Bottom Floating Card: IEMS Enterprise Overview */}
        <div className="absolute bottom-8 inset-x-8 z-10 mx-auto max-w-[490px] rounded-2xl border border-slate-200/90 dark:border-white/15 bg-white/95 dark:bg-[#0A0B0F]/90 backdrop-blur-md p-6 text-slate-900 dark:text-white shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-[#065BAB] dark:text-blue-400">
              منصة إدارة الموارد والأداء · IEMS
            </span>
            <img
              src={theme === 'dark' ? '/iems-logo-dark.png?v=3' : '/iems-logo.png?v=3'}
              alt="IEMS"
              className="h-7 w-auto object-contain opacity-95"
            />
          </div>
          <h2 className="mt-2 text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            رؤية موحدة للحضور والأداء المؤسسي
          </h2>

          <div className="my-4 border-t border-slate-200 dark:border-white/10" />

          <div className="space-y-3.5">
            <div className="flex items-center gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-[#065BAB] dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-400">
                <TrendingUp className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  مؤشرات الأداء والتارجت اليومي
                </div>
                <div className="text-xs text-slate-600 dark:text-zinc-400">
                  متابعة دقيقة لنسب التحقق والمراحل الإنتاجية عبر جميع الشيفتات
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400">
                <Award className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  تصنيف Top 5 والتقارير المعتمدة
                </div>
                <div className="text-xs text-slate-600 dark:text-zinc-400">
                  تقارير تفصيلية جاهزة للطباعة وتصدير PDF و Excel وفق المعايير الرسمية
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  سجلات الحضور والانضباط الشاملة
                </div>
                <div className="text-xs text-slate-600 dark:text-zinc-400">
                  تحليل يومي ومقارنات مباشرة للحضور والغياب والإجازات في منصة واحدة
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Interactive Form Dialog (matching original workflow) */}
      <Dialog open={forgotOpen} onOpenChange={(o: boolean) => setForgotOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>طلب استعادة كلمة المرور</DialogTitle>
            <DialogDescription>
              أدخل بياناتك بالأسفل ليتم تجهيز طلب إعادة تعيين كلمة المرور وإرساله مباشرة للدعم الفني.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!fpName.trim() || !fpId.trim()) {
                toast.error('يرجى إدخال الاسم الثلاثي والرقم التعريفي (ID).');
                return;
              }
              const link = document.createElement('a');
              link.href = whatsappUrl;
              link.target = '_blank';
              link.rel = 'noopener noreferrer';
              link.click();
            }}
            className="space-y-3.5 pt-1"
          >
            <div className="space-y-1.5">
              <Label htmlFor="fp-name">الاسم الثلاثي *</Label>
              <Input
                id="fp-name"
                value={fpName}
                onChange={(e) => setFpName(e.target.value)}
                placeholder="اكتب اسمك الثلاثي كما هو مسجل"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fp-id">الرقم التعريفي (ID) *</Label>
                <Input
                  id="fp-id"
                  inputMode="numeric"
                  value={fpId}
                  onChange={(e) => setFpId(e.target.value)}
                  placeholder="مثال: 1024"
                  className="tabular-nums"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fp-shift">الشيفت</Label>
                <NativeSelect
                  id="fp-shift"
                  value={fpShift}
                  onChange={(e) => setFpShift(e.target.value)}
                >
                  {fpShifts.map((s) => (
                    <option key={s} value={s}>
                      {s === 'OTHER' ? 'Other' : `Shift ${s}`}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fp-dept">المرحلة</Label>
                <NativeSelect
                  id="fp-dept"
                  value={fpDept || fpStages[0] || ''}
                  onChange={(e) => setFpDept(e.target.value)}
                >
                  {fpStages.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fp-reason">سبب المشكلة</Label>
                <NativeSelect
                  id="fp-reason"
                  value={fpReason}
                  onChange={(e) => setFpReason(e.target.value)}
                >
                  {fpReasons.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>

            {fpReason === 'أخرى' && (
              <div className="space-y-1.5">
                <Label htmlFor="fp-note">توضيح المشكلة (اختياري)</Label>
                <Input
                  id="fp-note"
                  value={fpNote}
                  onChange={(e) => setFpNote(e.target.value)}
                  placeholder="اكتب توضيحاً مختصراً للمشكلة"
                />
              </div>
            )}

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyForgotRequest}
              >
                {copiedFp ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedFp ? 'تم النسخ' : 'نسخ النص'}</span>
              </Button>
              <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>
                <X className="h-3.5 w-3.5" />
                <span>إلغاء</span>
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Send className="h-4 w-4" />
                <span>إرسال عبر واتساب</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Terms / Privacy Dialog */}
      <Dialog open={!!policyDialog} onOpenChange={(o: boolean) => !o && setPolicyDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {policyDialog === 'terms' ? 'شروط الخدمة' : 'سياسة الخصوصية'}
            </DialogTitle>
            <DialogDescription>
              {policyDialog === 'terms'
                ? 'منصة داخلية مخصصة لموظفي وإدارة Intercom لمتابعة الحضور والتارجت والطلبات التشغيلية.'
                : 'جميع بيانات الحسابات والسجلات اليومية محمية ومخصصة للاستخدام الإداري والتشغيلي المعتمد فقط.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setPolicyDialog(null)}>
              حسناً
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
