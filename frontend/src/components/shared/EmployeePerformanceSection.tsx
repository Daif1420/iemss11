import { useMemo, useState, type ReactNode } from 'react';
import {
  Award,
  BarChart3,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Layers,
  LayoutGrid,
  Table2,
  Target,
  UserCheck,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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

function chartFillColor(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return '#94A3B8';
  const pct = ratio * 100;
  if (pct < 50) return '#DC2626';
  if (pct < 70) return '#D97706';
  return '#059669';
}

function performanceStatusLabel(ratio: number | null): {
  text: string;
  badgeClass: string;
} {
  if (ratio === null || !Number.isFinite(ratio)) {
    return {
      text: 'قيد التحديث',
      badgeClass: 'border-border bg-secondary/60 text-muted-foreground',
    };
  }
  const pct = Math.round(ratio * 100);
  if (pct > 100) {
    return {
      text: 'تجاوز التارجت',
      badgeClass:
        'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    };
  }
  if (pct === 100) {
    return {
      text: 'مكتمل التارجت',
      badgeClass:
        'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    };
  }
  if (pct >= 70) {
    return {
      text: 'أداء قوي',
      badgeClass:
        'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    };
  }
  if (pct >= 50) {
    return {
      text: 'قيد التقدم',
      badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    };
  }
  return {
    text: 'يحتاج متابعة',
    badgeClass: 'border-destructive/30 bg-destructive/10 text-destructive',
  };
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
  hideTargets?: boolean;
  isSelfView?: boolean;
  afterHeroSlot?: ReactNode;
}

export function EmployeePerformanceSection({
  data,
  from = '',
  to = '',
  selectedStage = '__ALL__',
  showExportActions = true,
  showAllResidenceField = false,
  showBonusAndDeductions = true,
  hideTargets = false,
  isSelfView = false,
  afterHeroSlot,
}: EmployeePerformanceSectionProps) {
  const { user, isHrManager } = useAuth();
  const hideTargetsView = Boolean(hideTargets || isHrManager);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [activeShiftTab, setActiveShiftTab] = useState<string>('__FIRST__');
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'present' | 'absence'>('all');
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
  } = useMemo(() => {
    let percentSum = 0;
    let hasPercent = false;
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
  const examDays = Number(s.exam_leave || 0);
  const unclassifiedDays = Number(s.unclassified_absence || 0);
  const lateDays = Number(s.late_days || 0);
  const lateHours = Number(s.late_hours || 0);
  const overtimeDays = Number(s.overtime_days || 0);
  const overtimeHours = Number(s.overtime_hours || 0);
  const specialBonusDays = Number(s.special_bonus_days || 0);
  const specialDeductions = Number(s.special_deductions || 0);

  const absenceSubParts = [
    unauthDays > 0 ? `بدون إذن: ${fmtNumber(unauthDays)}` : null,
    sickDays > 0 ? `مرضي: ${fmtNumber(sickDays)}` : null,
    casualDays > 0 ? `عارضة: ${fmtNumber(casualDays)}` : null,
    permissionDays > 0 ? `بإذن: ${fmtNumber(permissionDays)}` : null,
    examDays > 0 ? `امتحان: ${fmtNumber(examDays)}` : null,
    unclassifiedDays > 0 ? `غير مصنف: ${fmtNumber(unclassifiedDays)}` : null,
  ].filter(Boolean);

  const disciplineRows: {
    label: string;
    value: string;
    tone: 'default' | 'primary' | 'success' | 'danger' | 'yellow' | 'purple' | 'burgundy';
  }[] = [
    ...(casualDays > 0
      ? [{ label: 'إجازة عارضة', value: fmtNumber(casualDays), tone: 'yellow' as const }]
      : []),
    ...(permissionDays > 0
      ? [{ label: 'إجازة بإذن', value: fmtNumber(permissionDays), tone: 'default' as const }]
      : []),
    ...(unauthDays > 0
      ? [{ label: 'غياب بدون إذن', value: fmtNumber(unauthDays), tone: 'danger' as const }]
      : []),
    ...(sickDays > 0
      ? [{ label: 'إجازة مرضي', value: fmtNumber(sickDays), tone: 'burgundy' as const }]
      : []),
    ...(examDays > 0
      ? [{ label: 'إجازة امتحان', value: fmtNumber(examDays), tone: 'purple' as const }]
      : []),
    ...(unclassifiedDays > 0
      ? [{ label: 'غير مصنف', value: fmtNumber(unclassifiedDays), tone: 'default' as const }]
      : []),
    ...(lateDays > 0
      ? [{ label: 'أيام التأخير', value: fmtNumber(lateDays), tone: 'danger' as const }]
      : []),
    ...(lateHours > 0
      ? [{ label: 'ساعات التأخير', value: fmtHours(lateHours), tone: 'danger' as const }]
      : []),
    ...(overtimeDays > 0
      ? [{ label: 'أيام الإضافي', value: fmtNumber(overtimeDays), tone: 'success' as const }]
      : []),
    ...(overtimeHours > 0
      ? [{ label: 'ساعات الإضافي', value: fmtHours(overtimeHours), tone: 'success' as const }]
      : []),
    ...(showBonusAndDeductions && !hideTargetsView && specialBonusDays > 0
      ? [
          {
            label: 'مكافآت خاصة (أيام)',
            value: fmtDecimal(specialBonusDays),
            tone: 'success' as const,
          },
        ]
      : []),
    ...(showBonusAndDeductions && !hideTargetsView && specialDeductions > 0
      ? [
          {
            label: 'خصومات خاصة',
            value: fmtDecimal(specialDeductions),
            tone: 'danger' as const,
          },
        ]
      : []),
    ...(!hideTargetsView && supervisorMonthlyTargetTotal !== 0
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
  const heroAxisMax = Math.max(
    100,
    heroRoundedPct !== null ? Math.ceil(heroRoundedPct / 25) * 25 : 100
  );
  const heroFillHex = chartFillColor(heroPercent);
  const spectrumStep = heroAxisMax <= 180 ? 5 : heroAxisMax <= 360 ? 10 : 25;
  const spectrumData = Array.from(
    { length: Math.max(10, Math.round(heroAxisMax / spectrumStep)) },
    (_, index) => {
      const pct = (index + 1) * spectrumStep;
      const reached = heroRoundedPct !== null && heroRoundedPct >= pct;
      const partial =
        heroRoundedPct !== null &&
        heroRoundedPct > pct - spectrumStep &&
        heroRoundedPct < pct;
      const isOverTarget = pct > 100;
      const baseHeight = isOverTarget
        ? Math.min(
            100,
            80 + Math.round(((pct - 100) / Math.max(25, heroAxisMax - 100)) * 20)
          )
        : 30 + Math.round((pct / 100) * 44);
      const fill =
        reached || partial
          ? isOverTarget
            ? 'url(#iemsSurgeGrad)'
            : 'url(#iemsTargetGrad)'
          : 'var(--secondary)';
      return {
        pct,
        height: baseHeight,
        reached,
        partial,
        fill,
        fillOpacity: reached ? 1 : partial ? 0.58 : 0.72,
        zoneLabel:
          pct > 100
            ? 'نطاق التفوق فوق التارجت'
            : pct >= 70
              ? 'نطاق الأداء القوي'
              : pct >= 50
                ? 'نطاق القبول'
                : 'نطاق الانطلاق',
      };
    }
  );
  const spectrumTicks =
    heroAxisMax === 100
      ? [25, 50, 75, 100]
      : heroAxisMax >= 150
        ? [50, 100, heroAxisMax]
        : [50, heroAxisMax];
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

              {!hideTargetsView && Array.isArray(data.myRanks) && data.myRanks.length > 0 && (
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

          {showExportActions && !hideTargetsView && (
            <div className="flex flex-wrap items-center gap-1.5 shrink-0 no-print">
              <ExportActionButton kind="excel" onClick={handleExportExcel} />
              <ExportActionButton kind="pdf" loading={pdfBusy} onClick={handleExportPdf} />
              <ExportActionButton kind="print" onClick={() => window.print()} />
            </div>
          )}
        </div>

        {/* Focal Showcase Band: Wide Horizontal Recharts Step-Wave Performance Spectrum */}
        {!hideTargetsView && (
        <div className="px-5 py-5 sm:px-7 sm:py-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-base sm:text-lg font-extrabold text-foreground">
                  مؤشر الإنجاز العام
                </h3>
                <span
                  className={cn(
                    'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-extrabold',
                    statusInfo.badgeClass
                  )}
                >
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
                        ? `أداء متفوق · تجاوزت التارجت بنسبة +${heroRoundedPct - 100}% أعلى من المستهدف`
                        : heroRoundedPct === 100
                          ? 'مكتمل · تم تحقيق 100% من التارجت المطلوب'
                          : `متبقي ${100 - heroRoundedPct}% للوصول إلى التارجت الكامل`}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-baseline gap-2.5 sm:text-end tabular-nums">
              <PercentText
                value={heroPercent}
                className="text-3xl sm:text-5xl font-black tracking-tight leading-none"
              />
            </div>
          </div>

          {/* Enhanced Gradient Step-Wave Spectrum */}
          <div className="space-y-2">
            <div
              dir="ltr"
              className="w-full h-38 sm:h-42 rounded-xl border border-border/70 bg-gradient-to-b from-secondary/10 to-secondary/30 px-2.5 pt-2 pb-1"
              role="img"
              aria-label={`مؤشر الإنجاز العام: ${heroRoundedPct !== null ? `${heroRoundedPct}%` : 'غير متوفر'}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={spectrumData}
                  margin={{ top: 24, right: 8, left: 8, bottom: 2 }}
                  barCategoryGap="20%"
                >
                  <defs>
                    <linearGradient id="iemsTargetGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={heroFillHex} stopOpacity={1} />
                      <stop offset="100%" stopColor={heroFillHex} stopOpacity={0.62} />
                    </linearGradient>
                    <linearGradient id="iemsSurgeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34D399" stopOpacity={1} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={0.75} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--border)"
                    strokeOpacity={0.45}
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="pct"
                    ticks={spectrumTicks}
                    tickFormatter={(val: number) => `${val}%`}
                    tick={{ fontSize: 11, fontWeight: 700, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border)', strokeOpacity: 0.75 }}
                    interval={0}
                  />
                  <YAxis domain={[0, 106]} hide />
                  <ReferenceLine
                    x={50}
                    stroke="var(--muted-foreground)"
                    strokeOpacity={0.35}
                    strokeDasharray="3 3"
                  />
                  <ReferenceLine
                    x={100}
                    stroke="var(--primary)"
                    strokeOpacity={0.9}
                    strokeWidth={1.75}
                    strokeDasharray="4 3"
                    label={{
                      value: 'التارجت 100%',
                      position: 'top',
                      fill: 'var(--primary)',
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--primary)', fillOpacity: 0.06 }}
                    content={({
                      active,
                      payload,
                    }: {
                      active?: boolean;
                      payload?: readonly {
                        payload?: {
                          pct: number;
                          reached: boolean;
                          partial: boolean;
                          zoneLabel: string;
                        };
                      }[];
                    }) => {
                      const pt = payload?.[0]?.payload;
                      if (!active || !pt) return null;
                      return (
                        <div
                          dir="rtl"
                          className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md space-y-1"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-bold text-foreground">محطة {pt.pct}%</span>
                            <span
                              className={cn(
                                'font-bold',
                                pt.reached || pt.partial
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-muted-foreground'
                              )}
                            >
                              {pt.reached ? 'محقق ✓' : pt.partial ? 'قيد الإنجاز' : 'متبقي'}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground">{pt.zoneLabel}</div>
                          <div className="pt-1 border-t border-border/60 flex items-center gap-2 tabular-nums">
                            <span className="text-muted-foreground">إنجازك الحالي:</span>
                            <span className="font-extrabold text-primary">
                              {fmtPercent(heroPercent)}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="height"
                    radius={[6, 6, 3, 3]}
                    maxBarSize={18}
                    isAnimationActive
                    animationDuration={750}
                  >
                    {spectrumData.map((entry) => (
                      <Cell
                        key={`spectrum-${entry.pct}`}
                        fill={entry.fill}
                        fillOpacity={entry.fillOpacity}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Clean Zone Legend */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground px-1">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: heroFillHex }}
                  />
                  <span>نطاق التارجت المحقق</span>
                </span>
                {heroRoundedPct !== null && heroRoundedPct > 100 && (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                    <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400 shrink-0" />
                    <span>تجاوز التارجت (+{heroRoundedPct - 100}%)</span>
                  </span>
                )}
              </div>
              <span className="tabular-nums font-semibold">
                المقياس: 0% — {heroAxisMax}%
              </span>
            </div>
          </div>

          {/* Stage Contribution Share Bar & Breakdown */}
          {contributionStages.length > 1 && contributionSum > 0 && (
            <div className="pt-2 border-t border-border/60 space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary flex gap-0.5">
                {contributionStages.map((st, idx) => {
                  const share = (st.achieved / contributionSum) * 100;
                  const sliceTone =
                    idx % 4 === 0
                      ? 'bg-primary'
                      : idx % 4 === 1
                        ? 'bg-emerald-500'
                        : idx % 4 === 2
                          ? 'bg-amber-500'
                          : 'bg-sky-500';
                  return (
                    <div
                      key={st.stage}
                      className={cn('h-full transition-all', sliceTone)}
                      style={{ width: `${share}%` }}
                      title={`${st.stage}: ${share.toFixed(0)}%`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span className="font-bold text-foreground">توزيع الإنجاز:</span>
                {contributionStages.map((st, idx) => {
                  const share = (st.achieved / contributionSum) * 100;
                  const dotTone =
                    idx % 4 === 0
                      ? 'bg-primary'
                      : idx % 4 === 1
                        ? 'bg-emerald-500'
                        : idx % 4 === 2
                          ? 'bg-amber-500'
                          : 'bg-sky-500';
                  return (
                    <span
                      key={st.stage}
                      className="inline-flex items-center gap-1.5 tabular-nums"
                    >
                      <span className={cn('h-2 w-2 rounded-full shrink-0', dotTone)} />
                      <span>{st.stage}</span>
                      <span className="font-bold text-foreground">{share.toFixed(0)}%</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        )}

        {/* 2. Primary KPI Strip (No duplicate overall percentage; Work Nature Allowance in its own KPI card when > 0) */}
        <div
          className={cn(
            'grid grid-cols-1 border-t border-border/70 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-border/70 bg-secondary/20',
            showBonusAndDeductions && !hideTargetsView && hasWorkNature
              ? 'sm:grid-cols-2 lg:grid-cols-4'
              : 'sm:grid-cols-3'
          )}
        >
          <div className="p-4 space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
              <span>أيام الحضور</span>
              <UserCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
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

          {showBonusAndDeductions && !hideTargetsView ? (
            <>
              <div className="p-4 space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
                  <span>الشريحة</span>
                  <Layers className="h-4 w-4 text-primary shrink-0" />
                </div>
                <div className="text-2xl font-extrabold text-foreground tabular-nums">
                  {hasBonusTier ? `شريحة ${String(s.bonus_tier)}` : '—'}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {hasBonusTier ? 'الشريحة المعتمدة في الفترة' : 'غير محددة في الفترة'}
                </div>
              </div>

              {hasWorkNature && (
                <div className="p-4 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
                    <span>بدل طبيعة العمل</span>
                    <Award className="h-4 w-4 text-primary shrink-0" />
                  </div>
                  <div className="text-2xl font-extrabold text-primary tabular-nums">
                    {fmtNumber(workNatureAllowance)}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    بدل طبيعة العمل المعتمد في الفترة
                  </div>
                </div>
              )}
            </>
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

      {afterHeroSlot}

      {/* 3. Two-Column Analytics & Structured Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Stage-by-Stage Target Progress Bars */}
        {!hideTargetsView && (
          <Card className="lg:col-span-7 flex flex-col">
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
            </CardHeader>
            <CardContent className="pt-4 flex-1">
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
        )}

        {/* Attendance, Leaves & Financial Hairline List (Zero values omitted) */}
        <Card className={cn(hideTargetsView ? 'lg:col-span-12' : 'lg:col-span-5', 'flex flex-col')}>
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0 border-b border-border/70">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <div>
                <CardTitle className="text-sm font-extrabold">تفاصيل الانضباط والساعات</CardTitle>
                <CardDescription className="text-[11px]">
                  {hideTargetsView
                    ? 'رصيد الإجازات، الغياب، وساعات الإضافي والتأخير'
                    : 'رصيد الإجازات، التأخيرات، والحوافز المعتمدة'}
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

      {/* 3b. Dedicated Daily Attendance Breakdown ("تفاصيل الحضور اليومي") */}
      <Card>
        <CardHeader className="pb-3 flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-border/70">
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-primary" />
            <div>
              <CardTitle className="text-sm font-extrabold">تفاصيل الحضور اليومي</CardTitle>
              <CardDescription className="text-[11px]">
                سجل الحضور والإجازات والغياب يوماً بيوم خلال الفترة
              </CardDescription>
            </div>
          </div>

          <div className="inline-flex items-center rounded-lg border border-border bg-secondary/40 p-1 text-[11px] no-print">
            {(
              [
                ['all', 'كل الأيام'],
                ['present', 'أيام الحضور'],
                ['absence', 'الغياب والإجازات'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setAttendanceFilter(key)}
                className={cn(
                  'rounded-md px-2.5 py-1 font-bold transition-colors cursor-pointer',
                  attendanceFilter === key
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </CardHeader>

        {/* Attendance Summary Strip */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border/60 bg-secondary/20 px-4 sm:px-6 py-2.5 text-xs tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-muted-foreground">إجمالي الحضور:</span>
            <strong className="text-emerald-600 dark:text-emerald-400">
              {fmtDecimal(presentDays)} يوم
            </strong>
          </span>
          <span className="text-border">·</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-muted-foreground">إجمالي الغياب:</span>
            <strong className={absenceDays > 0 ? 'text-destructive' : 'text-foreground'}>
              {fmtNumber(absenceDays)} يوم
            </strong>
          </span>
          {casualDays > 0 && (
            <>
              <span className="text-border">·</span>
              <span className="text-muted-foreground">
                عارضة: <strong className="text-yellow-600 dark:text-yellow-400">{fmtNumber(casualDays)}</strong>
              </span>
            </>
          )}
          {permissionDays > 0 && (
            <>
              <span className="text-border">·</span>
              <span className="text-muted-foreground">
                بإذن: <strong className="text-amber-600 dark:text-amber-400">{fmtNumber(permissionDays)}</strong>
              </span>
            </>
          )}
          {unauthDays > 0 && (
            <>
              <span className="text-border">·</span>
              <span className="text-muted-foreground">
                بدون إذن: <strong className="text-destructive">{fmtNumber(unauthDays)}</strong>
              </span>
            </>
          )}
          {sickDays > 0 && (
            <>
              <span className="text-border">·</span>
              <span className="text-muted-foreground">
                مرضي: <strong className="text-[#800020] dark:text-[#f07b93]">{fmtNumber(sickDays)}</strong>
              </span>
            </>
          )}
          {examDays > 0 && (
            <>
              <span className="text-border">·</span>
              <span className="text-muted-foreground">
                امتحان: <strong className="text-purple-600 dark:text-purple-400">{fmtNumber(examDays)}</strong>
              </span>
            </>
          )}
          {unclassifiedDays > 0 && (
            <>
              <span className="text-border">·</span>
              <span className="text-muted-foreground">
                غير مصنف: <strong className="text-foreground">{fmtNumber(unclassifiedDays)}</strong>
              </span>
            </>
          )}
        </div>

        <CardContent className="space-y-4 pt-4">
          {(() => {
            const attProfiles = displayedProfiles
              .map((p) => {
                const rawAtt = Object.entries(p.stages || {}).find(
                  ([k]) => String(k).trim() === 'الحضور'
                )?.[1];
                const items = (rawAtt || [])
                  .filter((r) => r.value !== null && r.value !== undefined && String(r.value).trim() !== '')
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((r) => {
                    const sv = String(r.value).trim();
                    const n = Number(sv);
                    const isUnauth = sv === 'ب';
                    const isPerm = sv === 'ا' || sv === 'أ';
                    const isSick = sv === 'م';
                    const isExam = sv === 'ن';
                    const isCasual = sv === 'ع';
                    const isUnclassifiedZero = sv === '0' || (Number.isFinite(n) && n === 0);
                    const isPresent = Number.isFinite(n) && n > 0;
                    const label = isUnauth
                      ? 'بدون إذن'
                      : isPerm
                        ? 'إجازة بإذن'
                        : isSick
                          ? 'مرضي'
                          : isExam
                            ? 'امتحان'
                            : isCasual
                              ? 'عارضة'
                              : isUnclassifiedZero
                                ? 'غير مصنف'
                                : isPresent
                                  ? n < 1
                                    ? `نصف يوم (${fmtDecimal(n)})`
                                    : `حضور (${fmtDecimal(n)})`
                                  : sv;
                    const toneClass = isUnauth
                      ? 'border-destructive/35 bg-destructive/8 text-destructive'
                      : isExam
                        ? 'border-purple-500/45 bg-purple-500/12 text-purple-700 dark:text-purple-300'
                        : isCasual
                          ? 'border-yellow-500/45 bg-yellow-500/12 text-yellow-700 dark:text-yellow-300'
                          : isPerm
                            ? 'border-amber-500/35 bg-amber-500/8 text-amber-700 dark:text-amber-400'
                            : isSick
                              ? 'border-[#800020]/35 bg-[#800020]/10 text-[#800020] dark:border-[#a82443]/50 dark:bg-[#800020]/25 dark:text-[#f07b93]'
                              : isUnclassifiedZero
                                ? 'border-slate-500/35 bg-slate-500/10 text-slate-700 dark:text-slate-300'
                                : isPresent
                                  ? 'border-emerald-500/30 bg-emerald-500/8 text-emerald-700 dark:text-emerald-400'
                                  : 'border-border bg-secondary/35 text-foreground';
                    return { date: r.date, isPresent, isAbsence: !isPresent, label, toneClass };
                  });
                return { shift: p.shift, items };
              })
              .filter((g) => g.items.length > 0);

            if (attProfiles.length === 0) {
              return (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  لا توجد سجلات حضور يومية مفصلة في الفترة المختارة.
                </div>
              );
            }

            return attProfiles.map((group, gIdx) => {
              const visibleItems = group.items.filter((it) => {
                if (attendanceFilter === 'present') return it.isPresent;
                if (attendanceFilter === 'absence') return it.isAbsence;
                return true;
              });

              return (
                <div key={`${group.shift}-${gIdx}`} className="space-y-2.5">
                  {duplicateShifts && (
                    <div className="text-xs font-extrabold text-primary">
                      حضور Shift {group.shift}
                    </div>
                  )}
                  {visibleItems.length === 0 ? (
                    <div className="rounded-lg border border-border py-6 text-center text-xs text-muted-foreground">
                      {attendanceFilter === 'absence'
                        ? 'لا توجد أيام غياب أو إجازات مسجلة في هذه الفترة.'
                        : 'لا توجد أيام حضور مسجلة لهذا التحديد.'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 min-[460px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                      {visibleItems.map((it) => (
                        <div
                          key={it.date}
                          className={cn(
                            'rounded-xl border px-2.5 py-2 flex flex-col justify-between gap-1 text-center transition-colors',
                            it.toneClass
                          )}
                        >
                          <div className="text-[10px] font-semibold opacity-80 leading-tight">
                            {weekdayArabic(it.date)}
                          </div>
                          <div className="text-[11px] font-extrabold tabular-nums text-foreground">
                            {it.date.slice(8)}/{it.date.slice(5, 7)}
                          </div>
                          <div className="text-[11px] font-extrabold leading-tight tabular-nums">
                            {it.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </CardContent>
      </Card>

      {/* 4. Supervisor Targets Breakdown */}
      {!hideTargetsView && supervisorSections.length > 0 && (
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
      {!hideTargetsView && (
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
                if (trimName === 'الحضور' || trimName.toUpperCase() === 'TOTAL TARGET %') {
                  return false;
                }
                return (rows || []).some(
                  (r) => r.value !== null && r.value !== undefined && r.value !== ''
                );
              })
              .sort(([aKey], [bKey]) => String(aKey).localeCompare(String(bKey), 'ar'));

            const dateSet = new Set<string>();
            stageEntries.forEach(([, rows]) => rows.forEach((r) => dateSet.add(r.date)));
            if (totalTargetEntry) totalTargetEntry[1].forEach((r) => dateSet.add(r.date));
            const allDates = [...dateSet].sort();

            const attRowsForFilter =
              Object.entries(profile.stages || {}).find(
                ([k]) => String(k).trim() === 'الحضور'
              )?.[1] || [];
            const dates =
              matrixFilter === 'absence'
                ? allDates.filter(
                    (d) =>
                      stageEntries.some(([, rows]) => {
                        const hit = rows.find((r) => r.date === d)?.value;
                        const sv = String(hit ?? '').trim();
                        return (
                          sv === 'ب' ||
                          sv === 'ا' ||
                          sv === 'أ' ||
                          sv === 'م' ||
                          sv === 'ن' ||
                          sv === 'ع'
                        );
                      }) ||
                      attRowsForFilter.some((r) => {
                        if (r.date !== d) return false;
                        const sv = String(r.value ?? '').trim();
                        const n = Number(sv);
                        return (
                          sv === 'ب' ||
                          sv === 'ا' ||
                          sv === 'أ' ||
                          sv === 'م' ||
                          sv === 'ن' ||
                          sv === 'ع' ||
                          sv === '0' ||
                          (sv !== '' && Number.isFinite(n) && n === 0)
                        );
                      })
                  )
                : allDates;

            let overallPercentSum = 0;
            let hasAnyPercent = false;

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

              const target = Number(profile.stageTargets?.[stageName]);
              const hasTarget = Number.isFinite(target) && target > 0;
              const ratio = hasNum && hasTarget ? sum / target : null;

              if (ratio !== null) {
                overallPercentSum += ratio;
                hasAnyPercent = true;
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

            const summaryPctNum =
              s.percentage !== null && s.percentage !== undefined ? Number(s.percentage) : NaN;
            const overallStagePercent = hasAnyPercent
              ? overallPercentSum
              : (!selectedStage || selectedStage === '__ALL__') && Number.isFinite(summaryPctNum)
                ? summaryPctNum
                : null;
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
                          const isAtt = String(it.stage).trim() === 'الحضور';
                          return (
                            sv === 'ب' ||
                            sv === 'ا' ||
                            sv === 'أ' ||
                            sv === 'م' ||
                            sv === 'ن' ||
                            sv === 'ع' ||
                            (isAtt && sv === '0')
                          );
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
                                  const isAtt = String(it.stage).trim() === 'الحضور';
                                  const isUnclassifiedAtt = isAtt && sv === '0';
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
                                          sv === 'ن' && 'text-purple-600 dark:text-purple-400',
                                          sv === 'ع' && 'text-yellow-600 dark:text-yellow-400',
                                          (sv === 'ا' || sv === 'أ') &&
                                            'text-amber-600 dark:text-amber-400',
                                          sv === 'م' && 'text-[#800020] dark:text-[#f07b93]',
                                          isUnclassifiedAtt && 'text-muted-foreground'
                                        )}
                                      >
                                        {sv === 'ب'
                                          ? 'بدون إذن'
                                          : sv === 'ا' || sv === 'أ'
                                            ? 'إجازة بإذن'
                                            : sv === 'م'
                                              ? 'مرضي'
                                              : sv === 'ن'
                                                ? 'امتحان'
                                                : sv === 'ع'
                                                  ? 'عارضة'
                                                  : isUnclassifiedAtt
                                                    ? 'غير مصنف'
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
                                  const isAttRow = String(row.stageName).trim() === 'الحضور';
                                  const isUnclassifiedAtt = isAttRow && strVal === '0';
                                  const isAbsentMark =
                                    strVal === 'ب' ||
                                    strVal === 'ا' ||
                                    strVal === 'أ' ||
                                    strVal === 'م' ||
                                    strVal === 'ن' ||
                                    strVal === 'ع' ||
                                    isUnclassifiedAtt;
                                  const n = Number(v);
                                  return (
                                    <TableCell
                                      key={d}
                                      className={cn(
                                        'text-center font-semibold tabular-nums',
                                        strVal === 'ب' && 'text-destructive bg-destructive/5',
                                        strVal === 'ن' &&
                                          'text-purple-600 dark:text-purple-400 bg-purple-500/8',
                                        strVal === 'ع' &&
                                          'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10',
                                        (strVal === 'ا' || strVal === 'أ') &&
                                          'text-amber-600 dark:text-amber-400 bg-amber-500/5',
                                        strVal === 'م' &&
                                          'text-[#800020] bg-[#800020]/8 dark:text-[#f07b93] dark:bg-[#800020]/20',
                                        isUnclassifiedAtt && 'text-muted-foreground bg-muted/40',
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
                                <TableCell className="text-center text-muted-foreground tabular-nums">
                                  —
                                </TableCell>
                                <TableCell className="text-center text-muted-foreground tabular-nums">
                                  —
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
      )}
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
  tone?: 'default' | 'primary' | 'success' | 'danger' | 'yellow' | 'purple' | 'burgundy';
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
          tone === 'danger' && 'text-destructive',
          tone === 'yellow' && 'text-yellow-600 dark:text-yellow-400',
          tone === 'purple' && 'text-purple-600 dark:text-purple-400',
          tone === 'burgundy' && 'text-[#800020] dark:text-[#f07b93]'
        )}
      >
        {value}
      </span>
    </div>
  );
}
