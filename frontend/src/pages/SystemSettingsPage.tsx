import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  CalendarRange,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  Eye,
  FileBarChart2,
  Layers,
  Link2,
  Loader2,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  Save,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { fmtDateTime, fmtNumber } from '@/lib/format';
import {
  invalidatePublicSystemConfigCache,
  normalizeReportsAndSheetsConfig,
} from '@/lib/systemConfig';
import { cn } from '@/lib/utils';
import type {
  DatabaseInventoryPayload,
  PurgeCategories,
  RequestMetaPayload,
  RequestTypeKey,
  SystemSettingsConfig,
} from '@/types/iems';
import { AppShell } from '@/components/layout/AppShell';
import { REQUEST_CATALOG } from '@/components/requests/requestCatalog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

type SettingsSectionKey =
  | 'data_retention'
  | 'requests_forms'
  | 'display_features'
  | 'reports_sheets'
  | 'departments_lists'
  | 'general_payroll';

type PurgeMode = 'range' | 'older_than_months' | 'months';

interface PurgeResponse {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  deleted: {
    stageDaily: number;
    supervisorTargets: number;
    employeeMonthlySummary: number;
    employeeStageTargets: number;
    importHistory: number;
    employeeRequests: number;
    auditLogs: number;
    loginAudit: number;
    notifications: number;
    total: number;
  };
}

const SECTIONS: {
  key: SettingsSectionKey;
  title: string;
  subtitle: string;
  icon: typeof Database;
}[] = [
  {
    key: 'data_retention',
    title: 'قاعدة البيانات والمسح التلقائي',
    subtitle: 'عرض الأشهر المخزنة، المسح بفترة محددة، وجدولة الاحتفاظ الشهري.',
    icon: Database,
  },
  {
    key: 'requests_forms',
    title: 'الطلبات والروابط والصلاحيات',
    subtitle: 'روابط Google Forms، بوابة المرتبات، لائحة العمل، وصلاحيات المشرفين.',
    icon: Link2,
  },
  {
    key: 'display_features',
    title: 'العرض والخصوصية والتنبيهات',
    subtitle: 'التحكم في ظهور Top 5 والحوافز للموظف، صلاحيات التصدير، وإعلان النظام.',
    icon: Eye,
  },
  {
    key: 'reports_sheets',
    title: 'إعدادات التقارير والشيتات',
    subtitle: 'حجم التقارير، محاذاة الجدول، اتجاه وموضع الصفحة، وبلوكات المراحل والأشهر.',
    icon: FileBarChart2,
  },
  {
    key: 'departments_lists',
    title: 'الأقسام والمراحل والشركات والشيفتات',
    subtitle: 'إدارة قوائم المراحل، الشركات، الشيفتات، وأسباب المغادرة.',
    icon: Layers,
  },
  {
    key: 'general_payroll',
    title: 'إعدادات النظام والدورات والأمان',
    subtitle: 'اسم النظام، دورة المرتب، مدة الجلسة، حماية الدخول، والدعم الفني.',
    icon: SlidersHorizontal,
  },
];

