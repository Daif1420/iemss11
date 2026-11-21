import { useMemo, useState } from 'react';
import {
  Activity,
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Layers,
  LayoutGrid,
  Table2,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import type { EmployeeDetailPayload, SupervisorTargetEntry } from '@/types/iems';
import {
  fmtDate,
  fmtDecimal,
  fmtHours,
  fmtNumber,
  fmtPercent,
  percentTone,
  weekdayArabic,
} from '@/lib/format';
import {
  exportEmployeeDetailExcel,
  exportEmployeeDetailPdf,
  type EmployeeExportPayload,
} from '@/lib/export';
import { cn } from '@/lib/utils';
import { ExportActionButton } from '@/components/shared/ExportButtons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function PercentText({
  value,
  className,
}: {
  value: number | null | undefined;
  className?: string;
}) {
  const txt = fmtPercent(value);
  if (txt === '—') return <span className={cn('text-muted-foreground', className)}>—</span>;
  const tone = percentTone(value);
  return (
    <span
      className={cn(
        'font-bold tabular-nums',
        tone === 'low' && 'text-destructive',
        tone === 'mid' && 'text-amber-600 dark:text-amber-400',
        tone === 'high' && 'text-emerald-600 dark:text-emerald-400',
        className
      )}
    >
      {txt}
    </span>
  );
}

