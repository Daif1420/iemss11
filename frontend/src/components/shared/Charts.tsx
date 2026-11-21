import { useState } from 'react';
import type { AttendanceCompanyRow, AttendanceDailyRow } from '@/types/iems';
import { fmtDate, fmtDecimal, fmtWholePercent } from '@/lib/format';

export function CompanyComparisonChart({ companies }: { companies: AttendanceCompanyRow[] }) {
  const rows = companies.filter((c) => c.total > 0 || c.employee_count > 0);
  if (!rows.length) {
    return (
      <div className="flex h-52 items-center justify-center text-xs text-muted-foreground">
        لا توجد بيانات مقارنة متاحة
      </div>
    );
  }

  const maxTotal = Math.max(...rows.map((r) => Math.max(r.present + r.absent, 1)), 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-4 text-[11px] font-semibold text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs bg-primary inline-block" />
          الحضور
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs bg-destructive/80 inline-block" />
          الغياب
        </span>
      </div>

      <div className="space-y-3.5">
        {rows.map((c) => {
          const presentPct = (c.present / maxTotal) * 100;
          const absentPct = (c.absent / maxTotal) * 100;
          return (
            <div key={c.name} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground">{c.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {fmtDecimal(c.employee_count)} موظف · نسبة الحضور{' '}
                  <b className="text-foreground">{fmtWholePercent(c.attendance_rate)}</b>
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary flex">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${Math.min(100, presentPct)}%` }}
                  title={`حضور: ${fmtDecimal(c.present)}`}
                />
                <div
                  className="h-full bg-destructive/80 transition-all duration-300"
                  style={{ width: `${Math.min(100 - Math.min(100, presentPct), absentPct)}%` }}
                  title={`غياب: ${fmtDecimal(c.absent)}`}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                <span>حضور: {fmtDecimal(c.present)}</span>
                <span>غياب: {fmtDecimal(c.absent)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DailyAttendanceTrendChart({ daily }: { daily: AttendanceDailyRow[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!daily.length) {
    return (
      <div className="flex h-52 items-center justify-center text-xs text-muted-foreground">
        لا توجد بيانات يومية في هذه الفترة
      </div>
    );
  }

  const sliced = daily.slice(-31);
  const w = 720;
  const h = 190;
  const padL = 36;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const barSlot = chartW / sliced.length;
  const barW = Math.max(4, Math.min(18, barSlot * 0.58));

  const hovered = hoveredIndex !== null ? sliced[hoveredIndex] : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs min-h-[22px]">
        <span className="text-muted-foreground font-semibold">
          مؤشر نسبة الحضور اليومية ({sliced.length} يوم)
        </span>
        {hovered ? (
          <span className="text-xs font-bold text-foreground tabular-nums">
            {fmtDate(hovered.date)} — نسبة الحضور:{' '}
            <span className="text-primary">{fmtWholePercent(hovered.attendance_rate)}</span> (حضور{' '}
            {fmtDecimal(hovered.present)} / غياب {fmtDecimal(hovered.absent)})
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">مرّر المؤشر فوق أي عمود للتفاصيل</span>
        )}
      </div>

      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-48 min-w-[460px] select-none">
          {[0, 25, 50, 75, 100].map((tick) => {
            const y = padT + chartH - (tick / 100) * chartH;
            return (
              <g key={tick}>
                <line
                  x1={padL}
                  y1={y}
                  x2={w - padR}
                  y2={y}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth="1"
                  strokeDasharray={tick === 0 ? undefined : '3 3'}
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-muted-foreground text-[9px] tabular-nums"
                >
                  {tick}%
                </text>
              </g>
            );
          })}

          {sliced.map((d, idx) => {
            const rate = Math.max(0, Math.min(100, Number(d.attendance_rate || 0)));
            const barH = (rate / 100) * chartH;
            const x = padL + idx * barSlot + (barSlot - barW) / 2;
            const y = padT + chartH - barH;
            const isHovered = hoveredIndex === idx;
            const showLabel =
              sliced.length <= 12 || idx === 0 || idx === sliced.length - 1 || idx % 5 === 0;

            return (
              <g
                key={d.date}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                className="cursor-pointer"
              >
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(2, barH)}
                  rx={3}
                  className={isHovered ? 'fill-primary' : 'fill-primary/75'}
                />
                {showLabel && (
                  <text
                    x={x + barW / 2}
                    y={h - 8}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[9px] tabular-nums"
                  >
                    {d.date.slice(5)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