function ListEditor({
  title,
  description,
  items,
  placeholder,
  uppercase,
  onChange,
}: {
  title: string;
  description: string;
  items: string[];
  placeholder: string;
  uppercase?: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const handleAdd = () => {
    const val = uppercase ? draft.trim().toUpperCase() : draft.trim();
    if (!val) return;
    if (items.includes(val)) {
      toast.info('العنصر موجود بالفعل في القائمة.');
      return;
    }
    onChange([...items, val]);
    setDraft('');
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-extrabold">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder={placeholder}
            className="h-9 text-xs"
          />
          <Button type="button" size="sm" onClick={handleAdd} className="h-9 shrink-0 font-bold">
            <Plus className="h-3.5 w-3.5" />
            <span>إضافة</span>
          </Button>
        </div>

        <div className="divide-y divide-border/70 rounded-lg border border-border bg-secondary/20 max-h-60 overflow-y-auto">
          {items.length === 0 ? (
            <div className="py-5 text-center text-xs text-muted-foreground">
              القائمة فارغة — أضف عنصراً واحداً على الأقل.
            </div>
          ) : (
            items.map((item, idx) => (
              <div
                key={`${item}-${idx}`}
                className="flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-muted/40"
              >
                <span className="font-semibold text-foreground truncate">{item}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (items.length <= 1) {
                      toast.error('يجب أن تحتوي القائمة على عنصر واحد على الأقل.');
                      return;
                    }
                    onChange(items.filter((_, i) => i !== idx));
                  }}
                  className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors cursor-pointer shrink-0"
                  aria-label={`حذف ${item}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function SystemSettingsPage() {
  const { refreshPublicConfig } = useAuth();
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>('data_retention');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [config, setConfig] = useState<SystemSettingsConfig | null>(null);
  const [inventory, setInventory] = useState<DatabaseInventoryPayload | null>(null);
  const [reqMeta, setReqMeta] = useState<RequestMetaPayload | null>(null);

  // Manual Purge State
  const [purgeMode, setPurgeMode] = useState<PurgeMode>('range');
  const [purgeFrom, setPurgeFrom] = useState('');
  const [purgeTo, setPurgeTo] = useState('');
  const [purgeKeepMonths, setPurgeKeepMonths] = useState(3);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [purgeCats, setPurgeCats] = useState<PurgeCategories>({
    daily: true,
    requests: false,
    logs: true,
  });
  const [confirmPurgeOpen, setConfirmPurgeOpen] = useState(false);
  const [purging, setPurging] = useState(false);
  const [runningAutoNow, setRunningAutoNow] = useState(false);
  const [cleaningRequestsDb, setCleaningRequestsDb] = useState(false);

  // Request Workflow Settings synced with /api/requests/settings
  const [allowSupervisorDecision, setAllowSupervisorDecision] = useState(false);
  const [supervisorAllowedTypes, setSupervisorAllowedTypes] = useState<RequestTypeKey[]>(() =>
    REQUEST_CATALOG.map((c) => c.key)
  );
  const [allowEmployeeCancellation, setAllowEmployeeCancellation] = useState(true);
  const [allowReopenDecision, setAllowReopenDecision] = useState(true);
  const [preventDuplicatePending, setPreventDuplicatePending] = useState(false);
  const [enforceAdvanceWindow, setEnforceAdvanceWindow] = useState(false);
  const [advanceWindowStartDay, setAdvanceWindowStartDay] = useState(10);
  const [advanceWindowEndDay, setAdvanceWindowEndDay] = useState(20);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, statsRes, metaRes] = await Promise.all([
        api<{ config?: SystemSettingsConfig; settings?: SystemSettingsConfig }>(
          '/api/admin/system/settings'
        ),
        api<{ inventory: DatabaseInventoryPayload }>('/api/admin/system/data-stats'),
        api<RequestMetaPayload>('/api/requests/meta'),
      ]);

      const rawCfg = settingsRes.config ?? settingsRes.settings ?? null;
      setConfig(
        rawCfg
          ? {
              ...rawCfg,
              reportsAndSheets: normalizeReportsAndSheetsConfig(rawCfg.reportsAndSheets),
            }
          : null
      );
      setInventory(statsRes.inventory);
      setReqMeta(metaRes);

      setAllowSupervisorDecision(metaRes.permissions.decisionRoles.includes('supervisor'));
      setSupervisorAllowedTypes(
        Array.isArray(metaRes.permissions.supervisorAllowedTypes)
          ? metaRes.permissions.supervisorAllowedTypes
          : REQUEST_CATALOG.map((c) => c.key)
      );
      setAllowEmployeeCancellation(metaRes.permissions.allowEmployeeCancellation);
      setAllowReopenDecision(metaRes.permissions.allowReopenDecision ?? true);
      setPreventDuplicatePending(Boolean(metaRes.permissions.preventDuplicatePending));
      setEnforceAdvanceWindow(Boolean(metaRes.permissions.enforceAdvanceWindow));
      setAdvanceWindowStartDay(metaRes.permissions.advanceWindowStartDay || 10);
      setAdvanceWindowEndDay(metaRes.permissions.advanceWindowEndDay || 20);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر تحميل إعدادات النظام');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const retentionPreview = useMemo(() => {
    const months = inventory?.availableMonths || [];
    const total = months.length;
    const keepN = config?.autoPurge.retentionMonths || 3;
    const toDelete = Math.max(0, total - keepN);
    const manualToDelete = Math.max(0, total - purgeKeepMonths);
    return {
      total,
      keepN,
      toDelete,
      manualToDelete,
      oldestMonth: months[0]?.month || null,
      newestMonth: months[months.length - 1]?.month || null,
    };
  }, [inventory, config?.autoPurge.retentionMonths, purgeKeepMonths]);

  const saveSystemConfig = async (
    patch: Partial<SystemSettingsConfig>,
    successMsg = 'تم حفظ إعدادات النظام بنجاح'
  ) => {
    setSaving(true);
    try {
      const res = await api<{
        ok: boolean;
        config?: SystemSettingsConfig;
        settings?: SystemSettingsConfig;
      }>('/api/admin/system/settings', {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      const updated = res.config ?? res.settings;
      if (updated) {
        setConfig({
          ...updated,
          reportsAndSheets: normalizeReportsAndSheetsConfig(updated.reportsAndSheets),
        });
      }
      invalidatePublicSystemConfigCache();
      refreshPublicConfig().catch(() => {});
      toast.success(successMsg);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRequestsAndForms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    const salUrl = config.financialFormLinks.salaryEntitlementsUrl.trim();
    const advUrl = config.financialFormLinks.advanceRequestUrl.trim();
    const portalUrl = (config.financialFormLinks.payrollPortalUrl || '').trim();
    const regsUrl = (config.financialFormLinks.workRegulationsUrl || '').trim();
    if (salUrl && !salUrl.startsWith('https://')) {
      toast.error('رابط مستحقات الموظفين يجب أن يبدأ بـ https://');
      return;
    }
    if (advUrl && !advUrl.startsWith('https://')) {
      toast.error('رابط طلب السلفة يجب أن يبدأ بـ https://');
      return;
    }
    if (portalUrl && !portalUrl.startsWith('https://')) {
      toast.error('رابط بوابة المرتبات يجب أن يبدأ بـ https://');
      return;
    }
    if (regsUrl && !regsUrl.startsWith('https://')) {
      toast.error('رابط لائحة العمل يجب أن يبدأ بـ https://');
      return;
    }
    if (allowSupervisorDecision && supervisorAllowedTypes.length === 0) {
      toast.error('اختر نوع طلب واحد على الأقل للمشرفين أو ألغِ تفعيل صلاحية المشرفين.');
      return;
    }
    if (
      advanceWindowStartDay < 1 ||
      advanceWindowEndDay > 31 ||
      advanceWindowStartDay > advanceWindowEndDay
    ) {
      toast.error('يرجى إدخال نافذة أيام سلفة صحيحة (من 1 إلى 31).');
      return;
    }

    setSaving(true);
    try {
      const [sysRes] = await Promise.all([
        api<{
          ok: boolean;
          config?: SystemSettingsConfig;
          settings?: SystemSettingsConfig;
        }>('/api/admin/system/settings', {
          method: 'PUT',
          body: JSON.stringify({
            financialFormLinks: config.financialFormLinks,
            payroll: config.payroll,
          }),
        }),
        api('/api/requests/settings', {
          method: 'PUT',
          body: JSON.stringify({
            allowSupervisorDecision,
            supervisorAllowedTypes,
            requireDecisionReason: false,
            allowEmployeeCancellation,
            allowReopenDecision,
            preventDuplicatePending,
            enforceAdvanceWindow,
            advanceWindowStartDay,
            advanceWindowEndDay,
            maxAttachmentSizeMb: config.payroll.maxAttachmentSizeMb,
          }),
        }),
      ]);
      const updated = sysRes.config ?? sysRes.settings;
      if (updated) {
        setConfig({
          ...updated,
          reportsAndSheets: normalizeReportsAndSheetsConfig(updated.reportsAndSheets),
        });
      }
      invalidatePublicSystemConfigCache();
      await refreshPublicConfig();
      toast.success('تم حفظ روابط الطلبات والخدمات وإعدادات المراجعة بنجاح');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر حفظ إعدادات الطلبات');
    } finally {
      setSaving(false);
    }
  };

  const handleCleanupRequestsDb = async () => {
    setCleaningRequestsDb(true);
    try {
      const res = await api<{
        ok: boolean;
        deletedLegacy: number;
        cleanedRows: number;
        cleanedNotifications: number;
      }>('/api/requests/cleanup', { method: 'POST' });
      toast.success(
        `تم تنظيف سجلات الطلبات (حذف ${fmtNumber(res.deletedLegacy)} قديم · تصحيح ${fmtNumber(res.cleanedRows)} سجل)`
      );
      await loadAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر تنظيف سجلات الطلبات');
    } finally {
      setCleaningRequestsDb(false);
    }
  };

  const handleOpenManualPurgeConfirm = () => {
    if (!purgeCats.daily && !purgeCats.requests && !purgeCats.logs) {
      toast.error('اختر فئة واحدة على الأقل من البيانات للمسح.');
      return;
    }
    if (purgeMode === 'range') {
      if (!purgeFrom || !purgeTo || purgeFrom > purgeTo) {
        toast.error('يرجى تحديد فترة تاريخ صالحة (من تاريخ إلى تاريخ).');
        return;
      }
    } else if (purgeMode === 'months') {
      if (selectedMonths.length === 0) {
        toast.error('اختر شهراً واحداً على الأقل من قائمة الأشهر المسجلة في السيستم.');
        return;
      }
    }
    setConfirmPurgeOpen(true);
  };

  const handleExecuteManualPurge = async () => {
    setPurging(true);
    try {
      const payload =
        purgeMode === 'range'
          ? { mode: 'range', from: purgeFrom, to: purgeTo, categories: purgeCats }
          : purgeMode === 'months'
            ? { mode: 'months', months: selectedMonths, categories: purgeCats }
            : {
                mode: 'older_than_months',
                keepMonths: purgeKeepMonths,
                categories: purgeCats,
              };

      const res = await api<PurgeResponse>('/api/admin/system/purge', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setConfirmPurgeOpen(false);
      if (res.skipped) {
        toast.info(res.reason || 'لم يتم حذف أي سجلات.');
      } else {
        toast.success(`تم مسح ${fmtNumber(res.deleted.total)} سجل من قاعدة البيانات بنجاح.`);
        setSelectedMonths([]);
      }
      await loadAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'فشل مسح البيانات');
    } finally {
      setPurging(false);
    }
  };

  const handleRunAutoPurgeNow = async () => {
    if (!config) return;
    setRunningAutoNow(true);
    try {
      // Save latest autoPurge configuration before forcing execution
      await api('/api/admin/system/settings', {
        method: 'PUT',
        body: JSON.stringify({ autoPurge: config.autoPurge }),
      });

      const res = await api<PurgeResponse>('/api/admin/system/auto-purge-run', {
        method: 'POST',
      });
      if (res.skipped) {
        toast.info(res.reason || 'لم توجد بيانات أقدم من المدة المحددة.');
      } else {
        toast.success(
          `تم تنفيذ التنظيف التلقائي ومسح ${fmtNumber(res.deleted?.total || 0)} سجل بنجاح.`
        );
      }
      await loadAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر تشغيل المسح التلقائي');
    } finally {
      setRunningAutoNow(false);
    }
  };

  const toggleMonthPick = (month: string) => {
    setPurgeMode('months');
    setSelectedMonths((prev) =>
      prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month].sort()
    );
  };

  const purgeSummaryLabel = useMemo(() => {
    if (purgeMode === 'range') {
      return `سيتم حذف السجلات المحددة نهائياً في الفترة من ${purgeFrom || '—'} إلى ${purgeTo || '—'}.`;
    }
    if (purgeMode === 'months') {
      return `سيتم حذف السجلات المحددة للأشهر: ${selectedMonths.join('، ') || '—'}.`;
    }
    return `سيتم الإبقاء على أحدث ${purgeKeepMonths} أشهر متاحة على السيستم وحذف ما قبلها نهائياً.`;
  }, [purgeMode, purgeFrom, purgeTo, selectedMonths, purgeKeepMonths]);

  return (
    <AppShell>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-4">
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
              إعدادات النظام وقاعدة البيانات
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              التحكم الشامل في تخفيف قاعدة البيانات والمسح التلقائي، قوائم الأقسام، وروابط نماذج
              الطلبات.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadAll}
            disabled={loading}
            className="h-9 self-start sm:self-auto"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            <span>تحديث الإحصائيات</span>
          </Button>
        </div>

        {loading && !config ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <Skeleton className="lg:col-span-3 h-64 rounded-xl" />
            <Skeleton className="lg:col-span-9 h-96 rounded-xl" />
          </div>
        ) : config ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Section Navigation Rail */}
            <aside className="lg:col-span-4 xl:col-span-3">
              <div className="rounded-xl border border-border bg-card p-2 space-y-1">
                {SECTIONS.map((sec) => {
                  const Icon = sec.icon;
                  const active = activeSection === sec.key;
                  return (
                    <button
                      key={sec.key}
                      type="button"
                      onClick={() => setActiveSection(sec.key)}
                      className={cn(
                        'w-full flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-start transition-colors cursor-pointer',
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground hover:bg-secondary/60'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0 mt-0.5',
                          active ? 'text-primary-foreground' : 'text-primary'
                        )}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold leading-tight">{sec.title}</div>
                        <div
                          className={cn(
                            'text-[11px] mt-0.5 line-clamp-2',
                            active ? 'text-primary-foreground/85' : 'text-muted-foreground'
                          )}
                        >
                          {sec.subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Section Workspace Content */}
            <div className="lg:col-span-8 xl:col-span-9 space-y-5">
              {/* ================= SECTION 1: DATA RETENTION & PURGE ================= */}
              {activeSection === 'data_retention' && (
                <div className="space-y-5">
                  {/* Live Database Inventory Overview */}
                  {inventory && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-extrabold flex items-center gap-2">
                          <Database className="h-4 w-4 text-primary" />
                          <span>حجم البيانات والفترات المتاحة حالياً على السيستم</span>
                        </CardTitle>
                        <CardDescription className="text-xs">
                          ملخص حي للأشهر والسجلات المخزنة في قاعدة البيانات لاختيار المدة المناسبة
                          للتخفيف.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="rounded-lg border border-border bg-secondary/35 p-3">
                            <div className="text-[11px] text-muted-foreground">الأشهر المسجلة</div>
                            <div className="text-lg font-extrabold tabular-nums mt-0.5 text-primary">
                              {fmtNumber(inventory.totalMonths)} شهر
                            </div>
                          </div>
                          <div className="rounded-lg border border-border bg-secondary/35 p-3">
                            <div className="text-[11px] text-muted-foreground">النطاق الزمني</div>
                            <div className="text-xs font-extrabold tabular-nums mt-1.5" dir="ltr">
                              {inventory.minDate && inventory.maxDate
                                ? `${inventory.minDate} → ${inventory.maxDate}`
                                : 'لا توجد سجلات يومية'}
                            </div>
                          </div>
                          <div className="rounded-lg border border-border bg-secondary/35 p-3">
                            <div className="text-[11px] text-muted-foreground">
                              سجلات الحضور والتارجت
                            </div>
                            <div className="text-lg font-extrabold tabular-nums mt-0.5">
                              {fmtNumber(
                                inventory.counts.stageDaily +
                                  inventory.counts.supervisorTargets +
                                  inventory.counts.employeeMonthlySummary
                              )}
                            </div>
                          </div>
                          <div className="rounded-lg border border-border bg-secondary/35 p-3">
                            <div className="text-[11px] text-muted-foreground">
                              الطلبات والسجلات الأمنية
                            </div>
                            <div className="text-lg font-extrabold tabular-nums mt-0.5">
                              {fmtNumber(
                                inventory.counts.employeeRequests +
                                  inventory.counts.auditLogs +
                                  inventory.counts.loginAudit +
                                  inventory.counts.notifications
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Interactive Available Months Grid */}
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-bold text-foreground">
                              الأشهر الموجودة فعلياً في قاعدة البيانات ({inventory.totalMonths}{' '}
                              شهر):
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              اضغط على أي شهر لإضافته إلى قائمة المسح المخصص أدناه
                            </span>
                          </div>

                          {inventory.availableMonths.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                              لا توجد سجلات شهرية مسجلة حالياً في قاعدة البيانات.
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                              {inventory.availableMonths.map((m) => {
                                const isPicked =
                                  purgeMode === 'months' && selectedMonths.includes(m.month);
                                return (
                                  <button
                                    key={m.month}
                                    type="button"
                                    onClick={() => toggleMonthPick(m.month)}
                                    className={cn(
                                      'rounded-lg border p-2.5 text-start transition-colors cursor-pointer space-y-1',
                                      isPicked
                                        ? 'border-destructive bg-destructive/10'
                                        : 'border-border bg-card hover:border-primary/50'
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span
                                        className="text-xs font-extrabold tabular-nums"
                                        dir="ltr"
                                      >
                                        {m.month}
                                      </span>
                                      {isPicked && (
                                        <span className="text-[10px] font-bold text-destructive">
                                          محدد للمسح
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground tabular-nums">
                                      تارجت: {fmtNumber(m.dailyRows + m.supervisorRows)} · ملخص:{' '}
                                      {fmtNumber(m.monthlySummaryRows)}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground tabular-nums">
                                      طلبات: {fmtNumber(m.requestRows)} · سجل:{' '}
                                      {fmtNumber(m.logRows)}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Manual Purge By Date Range or Month Count */}
                  <Card className="border-destructive/30">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-extrabold flex items-center gap-2 text-destructive">
                        <Trash2 className="h-4 w-4" />
                        <span>مسح البيانات وتخفيف قاعدة البيانات</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        حذف السجلات التشغيلية الثقيلة لفترة من - إلى، أو اختيار أشهر محددة، أو حذف
                        كل ما يتجاوز مدة شهرية معينة مع الحفاظ على حسابات الموظفين وإعدادات النظام.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Purge Mode Switcher */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setPurgeMode('range')}
                          className={cn(
                            'rounded-lg border px-3 py-2 text-xs font-bold transition-colors cursor-pointer text-start',
                            purgeMode === 'range'
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-secondary/30 text-foreground hover:bg-muted'
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <CalendarRange className="h-3.5 w-3.5" />
                            <span>فترة محددة (من — إلى)</span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPurgeMode('older_than_months')}
                          className={cn(
                            'rounded-lg border px-3 py-2 text-xs font-bold transition-colors cursor-pointer text-start',
                            purgeMode === 'older_than_months'
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-secondary/30 text-foreground hover:bg-muted'
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            <span>أقدم من مدة (شهور)</span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPurgeMode('months')}
                          className={cn(
                            'rounded-lg border px-3 py-2 text-xs font-bold transition-colors cursor-pointer text-start',
                            purgeMode === 'months'
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-secondary/30 text-foreground hover:bg-muted'
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <Database className="h-3.5 w-3.5" />
                            <span>أشهر محددة ({selectedMonths.length})</span>
                          </div>
                        </button>
                      </div>

                      {/* Mode Inputs */}
                      {purgeMode === 'range' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-border bg-secondary/25 p-3">
                          <div className="space-y-1">
                            <Label className="text-xs font-bold">من تاريخ *</Label>
                            <DatePicker
                              value={purgeFrom}
                              onChange={setPurgeFrom}
                              clearable
                              placeholder="اختر تاريخ البداية"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-bold">إلى تاريخ *</Label>
                            <DatePicker
                              value={purgeTo}
                              min={purgeFrom || undefined}
                              onChange={setPurgeTo}
                              clearable
                              placeholder="اختر تاريخ النهاية"
                            />
                          </div>
                        </div>
                      )}

                      {purgeMode === 'older_than_months' && (
                        <div className="rounded-lg border border-border bg-secondary/25 p-3 space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                            <div className="space-y-1">
                              <Label className="text-xs font-bold">
                                الإبقاء على أحدث مدة (بالأشهر):
                              </Label>
                              <NativeSelect
                                value={String(purgeKeepMonths)}
                                onChange={(e) => setPurgeKeepMonths(Number(e.target.value) || 3)}
                                className="h-9 text-xs"
                              >
                                <option value="1">شهر واحد (الاحتفاظ بأحدث شهر فقط)</option>
                                <option value="2">شهرين (الاحتفاظ بأحدث شهرين)</option>
                                <option value="3">3 شهور (الاحتفاظ بأحدث 3 أشهر)</option>
                                <option value="6">6 شهور (الاحتفاظ بأحدث 6 أشهر)</option>
                                <option value="12">12 شهراً (سنة كاملة)</option>
                              </NativeSelect>
                            </div>
                            <div className="text-xs text-muted-foreground leading-relaxed">
                              يوجد حالياً على السيستم{' '}
                              <strong className="text-foreground tabular-nums">
                                {retentionPreview.total} شهر
                              </strong>
                              . عند اختيار الاحتفاظ بـ{' '}
                              <strong className="text-foreground tabular-nums">
                                {purgeKeepMonths} شهر
                              </strong>
                              ، سيتم مسح{' '}
                              <strong className="text-destructive tabular-nums">
                                {retentionPreview.manualToDelete} شهر
                              </strong>{' '}
                              الأقدم.
                            </div>
                          </div>
                        </div>
                      )}

                      {purgeMode === 'months' && (
                        <div className="rounded-lg border border-border bg-secondary/25 p-3 text-xs space-y-1.5">
                          <div className="font-bold text-foreground">
                            الأشهر المحددة للمسح اليدوي:
                          </div>
                          {selectedMonths.length === 0 ? (
                            <p className="text-muted-foreground">
                              اضغط على بطاقات الأشهر في الأعلى لتحديد شهر واحد أو أكثر لمسح بياناته.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {selectedMonths.map((ym) => (
                                <button
                                  key={ym}
                                  type="button"
                                  onClick={() => toggleMonthPick(ym)}
                                  className="inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive cursor-pointer tabular-nums"
                                >
                                  <span dir="ltr">{ym}</span>
                                  <span>×</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Data Categories Checkboxes */}
                      <div className="space-y-2">
                        <Label className="text-xs font-bold">فئات البيانات المراد مسحها:</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                          <label className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3 cursor-pointer hover:border-primary/40">
                            <input
                              type="checkbox"
                              checked={purgeCats.daily}
                              onChange={(e) =>
                                setPurgeCats((c) => ({ ...c, daily: e.target.checked }))
                              }
                              className="mt-0.5 h-4 w-4 accent-primary shrink-0"
                            />
                            <div>
                              <div className="font-bold text-foreground">
                                الحضور والتارجت والرفع
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                السجلات اليومية، تارجت المشرفين، الملخصات الشهرية، سجل الاستيراد.
                              </div>
                            </div>
                          </label>

                          <label className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3 cursor-pointer hover:border-primary/40">
                            <input
                              type="checkbox"
                              checked={purgeCats.requests}
                              onChange={(e) =>
                                setPurgeCats((c) => ({ ...c, requests: e.target.checked }))
                              }
                              className="mt-0.5 h-4 w-4 accent-primary shrink-0"
                            />
                            <div>
                              <div className="font-bold text-foreground">الطلبات والمرفقات</div>
                              <div className="text-[11px] text-muted-foreground">
                                طلبات الموظفين، الملفات المرفقة، وسجل مراجعة الطلبات.
                              </div>
                            </div>
                          </label>

                          <label className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3 cursor-pointer hover:border-primary/40">
                            <input
                              type="checkbox"
                              checked={purgeCats.logs}
                              onChange={(e) =>
                                setPurgeCats((c) => ({ ...c, logs: e.target.checked }))
                              }
                              className="mt-0.5 h-4 w-4 accent-primary shrink-0"
                            />
                            <div>
                              <div className="font-bold text-foreground">
                                السجلات والإشعارات
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                سجل العمليات، سجل تسجيل الدخول، والإشعارات القديمة.
                              </div>
                            </div>
                          </label>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                        <span className="text-[11px] text-muted-foreground">
                          تنبيه: بيانات حسابات الموظفين وإعدادات النظام محمية ولا تُمس عند المسح.
                        </span>
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={handleOpenManualPurgeConfirm}
                          disabled={purging}
                          className="font-bold"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>مسح البيانات للفترة المحددة</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Auto Monthly Retention Card */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-extrabold flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary" />
                        <span>المسح التلقائي الدوري (شهرياً)</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        تشغيل تنظيف تلقائي لقاعدة البيانات للاحتفاظ بأحدث عدد محدد من الأشهر وحذف
                        ما يسبقها تلقائياً.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 p-3 cursor-pointer">
                        <div>
                          <div className="text-xs font-extrabold text-foreground">
                            تفعيل المسح التلقائي لقاعدة البيانات
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            يفحص النظام الأشهر المخزنة تلقائياً عند التشغيل وكل 6 ساعات ويمسح
                            السجلات الأقدم من مدة الاحتفاظ.
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={config.autoPurge.enabled}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              autoPurge: { ...config.autoPurge, enabled: e.target.checked },
                            })
                          }
                          className="h-4 w-4 accent-primary shrink-0"
                        />
                      </label>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold">
                            مدة الاحتفاظ التلقائي بالبيانات (شهور)
                          </Label>
                          <NativeSelect
                            value={String(config.autoPurge.retentionMonths)}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                autoPurge: {
                                  ...config.autoPurge,
                                  retentionMonths: Number(e.target.value) || 3,
                                },
                              })
                            }
                            className="h-9 text-xs"
                          >
                            <option value="1">شهر واحد (الاحتفاظ بآخر شهر)</option>
                            <option value="2">شهرين (الاحتفاظ بآخر شهرين)</option>
                            <option value="3">3 شهور (الاحتفاظ بآخر 3 أشهر)</option>
                            <option value="6">6 شهور (الاحتفاظ بآخر 6 أشهر)</option>
                            <option value="12">12 شهراً (الاحتفاظ بآخر سنة)</option>
                          </NativeSelect>
                        </div>

                        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1">
                          <div className="font-bold text-foreground">المعاينة الحالية للسيستم:</div>
                          <div className="text-muted-foreground tabular-nums">
                            الموجود حالياً:{' '}
                            <strong className="text-foreground">{retentionPreview.total} شهر</strong>{' '}
                            {retentionPreview.oldestMonth && retentionPreview.newestMonth && (
                              <span dir="ltr">
                                ({retentionPreview.oldestMonth} → {retentionPreview.newestMonth})
                              </span>
                            )}
                          </div>
                          <div className="text-muted-foreground tabular-nums">
                            سيُحفظ{' '}
                            <strong className="text-foreground">{retentionPreview.keepN} شهر</strong>{' '}
                            ويُمسح{' '}
                            <strong className="text-destructive">
                              {retentionPreview.toDelete} شهر
                            </strong>{' '}
                            تلقائياً عند تجاوز الحد.
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-bold">
                          الفئات المشمولة في المسح التلقائي:
                        </Label>
                        <div className="flex flex-wrap gap-3 text-xs">
                          <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={config.autoPurge.categories.daily}
                              onChange={(e) =>
                                setConfig({
                                  ...config,
                                  autoPurge: {
                                    ...config.autoPurge,
                                    categories: {
                                      ...config.autoPurge.categories,
                                      daily: e.target.checked,
                                    },
                                  },
                                })
                              }
                              className="h-4 w-4 accent-primary"
                            />
                            <span className="font-semibold">الحضور والتارجت والرفع</span>
                          </label>
                          <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={config.autoPurge.categories.requests}
                              onChange={(e) =>
                                setConfig({
                                  ...config,
                                  autoPurge: {
                                    ...config.autoPurge,
                                    categories: {
                                      ...config.autoPurge.categories,
                                      requests: e.target.checked,
                                    },
                                  },
                                })
                              }
                              className="h-4 w-4 accent-primary"
                            />
                            <span className="font-semibold">الطلبات والمرفقات</span>
                          </label>
                          <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={config.autoPurge.categories.logs}
                              onChange={(e) =>
                                setConfig({
                                  ...config,
                                  autoPurge: {
                                    ...config.autoPurge,
                                    categories: {
                                      ...config.autoPurge.categories,
                                      logs: e.target.checked,
                                    },
                                  },
                                })
                              }
                              className="h-4 w-4 accent-primary"
                            />
                            <span className="font-semibold">السجلات والإشعارات</span>
                          </label>
                        </div>
                      </div>

                      {config.autoPurge.lastRunAt && (
                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/20 px-3 py-2 text-[11px] text-muted-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span>
                            آخر تنفيذ: <strong className="tabular-nums">{fmtDateTime(config.autoPurge.lastRunAt)}</strong>
                            {config.autoPurge.lastDeletedSummary
                              ? ` · تم حذف ${fmtNumber(config.autoPurge.lastDeletedSummary.deletedTotal)} سجل`
                              : ''}
                          </span>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleRunAutoPurgeNow}
                          disabled={runningAutoNow || saving}
                          className="font-bold"
                        >
                          {runningAutoNow ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5 text-primary" />
                          )}
                          <span>تشغيل المسح التلقائي الآن</span>
                        </Button>
                        <Button
                          type="button"
                          onClick={() =>
                            saveSystemConfig(
                              { autoPurge: config.autoPurge },
                              'تم حفظ إعدادات المسح التلقائي بنجاح'
                            )
                          }
                          disabled={saving || runningAutoNow}
                          className="font-bold"
                        >
                          <Save className="h-4 w-4" />
                          <span>{saving ? 'جاري الحفظ...' : 'حفظ إعدادات المسح التلقائي'}</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Legacy Requests Integrity Cleanup */}
                  <Card>
                    <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="text-xs font-extrabold text-foreground">
                          فحص وسلامة سجلات الطلبات القديمة
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          تنظيف الجداول المتداخلة للطلبات القديمة والإشعارات غير المرتبطة تلقائياً.
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleCleanupRequestsDb}
                        disabled={cleaningRequestsDb}
                        className="font-bold"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        <span>
                          {cleaningRequestsDb ? 'جاري الفحص...' : 'تنظيف سجلات الطلبات'}
                        </span>
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* ================= SECTION 2: FINANCIAL FORMS & REQUEST SETTINGS ================= */}
              {activeSection === 'requests_forms' && (
                <form onSubmit={handleSaveRequestsAndForms} className="space-y-5">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-extrabold flex items-center gap-2">
                        <Link2 className="h-4 w-4 text-primary" />
                        <span>تحويل الطلبات المالية إلى روابط Google Forms</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        عند التفعيل، يتم توجيه الموظف مباشرة إلى رابط نموذج Google المخصص عند الضغط
                        على مستحقات الموظفين أو طلب السلفة المالية.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 p-3 cursor-pointer">
                        <div>
                          <div className="text-xs font-extrabold text-foreground">
                            تفعيل التوجيه الخارجي للطلبات المالية
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            فتح روابط Google Forms المعتمدة بدلاً من النموذج الداخلي لمستحقات
                            الموظف وطلب السلفة.
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={config.financialFormLinks.enabled}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              financialFormLinks: {
                                ...config.financialFormLinks,
                                enabled: e.target.checked,
                              },
                            })
                          }
                          className="h-4 w-4 accent-primary shrink-0"
                        />
                      </label>

                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs font-bold">
                              رابط مستحقات موظف (Google Form)
                            </Label>
                            {config.financialFormLinks.salaryEntitlementsUrl.startsWith(
                              'https://'
                            ) && (
                              <a
                                href={config.financialFormLinks.salaryEntitlementsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                <span>معاينة النموذج</span>
                              </a>
                            )}
                          </div>
                          <Input
                            dir="ltr"
                            value={config.financialFormLinks.salaryEntitlementsUrl}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                financialFormLinks: {
                                  ...config.financialFormLinks,
                                  salaryEntitlementsUrl: e.target.value,
                                },
                              })
                            }
                            placeholder="https://docs.google.com/forms/..."
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs font-bold">
                              رابط طلب سلفة مالية (Google Form)
                            </Label>
                            {config.financialFormLinks.advanceRequestUrl.startsWith('https://') && (
                              <a
                                href={config.financialFormLinks.advanceRequestUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                <span>معاينة النموذج</span>
                              </a>
                            )}
                          </div>
                          <Input
                            dir="ltr"
                            value={config.financialFormLinks.advanceRequestUrl}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                financialFormLinks: {
                                  ...config.financialFormLinks,
                                  advanceRequestUrl: e.target.value,
                                },
                              })
                            }
                            placeholder="https://docs.google.com/forms/..."
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/70">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold">
                              رابط بوابة المرتبات (في صفحة الموظف)
                            </Label>
                            <Input
                              dir="ltr"
                              value={config.financialFormLinks.payrollPortalUrl || ''}
                              onChange={(e) =>
                                setConfig({
                                  ...config,
                                  financialFormLinks: {
                                    ...config.financialFormLinks,
                                    payrollPortalUrl: e.target.value,
                                  },
                                })
                              }
                              placeholder="https://..."
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold">
                              رابط لائحة العمل الداخلية
                            </Label>
                            <Input
                              dir="ltr"
                              value={config.financialFormLinks.workRegulationsUrl || ''}
                              onChange={(e) =>
                                setConfig({
                                  ...config,
                                  financialFormLinks: {
                                    ...config.financialFormLinks,
                                    workRegulationsUrl: e.target.value,
                                  },
                                })
                              }
                              placeholder="https://..."
                            />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-extrabold">
                        صلاحيات المراجعة وسير عمل الطلبات
                      </CardTitle>
                      <CardDescription className="text-xs">
                        تحكم موحد بصلاحيات المشرفين في قبول/رفض الطلبات وضوابط التقديم والمرفقات.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs">
                      <label className="flex items-center justify-between gap-3 cursor-pointer">
                        <div>
                          <div className="font-bold text-foreground">
                            منح المشرفين صلاحية البتّ في الطلبات
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            السماح للمشرف بمراجعة طلبات الشيفت المسند إليه فقط (وطلبات النقل الواردة لشيفتهم).
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={allowSupervisorDecision}
                          onChange={(e) => setAllowSupervisorDecision(e.target.checked)}
                          className="h-4 w-4 accent-primary shrink-0"
                        />
                      </label>

                      {allowSupervisorDecision && (
                        <div className="rounded-lg border border-border bg-secondary/25 p-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-foreground">
                              أنواع الطلبات المتاحة للمشرفين:
                            </span>
                            <div className="flex items-center gap-2 text-[11px]">
                              <button
                                type="button"
                                onClick={() =>
                                  setSupervisorAllowedTypes(REQUEST_CATALOG.map((c) => c.key))
                                }
                                className="font-bold text-primary hover:underline cursor-pointer"
                              >
                                تحديد الكل
                              </button>
                              <span className="text-muted-foreground">·</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setSupervisorAllowedTypes([
                                    'exam_leave',
                                    'special_leave',
                                    'sick_leave',
                                    'extra_working_days',
                                    'shift_transfer',
                                  ])
                                }
                                className="font-bold text-primary hover:underline cursor-pointer"
                              >
                                الإجازات والنقل فقط
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {REQUEST_CATALOG.map((item) => {
                              const checked = supervisorAllowedTypes.includes(item.key);
                              return (
                                <label
                                  key={item.key}
                                  className="flex items-center gap-2 rounded border border-border/70 bg-card px-2.5 py-1.5 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) =>
                                      setSupervisorAllowedTypes((prev) =>
                                        e.target.checked
                                          ? prev.includes(item.key)
                                            ? prev
                                            : [...prev, item.key]
                                          : prev.filter((k) => k !== item.key)
                                      )
                                    }
                                    className="h-3.5 w-3.5 accent-primary shrink-0"
                                  />
                                  <span className="text-[11px] font-semibold truncate">
                                    {item.arabicTitle}
                                    {item.key === 'shift_transfer' && (
                                      <span className="text-muted-foreground font-normal">
                                        {' '}
                                        (← للشيفت المنقول إليه)
                                      </span>
                                    )}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/70">
                        <label className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 cursor-pointer">
                          <span className="font-semibold">إعادة فتح الطلبات المغلقة</span>
                          <input
                            type="checkbox"
                            checked={allowReopenDecision}
                            onChange={(e) => setAllowReopenDecision(e.target.checked)}
                            className="h-4 w-4 accent-primary"
                          />
                        </label>
                        <label className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 cursor-pointer">
                          <span className="font-semibold">إلغاء الطلب قبل المراجعة</span>
                          <input
                            type="checkbox"
                            checked={allowEmployeeCancellation}
                            onChange={(e) => setAllowEmployeeCancellation(e.target.checked)}
                            className="h-4 w-4 accent-primary"
                          />
                        </label>
                        <label className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 cursor-pointer">
                          <span className="font-semibold">منع الطلبات المكررة قيد المتابعة</span>
                          <input
                            type="checkbox"
                            checked={preventDuplicatePending}
                            onChange={(e) => setPreventDuplicatePending(e.target.checked)}
                            className="h-4 w-4 accent-primary"
                          />
                        </label>
                        <label className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 cursor-pointer">
                          <span className="font-semibold">تقييد السلفة بأيام محددة بالشهر</span>
                          <input
                            type="checkbox"
                            checked={enforceAdvanceWindow}
                            onChange={(e) => setEnforceAdvanceWindow(e.target.checked)}
                            className="h-4 w-4 accent-primary"
                          />
                        </label>
                      </div>

                      {reqMeta && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">
                              بداية نافذة السلفة (يوم)
                            </Label>
                            <Input
                              type="number"
                              min={1}
                              max={28}
                              value={advanceWindowStartDay}
                              onChange={(e) =>
                                setAdvanceWindowStartDay(Number(e.target.value) || 1)
                              }
                              className="h-8 text-xs tabular-nums"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">
                              نهاية نافذة السلفة (يوم)
                            </Label>
                            <Input
                              type="number"
                              min={1}
                              max={31}
                              value={advanceWindowEndDay}
                              onChange={(e) =>
                                setAdvanceWindowEndDay(Number(e.target.value) || 20)
                              }
                              className="h-8 text-xs tabular-nums"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">
                              الحد الأقصى لحجم المرفق
                            </Label>
                            <NativeSelect
                              value={String(config.payroll.maxAttachmentSizeMb)}
                              onChange={(e) =>
                                setConfig({
                                  ...config,
                                  payroll: {
                                    ...config.payroll,
                                    maxAttachmentSizeMb: Number(e.target.value) || 5,
                                  },
                                })
                              }
                              className="h-8 text-xs"
                            >
                              <option value="2">2 MB</option>
                              <option value="5">5 MB</option>
                              <option value="10">10 MB</option>
                            </NativeSelect>
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end pt-3 border-t border-border">
                        <Button type="submit" disabled={saving} className="font-bold">
                          <Save className="h-4 w-4" />
                          <span>{saving ? 'جاري الحفظ...' : 'حفظ روابط الطلبات والصلاحيات'}</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </form>
              )}

              {/* ================= SECTION 2B: DISPLAY, PRIVACY & NOTICES ================= */}
              {activeSection === 'display_features' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveSystemConfig(
                      { displayAndFeatures: config.displayAndFeatures },
                      'تم حفظ إعدادات العرض والصلاحيات والتنبيهات بنجاح'
                    );
                  }}
                  className="space-y-5"
                >
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-extrabold flex items-center gap-2">
                        <Eye className="h-4 w-4 text-primary" />
                        <span>خصوصية عرض بيانات الموظفين</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        تخصيص العناصر التي تظهر للموظف في صفحته الرئيسية وصلاحيات تصدير الملفات.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs">
                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/25 p-3 cursor-pointer">
                        <div>
                          <div className="font-bold text-foreground">
                            إظهار شارة وترتيب Top 5 للموظف
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            عرض مركز الموظف ضمن أفضل 5 في كل مرحلة داخل لوحته الشخصية.
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={config.displayAndFeatures.showTop5ToEmployees}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              displayAndFeatures: {
                                ...config.displayAndFeatures,
                                showTop5ToEmployees: e.target.checked,
                              },
                            })
                          }
                          className="h-4 w-4 accent-primary shrink-0"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/25 p-3 cursor-pointer">
                        <div>
                          <div className="font-bold text-foreground">
                            إظهار الشريحة، بدل طبيعة العمل، والمكافآت/الخصومات للموظف
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            إتاحة بيانات الشريحة المالية وطبيعة العمل وأيام المكافآت والخصومات في
                            ملف الموظف.
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={config.displayAndFeatures.showBonusAndDeductionsToEmployee}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              displayAndFeatures: {
                                ...config.displayAndFeatures,
                                showBonusAndDeductionsToEmployee: e.target.checked,
                              },
                            })
                          }
                          className="h-4 w-4 accent-primary shrink-0"
                        />
                      </label>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 cursor-pointer">
                          <div>
                            <div className="font-bold text-foreground">
                              السماح للموظف بتصدير ملفه
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              أزرار Excel و PDF والطباعة في صفحة الموظف.
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={config.displayAndFeatures.allowEmployeeExport}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                displayAndFeatures: {
                                  ...config.displayAndFeatures,
                                  allowEmployeeExport: e.target.checked,
                                },
                              })
                            }
                            className="h-4 w-4 accent-primary shrink-0"
                          />
                        </label>

                        <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 cursor-pointer">
                          <div>
                            <div className="font-bold text-foreground">
                              السماح للمشرفين بالتصدير
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              تصدير التقارير وسجلات الحضور والطلبات لشيفت المشرف.
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={config.displayAndFeatures.allowSupervisorExport}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                displayAndFeatures: {
                                  ...config.displayAndFeatures,
                                  allowSupervisorExport: e.target.checked,
                                },
                              })
                            }
                            className="h-4 w-4 accent-primary shrink-0"
                          />
                        </label>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-extrabold flex items-center gap-2">
                        <Bell className="h-4 w-4 text-primary" />
                        <span>تنبيه / إعلان نصي أعلى الصفحة الرئيسية</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        رسالة إرشادية أو إدارية مختصرة تظهر لجميع المستخدمين أعلى الرئيسية.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs">
                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/25 p-3 cursor-pointer">
                        <div>
                          <div className="font-bold text-foreground">تفعيل الشريط الإعلاني النصي</div>
                          <div className="text-[11px] text-muted-foreground">
                            يظهر أعلى لوحة المتابعة الرئيسية وصفحة الموظف.
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={config.displayAndFeatures.systemNoticeEnabled}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              displayAndFeatures: {
                                ...config.displayAndFeatures,
                                systemNoticeEnabled: e.target.checked,
                              },
                            })
                          }
                          className="h-4 w-4 accent-primary shrink-0"
                        />
                      </label>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">نص التنبيه الإداري (بحد أقصى 300 حرف)</Label>
                        <Input
                          value={config.displayAndFeatures.systemNoticeText}
                          maxLength={300}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              displayAndFeatures: {
                                ...config.displayAndFeatures,
                                systemNoticeText: e.target.value,
                              },
                            })
                          }
                          placeholder="مثال: آخر موعد لمراجعة السجلات قبل إغلاق دورة الشهر يوم 20 الساعة 4 عصراً."
                        />
                      </div>

                      <div className="flex justify-end pt-2 border-t border-border">
                        <Button type="submit" disabled={saving} className="font-bold">
                          <Save className="h-4 w-4" />
                          <span>{saving ? 'جاري الحفظ...' : 'حفظ إعدادات العرض والصلاحيات'}</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </form>
              )}

              {/* ================= SECTION 2C: REPORTS & SHEETS CUSTOMIZATION ================= */}
              {activeSection === 'reports_sheets' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveSystemConfig(
                      { reportsAndSheets: config.reportsAndSheets },
                      'تم حفظ إعدادات التقارير والشيتات بنجاح'
                    );
                  }}
                  className="space-y-5"
                >
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-extrabold flex items-center gap-2">
                        <FileBarChart2 className="h-4 w-4 text-primary" />
                        <span>تخصيص حجم ومحاذاة التقارير (PDF ومعاينة التقرير)</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        تحكم كامل في حجم الخط والجداول، محاذاة البيانات داخل الجدول أفقياً ورأسياً، وموضع محتوى الصفحة في ملفات PDF.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold">حجم التقرير والجدول</Label>
                          <NativeSelect
                            value={config.reportsAndSheets.reportSize}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                reportsAndSheets: {
                                  ...config.reportsAndSheets,
                                  reportSize: e.target.value as 'compact' | 'normal' | 'large',
                                },
                              })
                            }
                          >
                            <option value="compact">مضغوط (Compact — صفوف أكثر بالصفحة)</option>
                            <option value="normal">قياسي (Normal — متوازن)</option>
                            <option value="large">كبير (Large — خط ومسافات أوضح)</option>
                          </NativeSelect>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold">اتجاه صفحة PDF</Label>
                          <NativeSelect
                            value={config.reportsAndSheets.reportOrientation}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                reportsAndSheets: {
                                  ...config.reportsAndSheets,
                                  reportOrientation: e.target.value as
                                    | 'auto'
                                    | 'portrait'
                                    | 'landscape',
                                },
                              })
                            }
                          >
                            <option value="auto">تلقائي حسب نوع التقرير (مستحسن)</option>
                            <option value="portrait">طولي دائماً (Portrait A4)</option>
                            <option value="landscape">عرضي دائماً (Landscape A4)</option>
                          </NativeSelect>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold">موضع الصفحة عمودياً</Label>
                          <NativeSelect
                            value={config.reportsAndSheets.pageVerticalAlign}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                reportsAndSheets: {
                                  ...config.reportsAndSheets,
                                  pageVerticalAlign: e.target.value as 'top' | 'center',
                                },
                              })
                            }
                          >
                            <option value="top">أعلى الصفحة كالمعتاد (افتراضي)</option>
                            <option value="center">توسيط الصفحة الواحدة رأسياً</option>
                          </NativeSelect>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/70">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold">المحاذاة الأفقية داخل خلايا الجدول</Label>
                          <NativeSelect
                            value={config.reportsAndSheets.tableAlignH}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                reportsAndSheets: {
                                  ...config.reportsAndSheets,
                                  tableAlignH: e.target.value as 'center' | 'right' | 'left',
                                },
                              })
                            }
                          >
                            <option value="center">وسط الخلية (Center)</option>
                            <option value="left">يسار الخلية (Left)</option>
                            <option value="right">يمين الخلية (Right)</option>
                          </NativeSelect>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold">المحاذاة الرأسية داخل خلايا الجدول</Label>
                          <NativeSelect
                            value={config.reportsAndSheets.tableAlignV}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                reportsAndSheets: {
                                  ...config.reportsAndSheets,
                                  tableAlignV: e.target.value as 'middle' | 'top' | 'bottom',
                                },
                              })
                            }
                          >
                            <option value="middle">منتصف الخلية (Middle)</option>
                            <option value="top">أعلى الخلية (Top)</option>
                            <option value="bottom">أسفل الخلية (Bottom)</option>
                          </NativeSelect>
                        </div>
                      </div>

                      {/* Live Visual Preview of Table Cell Alignment, Size & Page Vertical Position */}
                      <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground">
                          <span>معاينة حية لمحاذاة جدول التقرير وموضع الصفحة</span>
                          <span dir="ltr">
                            {config.reportsAndSheets.reportSize.toUpperCase()} ·{' '}
                            {config.reportsAndSheets.tableAlignH} / {config.reportsAndSheets.tableAlignV} ·{' '}
                            Page: {config.reportsAndSheets.pageVerticalAlign}
                          </span>
                        </div>
                        <div
                          className={cn(
                            'rounded border border-border bg-card p-3 min-h-[112px] flex flex-col',
                            config.reportsAndSheets.pageVerticalAlign === 'center'
                              ? 'justify-center'
                              : 'justify-start'
                          )}
                        >
                          <table className="w-full border-collapse text-[11px]" dir="ltr">
                            <thead>
                              <tr className="bg-muted">
                                {['Employee', 'Stage', 'Achieved', '%'].map((col) => (
                                  <th
                                    key={col}
                                    className={cn(
                                      'border border-border font-bold',
                                      config.reportsAndSheets.reportSize === 'compact'
                                        ? 'px-1.5 py-1 text-[10px]'
                                        : config.reportsAndSheets.reportSize === 'large'
                                          ? 'px-3 py-2 text-xs'
                                          : 'px-2 py-1.5',
                                      config.reportsAndSheets.tableAlignH === 'left'
                                        ? 'text-left'
                                        : config.reportsAndSheets.tableAlignH === 'right'
                                          ? 'text-right'
                                          : 'text-center',
                                      config.reportsAndSheets.tableAlignV === 'top'
                                        ? 'align-top'
                                        : config.reportsAndSheets.tableAlignV === 'bottom'
                                          ? 'align-bottom'
                                          : 'align-middle'
                                    )}
                                  >
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                {['Ahmed Ali', 'فحص', '1,250', '104.2%'].map((val, idx) => (
                                  <td
                                    key={idx}
                                    className={cn(
                                      'border border-border h-10',
                                      config.reportsAndSheets.reportSize === 'compact'
                                        ? 'px-1.5 py-0.5 text-[10px]'
                                        : config.reportsAndSheets.reportSize === 'large'
                                          ? 'px-3 py-2 text-xs'
                                          : 'px-2 py-1',
                                      config.reportsAndSheets.tableAlignH === 'left'
                                        ? 'text-left'
                                        : config.reportsAndSheets.tableAlignH === 'right'
                                          ? 'text-right'
                                          : 'text-center',
                                      config.reportsAndSheets.tableAlignV === 'top'
                                        ? 'align-top'
                                        : config.reportsAndSheets.tableAlignV === 'bottom'
                                          ? 'align-bottom'
                                          : 'align-middle'
                                    )}
                                  >
                                    {val}
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-extrabold flex items-center gap-2">
                        <Layers className="h-4 w-4 text-primary" />
                        <span>إعدادات الشيتات والمراحل وعدد أيام الشهر</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        تحديد عدد صفوف بلوك المراحل لكل موظف عند رفع شيت الإكسيل (16 بلوك أو أكثر)، عدد أعمدة الأيام في تقارير الموظف، وطول الشهر (30 أو 31 يوم).
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold">
                            عدد صفوف مراحل الموظف في الشيت (Block)
                          </Label>
                          <Input
                            type="number"
                            min={16}
                            max={40}
                            value={config.reportsAndSheets.sheetStageBlockRows}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                reportsAndSheets: {
                                  ...config.reportsAndSheets,
                                  sheetStageBlockRows: Math.min(
                                    40,
                                    Math.max(16, Number(e.target.value) || 16)
                                  ),
                                },
                              })
                            }
                            className="tabular-nums"
                          />
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {[16, 20, 24, 30].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() =>
                                  setConfig({
                                    ...config,
                                    reportsAndSheets: {
                                      ...config.reportsAndSheets,
                                      sheetStageBlockRows: preset,
                                    },
                                  })
                                }
                                className={cn(
                                  'rounded border px-2 py-0.5 text-[10px] font-bold tabular-nums cursor-pointer transition-colors',
                                  config.reportsAndSheets.sheetStageBlockRows === preset
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
                                )}
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            الافتراضي 16 مرحلة/صف لكل موظف (يمكن رفعه حتى 40).
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold">
                            عدد أيام البلوك في PDF الموظف
                          </Label>
                          <Input
                            type="number"
                            min={8}
                            max={31}
                            value={config.reportsAndSheets.pdfMaxDatesPerBlock}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                reportsAndSheets: {
                                  ...config.reportsAndSheets,
                                  pdfMaxDatesPerBlock: Math.min(
                                    31,
                                    Math.max(8, Number(e.target.value) || 16)
                                  ),
                                },
                              })
                            }
                            className="tabular-nums"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            تقسيم جدول أيام الموظف إلى بلوكات (مثلاً 16 أو 31 يوم).
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold">عدد أيام الشهر في الشيتات</Label>
                          <NativeSelect
                            value={config.reportsAndSheets.monthDaysCount}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                reportsAndSheets: {
                                  ...config.reportsAndSheets,
                                  monthDaysCount: e.target.value as 'auto' | '30' | '31',
                                },
                              })
                            }
                          >
                            <option value="auto">تلقائي حسب الشهر (28–31 يوم)</option>
                            <option value="30">30 يوماً</option>
                            <option value="31">31 يوماً</option>
                          </NativeSelect>
                          <p className="text-[11px] text-muted-foreground">
                            يُطبق على أعمدة استيراد الشيت ونطاق الإدخال والدورات.
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold">عمود نسبة التارجت في الشيت</Label>
                          <NativeSelect
                            value={config.reportsAndSheets.targetPercentageColumn || 'auto'}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                reportsAndSheets: {
                                  ...config.reportsAndSheets,
                                  targetPercentageColumn: e.target.value,
                                },
                              })
                            }
                          >
                            <option value="auto">تلقائي حسب آخر عمود تاريخ (مستحسن)</option>
                            <option value="AL">AL (شيتات 28 يوماً)</option>
                            <option value="AM">AM (شيتات 29 يوماً)</option>
                            <option value="AN">AN (شيتات 30 يوماً)</option>
                            <option value="AO">AO (شيتات 31 يوماً / نسبة 30 يوم)</option>
                            <option value="AP">AP (نسبة شيت 31 يوماً)</option>
                            <option value="AQ">AQ</option>
                          </NativeSelect>
                          <p className="text-[11px] text-muted-foreground">
                            يتعرف الوضع التلقائي على عمود التارجت والنسبة بعد آخر تاريخ (30 أو 31 يوماً) مع إخفاء الأيام الصفرية غير المسجلة.
                          </p>
                        </div>
                      </div>

                      <div className="flex justify-end pt-3 border-t border-border">
                        <Button type="submit" disabled={saving} className="font-bold">
                          <Save className="h-4 w-4" />
                          <span>{saving ? 'جاري الحفظ...' : 'حفظ إعدادات التقارير والشيتات'}</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </form>
              )}

              {/* ================= SECTION 3: DEPARTMENTS, COMPANIES, SHIFTS & LISTS ================= */}
              {activeSection === 'departments_lists' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ListEditor
                      title="المراحل التشغيلية والأقسام"
                      description="تُستخدم كمراحل افتراضية في الطلبات والإدخال عندما لا توجد مراحل نشطة في الشيت."
                      items={config.departmentsAndLists.stages}
                      placeholder="اسم المرحلة (مثال: تحقق)..."
                      onChange={(stages) =>
                        setConfig({
                          ...config,
                          departmentsAndLists: { ...config.departmentsAndLists, stages },
                        })
                      }
                    />
                    <ListEditor
                      title="الشركات المسجلة بالنظام"
                      description="أسماء الشركات المعتمدة في ملفات الموظفين والفلاتر."
                      items={config.departmentsAndLists.companies}
                      placeholder="اسم الشركة (مثال: SMART BUSINESS)..."
                      onChange={(companies) =>
                        setConfig({
                          ...config,
                          departmentsAndLists: { ...config.departmentsAndLists, companies },
                        })
                      }
                    />
                    <ListEditor
                      title="الشيفتات المعتمدة"
                      description="رموز الشيفتات المتاحة للتشغيل والفرز والتعيين."
                      items={config.departmentsAndLists.shifts}
                      placeholder="رمز الشيفت (مثال: E)..."
                      uppercase
                      onChange={(shifts) =>
                        setConfig({
                          ...config,
                          departmentsAndLists: { ...config.departmentsAndLists, shifts },
                        })
                      }
                    />
                    <ListEditor
                      title="أسباب المغادرة المعتمدة"
                      description="القائمة المنسدلة لأسباب مغادرة الموظفين وإخلاء الطرف."
                      items={config.departmentsAndLists.departureReasons}
                      placeholder="أضف سبب مغادرة..."
                      onChange={(departureReasons) =>
                        setConfig({
                          ...config,
                          departmentsAndLists: {
                            ...config.departmentsAndLists,
                            departureReasons,
                          },
                        })
                      }
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        saveSystemConfig(
                          { departmentsAndLists: config.departmentsAndLists },
                          'تم حفظ قوائم الأقسام والشركات والشيفتات بنجاح'
                        )
                      }
                      className="font-bold"
                    >
                      <Save className="h-4 w-4" />
                      <span>{saving ? 'جاري الحفظ...' : 'حفظ القوائم والأقسام'}</span>
                    </Button>
                  </div>
                </div>
              )}

              {/* ================= SECTION 4: GENERAL, PAYROLL & SECURITY ================= */}
              {activeSection === 'general_payroll' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveSystemConfig(
                      { general: config.general, payroll: config.payroll },
                      'تم حفظ إعدادات النظام والدورات والأمان بنجاح'
                    );
                  }}
                  className="space-y-5"
                >
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-extrabold flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        <span>الهوية والبيانات العامة</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="space-y-1">
                        <Label className="text-xs font-bold">اسم النظام المختصر</Label>
                        <Input
                          value={config.general.systemName}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              general: { ...config.general, systemName: e.target.value },
                            })
                          }
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-bold">الوصف التعريفي</Label>
                        <Input
                          value={config.general.systemSubtitle}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              general: { ...config.general, systemSubtitle: e.target.value },
                            })
                          }
                          required
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-extrabold">
                        دورات المرتب والانضباط والمرفقات
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-xs">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs font-bold">بداية دورة المرتب (يوم)</Label>
                          <Input
                            type="number"
                            min={1}
                            max={28}
                            value={config.payroll.cycleStartDay}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                payroll: {
                                  ...config.payroll,
                                  cycleStartDay: Number(e.target.value) || 21,
                                },
                              })
                            }
                            className="tabular-nums"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-bold">نهاية دورة المرتب (يوم)</Label>
                          <Input
                            type="number"
                            min={1}
                            max={31}
                            value={config.payroll.cycleEndDay}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                payroll: {
                                  ...config.payroll,
                                  cycleEndDay: Number(e.target.value) || 20,
                                },
                              })
                            }
                            className="tabular-nums"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-bold">حد تنبيه الغياب بدون إذن</Label>
                          <Input
                            type="number"
                            min={1}
                            max={30}
                            value={config.payroll.unauthorizedAbsenceThreshold}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                payroll: {
                                  ...config.payroll,
                                  unauthorizedAbsenceThreshold: Number(e.target.value) || 3,
                                },
                              })
                            }
                            className="tabular-nums"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-bold">حد حجم المرفق</Label>
                          <NativeSelect
                            value={String(config.payroll.maxAttachmentSizeMb)}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                payroll: {
                                  ...config.payroll,
                                  maxAttachmentSizeMb: Number(e.target.value) || 5,
                                },
                              })
                            }
                          >
                            <option value="2">2 MB</option>
                            <option value="5">5 MB</option>
                            <option value="10">10 MB</option>
                          </NativeSelect>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/70">
                        <div className="space-y-1">
                          <Label className="text-xs font-bold">
                            كلمة المرور الافتراضية للحسابات الجديدة
                          </Label>
                          <Input
                            dir="ltr"
                            value={config.general.defaultPassword}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                general: { ...config.general, defaultPassword: e.target.value },
                              })
                            }
                            minLength={4}
                            required
                          />
                        </div>

                        <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/25 px-3 py-2 cursor-pointer self-end h-9">
                          <span className="font-bold">إلزام تغيير الباسورد عند أول دخول</span>
                          <input
                            type="checkbox"
                            checked={config.general.requirePasswordChangeOnFirstLogin}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                general: {
                                  ...config.general,
                                  requirePasswordChangeOnFirstLogin: e.target.checked,
                                },
                              })
                            }
                            className="h-4 w-4 accent-primary"
                          />
                        </label>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-extrabold flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        <span>أمان الجلسات واستعادة كلمة المرور والدعم</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs font-bold">مدة الجلسة (ساعة)</Label>
                          <Input
                            type="number"
                            min={1}
                            max={720}
                            value={config.general.sessionExpiryHours}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                general: {
                                  ...config.general,
                                  sessionExpiryHours: Number(e.target.value) || 8,
                                },
                              })
                            }
                            className="tabular-nums"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-bold">الحد الأقصى لمحاولات الدخول</Label>
                          <Input
                            type="number"
                            min={3}
                            max={30}
                            value={config.general.maxLoginAttempts}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                general: {
                                  ...config.general,
                                  maxLoginAttempts: Number(e.target.value) || 8,
                                },
                              })
                            }
                            className="tabular-nums"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-bold flex items-center gap-1.5">
                            <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                            <span>رقم واتساب الدعم (بالكود الدولي)</span>
                          </Label>
                          <Input
                            dir="ltr"
                            value={config.general.supportWhatsappNumber}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                general: {
                                  ...config.general,
                                  supportWhatsappNumber: e.target.value,
                                },
                              })
                            }
                            placeholder="201099843057"
                            className="tabular-nums"
                          />
                        </div>
                      </div>

                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/25 px-3 py-2.5 cursor-pointer">
                        <div>
                          <div className="font-bold text-foreground">
                            إتاحة نموذج «هل نسيت كلمة المرور؟» في شاشة الدخول
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            يسمح للموظف بتجهيز رسالة استعادة كلمة المرور وإرسالها لرقم الدعم المحدد.
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={config.general.allowForgotPassword}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              general: {
                                ...config.general,
                                allowForgotPassword: e.target.checked,
                              },
                            })
                          }
                          className="h-4 w-4 accent-primary shrink-0"
                        />
                      </label>

                      <div className="flex justify-end pt-2 border-t border-border">
                        <Button type="submit" disabled={saving} className="font-bold">
                          <Save className="h-4 w-4" />
                          <span>{saving ? 'جاري الحفظ...' : 'حفظ الإعدادات العامة والأمان'}</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </form>
              )}
            </div>
          </div>
        ) : (
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <div className="text-sm font-bold text-foreground">تعذر تحميل إعدادات النظام</div>
              <p className="text-xs text-muted-foreground">
                تأكد من الاتصال بالخادم وصلاحية منشئ النظام ثم أعد المحاولة.
              </p>
              <Button type="button" size="sm" onClick={loadAll}>
                <RefreshCw className="h-3.5 w-3.5" />
                <span>إعادة المحاولة</span>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Confirmation Dialog for Irreversible Manual Database Purge */}
      <AlertDialog open={confirmPurgeOpen} onOpenChange={setConfirmPurgeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <span>تأكيد مسح البيانات من قاعدة البيانات</span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              {purgeSummaryLabel}
              {'\n'}
              لا يمكن التراجع عن هذه العملية بعد التنفيذ. حسابات الموظفين وإعدادات النظام ستبقى كما
              هي دون مساس.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purging}>تراجع</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e: MouseEvent<HTMLButtonElement>) => {
                e.preventDefault();
                handleExecuteManualPurge();
              }}
              disabled={purging}
            >
              {purging ? 'جاري المسح...' : 'نعم، تأكيد المسح الآن'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
