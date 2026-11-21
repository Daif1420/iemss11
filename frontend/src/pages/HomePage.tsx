import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpDown,
  Bell,
  Briefcase,
  Building2,
  Calendar,
  ExternalLink,
  FileBarChart2,
  FileSpreadsheet,
  FileText,
  Filter,
  FilterX,
  GraduationCap,
  PenSquare,
  Percent,
  RefreshCw,
  RotateCcw,
  Search,
  SearchCheck,
  TrendingDown,
  UserCheck,
  UserMinus,
  UserPlus,
  UserRoundMinus,
  UserRoundPlus,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, fetchAuthenticatedBlobUrl } from '@/lib/api';
import {
  fmtDate,
  fmtDecimal,
  fmtNumber,
  fmtWholePercent,
  payrollCycle,
  weekdayArabic,
} from '@/lib/format';
import { exportAttendanceExcel, exportAttendancePdf } from '@/lib/export';
import type {
  AdminOverview,
  AttendancePayload,
  DashboardPayload,
  EmployeeDetailPayload,
  PublicSystemConfigPayload,
} from '@/types/iems';
import { cn } from '@/lib/utils';
import { AppShell } from '@/components/layout/AppShell';
import { ExportActionButton } from '@/components/shared/ExportButtons';
import { GlobalSearchBar } from '@/components/shared/GlobalSearchBar';
import { KpiCard } from '@/components/shared/KpiCard';
import { MultiFilterPopover } from '@/components/shared/MultiFilterPopover';
import {
  CompanyComparisonChart,
  DailyAttendanceTrendChart,
} from '@/components/shared/Charts';
import { EmployeePerformanceSection } from '@/components/shared/EmployeePerformanceSection';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type QuickRangeKey = 'today' | 'week' | 'month' | 'all';
type EmpSortKey = 'name' | 'id' | 'present' | 'absent' | 'unauthorized' | 'attendance_rate';
type TableTabKey = 'employees' | 'daily' | 'companies';
type QuickEmpFilterKey = 'all' | 'perfect' | 'has_absent' | 'has_unauth';

const STATUS_OPTIONS = [
  { value: 'present', label: 'حضور' },
  { value: 'casual', label: 'إجازة عارضة' },
  { value: 'permission', label: 'إجازة بإذن' },
  { value: 'unauthorized', label: 'بدون إذن' },
  { value: 'medical', label: 'مرضي' },
  { value: 'absent', label: 'إجمالي الغياب' },
];

