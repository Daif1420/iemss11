import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpDown,
  Award,
  BarChart3,
  Clock,
  FileText,
  Percent,
  Search,
  Trophy,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/layout/AppShell';
import { ExportActionButton } from '@/components/shared/ExportButtons';
import { IemsLogo } from '@/components/shared/IemsLogo';
import { KpiCard } from '@/components/shared/KpiCard';
import { MultiFilterPopover } from '@/components/shared/MultiFilterPopover';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/lib/api';
import { exportReportExcel, exportReportPdf } from '@/lib/export';
import { fmtDecimal, fmtNumber, fmtPercent, payrollCycle } from '@/lib/format';
import { normalizeReportsAndSheetsConfig } from '@/lib/systemConfig';
import { cn } from '@/lib/utils';
import type {
  DashboardPayload,
  PublicSystemConfigPayload,
  ReportResult,
  Top5Row,
} from '@/types/iems';

type SortKey =
  | 'name'
  | 'company'
  | 'shift'
  | 'stage_target'
  | 'sheet_target'
  | 'achievement_pct';
type QuickPeriodKey = 'today' | 'week' | 'cycle' | 'all' | 'custom';

function fmtEnDate(iso?: string | null) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  return y && m && d ? `${y}-${m}-${d}` : String(iso);
}

