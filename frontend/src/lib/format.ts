import type { EmployeeStatus, RequestStatus, Role } from '@/types/iems';

export const DEPARTURE_REASONS = [
  'استقالة',
  'كثرة الغياب عن العمل',
  'ضعف الأداء / عدم تحقيق التارجت',
  'مخالفة لوائح العمل',
  'مخالفة إدارية / سلوكية',
  'ترك العمل بدون إخطار',
  'خدمة الوطن (الجيش)',
] as const;

export const ROLE_LABELS: Record<Role, string> = {
  system_creator: 'منشئ النظام',
  admin: 'مدير النظام',
  hr_manager: 'مدير الموارد البشرية',
  supervisor: 'مشرف',
  employee: 'موظف',
};

export const STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: 'نشط',
  left: 'غادر',
  archive: 'أرشيف',
};

export const MISSING_REASONS: Record<string, string> = {
  missing: 'اليوم غير مسجل نهائيًا',
  incomplete: 'البيانات مسجلة بشكل ناقص',
  wrong: 'الكمية المسجلة غير صحيحة',
};

export const LEAVE_TYPES: Record<string, string> = {
  annual: 'اعتيادية',
  casual: 'عارضة',
  sick: 'مرضية',
  unpaid: 'بدون مرتب',
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: 'قيد المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
  cancelled: 'ملغي',
};

export const REQUEST_KIND_LABELS: Record<'missing' | 'leave' | 'advance', string> = {
  missing: 'استكمال بيانات',
  leave: 'إجازة',
  advance: 'سلفة',
};

export function fmtNumber(v: unknown): string {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
}

export function fmtDecimal(v: unknown, maxFraction = 2): string {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFraction,
  });
}

export function fmtHours(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const hours = n > 0 && n < 1 ? n * 24 : n;
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function fmtPercent(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

export function fmtWholePercent(v: unknown): string {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return '0%';
  return `${Math.round(n)}%`;
}

export function percentTone(value: unknown): 'low' | 'mid' | 'high' | 'none' {
  if (value === null || value === undefined || value === '') return 'none';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'none';
  const pct = n * 100;
  if (pct < 50) return 'low';
  if (pct < 70) return 'mid';
  return 'high';
}

export function fmtDate(v?: string | null): string {
  if (!v) return '—';
  const day = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

export function fmtDateTime(v?: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
}

export function weekdayArabic(dateStr: string): string {
  const names = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const parsed = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? '—' : names[parsed.getUTCDay()];
}

export function payrollCycle(
  dateStr: string,
  startDay = 21,
  endDay = 20,
  monthDaysCount: 'auto' | '30' | '31' = 'auto'
): { start: string; end: string; monthKey: string } {
  const sDay = Math.min(28, Math.max(1, Math.round(Number(startDay) || 21)));
  const eDay = Math.min(31, Math.max(1, Math.round(Number(endDay) || 20)));
  const d = new Date(`${dateStr}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  if (sDay === 1 && eDay >= 28) {
    const start = new Date(Date.UTC(y, m, 1));
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const effectiveMax = monthDaysCount === '30' ? Math.min(30, lastDay) : lastDay;
    const end = new Date(Date.UTC(y, m, Math.min(eDay, effectiveMax)));
    const s = start.toISOString().slice(0, 10);
    return { start: s, end: end.toISOString().slice(0, 10), monthKey: s.slice(0, 7) };
  }
  const start = new Date(
    Date.UTC(day >= sDay ? y : m === 0 ? y - 1 : y, day >= sDay ? m : m === 0 ? 11 : m - 1, sDay)
  );
  const nextMonthLast = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 2, 0)
  ).getUTCDate();
  const effectiveNextMax =
    monthDaysCount === '30' ? Math.min(30, nextMonthLast) : nextMonthLast;
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, Math.min(eDay, effectiveNextMax))
  );
  const s = start.toISOString().slice(0, 10);
  return { start: s, end: end.toISOString().slice(0, 10), monthKey: s.slice(0, 7) };
}

export function stageDisplay(stage: string[] | string | undefined | null, joiner = ' + '): string {
  if (!stage || stage === '__ALL__') return 'كل المراحل';
  return Array.isArray(stage) ? stage.join(joiner) : String(stage);
}