export function HomePage() {
  const { user, isCreator, isAdminUp, isSupervisorUp, isEmployee } = useAuth();
  const navigate = useNavigate();

  // Banner + public system config rendered right below Topbar
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [publicConfig, setPublicConfig] = useState<PublicSystemConfigPayload | null>(null);

  useEffect(() => {
    let activeUrl: string | null = null;
    let cancelled = false;
    fetchAuthenticatedBlobUrl('/api/admin/banner/image')
      .then((url) => {
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        activeUrl = url;
        setBannerUrl(url);
      })
      .catch(() => setBannerUrl(null));

    api<PublicSystemConfigPayload>('/api/admin/system/public-config')
      .then((cfg) => {
        if (!cancelled) setPublicConfig(cfg);
      })
      .catch(() => {
        // fallback defaults
      });

    return () => {
      cancelled = true;
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, []);

  const noticeText =
    publicConfig?.displayAndFeatures?.systemNoticeEnabled &&
    publicConfig.displayAndFeatures.systemNoticeText?.trim()
      ? publicConfig.displayAndFeatures.systemNoticeText.trim()
      : '';

  const bannerElement =
    bannerUrl || noticeText ? (
      <div className="border-b border-border bg-card/50 no-print">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-3 space-y-2.5">
          {noticeText && (
            <div className="flex items-center gap-2.5 rounded-lg border border-primary/25 bg-primary/5 px-3.5 py-2 text-xs font-semibold text-foreground">
              <Bell className="h-4 w-4 text-primary shrink-0" />
              <span>{noticeText}</span>
            </div>
          )}
          {bannerUrl && (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
              <img
                src={bannerUrl}
                alt="إعلان النظام"
                className="w-full max-h-52 object-cover block"
              />
            </div>
          )}
        </div>
      </div>
    ) : null;

  return (
    <AppShell beforeContent={bannerElement}>
      {isSupervisorUp ? (
        <ManagementHomeView
          isCreator={isCreator}
          isAdminUp={isAdminUp}
          userName={user?.name}
          publicConfig={publicConfig}
          navigate={navigate}
        />
      ) : (
        <EmployeeSelfHomeView
          userId={user?.id}
          userName={user?.name}
          isEmployee={isEmployee}
          publicConfig={publicConfig}
        />
      )}
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// 1. Admin / System Creator / Supervisor Home View
// ---------------------------------------------------------------------------
function ManagementHomeView({
  isCreator,
  isAdminUp,
  userName,
  publicConfig,
  navigate,
}: {
  isCreator: boolean;
  isAdminUp: boolean;
  userName?: string;
  publicConfig: PublicSystemConfigPayload | null;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [companiesMeta, setCompaniesMeta] = useState<string[]>([]);
  const [departmentsMeta, setDepartmentsMeta] = useState<string[]>([]);
  const [shiftsMeta, setShiftsMeta] = useState<string[]>([]);

  const cycleStartDay = publicConfig?.payroll?.cycleStartDay ?? 21;
  const cycleEndDay = publicConfig?.payroll?.cycleEndDay ?? 20;
  const absThreshold = publicConfig?.payroll?.unauthorizedAbsenceThreshold ?? 3;
  const canExportTable = isAdminUp || (publicConfig?.displayAndFeatures?.allowSupervisorExport ?? true);

  // Active Filter State
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedShifts, setSelectedShifts] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [activeRange, setActiveRange] = useState<QuickRangeKey | 'custom'>('month');
  const [searchQuery, setSearchQuery] = useState('');

  // Loaded Data
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [attendance, setAttendance] = useState<AttendancePayload | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  // Table sort & UI organization
  const [sortKey, setSortKey] = useState<EmpSortKey>('absent');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [activeTableTab, setActiveTableTab] = useState<TableTabKey>('employees');
  const [quickEmpFilter, setQuickEmpFilter] = useState<QuickEmpFilterKey>('all');

  const fetchAllData = useCallback(
    async (params: {
      from: string;
      to: string;
      companies: string[];
      departments: string[];
      shifts: string[];
      statuses: string[];
    }) => {
      if (params.from && params.to && params.from > params.to) {
        toast.error('تاريخ البداية يجب أن يسبق تاريخ النهاية.');
        return;
      }
      setLoading(true);
      try {
        const attQs = new URLSearchParams();
        if (params.from) attQs.set('from', params.from);
        if (params.to) attQs.set('to', params.to);
        params.companies.forEach((v) => attQs.append('company', v));
        params.departments.forEach((v) => attQs.append('department', v));
        params.shifts.forEach((v) => attQs.append('shift', v));
        params.statuses.forEach((v) => attQs.append('status', v));

        const dashQs = new URLSearchParams();
        if (params.from) dashQs.set('from', params.from);
        if (params.to) dashQs.set('to', params.to);
        params.shifts.forEach((v) => dashQs.append('shift', v));

        const calls: [
          Promise<AttendancePayload>,
          Promise<DashboardPayload>,
          Promise<AdminOverview | null>,
        ] = [
          api<AttendancePayload>(`/api/attendance?${attQs}`),
          api<DashboardPayload>(`/api/employee/dashboard?${dashQs}`),
          api<AdminOverview>(
            `/api/admin/overview?${(() => {
              const oq = new URLSearchParams();
              if (params.from) oq.set('from', params.from);
              if (params.to) oq.set('to', params.to);
              if (params.shifts.length === 1) oq.set('shift', params.shifts[0]);
              return oq;
            })()}`
          ),
        ];

        const [attRes, dashRes, ovRes] = await Promise.all(calls);
        setAttendance(attRes);
        setDashboard(dashRes);
        if (ovRes) setOverview(ovRes);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'تعذر تحميل بيانات اللوحة');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Initial Boot
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const meta = await api<{
          dates: string[];
          companies: string[];
          departments: string[];
          shifts: string[];
        }>('/api/attendance/meta');
        if (!active) return;

        const dts = meta.dates || [];
        setAvailableDates(dts);
        setCompaniesMeta(meta.companies || []);
        setDepartmentsMeta(meta.departments || []);
        setShiftsMeta(meta.shifts || []);

        let initFrom = '';
        let initTo = '';
        if (dts.length) {
          const first = dts[0];
          const last = dts[dts.length - 1];
          const cyc = payrollCycle(last, cycleStartDay, cycleEndDay);
          initFrom = cyc.start < first ? first : cyc.start;
          initTo = cyc.end > last ? last : cyc.end;
          setFrom(initFrom);
          setTo(initTo);
        }

        await fetchAllData({
          from: initFrom,
          to: initTo,
          companies: [],
          departments: [],
          shifts: [],
          statuses: [],
        });
      } catch (err) {
        if (active) {
          toast.error(err instanceof ApiError ? err.message : 'تعذر تهيئة البيانات');
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchAllData, cycleStartDay, cycleEndDay]);

  const applyQuickRange = (key: QuickRangeKey) => {
    if (!availableDates.length) return;
    const first = availableDates[0];
    const last = availableDates[availableDates.length - 1];
    let nextFrom = first;
    let nextTo = last;

    if (key === 'today') {
      nextFrom = last;
      nextTo = last;
    } else if (key === 'week') {
      const d = new Date(`${last}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 6);
      const w = d.toISOString().slice(0, 10);
      nextFrom = w < first ? first : w;
      nextTo = last;
    } else if (key === 'month') {
      const c = payrollCycle(last, cycleStartDay, cycleEndDay);
      nextFrom = c.start < first ? first : c.start;
      nextTo = c.end > last ? last : c.end;
    } else {
      nextFrom = first;
      nextTo = last;
    }

    setActiveRange(key);
    setFrom(nextFrom);
    setTo(nextTo);
    fetchAllData({
      from: nextFrom,
      to: nextTo,
      companies: selectedCompanies,
      departments: selectedDepartments,
      shifts: selectedShifts,
      statuses: selectedStatuses,
    });
  };

  const handleApplyFilters = () => {
    setActiveRange('custom');
    fetchAllData({
      from,
      to,
      companies: selectedCompanies,
      departments: selectedDepartments,
      shifts: selectedShifts,
      statuses: selectedStatuses,
    });
  };

  const handleResetFilters = () => {
    const first = availableDates[0] || '';
    const last = availableDates[availableDates.length - 1] || '';
    const cyc = last ? payrollCycle(last, cycleStartDay, cycleEndDay) : null;
    const initFrom = cyc ? (cyc.start < first ? first : cyc.start) : first;
    const initTo = cyc ? (cyc.end > last ? last : cyc.end) : last;

    setFrom(initFrom);
    setTo(initTo);
    setSelectedCompanies([]);
    setSelectedDepartments([]);
    setSelectedShifts([]);
    setSelectedStatuses([]);
    setSearchQuery('');
    setQuickEmpFilter('all');
    setActiveRange('month');
    fetchAllData({
      from: initFrom,
      to: initTo,
      companies: [],
      departments: [],
      shifts: [],
      statuses: [],
    });
  };

  const drillAttendanceKpi = async (statusFilter: string, targetTab: TableTabKey) => {
    const nextStatuses = statusFilter ? [statusFilter] : [];
    setSelectedStatuses(nextStatuses);
    setActiveTableTab(targetTab);
    if (statusFilter === 'absent') setQuickEmpFilter('has_absent');
    else if (statusFilter === 'unauthorized') setQuickEmpFilter('has_unauth');
    else setQuickEmpFilter('all');
    await fetchAllData({
      from,
      to,
      companies: selectedCompanies,
      departments: selectedDepartments,
      shifts: selectedShifts,
      statuses: nextStatuses,
    });
    document.getElementById('operational-tables-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const unauthorizedRows = useMemo(() => {
    if (dashboard?.unauthorizedAbsenceEmployees?.length) {
      return dashboard.unauthorizedAbsenceEmployees.map((r) => ({
        id: r.id,
        name: r.name,
        company: r.company,
        shift: r.shift,
        days: r.unauthorized_days,
      }));
    }
    return (attendance?.employees || [])
      .filter((r) => Number(r.unauthorized || 0) >= absThreshold)
      .map((r) => ({
        id: r.id,
        name: r.name,
        company: r.company,
        shift: r.shift,
        days: r.unauthorized,
      }));
  }, [dashboard, attendance, absThreshold]);

  const filteredAndSortedEmployees = useMemo(() => {
    const rows = attendance?.employees || [];
    const q = searchQuery.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (quickEmpFilter === 'perfect' && Number(r.attendance_rate || 0) < 100) return false;
      if (quickEmpFilter === 'has_absent' && Number(r.absent || 0) <= 0) return false;
      if (quickEmpFilter === 'has_unauth' && Number(r.unauthorized || 0) <= 0) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        String(r.id).includes(q) ||
        String(r.company || '').toLowerCase().includes(q) ||
        String(r.department || '').toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'ar') * mul;
      return (Number(a[sortKey] || 0) - Number(b[sortKey] || 0)) * mul;
    });
  }, [attendance, searchQuery, quickEmpFilter, sortKey, sortDir]);

  const activeFiltersCount =
    selectedCompanies.length +
    selectedDepartments.length +
    selectedShifts.length +
    selectedStatuses.length;

  const toggleSort = (key: EmpSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const handleExportPdf = async () => {
    if (!attendance) return;
    setPdfBusy(true);
    try {
      await exportAttendancePdf(attendance, userName || '—');
      toast.success('تم إنشاء ملف PDF');
    } catch {
      toast.error('تعذر إنشاء ملف PDF');
    } finally {
      setPdfBusy(false);
    }
  };

  const totals = attendance?.totals;
  const absenceRate = totals?.total ? (totals.absent / totals.total) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Page Header + Timeframe Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
            لوحة المتابعة الرئيسية
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            نظرة موحدة على القوة التشغيلية ومعدلات الحضور والغياب في الفترة المحددة
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <div className="inline-flex items-center rounded-lg border border-border bg-card p-1">
            {(
              [
                ['today', 'اليوم'],
                ['week', '7 أيام'],
                ['month', 'الدورة الحالية'],
                ['all', 'الكل'],
              ] as [QuickRangeKey, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => applyQuickRange(k)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer',
                  activeRange === k
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <Badge variant="outline" className="h-8 px-3 gap-1.5 text-xs tabular-nums">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            <span>
              {attendance?.range
                ? `${fmtDate(attendance.range.from)} → ${fmtDate(attendance.range.to)}`
                : '—'}
            </span>
          </Badge>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetFilters}
            className="h-8"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>إعادة ضبط</span>
          </Button>
        </div>
      </div>

      {/* Global Command Search + Quick Workflow Shortcuts */}
      <div className="space-y-3 no-print">
        <GlobalSearchBar
          isAdminUp={isAdminUp}
          isCreator={isCreator}
          companies={companiesMeta}
          departments={departmentsMeta}
          fallbackEmployees={attendance?.employees || []}
          onFilterCompany={(company) => {
            const next = [company];
            setSelectedCompanies(next);
            setActiveTableTab('employees');
            fetchAllData({
              from,
              to,
              companies: next,
              departments: selectedDepartments,
              shifts: selectedShifts,
              statuses: selectedStatuses,
            });
            document
              .getElementById('operational-tables-panel')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          onFilterDepartment={(dept) => {
            const next = [dept];
            setSelectedDepartments(next);
            setActiveTableTab('employees');
            fetchAllData({
              from,
              to,
              companies: selectedCompanies,
              departments: next,
              shifts: selectedShifts,
              statuses: selectedStatuses,
            });
            document
              .getElementById('operational-tables-panel')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />

        {/* Quick Operational Shortcuts */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-muted-foreground ml-1">اختصارات سريعة:</span>
          {[
            { label: 'طلبات الموظفين', to: '/requests.html', icon: FileText, show: true },
            { label: 'التقارير', to: '/reports.html', icon: FileBarChart2, show: true },
            { label: 'الإدخال اليدوي', to: '/admin-manual-entry.html', icon: PenSquare, show: isAdminUp },
            { label: 'تحديث البيانات', to: '/admin-import.html', icon: FileSpreadsheet, show: true },
            { label: 'دليل الموظفين', to: '/admin-employees.html?status=active', icon: Users, show: true },
            { label: 'الموظفون الجدد', to: '/employees-new.html', icon: UserPlus, show: true },
            { label: 'سجل المغادرين', to: '/employees-left.html', icon: UserMinus, show: true },
          ]
            .filter((item) => item.show)
            .map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-accent/60 hover:text-primary"
                >
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
        </div>
      </div>

      {/* Organized Filter Toolbar */}
      <Card className="no-print">
        <CardContent className="p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <Filter className="h-3.5 w-3.5 text-primary" />
              <span>تصفية البيانات</span>
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="text-[11px] tabular-nums">
                  {activeFiltersCount} نشط
                </Badge>
              )}
            </div>
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
              >
                <FilterX className="h-3.5 w-3.5" />
                <span>مسح كل الفلاتر</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-2.5 items-end">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground block">
                من تاريخ
              </label>
              <DatePicker
                value={from}
                min={availableDates[0] || undefined}
                max={availableDates[availableDates.length - 1] || undefined}
                onChange={(v) => {
                  setFrom(v);
                  if (to && v > to) setTo(v);
                }}
                placeholder="من تاريخ"
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground block">
                إلى تاريخ
              </label>
              <DatePicker
                value={to}
                min={availableDates[0] || undefined}
                max={availableDates[availableDates.length - 1] || undefined}
                onChange={setTo}
                placeholder="إلى تاريخ"
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground block">الشركة</span>
              <MultiFilterPopover
                label="الشركة"
                allLabel="كل الشركات"
                options={companiesMeta.map((c) => ({ value: c, label: c }))}
                selected={selectedCompanies}
                onChange={setSelectedCompanies}
              />
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground block">
                المرحلة / القسم
              </span>
              <MultiFilterPopover
                label="المرحلة"
                allLabel="كل المراحل"
                options={departmentsMeta.map((d) => ({ value: d, label: d }))}
                selected={selectedDepartments}
                onChange={setSelectedDepartments}
              />
            </div>

            {(isAdminUp || shiftsMeta.length > 0) && (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground block">
                  الشيفت
                </span>
                {!isAdminUp && shiftsMeta.length === 1 ? (
                  <Input
                    value={`Shift ${shiftsMeta[0]}`}
                    readOnly
                    disabled
                    className="h-9 text-xs bg-muted/50 font-bold"
                  />
                ) : (
                  <MultiFilterPopover
                    label="الشيفت"
                    allLabel={isAdminUp ? 'كل الشيفتات' : 'كل الشيفتات المسندة'}
                    options={shiftsMeta.map((s) => ({ value: s, label: s }))}
                    selected={selectedShifts}
                    onChange={setSelectedShifts}
                  />
                )}
              </div>
            )}

            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground block">الحالة</span>
              <MultiFilterPopover
                label="الحالة"
                allLabel="كل الحالات"
                options={STATUS_OPTIONS}
                selected={selectedStatuses}
                onChange={setSelectedStatuses}
              />
            </div>

            <div>
              <Button
                type="button"
                onClick={handleApplyFilters}
                className="w-full h-9 text-xs font-bold"
                disabled={loading}
              >
                <SearchCheck className="h-3.5 w-3.5" />
                <span>عرض النتائج</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Unified KPI Grid (7 Admin Overview + 5 Attendance KPIs) */}
      {loading && !attendance ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3.5">
          {overview && (
            <>
              <KpiCard
                label="إجمالي الموظفين"
                value={fmtNumber(overview.total)}
                icon={Users}
                tone="primary"
                onClick={() => navigate('/admin-employees.html?status=active')}
              />
              <KpiCard
                label="سمارت بيزنس"
                value={fmtNumber(overview.smart)}
                icon={Building2}
                tone="default"
                onClick={() => navigate('/admin-employees.html?status=active&company=smart')}
              />
              <KpiCard
                label="برافوس"
                value={fmtNumber(overview.bravos)}
                icon={Briefcase}
                tone="default"
                onClick={() => navigate('/admin-employees.html?status=active&company=bravos')}
              />
              <KpiCard
                label="الطلاب"
                value={fmtNumber(overview.students)}
                icon={Users}
                tone="default"
                onClick={() => navigate('/admin-employees.html?status=active&education=طالب')}
              />
              <KpiCard
                label="الخريجون"
                value={fmtNumber(overview.graduates)}
                icon={GraduationCap}
                tone="default"
                onClick={() => navigate('/admin-employees.html?status=active&education=خريج')}
              />
              <KpiCard
                label="الجدد هذا الشهر"
                value={fmtNumber(overview.newEmployees)}
                icon={UserRoundPlus}
                tone="success"
                onClick={() => navigate('/employees-new.html')}
              />
              <KpiCard
                label="المغادرون"
                value={fmtNumber(overview.leftEmployees)}
                icon={UserRoundMinus}
                tone="danger"
                onClick={() => navigate('/employees-left.html')}
              />
            </>
          )}

          {totals && (
            <>
              <KpiCard
                label="إجمالي الحضور"
                value={fmtDecimal(totals.present)}
                icon={UserCheck}
                tone="success"
                active={selectedStatuses.includes('present')}
                onClick={() => drillAttendanceKpi('present', 'employees')}
              />
              <KpiCard
                label="نسبة الحضور"
                value={fmtWholePercent(totals.attendance_rate)}
                icon={Percent}
                tone="primary"
                onClick={() => drillAttendanceKpi('', 'daily')}
              />
              <KpiCard
                label="إجمالي الغياب"
                value={fmtDecimal(totals.absent)}
                icon={XCircle}
                tone="warning"
                active={selectedStatuses.includes('absent')}
                onClick={() => drillAttendanceKpi('absent', 'employees')}
              />
              <KpiCard
                label="نسبة الغياب"
                value={fmtWholePercent(absenceRate)}
                icon={TrendingDown}
                tone="warning"
                onClick={() => drillAttendanceKpi('absent', 'daily')}
              />
              <KpiCard
                label="غياب بدون إذن"
                value={fmtDecimal(totals.unauthorized)}
                icon={AlertTriangle}
                tone="danger"
                active={selectedStatuses.includes('unauthorized')}
                onClick={() => drillAttendanceKpi('unauthorized', 'employees')}
              />
            </>
          )}
        </section>
      )}

      {/* Unauthorized Absence Alert Panel (>= 3 days) */}
      {unauthorizedRows.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div>
                <CardTitle className="text-sm font-bold text-foreground">
                  تنبيه: موظفون لديهم غياب بدون إذن {absThreshold} أيام فأكثر
                </CardTitle>
                <p className="text-[11px] text-muted-foreground">
                  مبني على سجلات الحضور الفعلية خلال الفترة المحددة
                </p>
              </div>
            </div>
            <Badge variant="destructive" className="tabular-nums">
              {unauthorizedRows.length} موظف
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الموظف</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>الشركة</TableHead>
                    <TableHead>الشيفت</TableHead>
                    <TableHead className="text-center">أيام الغياب بدون إذن</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unauthorizedRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-bold">
                        <Link
                          to={`/employee.html?id=${r.id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {r.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">#{r.id}</TableCell>
                      <TableCell>{r.company || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.shift || '—'}</Badge>
                      </TableCell>
                      <TableCell className="text-center font-extrabold text-destructive">
                        {fmtNumber(r.days)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Bento Grid */}
      {attendance && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">مقارنة حضور الشركات</CardTitle>
              <p className="text-[11px] text-muted-foreground">
                توزيع الحضور والغياب ومعدلات الالتزام لكل شركة
              </p>
            </CardHeader>
            <CardContent>
              <CompanyComparisonChart companies={attendance.companies || []} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">مؤشر الحضور اليومي</CardTitle>
              <p className="text-[11px] text-muted-foreground">
                تطور نسبة الحضور عبر أيام الفترة المختارة
              </p>
            </CardHeader>
            <CardContent>
              <DailyAttendanceTrendChart daily={attendance.daily || []} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Unified Tabbed Operational Tables Panel */}
      {attendance && (
        <Card id="operational-tables-panel">
          <CardHeader className="pb-3 space-y-3 border-b border-border/70">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              {/* Clean Tab Switcher */}
              <div className="inline-flex flex-wrap items-center rounded-lg border border-border bg-muted/40 p-1 w-fit no-print">
                <button
                  type="button"
                  onClick={() => setActiveTableTab('employees')}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap',
                    activeTableTab === 'employees'
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  التفاصيل اليومية للموظفين ({fmtNumber(filteredAndSortedEmployees.length)})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTableTab('daily')}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap',
                    activeTableTab === 'daily'
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  الحضور يومًا بيوم ({fmtNumber((attendance.daily || []).length)})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTableTab('companies')}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap',
                    activeTableTab === 'companies'
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  ملخص أداء الشركات ({fmtNumber((attendance.companies || []).length)})
                </button>
              </div>

              {/* Export Buttons */}
              {canExportTable && (
                <div className="flex flex-wrap items-center gap-2 no-print">
                  <ExportActionButton
                    kind="excel"
                    onClick={() => exportAttendanceExcel(attendance)}
                  />
                  <ExportActionButton
                    kind="pdf"
                    loading={pdfBusy}
                    onClick={handleExportPdf}
                  />
                  <ExportActionButton
                    kind="print"
                    onClick={() => window.print()}
                  />
                </div>
              )}
            </div>

            {/* Contextual Toolbar for Employees Tab */}
            {activeTableTab === 'employees' && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pt-1 no-print">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      ['all', 'الكل'],
                      ['perfect', 'حضور كامل 100%'],
                      ['has_absent', 'لديهم غياب'],
                      ['has_unauth', 'غياب بدون إذن'],
                    ] as [QuickEmpFilterKey, string][]
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setQuickEmpFilter(k)}
                      className={cn(
                        'rounded-md border px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer',
                        quickEmpFilter === k
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-56">
                  <Search className="h-3.5 w-3.5 text-muted-foreground absolute right-2.5 top-2.5" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="فلترة بالاسم أو ID أو الشركة..."
                    className="h-8 pr-8 text-xs"
                  />
                </div>
              </div>
            )}
          </CardHeader>

          <CardContent className="p-0">
            {activeTableTab === 'employees' && (
              <div id="employee-detail-panel" className="max-h-[540px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <button
                          type="button"
                          onClick={() => toggleSort('name')}
                          className="inline-flex items-center gap-1 cursor-pointer hover:text-foreground"
                        >
                          <span>الموظف</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          onClick={() => toggleSort('id')}
                          className="inline-flex items-center gap-1 cursor-pointer hover:text-foreground"
                        >
                          <span>ID</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead>الشركة</TableHead>
                      <TableHead>الشيفت</TableHead>
                      <TableHead>المرحلة</TableHead>
                      <TableHead className="text-center">
                        <button
                          type="button"
                          onClick={() => toggleSort('present')}
                          className="inline-flex items-center gap-1 cursor-pointer hover:text-foreground"
                        >
                          <span>الحضور</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead className="text-center">
                        <button
                          type="button"
                          onClick={() => toggleSort('absent')}
                          className="inline-flex items-center gap-1 cursor-pointer hover:text-foreground"
                        >
                          <span>الغياب</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead className="text-center">عارضة</TableHead>
                      <TableHead className="text-center">بإذن</TableHead>
                      <TableHead className="text-center">
                        <button
                          type="button"
                          onClick={() => toggleSort('unauthorized')}
                          className="inline-flex items-center gap-1 cursor-pointer hover:text-foreground"
                        >
                          <span>بدون إذن</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead className="text-center">مرضي</TableHead>
                      <TableHead className="text-center">
                        <button
                          type="button"
                          onClick={() => toggleSort('attendance_rate')}
                          className="inline-flex items-center gap-1 cursor-pointer hover:text-foreground"
                        >
                          <span>نسبة الحضور</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAndSortedEmployees.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={12}
                          className="py-10 text-center text-xs text-muted-foreground"
                        >
                          لا توجد بيانات مطابقة
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAndSortedEmployees.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-bold">
                            <Link
                              to={`/employee.html?id=${r.id}`}
                              className="hover:text-primary hover:underline"
                            >
                              {r.name}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{r.id}</TableCell>
                          <TableCell>{r.company || '—'}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{r.shift || '—'}</Badge>
                          </TableCell>
                          <TableCell>{r.department || '—'}</TableCell>
                          <TableCell className="text-center text-emerald-600 dark:text-emerald-400 font-semibold">
                            {fmtDecimal(r.present)}
                          </TableCell>
                          <TableCell className="text-center text-destructive font-semibold">
                            {fmtDecimal(r.absent)}
                          </TableCell>
                          <TableCell className="text-center">{fmtDecimal(r.casual)}</TableCell>
                          <TableCell className="text-center">{fmtDecimal(r.permission)}</TableCell>
                          <TableCell className="text-center text-destructive font-semibold">
                            {fmtDecimal(r.unauthorized)}
                          </TableCell>
                          <TableCell className="text-center">{fmtDecimal(r.medical)}</TableCell>
                          <TableCell className="text-center font-bold">
                            {fmtWholePercent(r.attendance_rate)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {activeTableTab === 'daily' && (
              <div id="daily-panel" className="max-h-[540px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>اليوم</TableHead>
                      <TableHead className="text-center">الحضور</TableHead>
                      <TableHead className="text-center">الغياب</TableHead>
                      <TableHead className="text-center">عارضة</TableHead>
                      <TableHead className="text-center">بإذن</TableHead>
                      <TableHead className="text-center">بدون إذن</TableHead>
                      <TableHead className="text-center">مرضي</TableHead>
                      <TableHead className="text-center">نسبة الحضور</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(attendance.daily || []).length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={9}
                          className="py-8 text-center text-xs text-muted-foreground"
                        >
                          لا توجد بيانات يومية
                        </TableCell>
                      </TableRow>
                    ) : (
                      attendance.daily.map((d) => (
                        <TableRow key={d.date}>
                          <TableCell className="font-semibold">{fmtDate(d.date)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {weekdayArabic(d.date)}
                          </TableCell>
                          <TableCell className="text-center text-emerald-600 dark:text-emerald-400 font-semibold">
                            {fmtDecimal(d.present)}
                          </TableCell>
                          <TableCell className="text-center text-destructive font-semibold">
                            {fmtDecimal(d.absent)}
                          </TableCell>
                          <TableCell className="text-center">{fmtDecimal(d.casual)}</TableCell>
                          <TableCell className="text-center">{fmtDecimal(d.permission)}</TableCell>
                          <TableCell className="text-center text-destructive">
                            {fmtDecimal(d.unauthorized)}
                          </TableCell>
                          <TableCell className="text-center">{fmtDecimal(d.medical)}</TableCell>
                          <TableCell className="text-center font-bold">
                            {fmtWholePercent(d.attendance_rate)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {activeTableTab === 'companies' && (
              <div className="max-h-[540px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الشركة</TableHead>
                      <TableHead className="text-center">الموظفون</TableHead>
                      <TableHead className="text-center">الحضور</TableHead>
                      <TableHead className="text-center">الغياب</TableHead>
                      <TableHead className="text-center">حضور خريجين</TableHead>
                      <TableHead className="text-center">غياب خريجين</TableHead>
                      <TableHead className="text-center">حضور طلاب</TableHead>
                      <TableHead className="text-center">غياب طلاب</TableHead>
                      <TableHead className="text-center">نسبة الحضور</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(attendance.companies || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-8 text-center text-xs text-muted-foreground">
                          لا توجد بيانات متاحة
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {attendance.companies.map((c) => {
                          const t = c.present + c.absent;
                          const rate = t ? (c.present / t) * 100 : 0;
                          return (
                            <TableRow key={c.name}>
                              <TableCell className="font-bold">{c.name}</TableCell>
                              <TableCell className="text-center">{fmtDecimal(c.employee_count)}</TableCell>
                              <TableCell className="text-center text-emerald-600 dark:text-emerald-400 font-semibold">
                                {fmtDecimal(c.present)}
                              </TableCell>
                              <TableCell className="text-center text-destructive font-semibold">
                                {fmtDecimal(c.absent)}
                              </TableCell>
                              <TableCell className="text-center">{fmtDecimal(c.graduate_present)}</TableCell>
                              <TableCell className="text-center">{fmtDecimal(c.graduate_absent)}</TableCell>
                              <TableCell className="text-center">{fmtDecimal(c.student_present)}</TableCell>
                              <TableCell className="text-center">{fmtDecimal(c.student_absent)}</TableCell>
                              <TableCell className="text-center font-bold">{fmtWholePercent(rate)}</TableCell>
                            </TableRow>
                          );
                        })}
                        {(() => {
                          const sum = attendance.companies.reduce(
                            (acc, c) => ({
                              emp: acc.emp + c.employee_count,
                              p: acc.p + c.present,
                              a: acc.a + c.absent,
                              gp: acc.gp + c.graduate_present,
                              ga: acc.ga + c.graduate_absent,
                              sp: acc.sp + c.student_present,
                              sa: acc.sa + c.student_absent,
                            }),
                            { emp: 0, p: 0, a: 0, gp: 0, ga: 0, sp: 0, sa: 0 }
                          );
                          const tt = sum.p + sum.a;
                          const rate = tt ? (sum.p / tt) * 100 : 0;
                          return (
                            <TableRow className="bg-muted/50 font-bold">
                              <TableCell>الإجمالي</TableCell>
                              <TableCell className="text-center">{fmtDecimal(sum.emp)}</TableCell>
                              <TableCell className="text-center text-emerald-600 dark:text-emerald-400">
                                {fmtDecimal(sum.p)}
                              </TableCell>
                              <TableCell className="text-center text-destructive">
                                {fmtDecimal(sum.a)}
                              </TableCell>
                              <TableCell className="text-center">{fmtDecimal(sum.gp)}</TableCell>
                              <TableCell className="text-center">{fmtDecimal(sum.ga)}</TableCell>
                              <TableCell className="text-center">{fmtDecimal(sum.sp)}</TableCell>
                              <TableCell className="text-center">{fmtDecimal(sum.sa)}</TableCell>
                              <TableCell className="text-center">{fmtWholePercent(rate)}</TableCell>
                            </TableRow>
                          );
                        })()}
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Employee Personal Home Workspace
// ---------------------------------------------------------------------------
function EmployeeSelfHomeView({
  userId,
  userName,
  publicConfig,
}: {
  userId?: number;
  userName?: string;
  isEmployee: boolean;
  publicConfig: PublicSystemConfigPayload | null;
}) {
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedStage, setSelectedStage] = useState('__ALL__');
  const [data, setData] = useState<EmployeeDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const cycleStartDay = publicConfig?.payroll?.cycleStartDay ?? 21;
  const cycleEndDay = publicConfig?.payroll?.cycleEndDay ?? 20;
  const allowEmployeeExport = publicConfig?.displayAndFeatures?.allowEmployeeExport ?? true;
  const showBonusAndDeductions =
    publicConfig?.displayAndFeatures?.showBonusAndDeductionsToEmployee ?? true;
  const payrollPortalUrl =
    publicConfig?.financialFormLinks?.payrollPortalUrl || 'https://ziadkhaled14.pythonanywhere.com/';
  const workRegulationsUrl =
    publicConfig?.financialFormLinks?.workRegulationsUrl ||
    'https://drive.google.com/file/d/1c4Af3qdLm3dROQeAYOCe8kUlEDGclPA8/view';

  const loadSelf = useCallback(
    async (f: string, t: string, stageVal: string) => {
      if (!userId) return;
      if (f && t && f > t) {
        toast.error('تاريخ البداية يجب أن يسبق تاريخ النهاية.');
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (f) params.set('from', f);
        if (t) params.set('to', t);
        if (stageVal && stageVal !== '__ALL__') params.set('stage', stageVal);
        if (f && t) {
          const cf = payrollCycle(f, cycleStartDay, cycleEndDay).monthKey;
          const ct = payrollCycle(t, cycleStartDay, cycleEndDay).monthKey;
          if (cf === ct) params.set('month', cf);
        }
        const res = await api<EmployeeDetailPayload>(`/api/employee/${userId}?${params}`);
        setData(res);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'تعذر تحميل بياناتك');
      } finally {
        setLoading(false);
      }
    },
    [userId, cycleStartDay, cycleEndDay]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [stRes, dtRes] = await Promise.all([
          api<{ stages: string[] }>('/api/employee/stages'),
          api<{ dates: string[] }>('/api/employee/dates'),
        ]);
        if (!active) return;

        const dts = dtRes.dates || [];
        setAvailableDates(dts);
        setStages((stRes.stages || []).filter((s) => String(s).trim() !== 'الحضور'));

        let initFrom = '';
        let initTo = '';
        if (dts.length) {
          const first = dts[0];
          const last = dts[dts.length - 1];
          const c = payrollCycle(last, cycleStartDay, cycleEndDay);
          initFrom = c.start < first ? first : c.start;
          initTo = c.end > last ? last : c.end;
          setFrom(initFrom);
          setTo(initTo);
        }
        await loadSelf(initFrom, initTo, '__ALL__');
      } catch (err) {
        if (active) {
          toast.error(err instanceof ApiError ? err.message : 'تعذر تحميل البيانات');
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [loadSelf, cycleStartDay, cycleEndDay]);

  return (
    <div className="space-y-5">
      {/* Greeting & Period Filter Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/70 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
            مرحباً، {data?.employee?.name || userName}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            متابعة سجل حضورك، نسب التارجت، والخدمات الإلكترونية في مكان واحد
          </p>
        </div>

        {/* Employee Period Filter */}
        <div className="flex flex-wrap items-center gap-2 no-print">
          <div className="w-40">
            <DatePicker
              value={from}
              min={availableDates[0] || undefined}
              max={availableDates[availableDates.length - 1] || undefined}
              onChange={setFrom}
              placeholder="من تاريخ"
              className="text-xs"
            />
          </div>
          <div className="w-40">
            <DatePicker
              value={to}
              min={availableDates[0] || undefined}
              max={availableDates[availableDates.length - 1] || undefined}
              onChange={setTo}
              placeholder="إلى تاريخ"
              className="text-xs"
            />
          </div>
          <div className="w-40">
            <NativeSelect
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="h-9 text-xs"
            >
              <option value="__ALL__">كل المراحل</option>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-9"
            onClick={() => loadSelf(from, to, selectedStage)}
            disabled={loading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            <span>تحديث</span>
          </Button>
        </div>
      </div>

      {/* Quick Employee Service Links Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 no-print">
        <Link
          to="/requests.html"
          className="group flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 transition-colors hover:border-primary/60 hover:bg-primary/10"
        >
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-bold text-primary truncate">
              بوابة الطلبات والخدمات
            </div>
            <div className="text-[11px] text-muted-foreground truncate mt-0.5">
              تقديم ومتابعة الإجازات والمستحقات والسلف
            </div>
          </div>
          <FileText className="h-4 w-4 text-primary shrink-0" />
        </Link>
        {[
          {
            title: 'بوابة المرتبات',
            sub: 'عرض بيانات المرتب والخدمات المالية',
            href: payrollPortalUrl,
          },
          {
            title: 'لائحة العمل',
            sub: 'مراجعة لوائح وسياسات العمل الداخلية',
            href: workRegulationsUrl,
          },
        ].map((item) => (
          <a
            key={item.title}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-muted/30"
          >
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
                {item.title}
              </div>
              <div className="text-[11px] text-muted-foreground truncate mt-0.5">{item.sub}</div>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
          </a>
        ))}
      </div>

      {/* Shared Upgraded Employee Performance Section */}
      {loading && !data ? (
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-xl" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : (
        data && (
          <EmployeePerformanceSection
            data={data}
            from={from}
            to={to}
            selectedStage={selectedStage}
            showExportActions={allowEmployeeExport}
            showBonusAndDeductions={showBonusAndDeductions}
            isSelfView
          />
        )
      )}
    </div>
  );
}