function fmtEnNum(val?: number | null) {
  return Number(val || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function ReportsPage() {
  const { user, isAdminUp, publicConfig: authPublicConfig } = useAuth();
  const navigate = useNavigate();

  const [stages, setStages] = useState<string[]>([]);
  const [shifts, setShifts] = useState<string[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [activePeriod, setActivePeriod] = useState<QuickPeriodKey>('week');
  const [selectedStage, setSelectedStage] = useState('');
  const [selectedShifts, setSelectedShifts] = useState<string[]>([]);

  const [running, setRunning] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<ReportResult | null>(null);
  const [generatedAt, setGeneratedAt] = useState('');

  const [top5Loading, setTop5Loading] = useState(false);
  const [top5Data, setTop5Data] = useState<DashboardPayload | null>(null);

  const [tableSearch, setTableSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('stage_target');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [publicConfig, setPublicConfig] = useState<PublicSystemConfigPayload | null>(null);

  const activePublicConfig = authPublicConfig ?? publicConfig;
  const reportCfg = useMemo(
    () => normalizeReportsAndSheetsConfig(activePublicConfig?.reportsAndSheets),
    [activePublicConfig]
  );

  const canExport = isAdminUp || (activePublicConfig?.displayAndFeatures?.allowSupervisorExport ?? true);
  const previewTextAlign =
    reportCfg.tableAlignH === 'left'
      ? 'text-left'
      : reportCfg.tableAlignH === 'right'
        ? 'text-right'
        : 'text-center';
  const previewJustifyAlign =
    reportCfg.tableAlignH === 'left'
      ? 'justify-start'
      : reportCfg.tableAlignH === 'right'
        ? 'justify-end'
        : 'justify-center';
  const previewVertAlign =
    reportCfg.tableAlignV === 'top'
      ? 'align-top'
      : reportCfg.tableAlignV === 'bottom'
        ? 'align-bottom'
        : 'align-middle';
  const sheetPadClass =
    reportCfg.reportSize === 'compact'
      ? 'p-4 sm:p-5'
      : reportCfg.reportSize === 'large'
        ? 'p-6 sm:p-10'
        : 'p-5 sm:p-8';
  const previewTableTextClass =
    reportCfg.reportSize === 'compact'
      ? 'text-[10px]'
      : reportCfg.reportSize === 'large'
        ? 'text-xs'
        : 'text-[11px]';
  const previewThPadClass =
    reportCfg.reportSize === 'compact'
      ? 'py-1.5 px-1.5'
      : reportCfg.reportSize === 'large'
        ? 'py-2.5 px-2.5'
        : 'py-2 px-2';
  const previewTdPadClass =
    reportCfg.reportSize === 'compact'
      ? 'py-1 px-1.5'
      : reportCfg.reportSize === 'large'
        ? 'py-2 px-2.5'
        : 'py-1.5 px-2';

  const minDate = availableDates[0] || '';
  const maxDate = availableDates[availableDates.length - 1] || '';

  const executeReportAndTop5 = useCallback(
    async (f: string, t: string, stg: string, shfts: string[]) => {
      if (!f || !t) {
        setErrorMsg('من فضلك حدد فترة التاريخ (من - إلى).');
        return;
      }
      if (f > t) {
        setErrorMsg('تاريخ البداية يجب أن يكون قبل تاريخ النهاية.');
        return;
      }
      if (!stg) {
        setErrorMsg('من فضلك اختر مرحلة واحدة لعرض التقرير.');
        return;
      }

      setErrorMsg('');
      setRunning(true);
      setTop5Loading(true);

      try {
        const repQ = new URLSearchParams({ from: f, to: t, stage: stg });
        if (isAdminUp) {
          shfts.forEach((s) => repQ.append('shift', s));
        }

        const dashQ = new URLSearchParams({ from: f, to: t, stage: stg });
        if (isAdminUp) {
          shfts.forEach((s) => dashQ.append('shift', s));
        }

        const [reportRes, dashRes] = await Promise.all([
          api<ReportResult>(`/api/admin/report/attendance?${repQ.toString()}`),
          api<DashboardPayload>(`/api/employee/dashboard?${dashQ.toString()}`).catch(() => null),
        ]);

        setResult(reportRes);
        setTop5Data(dashRes);
        setGeneratedAt(
          new Date().toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        );
      } catch (err) {
        setResult(null);
        setErrorMsg(err instanceof ApiError ? err.message : 'تعذر إنشاء التقرير');
      } finally {
        setRunning(false);
        setTop5Loading(false);
      }
    },
    [isAdminUp]
  );

  useEffect(() => {
    let active = true;
    async function init() {
      setMetaLoading(true);
      try {
        const [stageRes, shiftRes, dateRes, cfgRes] = await Promise.all([
          api<{ stages: string[] }>('/api/admin/report/stages'),
          api<{ shifts: string[] }>('/api/employee/shifts'),
          api<{ dates: string[] }>('/api/employee/dates'),
          api<PublicSystemConfigPayload>('/api/admin/system/public-config').catch(() => null),
        ]);
        if (!active) return;
        if (cfgRes) setPublicConfig(cfgRes);

        const cleanStages = (stageRes.stages || []).filter(
          (s) => String(s).trim() !== 'الحضور'
        );
        setStages(cleanStages);
        const defaultStage = cleanStages[0] || '';
        setSelectedStage(defaultStage);

        if (isAdminUp) {
          setShifts(shiftRes.shifts || []);
        } else {
          const supShifts = user?.supervisorShifts?.length
            ? user.supervisorShifts
            : user?.shift
              ? [user.shift]
              : [];
          setShifts(supShifts);
        }

        const dates = dateRes.dates || [];
        setAvailableDates(dates);
        if (dates.length && defaultStage) {
          const defaultTo = dates[dates.length - 1];
          const defaultFrom = dates[Math.max(0, dates.length - 7)];
          setFrom(defaultFrom);
          setTo(defaultTo);
          await executeReportAndTop5(defaultFrom, defaultTo, defaultStage, []);
        }
      } catch (err) {
        if (!active) return;
        toast.error(err instanceof ApiError ? err.message : 'تعذر تحميل فلاتر التقارير');
      } finally {
        if (active) setMetaLoading(false);
      }
    }
    init();
    return () => {
      active = false;
    };
  }, [isAdminUp, user?.shift, user?.supervisorShifts, executeReportAndTop5]);

  const applyQuickRange = (kind: Exclude<QuickPeriodKey, 'custom'>) => {
    const anchor = maxDate || to || new Date().toISOString().slice(0, 10);
    let nextFrom = anchor;
    let nextTo = anchor;

    if (kind === 'all') {
      nextFrom = minDate || anchor;
      nextTo = maxDate || anchor;
    } else if (kind === 'today') {
      nextFrom = anchor;
      nextTo = anchor;
    } else if (kind === 'week') {
      const d = new Date(`${anchor}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 6);
      const iso = d.toISOString().slice(0, 10);
      nextFrom = minDate && iso < minDate ? minDate : iso;
      nextTo = anchor;
    } else if (kind === 'cycle') {
      const cyc = payrollCycle(
        anchor,
        activePublicConfig?.payroll?.cycleStartDay,
        activePublicConfig?.payroll?.cycleEndDay,
        reportCfg.monthDaysCount
      );
      nextFrom = minDate && cyc.start < minDate ? minDate : cyc.start;
      nextTo = maxDate && cyc.end > maxDate ? maxDate : cyc.end;
    }

    setActivePeriod(kind);
    setFrom(nextFrom);
    setTo(nextTo);
    if (selectedStage) {
      executeReportAndTop5(nextFrom, nextTo, selectedStage, selectedShifts);
    }
  };

  const handleStageChange = (nextStage: string) => {
    setSelectedStage(nextStage);
    if (from && to && nextStage) {
      executeReportAndTop5(from, to, nextStage, selectedShifts);
    }
  };

  const handleExportPdf = async () => {
    if (!result || !result.employees.length) return;
    setExportingPdf(true);
    try {
      await exportReportPdf(result, user?.name || '—');
      toast.success('تم تصدير تقرير PDF بنجاح');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تصدير PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  const filteredAndSortedRows = useMemo(() => {
    if (!result?.employees) return [];
    const q = tableSearch.trim().toLowerCase();
    const list = q
      ? result.employees.filter(
          (e) =>
            String(e.name || '').toLowerCase().includes(q) ||
            String(e.company || '').toLowerCase().includes(q) ||
            String(e.shift || '').toLowerCase().includes(q) ||
            String(e.id).includes(q)
        )
      : [...result.employees];

    list.sort((a, b) => {
      if (sortKey === 'stage_target' || sortKey === 'sheet_target' || sortKey === 'achievement_pct') {
        const va = Number(a[sortKey] ?? -1);
        const vb = Number(b[sortKey] ?? -1);
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      const va = String(a[sortKey] || '');
      const vb = String(b[sortKey] || '');
      return sortDir === 'asc' ? va.localeCompare(vb, 'en') : vb.localeCompare(va, 'en');
    });
    return list;
  }, [result, tableSearch, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(
        key === 'stage_target' || key === 'sheet_target' || key === 'achievement_pct'
          ? 'desc'
          : 'asc'
      );
    }
  };

  // Top 5 rows specifically for the active single stage
  const activeTop5Rows: Top5Row[] = useMemo(() => {
    if (!top5Data) return [];
    if (top5Data.selectedTop5?.length) return top5Data.selectedTop5;
    const groups = top5Data.top5ByStage || {};
    const stageKey = result?.stage || selectedStage;
    if (stageKey && groups[stageKey]?.length) return groups[stageKey];
    const firstNonEmpty = Object.values(groups).find((rows) => rows && rows.length > 0);
    return firstNonEmpty || [];
  }, [top5Data, result?.stage, selectedStage]);

  // Executive KPIs computed cleanly for the selected stage
  const metrics = useMemo(() => {
    const rows = result?.employees || [];
    const totalEmployees = rows.length;
    const totalSum = rows.reduce((acc, r) => acc + (Number(r.stage_target) || 0), 0);
    const pctRows = rows.filter(
      (r) => r.achievement_pct !== null && r.achievement_pct !== undefined && Number.isFinite(Number(r.achievement_pct))
    );
    const avgPct = pctRows.length
      ? pctRows.reduce((acc, r) => acc + Number(r.achievement_pct || 0), 0) / pctRows.length
      : null;
    const topEmployee = rows.reduce<(typeof rows)[0] | null>((best, cur) => {
      if (!best || (Number(cur.stage_target) || 0) > (Number(best.stage_target) || 0)) return cur;
      return best;
    }, null);
    return { totalEmployees, totalSum, avgPct, targetedCount: pctRows.length, topEmployee };
  }, [result]);

  const shiftTotals = result?.shift_totals || [];
  const maxShiftTotal = Math.max(...shiftTotals.map((s) => s.total), 1);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Top Header + Quick Period Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 no-print">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
              تقارير أداء المراحل
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              استخراج تقرير مرحلة واحدة مع احتساب نسبة التحقق من تارجت الشيت وتصديره باللغة الإنجليزية
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-border bg-card p-1">
              {(
                [
                  ['today', 'اليوم'],
                  ['week', '7 أيام'],
                  ['cycle', 'الدورة الحالية'],
                  ['all', 'كل البيانات'],
                ] as [Exclude<QuickPeriodKey, 'custom'>, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  disabled={metaLoading || running}
                  onClick={() => applyQuickRange(k)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap',
                    activePeriod === k
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Single-Stage Report Filter Bar */}
        <Card className="no-print">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-2 space-y-1.5">
                <Label htmlFor="rep-from" className="text-xs">من تاريخ</Label>
                <DatePicker
                  id="rep-from"
                  value={from}
                  min={minDate || undefined}
                  max={maxDate || undefined}
                  onChange={(val) => {
                    setActivePeriod('custom');
                    setFrom(val);
                  }}
                  placeholder="من تاريخ"
                  className="text-xs"
                />
              </div>

              <div className="lg:col-span-2 space-y-1.5">
                <Label htmlFor="rep-to" className="text-xs">إلى تاريخ</Label>
                <DatePicker
                  id="rep-to"
                  value={to}
                  min={minDate || undefined}
                  max={maxDate || undefined}
                  onChange={(val) => {
                    setActivePeriod('custom');
                    setTo(val);
                  }}
                  placeholder="إلى تاريخ"
                  className="text-xs"
                />
              </div>

              {isAdminUp && (
                <div className="lg:col-span-2 space-y-1.5">
                  <Label className="text-xs">الشيفت</Label>
                  <MultiFilterPopover
                    label="الشيفت"
                    allLabel="كل الشيفتات"
                    options={shifts.map((s) => ({ value: s, label: `Shift ${s}` }))}
                    selected={selectedShifts}
                    onChange={setSelectedShifts}
                    disabled={metaLoading}
                  />
                </div>
              )}

              <div className={cn(isAdminUp ? 'lg:col-span-4' : 'lg:col-span-6', 'space-y-1.5')}>
                <Label htmlFor="rep-stage" className="text-xs">
                  المرحلة المطلوبة (مرحلة واحدة فقط)
                </Label>
                <NativeSelect
                  id="rep-stage"
                  value={selectedStage}
                  disabled={metaLoading || stages.length === 0}
                  onChange={(e) => handleStageChange(e.target.value)}
                  className="h-9 text-xs font-bold"
                >
                  {stages.length === 0 ? (
                    <option value="">لا توجد مراحل متاحة</option>
                  ) : (
                    stages.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))
                  )}
                </NativeSelect>
              </div>

              <div className="lg:col-span-2">
                <Button
                  type="button"
                  onClick={() => executeReportAndTop5(from, to, selectedStage, selectedShifts)}
                  disabled={running || metaLoading || !selectedStage}
                  className="w-full h-9 text-xs font-bold"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  <span>{running ? 'جارٍ التحديث...' : 'عرض التقرير'}</span>
                </Button>
              </div>
            </div>

            {errorMsg && (
              <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
                {errorMsg}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Executive Single-Stage KPI Strip */}
        {running && !result ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 no-print">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          result && (
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 no-print">
              <KpiCard
                label="الموظفون بالمرحلة"
                value={fmtNumber(metrics.totalEmployees)}
                sub={result.stage}
                icon={Users}
                tone="primary"
              />
              <KpiCard
                label="إجمالي الإنجاز المحقق"
                value={fmtDecimal(metrics.totalSum)}
                sub={`${fmtEnDate(result.from)} → ${fmtEnDate(result.to)}`}
                icon={BarChart3}
                tone="success"
              />
              <KpiCard
                label="متوسط نسبة التحقق"
                value={metrics.avgPct !== null ? `${metrics.avgPct.toFixed(1)}%` : '—'}
                sub={
                  metrics.targetedCount
                    ? `محسوبة من تارجت الشيت (${metrics.targetedCount} موظف)`
                    : 'لا يوجد تارجت مسجل بالشيت'
                }
                icon={Percent}
                tone="default"
              />
              <KpiCard
                label="الأعلى تحقيقاً بالمرحلة"
                value={metrics.topEmployee ? fmtDecimal(metrics.topEmployee.stage_target) : '—'}
                sub={
                  metrics.topEmployee
                    ? `${metrics.topEmployee.name}${
                        metrics.topEmployee.achievement_pct != null
                          ? ` (${metrics.topEmployee.achievement_pct.toFixed(1)}%)`
                          : ''
                      }`
                    : 'لا توجد بيانات'
                }
                icon={Trophy}
                tone="warning"
                onClick={
                  metrics.topEmployee
                    ? () => navigate(`/employee.html?id=${metrics.topEmployee!.id}`)
                    : undefined
                }
              />
            </section>
          )
        )}

        {/* RTL Workspace: Right Panel (Top 5 + Shift Breakdown = col 1) | Left Panel (English Report Preview = col 2) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Column 1 (Appears on the RIGHT in RTL desktop): Top 5 + Shift Distribution */}
          <div className="xl:col-span-4 order-2 xl:order-1 space-y-4 no-print">
            {/* Top 5 Leaderboard */}
            <Card>
              <CardHeader className="pb-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm font-bold">
                      أفضل 5 موظفين ({result?.stage || selectedStage || '—'})
                    </CardTitle>
                  </div>
                  <Award className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardDescription className="text-[11px] tabular-nums">
                  {top5Data?.range?.from && top5Data?.range?.to
                    ? `${fmtEnDate(top5Data.range.from)} → ${fmtEnDate(top5Data.range.to)}`
                    : 'متزامن مع المرحلة والفترة المحددة'}
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-0">
                {top5Loading ? (
                  <div className="space-y-2.5 pt-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full rounded-lg" />
                    ))}
                  </div>
                ) : activeTop5Rows.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    لا توجد بيانات Top 5 في النطاق المحدد
                  </div>
                ) : (
                  <div className="divide-y divide-border/70">
                    {activeTop5Rows.slice(0, 5).map((r, i) => {
                      const rank = r.rank || i + 1;
                      return (
                        <div
                          key={`${selectedStage}-${r.id}`}
                          className="flex items-center justify-between gap-2 py-2.5 first:pt-1 last:pb-1"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={cn(
                                'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-extrabold tabular-nums',
                                rank === 1
                                  ? 'bg-[#065BAB] text-white'
                                  : rank === 2
                                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                    : 'bg-secondary text-foreground'
                              )}
                            >
                              {rank}
                            </span>
                            <div className="min-w-0">
                              <Link
                                to={`/employee.html?id=${r.id}`}
                                className="block truncate text-xs font-bold hover:text-primary hover:underline"
                              >
                                {r.name}
                              </Link>
                              <span className="block text-[11px] text-muted-foreground tabular-nums">
                                #{r.id} · Shift {r.shift || '—'}
                              </span>
                            </div>
                          </div>
                          <span className="text-sm font-extrabold text-foreground tabular-nums shrink-0">
                            {fmtDecimal(r.achieved)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Shift Comparison Card (Only if shifts exist for stage) */}
            {result && shiftTotals.length > 0 && (
              <Card>
                <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      <span>توزيع الشيفتات بالمرحلة</span>
                    </CardTitle>
                    <CardDescription className="text-[11px]">
                      مقارنة مساهمة كل شيفت ومتوسط إنتاج الموظف
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {shiftTotals.map((sh) => {
                    const share = metrics.totalSum ? (sh.total / metrics.totalSum) * 100 : 0;
                    const barPct = (sh.total / maxShiftTotal) * 100;
                    const avgPerEmp = sh.employee_count ? sh.total / sh.employee_count : 0;
                    return (
                      <div key={sh.shift} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs tabular-nums">
                          <div>
                            <span className="font-extrabold text-foreground">Shift {sh.shift}</span>
                            <span className="text-[11px] text-muted-foreground mr-2">
                              ({sh.employee_count} موظف · متوسط {fmtDecimal(avgPerEmp)})
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground">
                              {fmtPercent(share / 100)}
                            </span>
                            <span className="font-extrabold text-foreground">
                              {fmtDecimal(sh.total)}
                            </span>
                          </div>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-[#065BAB] dark:bg-blue-500 transition-all"
                            style={{ width: `${Math.max(4, Math.min(100, barPct))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Column 2 (Appears on the LEFT in RTL desktop): Official English Report Preview */}
          <div className="xl:col-span-8 order-1 xl:order-2 space-y-3">
            {/* Sheet Toolbar: Search + Export */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 no-print">
              <div className="relative w-full sm:w-64">
                <Search className="h-3.5 w-3.5 text-muted-foreground absolute right-3 top-2.5" />
                <Input
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="بحث داخل التقرير..."
                  className="h-8 pr-8 text-xs bg-card"
                />
              </div>

              {canExport && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <ExportActionButton
                    kind="excel"
                    disabled={!result || !result.employees.length}
                    onClick={() => result && exportReportExcel(result)}
                  />
                  <ExportActionButton
                    kind="pdf"
                    disabled={!result || !result.employees.length}
                    loading={exportingPdf}
                    onClick={handleExportPdf}
                  />
                  <ExportActionButton
                    kind="print"
                    disabled={!result || !result.employees.length}
                    onClick={() => window.print()}
                  />
                </div>
              )}
            </div>

            {running ? (
              <Card>
                <CardContent className="p-8 space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-64 w-full" />
                </CardContent>
              </Card>
            ) : !result ? (
              <Card className="no-print">
                <CardContent className="py-16 px-6 text-center space-y-2">
                  <FileText className="h-9 w-9 text-muted-foreground/50 mx-auto" />
                  <p className="text-sm font-semibold text-foreground">لا توجد بيانات للتقرير</p>
                  <p className="text-xs text-muted-foreground">
                    اختر المرحلة واضغط «عرض التقرير» لتحميل السجلات.
                  </p>
                </CardContent>
              </Card>
            ) : (
              /* Crisp LTR English Report Sheet matching reference ARMS PDF */
              <div
                dir="ltr"
                style={{
                  fontFamily: '"Plus Jakarta Sans", "Cairo", system-ui, sans-serif',
                  fontVariantNumeric: 'normal',
                }}
                className={cn(
                  'w-full bg-white text-[#0F172A] rounded-md border border-[#CBD5E1] shadow-xs print:max-w-none print:border-0 print:shadow-none print:p-0',
                  sheetPadClass
                )}
              >
                {/* 3-Column Header: Intercom Left | Title Center | Balanced IEMS Logo Right */}
                <div className="grid grid-cols-[112px_1fr_112px] sm:grid-cols-[195px_1fr_195px] items-center pb-1 mb-3.5">
                  <div className="flex items-center justify-start">
                    <img
                      src="/logo.png"
                      alt="Intercom"
                      className="h-6 sm:h-8 w-auto object-contain"
                    />
                  </div>
                  <div className="text-center">
                    <h2 className="text-sm sm:text-lg font-bold text-[#0F172A] tracking-tight leading-tight">
                      Employee Performance Report
                    </h2>
                  </div>
                  <div className="flex items-center justify-end">
                    <IemsLogo variant="light" size="md" />
                  </div>
                </div>

                {/* Rounded Metadata Box */}
                <div className="w-full rounded-[6px] border border-[#CBD5E1] bg-[#FAFBFD] px-4 py-3 grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-x-6 gap-y-1.5 text-[11px] text-[#0F172A]">
                  <div className="flex items-center gap-2">
                    <span className="text-[#475569] font-medium min-w-[82px] shrink-0">Scope :</span>
                    <span className="font-bold">
                      {result.stage} · {fmtEnDate(result.from)} to {fmtEnDate(result.to)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#475569] font-medium min-w-[82px] shrink-0">
                      Print Date :
                    </span>
                    <span className="font-bold">{generatedAt || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#475569] font-medium min-w-[82px] shrink-0">Total :</span>
                    <span className="font-bold">
                      {filteredAndSortedRows.length} Employees · Achieved {fmtEnNum(metrics.totalSum)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#475569] font-medium min-w-[82px] shrink-0">
                      Prepared By :
                    </span>
                    <span className="font-bold">{user?.name || '—'}</span>
                  </div>
                </div>

                <div className="border-t border-[#CBD5E1] my-3.5" />

                {/* Clean English Table matching ARMS reference PDF */}
                {filteredAndSortedRows.length === 0 ? (
                  <div className="py-12 text-center text-sm text-[#64748B] border border-[#CBD5E1] rounded">
                    No matching employee records found for this stage and period.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className={cn('w-full border-collapse', previewTableTextClass)}>
                      <thead>
                        <tr className="bg-[#E5E7EB] text-[#111827]">
                          <th
                            className={cn(
                              'border border-[#CBD5E1] font-bold w-10',
                              previewThPadClass,
                              previewTextAlign,
                              previewVertAlign
                            )}
                          >
                            #
                          </th>
                          <th
                            className={cn(
                              'border border-[#CBD5E1] font-bold',
                              previewThPadClass,
                              previewTextAlign,
                              previewVertAlign
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort('name')}
                              className={cn('w-full inline-flex items-center gap-1 cursor-pointer hover:underline', previewJustifyAlign)}
                            >
                              <span>Employee</span>
                              <ArrowUpDown className="h-3 w-3 opacity-60 no-print" />
                            </button>
                          </th>
                          <th
                            className={cn(
                              'border border-[#CBD5E1] font-bold',
                              previewThPadClass,
                              previewTextAlign,
                              previewVertAlign
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort('company')}
                              className={cn('w-full inline-flex items-center gap-1 cursor-pointer hover:underline', previewJustifyAlign)}
                            >
                              <span>Company</span>
                              <ArrowUpDown className="h-3 w-3 opacity-60 no-print" />
                            </button>
                          </th>
                          <th
                            className={cn(
                              'border border-[#CBD5E1] font-bold w-14',
                              previewThPadClass,
                              previewTextAlign,
                              previewVertAlign
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort('shift')}
                              className={cn('w-full inline-flex items-center gap-1 cursor-pointer hover:underline', previewJustifyAlign)}
                            >
                              <span>Shift</span>
                              <ArrowUpDown className="h-3 w-3 opacity-60 no-print" />
                            </button>
                          </th>
                          <th
                            className={cn(
                              'border border-[#CBD5E1] font-bold w-24',
                              previewThPadClass,
                              previewTextAlign,
                              previewVertAlign
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort('stage_target')}
                              className={cn('w-full inline-flex items-center gap-1 cursor-pointer hover:underline', previewJustifyAlign)}
                            >
                              <span>Achieved</span>
                              <ArrowUpDown className="h-3 w-3 opacity-60 no-print" />
                            </button>
                          </th>
                          <th
                            className={cn(
                              'border border-[#CBD5E1] font-bold w-20',
                              previewThPadClass,
                              previewTextAlign,
                              previewVertAlign
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort('sheet_target')}
                              className={cn('w-full inline-flex items-center gap-1 cursor-pointer hover:underline', previewJustifyAlign)}
                            >
                              <span>Target</span>
                              <ArrowUpDown className="h-3 w-3 opacity-60 no-print" />
                            </button>
                          </th>
                          <th
                            className={cn(
                              'border border-[#CBD5E1] font-bold w-16',
                              previewThPadClass,
                              previewTextAlign,
                              previewVertAlign
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort('achievement_pct')}
                              className={cn('w-full inline-flex items-center gap-1 cursor-pointer hover:underline', previewJustifyAlign)}
                            >
                              <span>%</span>
                              <ArrowUpDown className="h-3 w-3 opacity-60 no-print" />
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAndSortedRows.map((emp, idx) => {
                          const pct = emp.achievement_pct;
                          return (
                            <tr
                              key={emp.id}
                              className={idx % 2 === 1 ? 'bg-[#F4F7FA]' : 'bg-white'}
                            >
                              <td
                                className={cn(
                                  'border border-[#CBD5E1] font-semibold text-[#1E293B]',
                                  previewTdPadClass,
                                  previewTextAlign,
                                  previewVertAlign
                                )}
                              >
                                {idx + 1}
                              </td>
                              <td
                                className={cn(
                                  'border border-[#CBD5E1] font-semibold text-[#0F172A]',
                                  previewTdPadClass,
                                  previewTextAlign,
                                  previewVertAlign
                                )}
                              >
                                <Link
                                  to={`/employee.html?id=${emp.id}`}
                                  className={cn('inline-flex w-full items-center hover:underline', previewJustifyAlign)}
                                >
                                  {emp.name}
                                </Link>
                              </td>
                              <td
                                className={cn(
                                  'border border-[#CBD5E1] text-[#1E293B]',
                                  previewTdPadClass,
                                  previewTextAlign,
                                  previewVertAlign
                                )}
                              >
                                {emp.company || '—'}
                              </td>
                              <td
                                className={cn(
                                  'border border-[#CBD5E1] text-[#1E293B]',
                                  previewTdPadClass,
                                  previewTextAlign,
                                  previewVertAlign
                                )}
                              >
                                {emp.shift || '—'}
                              </td>
                              <td
                                className={cn(
                                  'border border-[#CBD5E1] font-bold text-[#0F172A]',
                                  previewTdPadClass,
                                  previewTextAlign,
                                  previewVertAlign
                                )}
                              >
                                {fmtEnNum(emp.stage_target)}
                              </td>
                              <td
                                className={cn(
                                  'border border-[#CBD5E1] text-[#1E293B]',
                                  previewTdPadClass,
                                  previewTextAlign,
                                  previewVertAlign
                                )}
                              >
                                {emp.sheet_target != null ? fmtEnNum(emp.sheet_target) : '—'}
                              </td>
                              <td
                                className={cn(
                                  'border border-[#CBD5E1] font-bold text-[#0F172A]',
                                  previewTdPadClass,
                                  previewTextAlign,
                                  previewVertAlign
                                )}
                              >
                                {pct != null ? `${Number(pct).toFixed(1)}%` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Official Footer */}
                <div className="mt-6 pt-2.5 border-t border-[#CBD5E1] flex items-center justify-between text-[10px] font-medium text-[#475569]">
                  <span>Intercom IEMS</span>
                  <span>Page 1 of 1</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