function getInitials(name?: string | null): string {
  const clean = String(name || '').trim();
  if (!clean) return '—';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0] || ''}${parts[1][0] || ''}`;
}

function barColorClass(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return 'bg-muted-foreground/30';
  const pct = ratio * 100;
  if (pct < 50) return 'bg-destructive';
  if (pct < 70) return 'bg-amber-500';
  return 'bg-emerald-600 dark:bg-emerald-500';
}

function performanceStatusLabel(ratio: number | null): { text: string; toneClass: string } {
  if (ratio === null || !Number.isFinite(ratio)) {
    return { text: 'قيد التحديث', toneClass: 'text-muted-foreground' };
  }
  const pct = ratio * 100;
  if (pct >= 100) return { text: 'مكتمل التارجت', toneClass: 'text-emerald-600 dark:text-emerald-400' };
  if (pct >= 70) return { text: 'أداء قوي', toneClass: 'text-emerald-600 dark:text-emerald-400' };
  if (pct >= 50) return { text: 'قيد التقدم', toneClass: 'text-amber-600 dark:text-amber-400' };
  return { text: 'يحتاج متابعة', toneClass: 'text-destructive' };
}

interface NormalizedProfile {
  shift: string;
  stages: Record<string, { date: string; value: string | number }[]>;
  stageTargets: Record<string, number | null>;
}

interface EmployeePerformanceSectionProps {
  data: EmployeeDetailPayload;
  from?: string;
  to?: string;
  selectedStage?: string;
  showExportActions?: boolean;
  showAllResidenceField?: boolean;
  showBonusAndDeductions?: boolean;
  isSelfView?: boolean;
}

export function EmployeePerformanceSection({
  data,
  from = '',
  to = '',
  selectedStage = '__ALL__',
  showExportActions = true,
  showAllResidenceField = false,
  showBonusAndDeductions = true,
  isSelfView = false,
}: EmployeePerformanceSectionProps) {
  const { user } = useAuth();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [activeShiftTab, setActiveShiftTab] = useState<string>('__FIRST__');
  const [matrixViewMode, setMatrixViewMode] = useState<'table' | 'cards'>('table');
  const [matrixFilter, setMatrixFilter] = useState<'all' | 'absence'>('all');

  const emp = data.employee;
  const s = data.summary || {};
  const a = data.attendance || { present_days: 0, absent_days: 0 };
  const globalStageTargets = data.stageTargets || {};

  // Canonical KPI & stage calculations
  const {
    totalAchievementPercent,
    combinedPercentWithSup,
    supervisorMonthlyTargetTotal,
    stageProgressList,
    totalStageAchieved,
    totalStageTarget,
  } = useMemo(() => {
    let percentSum = 0;
    let hasPercent = false;
    let achievedSum = 0;
    let targetSum = 0;
    const progressRows: {
      stage: string;
      achieved: number;
      target: number | null;
      ratio: number | null;
    }[] = [];

    Object.entries(data.stages || {})
      .sort(([aKey], [bKey]) => aKey.localeCompare(bKey, 'ar'))
      .forEach(([stageName, rows]) => {
        const trimName = String(stageName).trim();
        if (trimName === 'الحضور' || trimName.toUpperCase() === 'TOTAL TARGET %') return;
        const nums = (rows || [])
          .map((r) => Number(r.value))
          .filter((n) => Number.isFinite(n));
        if (!nums.length) return;
        const sum = nums.reduce((acc, v) => acc + v, 0);
        const target = Number(globalStageTargets[stageName]);
        const validTarget = Number.isFinite(target) && target > 0 ? target : null;
        const ratio = validTarget ? sum / validTarget : null;

        achievedSum += sum;
        if (validTarget) targetSum += validTarget;
        if (ratio !== null) {
          percentSum += ratio;
          hasPercent = true;
        }
        progressRows.push({
          stage: trimName,
          achieved: sum,
          target: validTarget,
          ratio,
        });
      });

    const overall = hasPercent
      ? percentSum
      : Number.isFinite(Number(s.percentage))
        ? Number(s.percentage)
        : null;

    const supMonthly = Object.values(data.supervisorTargets || {})
      .flatMap((rows) => rows || [])
      .reduce((sum, r) => {
        const n = Number(r?.targetMonthly);
        return Number.isFinite(n) ? sum + n : sum;
      }, 0);

    const hasSup = Number.isFinite(supMonthly) && supMonthly !== 0;
    const combined = overall !== null || hasSup ? (overall ?? 0) + (hasSup ? supMonthly : 0) : null;

    return {
      totalAchievementPercent: overall,
      combinedPercentWithSup: combined,
      supervisorMonthlyTargetTotal: supMonthly,
      stageProgressList: progressRows,
      totalStageAchieved: achievedSum,
      totalStageTarget: targetSum,
    };
  }, [data.stages, data.supervisorTargets, globalStageTargets, s.percentage]);

  // Normalize single vs duplicate shift profiles
  const { profilesToShow, duplicateShifts } = useMemo(() => {
    const rawProfiles = Array.isArray(data.shiftProfiles) ? data.shiftProfiles : [];
    const inPeriod = (date: string) => (!from || date >= from) && (!to || date <= to);

    const normalized: NormalizedProfile[] = rawProfiles.map((p) => {
      const stageMap: Record<string, { date: string; value: string | number }[]> = {};
      const stageTargetMap: Record<string, number | null> = {};
      (p.stages || []).forEach((st) => {
        if (!st || !st.role) return;
        if (selectedStage && selectedStage !== '__ALL__' && st.role !== selectedStage) return;
        stageMap[st.role] = Object.entries(st.daily || {})
          .filter(([date]) => inPeriod(date))
          .map(([date, value]) => ({ date, value }));
        const ownTarget = Number(st.monthlyTarget);
        stageTargetMap[st.role] =
          Number.isFinite(ownTarget) && ownTarget > 0
            ? ownTarget
            : Number(globalStageTargets[st.role]) || null;
      });
      return {
        shift: p.shift || 'Other',
        stages: stageMap,
        stageTargets: stageTargetMap,
      };
    });

    const hasDup = normalized.length > 1;
    const toShow: NormalizedProfile[] = hasDup
      ? normalized
      : [
          {
            shift: emp.shift || emp.target_shift || 'Other',
            stages: data.stages || {},
            stageTargets: globalStageTargets,
          },
        ];

    return { profilesToShow: toShow, duplicateShifts: hasDup };
  }, [
    data.shiftProfiles,
    data.stages,
    emp.shift,
    emp.target_shift,
    from,
    to,
    selectedStage,
    globalStageTargets,
  ]);

  const displayedProfiles = useMemo(() => {
    if (!duplicateShifts || activeShiftTab === '__ALL__') return profilesToShow;
    if (activeShiftTab === '__FIRST__') return profilesToShow.slice(0, 1);
    const matched = profilesToShow.filter((p) => p.shift === activeShiftTab);
    return matched.length ? matched : profilesToShow.slice(0, 1);
  }, [duplicateShifts, activeShiftTab, profilesToShow]);

  // Build unified export payload
  const exportPayload: EmployeeExportPayload = useMemo(() => {
    const dates = [
      ...new Set(
        profilesToShow.flatMap((p) =>
          Object.values(p.stages || {}).flatMap((rows) => (rows || []).map((r) => r.date))
        )
      ),
    ].sort();

    const rows = profilesToShow.flatMap((profile) =>
      Object.entries(profile.stages || {}).map(([stage, stageRows]) => {
        const numericValues = (stageRows || []).map((r) => Number(r.value)).filter(Number.isFinite);
        const total = numericValues.reduce((acc, v) => acc + v, 0);
        const isAttendance = String(stage).trim() === 'الحضور';
        const stTarget = Number(profile.stageTargets?.[stage]);
        const hasTarget = Number.isFinite(stTarget) && stTarget > 0;
        return {
          shift: profile.shift,
          stage,
          isAttendance,
          values: Object.fromEntries((stageRows || []).map((r) => [r.date, r.value])),
          total: numericValues.length ? total : null,
          target: hasTarget ? stTarget : null,
          percentage: !isAttendance && numericValues.length && hasTarget ? total / stTarget : null,
        };
      })
    );

    const grandAchievement = rows
      .filter((r) => !r.isAttendance && r.total !== null)
      .reduce((sum, r) => sum + (r.total || 0), 0);
    const grandTarget = rows
      .filter((r) => !r.isAttendance && r.target !== null)
      .reduce((sum, r) => sum + (r.target || 0), 0);
    const grandPercent = rows
      .filter((r) => r.percentage !== null)
      .reduce((sum, r) => sum + (r.percentage || 0), 0);
    const hasPercent = rows.some((r) => r.percentage !== null);

    return {
      employee: emp,
      grandAchievement,
      grandTarget,
      grandPercent: hasPercent ? grandPercent : null,
      from,
      to,
      dates,
      rows,
    };
  }, [profilesToShow, emp, from, to]);

  const handleExportExcel = () => {
    try {
      exportEmployeeDetailExcel(exportPayload);
      toast.success('تم تحميل ملف Excel');
    } catch {
      toast.error('تعذر تصدير ملف Excel');
    }
  };

  const handleExportPdf = async () => {
    setPdfBusy(true);
    try {
      await exportEmployeeDetailPdf(exportPayload, user?.name || '—');
      toast.success('تم إنشاء ملف PDF');
    } catch {
      toast.error('تعذر إنشاء ملف PDF');
    } finally {
      setPdfBusy(false);
    }
  };

  const supervisorSections = Object.entries(data.supervisorTargets || {}) as [
    string,
    SupervisorTargetEntry[],
  ][];

  const presentDays = Number(s.total_present_days ?? a.present_days ?? 0);
  const absenceDays = Number(s.total_absence_days ?? s.total_absence ?? 0);
  const totalRecordedDays = presentDays + absenceDays;
  const attendancePct = totalRecordedDays > 0 ? presentDays / totalRecordedDays : null;

  const casualDays = Number(s.casual_leave || 0);
  const permissionDays = Number(s.leave_with_permission || 0);
  const unauthDays = Number(s.leave_without_permission ?? s.unauthorized_absence ?? 0);
  const sickDays = Number(s.sick_leave || 0);
  const lateHours = Number(s.late_hours || 0);
  const overtimeHours = Number(s.overtime_hours || 0);
  const specialBonusDays = Number(s.special_bonus_days || 0);
  const specialDeductions = Number(s.special_deductions || 0);

  const absenceSubParts = [
    unauthDays > 0 ? `بدون إذن: ${fmtNumber(unauthDays)}` : null,
    sickDays > 0 ? `مرضي: ${fmtNumber(sickDays)}` : null,
    casualDays > 0 ? `عارضة: ${fmtNumber(casualDays)}` : null,
    permissionDays > 0 ? `بإذن: ${fmtNumber(permissionDays)}` : null,
  ].filter(Boolean);

  const disciplineRows: {
    label: string;
    value: string;
    tone: 'default' | 'primary' | 'success' | 'danger';
  }[] = [
    ...(casualDays > 0
      ? [{ label: 'إجازة عارضة', value: fmtNumber(casualDays), tone: 'default' as const }]
      : []),
    ...(permissionDays > 0
      ? [{ label: 'إجازة بإذن', value: fmtNumber(permissionDays), tone: 'default' as const }]
      : []),
    ...(unauthDays > 0
      ? [{ label: 'غياب بدون إذن', value: fmtNumber(unauthDays), tone: 'danger' as const }]
      : []),
    ...(sickDays > 0
      ? [{ label: 'إجازة مرضي', value: fmtNumber(sickDays), tone: 'default' as const }]
      : []),
    ...(lateHours > 0
      ? [{ label: 'ساعات التأخير', value: fmtHours(lateHours), tone: 'danger' as const }]
      : []),
    ...(overtimeHours > 0
      ? [{ label: 'ساعات الإضافي', value: fmtHours(overtimeHours), tone: 'success' as const }]
      : []),
    ...(showBonusAndDeductions && specialBonusDays > 0
      ? [
          {
            label: 'مكافآت خاصة (أيام)',
            value: fmtDecimal(specialBonusDays),
            tone: 'success' as const,
          },
        ]
      : []),
    ...(showBonusAndDeductions && specialDeductions > 0
      ? [
          {
            label: 'خصومات خاصة',
            value: fmtDecimal(specialDeductions),
            tone: 'danger' as const,
          },
        ]
      : []),
    ...(supervisorMonthlyTargetTotal !== 0
      ? [
          {
            label: 'تارجت الإشراف',
            value: fmtPercent(supervisorMonthlyTargetTotal),
            tone: 'primary' as const,
          },
        ]
      : []),
  ];

  const metaParts = [
    `#${emp.id}`,
    emp.emp_num && emp.emp_num !== emp.id ? `كود ${emp.emp_num}` : null,
    emp.company || null,
    emp.shift || emp.target_shift ? `Shift ${emp.shift || emp.target_shift}` : null,
    emp.department || null,
    emp.education || null,
    showAllResidenceField && emp.residence ? emp.residence : null,
  ].filter(Boolean);

  const heroPercent = combinedPercentWithSup ?? totalAchievementPercent;
  const heroRoundedPct =
    heroPercent !== null && Number.isFinite(heroPercent) ? Math.round(heroPercent * 100) : null;
  const heroClampedRatio =
    heroPercent !== null && Number.isFinite(heroPercent) ? Math.max(0, Math.min(1, heroPercent)) : 0;
  const totalSegments = 25;
  const activeSegments = Math.round(heroClampedRatio * totalSegments);
  const statusInfo = performanceStatusLabel(heroPercent);
  const contributionStages = stageProgressList.filter((st) => st.achieved > 0);
  const contributionSum = contributionStages.reduce((sum, st) => sum + st.achieved, 0);
  const workNatureAllowance = Number(s.work_nature_allowance || 0);
  const hasWorkNature = Number.isFinite(workNatureAllowance) && workNatureAllowance > 0;
  const hasBonusTier =
    s.bonus_tier !== null && s.bonus_tier !== undefined && String(s.bonus_tier).trim() !== '';

  return (
    <div className="space-y-5">
      {/* 1. Executive Performance Hero Canvas (Single Dominant Visual Anchor) */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Identity & Export Controls Header */}
        <div className="px-5 py-4 sm:px-7 sm:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/70">
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-base sm:text-lg font-extrabold text-primary select-none">
              {getInitials(emp.name)}
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-foreground truncate">
                  {emp.name}
                </h2>
                {isSelfView && (
                  <span className="text-[11px] font-bold text-primary">ملف الأداء الشخصي</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {metaParts.map((part, i) => (
                  <span key={`${part}-${i}`} className="inline-flex items-center gap-2">
                    {i > 0 && <span className="text-border">·</span>}
                    <span className={i === 0 ? 'font-bold text-foreground tabular-nums' : ''}>
                      {part}
                    </span>
                  </span>
                ))}
              </div>

              {Array.isArray(data.myRanks) && data.myRanks.length > 0 && (
                <div className="pt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="inline-flex items-center gap-1 font-extrabold text-amber-600 dark:text-amber-400">
                    <Award className="h-3.5 w-3.5 shrink-0" />
                    <span>قائمة الأوائل:</span>
                  </span>
                  {data.myRanks.map((r, idx) => (
                    <span
                      key={`${r.stage}-${r.rank}`}
                      className="inline-flex items-center gap-1.5 font-semibold text-foreground tabular-nums"
                    >
                      {idx > 0 && <span className="text-border">·</span>}
                      <span>{r.stage}</span>
                      <span className="font-extrabold text-primary">#{r.rank}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {showExportActions && (
            <div className="flex flex-wrap items-center gap-1.5 shrink-0 no-print">
              <ExportActionButton kind="excel" onClick={handleExportExcel} />
              <ExportActionButton kind="pdf" loading={pdfBusy} onClick={handleExportPdf} />
              <ExportActionButton kind="print" onClick={() => window.print()} />
            </div>
          )}
        </div>

        {/* Focal Showcase Band: Overall Achievement Indicator */}
        <div className="px-5 py-5 sm:px-7 sm:py-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm sm:text-base font-extrabold text-foreground">
                  مؤشر الإنجاز العام
                </h3>
                <span className="text-border">·</span>
                <span className={cn('text-xs font-extrabold', statusInfo.toneClass)}>
                  {statusInfo.text}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground tabular-nums">
                {from && to && (
                  <span>
                    الفترة: {fmtDate(from)} → {fmtDate(to)}
                  </span>
                )}
                {heroRoundedPct !== null && (
                  <>
                    {from && to && <span className="text-border">·</span>}
                    <span
                      className={cn(
                        'font-bold',
                        heroRoundedPct >= 100
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-muted-foreground'
                      )}
                    >
                      {heroRoundedPct > 100
                        ? `عديت التارجت بزيادة +${heroRoundedPct - 100}% فوق الـ 100%`
                        : heroRoundedPct === 100
                          ? 'تم تحقيق التارجت الكامل 100%'
                          : `متبقي ${100 - heroRoundedPct}% للوصول إلى 100%`}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-baseline sm:text-end tabular-nums">
              <PercentText
                value={heroPercent}
                className="text-3xl sm:text-5xl font-black tracking-tight leading-none"
              />
            </div>
          </div>

          {/* 25-Segment Architectural Milestone Scale */}
          <div className="space-y-2">
            <div
              className="flex items-stretch gap-1 sm:gap-1.5 h-3.5 sm:h-4"
              role="progressbar"
              aria-valuenow={Math.round(heroClampedRatio * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="مؤشر الإنجاز العام"
            >
              {Array.from({ length: totalSegments }).map((_, idx) => {
                const filled = idx < activeSegments;
                return (
                  <div
                    key={idx}
                    className={cn(
                      'flex-1 rounded-[3px] transition-colors duration-200',
                      filled ? barColorClass(heroPercent) : 'bg-secondary'
                    )}
                  />
                );
              })}
            </div>

            {/* Aligned Milestone Ruler (0% / 50% / 70% / 100%) */}
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-semibold text-muted-foreground tabular-nums">
              <span>0%</span>
              <span>50% مقبول</span>
              <span>70% قوي</span>
              <span>100% التارجت</span>
            </div>
          </div>

          {/* Subtle Stage Contribution Share Summary (when multiple active stages exist) */}
          {contributionStages.length > 1 && contributionSum > 0 && (
            <div className="pt-2 border-t border-border/60 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="font-bold text-foreground">توزيع الإنجاز:</span>
              {contributionStages.map((st, idx) => {
                const share = (st.achieved / contributionSum) * 100;
                return (
                  <span
                    key={st.stage}
                    className="inline-flex items-center gap-1.5 tabular-nums"
                  >
                    {idx > 0 && <span className="text-border">·</span>}
                    <span>{st.stage}</span>
                    <span className="font-bold text-foreground">{share.toFixed(0)}%</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. Primary 3-KPI Strip (No duplicate overall percentage) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 border-t border-border/70 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-border/70 bg-secondary/20">
          <div className="p-4 space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
              <span>أيام الحضور</span>
              <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            </div>
            <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {fmtDecimal(presentDays)}
            </div>
            <div className="text-[11px] text-muted-foreground truncate tabular-nums">
              {attendancePct !== null
                ? `التزام ${fmtPercent(attendancePct)} من ${fmtDecimal(totalRecordedDays)} يوم`
                : 'سجل الحضور الفعلي للفترة'}
            </div>
          </div>

          <div className="p-4 space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
              <span>إجمالي الغياب</span>
              <Calendar className="h-4 w-4 text-destructive shrink-0" />
            </div>
            <div
              className={cn(
                'text-2xl font-extrabold tabular-nums',
                absenceDays > 0 ? 'text-destructive' : 'text-foreground'
              )}
            >
              {fmtNumber(absenceDays)}
            </div>
            <div className="text-[11px] text-muted-foreground truncate tabular-nums">
              {absenceSubParts.length > 0 ? absenceSubParts.join(' · ') : 'لا يوجد غياب مسجل'}
            </div>
          </div>

          {showBonusAndDeductions ? (
            <div className="p-4 space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
                <span>{hasWorkNature ? 'الشريحة وبدل طبيعة العمل' : 'الشريحة'}</span>
                <Layers className="h-4 w-4 text-primary shrink-0" />
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 tabular-nums">
                <span className="text-2xl font-extrabold text-foreground">
                  {hasBonusTier ? `شريحة ${String(s.bonus_tier)}` : '—'}
                </span>
                {hasWorkNature && (
                  <span className="text-xs font-bold text-primary">
                    · بدل طبيعة عمل: {fmtNumber(workNatureAllowance)}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {hasWorkNature
                  ? 'الشريحة وبدل طبيعة العمل المعتمدان'
                  : hasBonusTier
                    ? 'الشريحة المعتمدة في الفترة'
                    : 'غير محددة في الفترة'}
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
                <span>ساعات الإضافي والتأخير</span>
                <Clock className="h-4 w-4 text-primary shrink-0" />
              </div>
              <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {overtimeHours > 0 ? fmtHours(overtimeHours) : '—'}
              </div>
              <div className="text-[11px] text-muted-foreground truncate tabular-nums">
                {lateHours > 0 ? `ساعات التأخير: ${fmtHours(lateHours)}` : 'لا توجد ساعات تأخير'}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3. Two-Column Analytics & Structured Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Stage-by-Stage Target Progress Bars */}
        <Card className="lg:col-span-7">
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0 border-b border-border/70">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <div>
                <CardTitle className="text-sm font-extrabold">تحليل التارجت حسب المرحلة</CardTitle>
                <CardDescription className="text-[11px]">
                  مقارنة الإنجاز الفعلي بالتارجت المطلوب لكل مرحلة
                </CardDescription>
              </div>
            </div>
            {totalStageTarget > 0 && (
              <span className="text-xs font-extrabold text-muted-foreground tabular-nums">
                {fmtDecimal(totalStageAchieved)} / {fmtDecimal(totalStageTarget)}
              </span>
            )}
          </CardHeader>
          <CardContent className="pt-4">
            {stageProgressList.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground">
                لا توجد مراحل إنتاجية مسجلة في الفترة المختارة.
              </div>
            ) : (
              <div className="space-y-4">
                {stageProgressList.map((st) => {
                  const pctWidth =
                    st.ratio !== null ? Math.max(4, Math.min(100, Math.round(st.ratio * 100))) : 100;
                  return (
                    <div key={st.stage} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-bold text-foreground truncate">{st.stage}</span>
                        <div className="flex items-center gap-3 shrink-0 tabular-nums">
                          <span className="text-muted-foreground">
                            <strong className="text-foreground">{fmtDecimal(st.achieved)}</strong>
                            {st.target !== null ? ` / ${fmtDecimal(st.target)}` : ''}
                          </span>
                          <span className="min-w-[44px] text-end">
                            <PercentText value={st.ratio} />
                          </span>
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            st.ratio !== null ? barColorClass(st.ratio) : 'bg-primary/65'
                          )}
                          style={{ width: `${pctWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attendance, Leaves & Financial Hairline List (Zero values omitted) */}
        <Card className="lg:col-span-5">
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0 border-b border-border/70">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <div>
                <CardTitle className="text-sm font-extrabold">تفاصيل الانضباط والساعات</CardTitle>
                <CardDescription className="text-[11px]">
                  رصيد الإجازات، التأخيرات، والحوافز المعتمدة
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {disciplineRows.length === 0 ? (
              <div className="py-10 px-4 text-center space-y-1.5">
                <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400 mx-auto opacity-85" />
                <div className="text-xs font-extrabold text-foreground">
                  لا توجد خصومات أو إجازات أو تأخيرات مسجلة
                </div>
                <p className="text-[11px] text-muted-foreground">
                  سجل الانضباط والساعات لهذا الموظف نظيف بالكامل في الفترة المختارة.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/70 text-xs">
                {disciplineRows.map((row) => (
                  <SummaryRow
                    key={row.label}
                    label={row.label}
                    value={row.value}
                    tone={row.tone}
                    numeric
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4. Supervisor Targets Breakdown */}
      {supervisorSections.length > 0 && (
        <Card>
          <CardHeader className="pb-3 flex-row items-center gap-2 space-y-0 border-b border-border/70">
            <Target className="h-4 w-4 text-primary" />
            <div>
              <CardTitle className="text-sm font-extrabold">تفاصيل تارجت الإشراف</CardTitle>
              <CardDescription className="text-[11px]">
                متابعة التارجت اليومي والشهري للإشراف
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-4">
            {supervisorSections.map(([sectionName, rows]) => {
              const metricNames = [
                ...new Set((rows || []).flatMap((r) => Object.keys(r.metrics || {}))),
              ];
              const totals: Record<string, number> = {};
              metricNames.forEach((m) => (totals[m] = 0));
              let totalDaily = 0;
              let totalMonthly = 0;
              let hasDaily = false;
              let hasMonthly = false;

              (rows || []).forEach((r) => {
                metricNames.forEach((m) => {
                  const n = Number(r.metrics?.[m]);
                  if (Number.isFinite(n)) totals[m] += n;
                });
                const dn = Number(r.targetDaily);
                const mn = Number(r.targetMonthly);
                if (Number.isFinite(dn)) {
                  totalDaily += dn;
                  hasDaily = true;
                }
                if (Number.isFinite(mn)) {
                  totalMonthly += mn;
                  hasMonthly = true;
                }
              });

              return (
                <div key={sectionName} className="space-y-2">
                  <div className="text-xs font-bold text-foreground">{sectionName}</div>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>التاريخ</TableHead>
                          {metricNames.map((m) => (
                            <TableHead key={m}>{m}</TableHead>
                          ))}
                          <TableHead>التارجت اليومي</TableHead>
                          <TableHead>التارجت الشهري</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r, idx) => (
                          <TableRow key={`${r.date}-${idx}`}>
                            <TableCell className="font-semibold tabular-nums">
                              {fmtDate(r.date)}
                            </TableCell>
                            {metricNames.map((m) => {
                              const raw = r.metrics?.[m];
                              const n = Number(raw);
                              return (
                                <TableCell key={m} className="tabular-nums">
                                  {raw === null || raw === undefined || raw === ''
                                    ? '—'
                                    : Number.isFinite(n)
                                      ? fmtNumber(n)
                                      : String(raw)}
                                </TableCell>
                              );
                            })}
                            <TableCell className="tabular-nums">
                              {Number.isFinite(Number(r.targetDaily))
                                ? fmtPercent(r.targetDaily)
                                : '—'}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {Number.isFinite(Number(r.targetMonthly))
                                ? fmtPercent(r.targetMonthly)
                                : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell>الإجمالي</TableCell>
                          {metricNames.map((m) => (
                            <TableCell key={m} className="tabular-nums">
                              {totals[m] ? fmtNumber(totals[m]) : '—'}
                            </TableCell>
                          ))}
                          <TableCell className="tabular-nums">
                            {hasDaily ? fmtPercent(totalDaily) : '—'}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {hasMonthly ? fmtPercent(totalMonthly) : '—'}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* 5. Daily Details Matrix / Timeline View */}
      <Card>
        <CardHeader className="pb-3 flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-border/70">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <div>
              <CardTitle className="text-sm font-extrabold">السجل اليومي للمراحل والأداء</CardTitle>
              <CardDescription className="text-[11px]">
                متابعة الإنجاز اليومي لكل مرحلة مقارنةً بالتارجت الشهري
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 no-print">
            {/* Day Filter: All Days vs Absence Only */}
            <div className="inline-flex items-center rounded-lg border border-border bg-secondary/40 p-1 text-[11px]">
              <button
                type="button"
                onClick={() => setMatrixFilter('all')}
                className={cn(
                  'rounded-md px-2.5 py-1 font-bold transition-colors cursor-pointer',
                  matrixFilter === 'all'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                كل الأيام
              </button>
              <button
                type="button"
                onClick={() => setMatrixFilter('absence')}
                className={cn(
                  'rounded-md px-2.5 py-1 font-bold transition-colors cursor-pointer',
                  matrixFilter === 'absence'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                أيام الغياب والإجازات
              </button>
            </div>

            {/* Matrix Layout Switch: Table vs Day Cards */}
            <div className="inline-flex items-center rounded-lg border border-border bg-secondary/40 p-1 text-[11px]">
              <button
                type="button"
                onClick={() => setMatrixViewMode('table')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-bold transition-colors cursor-pointer',
                  matrixViewMode === 'table'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Table2 className="h-3.5 w-3.5" />
                <span>جدول</span>
              </button>
              <button
                type="button"
                onClick={() => setMatrixViewMode('cards')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-bold transition-colors cursor-pointer',
                  matrixViewMode === 'cards'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>سجل الأيام</span>
              </button>
            </div>

            {duplicateShifts && (
              <div className="inline-flex items-center rounded-lg border border-border bg-secondary/40 p-1 text-[11px]">
                {profilesToShow.map((p, idx) => {
                  const isActive =
                    activeShiftTab === p.shift || (activeShiftTab === '__FIRST__' && idx === 0);
                  return (
                    <button
                      key={p.shift}
                      type="button"
                      onClick={() => setActiveShiftTab(p.shift)}
                      className={cn(
                        'rounded-md px-2.5 py-1 font-bold transition-colors cursor-pointer',
                        isActive
                          ? 'bg-card text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      Shift {p.shift}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setActiveShiftTab('__ALL__')}
                  className={cn(
                    'rounded-md px-2.5 py-1 font-bold transition-colors cursor-pointer',
                    activeShiftTab === '__ALL__'
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  الكل
                </button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-4">
          {displayedProfiles.map((profile, pIdx) => {
            const allEntries = Object.entries(profile.stages || {});
            const totalTargetEntry = allEntries.find(
              ([name]) => String(name).trim().toUpperCase() === 'TOTAL TARGET %'
            );
            const stageEntries = allEntries
              .filter(([name, rows]) => {
                const trimName = String(name).trim();
                if (trimName.toUpperCase() === 'TOTAL TARGET %') return false;
                if (trimName === 'الحضور' && profile.shift !== 'Other') return false;
                return (rows || []).some(
                  (r) => r.value !== null && r.value !== undefined && r.value !== ''
                );
              })
              .sort(([aKey], [bKey]) => String(aKey).localeCompare(String(bKey), 'ar'));

            const dateSet = new Set<string>();
            stageEntries.forEach(([, rows]) => rows.forEach((r) => dateSet.add(r.date)));
            if (totalTargetEntry) totalTargetEntry[1].forEach((r) => dateSet.add(r.date));
            const allDates = [...dateSet].sort();

            const dates =
              matrixFilter === 'absence'
                ? allDates.filter((d) =>
                    stageEntries.some(([, rows]) => {
                      const hit = rows.find((r) => r.date === d)?.value;
                      const sv = String(hit ?? '').trim();
                      return sv === 'ب' || sv === 'ا' || sv === 'م';
                    })
                  )
                : allDates;

            let overallPercentSum = 0;
            let hasAnyPercent = false;
            let grandAchievement = 0;
            let hasGrandAchievement = false;
            let grandTarget = 0;
            let hasGrandTarget = false;

            const computedRows = stageEntries.map(([stageName, rows]) => {
              const byDate = Object.fromEntries(rows.map((r) => [r.date, r.value]));
              let sum = 0;
              let hasNum = false;
              rows.forEach((r) => {
                const n = Number(r.value);
                if (Number.isFinite(n) && String(r.value).trim() !== '') {
                  sum += n;
                  hasNum = true;
                }
              });

              const isAttendance = String(stageName).trim() === 'الحضور';
              const target = Number(profile.stageTargets?.[stageName]);
              const hasTarget = !isAttendance && Number.isFinite(target) && target > 0;
              const ratio = hasNum && hasTarget ? sum / target : null;

              if (ratio !== null) {
                overallPercentSum += ratio;
                hasAnyPercent = true;
              }
              if (!isAttendance && hasNum) {
                grandAchievement += sum;
                hasGrandAchievement = true;
              }
              if (hasTarget) {
                grandTarget += target;
                hasGrandTarget = true;
              }

              return {
                stageName,
                byDate,
                sum,
                hasNum,
                target: hasTarget ? target : null,
                ratio,
              };
            });

            const overallStagePercent = hasAnyPercent ? overallPercentSum : null;
            const totalRowSpan = computedRows.length + (totalTargetEntry ? 1 : 0);

            return (
              <div key={`${profile.shift}-${pIdx}`} className="space-y-3">
                {duplicateShifts && (
                  <div className="text-xs font-extrabold text-primary">
                    ملف Shift {profile.shift}
                  </div>
                )}

                {matrixViewMode === 'cards' ? (
                  dates.length === 0 ? (
                    <div className="rounded-lg border border-border py-10 text-center text-xs text-muted-foreground">
                      {matrixFilter === 'absence'
                        ? 'لا توجد أيام غياب أو إجازات مسجلة في هذه الفترة.'
                        : 'لا توجد بيانات يومية مسجلة في هذه الفترة.'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {dates.map((d) => {
                        const dayItems = computedRows
                          .map((r) => ({ stage: r.stageName, val: r.byDate[d] }))
                          .filter(
                            (it) => it.val !== undefined && it.val !== null && String(it.val).trim() !== ''
                          );
                        const dayPctRaw = totalTargetEntry?.[1].find((r) => r.date === d)?.value;
                        const dayPctNum = Number(dayPctRaw);
                        const hasAbsence = dayItems.some((it) => {
                          const sv = String(it.val).trim();
                          return sv === 'ب' || sv === 'ا' || sv === 'م';
                        });

                        return (
                          <div
                            key={d}
                            className="rounded-lg border border-border bg-secondary/20 p-3.5 space-y-2.5"
                          >
                            <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                              <div className="space-y-0.5">
                                <div className="text-xs font-extrabold text-foreground">
                                  {weekdayArabic(d)}
                                </div>
                                <div className="text-[11px] text-muted-foreground tabular-nums">
                                  {fmtDate(d)}
                                </div>
                              </div>
                              {dayPctRaw !== undefined &&
                              dayPctRaw !== null &&
                              String(dayPctRaw).trim() !== '' &&
                              Number.isFinite(dayPctNum) ? (
                                <PercentText value={dayPctNum} className="text-sm" />
                              ) : hasAbsence ? (
                                <span className="text-[11px] font-bold text-destructive">
                                  يوم غياب/إجازة
                                </span>
                              ) : null}
                            </div>

                            <div className="space-y-1.5 text-xs">
                              {dayItems.length === 0 ? (
                                <div className="text-muted-foreground text-[11px]">لا يوجد تسجيل</div>
                              ) : (
                                dayItems.map((it) => {
                                  const sv = String(it.val).trim();
                                  const n = Number(it.val);
                                  return (
                                    <div
                                      key={it.stage}
                                      className="flex items-center justify-between gap-2"
                                    >
                                      <span className="text-muted-foreground truncate">
                                        {it.stage}
                                      </span>
                                      <span
                                        className={cn(
                                          'font-bold tabular-nums',
                                          sv === 'ب' && 'text-destructive',
                                          (sv === 'ا' || sv === 'م') &&
                                            'text-amber-600 dark:text-amber-400'
                                        )}
                                      >
                                        {sv === 'ب'
                                          ? 'بدون إذن'
                                          : sv === 'ا'
                                            ? 'إجازة بإذن'
                                            : sv === 'م'
                                              ? 'مرضي'
                                              : Number.isFinite(n)
                                                ? fmtDecimal(n)
                                                : sv}
                                      </span>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky right-0 z-10 bg-muted min-w-[130px]">
                            المرحلة
                          </TableHead>
                          {dates.map((d) => (
                            <TableHead key={d} className="text-center min-w-[66px]">
                              <div className="flex flex-col leading-tight">
                                <span className="text-[10px] font-medium text-muted-foreground">
                                  {weekdayArabic(d)}
                                </span>
                                <span className="text-[11px] font-bold text-foreground tabular-nums">
                                  {d.slice(8)}/{d.slice(5, 7)}
                                </span>
                              </div>
                            </TableHead>
                          ))}
                          <TableHead className="text-center">الإجمالي</TableHead>
                          <TableHead className="text-center">التارجت الشهري</TableHead>
                          <TableHead className="text-center">نسبة الإنجاز</TableHead>
                          <TableHead className="text-center">النسبة الإجمالية</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {totalRowSpan === 0 || dates.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={dates.length + 5}
                              className="py-8 text-center text-xs text-muted-foreground"
                            >
                              {matrixFilter === 'absence'
                                ? 'لا توجد أيام غياب أو إجازات مسجلة في هذه الفترة.'
                                : 'لا توجد بيانات يومية مسجلة في هذه الفترة.'}
                            </TableCell>
                          </TableRow>
                        ) : (
                          <>
                            {computedRows.map((row, rowIdx) => (
                              <TableRow key={row.stageName}>
                                <TableCell className="sticky right-0 z-10 bg-card font-bold whitespace-nowrap border-l border-border/60">
                                  {row.stageName}
                                </TableCell>
                                {dates.map((d) => {
                                  const v = row.byDate[d];
                                  if (v === undefined || v === null || v === '') {
                                    return (
                                      <TableCell
                                        key={d}
                                        className="text-center text-muted-foreground/50 tabular-nums"
                                      >
                                        —
                                      </TableCell>
                                    );
                                  }
                                  const strVal = String(v).trim();
                                  const isAbsentMark =
                                    strVal === 'ب' || strVal === 'ا' || strVal === 'م';
                                  const n = Number(v);
                                  return (
                                    <TableCell
                                      key={d}
                                      className={cn(
                                        'text-center font-semibold tabular-nums',
                                        strVal === 'ب' && 'text-destructive bg-destructive/5',
                                        (strVal === 'ا' || strVal === 'م') &&
                                          'text-amber-600 dark:text-amber-400 bg-amber-500/5',
                                        !isAbsentMark && Number.isFinite(n) && n > 0 && 'text-foreground'
                                      )}
                                    >
                                      {Number.isFinite(n) && strVal !== ''
                                        ? fmtDecimal(n)
                                        : strVal}
                                    </TableCell>
                                  );
                                })}
                                <TableCell className="text-center font-extrabold tabular-nums">
                                  {row.hasNum ? fmtDecimal(row.sum) : '—'}
                                </TableCell>
                                <TableCell className="text-center tabular-nums">
                                  {row.target !== null ? fmtDecimal(row.target) : '—'}
                                </TableCell>
                                <TableCell className="text-center">
                                  <PercentText value={row.ratio} />
                                </TableCell>
                                {rowIdx === 0 && (
                                  <TableCell
                                    rowSpan={totalRowSpan}
                                    className="text-center align-middle bg-accent/25 border-r border-border font-extrabold"
                                  >
                                    <div className="text-base">
                                      <PercentText value={overallStagePercent} />
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                      الإجمالية
                                    </div>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}

                            {totalTargetEntry && (
                              <TableRow className="bg-muted/40 font-bold">
                                <TableCell className="sticky right-0 z-10 bg-muted/60 font-bold border-l border-border/60">
                                  اليومي
                                </TableCell>
                                {dates.map((d) => {
                                  const hit = totalTargetEntry[1].find((r) => r.date === d)?.value;
                                  if (hit === undefined || hit === null || hit === '') {
                                    return (
                                      <TableCell key={d} className="text-center text-muted-foreground">
                                        —
                                      </TableCell>
                                    );
                                  }
                                  const n = Number(hit);
                                  return (
                                    <TableCell key={d} className="text-center tabular-nums">
                                      {Number.isFinite(n) ? <PercentText value={n} /> : String(hit)}
                                    </TableCell>
                                  );
                                })}
                                <TableCell className="text-center tabular-nums">
                                  {hasGrandAchievement ? fmtDecimal(grandAchievement) : '—'}
                                </TableCell>
                                <TableCell className="text-center tabular-nums">
                                  {hasGrandTarget ? fmtDecimal(grandTarget) : '—'}
                                </TableCell>
                                <TableCell className="text-center">
                                  <PercentText value={overallStagePercent} />
                                </TableCell>
                                {computedRows.length === 0 && (
                                  <TableCell
                                    rowSpan={1}
                                    className="text-center align-middle bg-accent/25 border-r border-border font-extrabold"
                                  >
                                    <PercentText value={overallStagePercent} />
                                  </TableCell>
                                )}
                              </TableRow>
                            )}
                          </>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  tone = 'default',
  numeric = false,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'primary' | 'success' | 'danger';
  numeric?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          'font-bold',
          numeric && 'tabular-nums',
          tone === 'default' && 'text-foreground',
          tone === 'primary' && 'text-primary',
          tone === 'success' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'danger' && 'text-destructive'
        )}
      >
        {value}
      </span>
    </div>
  );
}
