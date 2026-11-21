import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const ARABIC_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

// Saturday-first Arabic week headers
const WEEK_DAYS = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];

export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  required?: boolean;
  clearable?: boolean;
  className?: string;
  id?: string;
  name?: string;
  /** Optional custom formatting inside trigger button */
  displayFormat?: 'arabic' | 'iso';
}

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function todayIsoLocal(): string {
  const now = new Date();
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function formatTriggerLabel(iso: string, mode: 'arabic' | 'iso'): string {
  const parsed = parseIso(iso);
  if (!parsed) return '';
  if (mode === 'iso') return iso;
  return `${parsed.d} ${ARABIC_MONTHS[parsed.m - 1]} ${parsed.y}`;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'اختر التاريخ',
  min,
  max,
  disabled = false,
  required = false,
  clearable = false,
  className,
  id,
  name,
  displayFormat = 'arabic',
}: DatePickerProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const todayIso = useMemo(() => todayIsoLocal(), []);
  const parsedVal = parseIso(value);
  const parsedToday = parseIso(todayIso)!;

  const [open, setOpen] = useState(false);
  const [openAbove, setOpenAbove] = useState(false);
  const [alignEnd, setAlignEnd] = useState(false);

  const [viewYear, setViewYear] = useState<number>(parsedVal?.y ?? parsedToday.y);
  const [viewMonth, setViewMonth] = useState<number>(parsedVal?.m ?? parsedToday.m);

  // Sync displayed calendar month when value changes externally or dialog reopens
  useEffect(() => {
    const p = parseIso(value);
    if (p) {
      setViewYear(p.y);
      setViewMonth(p.m);
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleToggleOpen = () => {
    if (disabled) return;
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenAbove(spaceBelow < 325 && rect.top > spaceBelow);
      // In RTL, default right-0 extends leftwards; check if there's enough space on left
      setAlignEnd(rect.right < 290);
      const p = parseIso(value) || parsedToday;
      setViewYear(p.y);
      setViewMonth(p.m);
    }
    setOpen((prev) => !prev);
  };

  const stepMonth = (delta: number) => {
    let nextM = viewMonth + delta;
    let nextY = viewYear;
    if (nextM < 1) {
      nextM = 12;
      nextY -= 1;
    } else if (nextM > 12) {
      nextM = 1;
      nextY += 1;
    }
    setViewMonth(nextM);
    setViewYear(nextY);
  };

  const yearOptions = useMemo(() => {
    const base = parsedToday.y;
    const years: number[] = [];
    for (let y = base - 10; y <= base + 5; y++) years.push(y);
    if (!years.includes(viewYear)) years.push(viewYear);
    return years.sort((a, b) => a - b);
  }, [parsedToday.y, viewYear]);

  const calendarCells = useMemo(() => {
    const firstDayJs = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0 Sun..6 Sat
    // Convert JS day (Sun=0..Sat=6) to Saturday-first offset (Sat=0, Sun=1..Fri=6)
    const leadingBlanks = (firstDayJs + 1) % 7;
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: ({ day: number; iso: string; disabled: boolean } | null)[] = [];
    for (let i = 0; i < leadingBlanks; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = toIso(viewYear, viewMonth, d);
      const outOfBounds = Boolean((min && iso < min) || (max && iso > max));
      cells.push({ day: d, iso, disabled: outOfBounds });
    }
    return cells;
  }, [viewYear, viewMonth, min, max]);

  const handleSelectDay = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };

  const handleSelectToday = () => {
    if ((min && todayIso < min) || (max && todayIso > max)) return;
    onChange(todayIso);
    setOpen(false);
  };

  const handleClear = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    onChange('');
    setOpen(false);
  };

  const label = value ? formatTriggerLabel(value, displayFormat) : '';

  return (
    <div ref={wrapperRef} className={cn('relative w-full', open && 'z-40')}>
      {/* Hidden native input keeps HTML form required-field validation working seamlessly */}
      {required && (
        <input
          type="text"
          name={name}
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          onChange={() => {}}
          className="sr-only pointer-events-none"
        />
      )}

      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={handleToggleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
          className
        )}
      >
        <span className="flex items-center gap-2 min-w-0 truncate">
          <CalendarDays className="h-3.5 w-3.5 text-primary shrink-0" />
          {label ? (
            <span className="font-medium truncate tabular-nums">{label}</span>
          ) : (
            <span className="text-muted-foreground truncate">{placeholder}</span>
          )}
        </span>

        {clearable && value && !disabled && (
          <span
            role="button"
            tabIndex={0}
            aria-label="مسح التاريخ"
            onClick={handleClear}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClear();
              }
            }}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="اختيار التاريخ"
          dir="rtl"
          className={cn(
            'absolute z-50 w-[286px] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl',
            openAbove ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            alignEnd ? 'left-0' : 'right-0'
          )}
        >
          {/* Month / Year Controls */}
          <div className="flex items-center justify-between gap-1.5 pb-2.5 mb-2 border-b border-border">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              aria-label="الشهر السابق"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-secondary/50 text-foreground hover:bg-muted cursor-pointer shrink-0"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-1 flex-1 min-w-0 justify-center">
              <select
                aria-label="الشهر"
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="h-7 rounded-md border border-border bg-background px-1.5 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                {ARABIC_MONTHS.map((mName, idx) => (
                  <option key={mName} value={idx + 1}>
                    {mName}
                  </option>
                ))}
              </select>
              <select
                aria-label="السنة"
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="h-7 rounded-md border border-border bg-background px-1.5 text-xs font-bold text-foreground tabular-nums focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => stepMonth(1)}
              aria-label="الشهر التالي"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-secondary/50 text-foreground hover:bg-muted cursor-pointer shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          {/* Weekday Headings */}
          <div className="grid grid-cols-7 gap-1 mb-1 text-center">
            {WEEK_DAYS.map((wd) => (
              <div
                key={wd}
                className="h-6 flex items-center justify-center text-[11px] font-bold text-muted-foreground"
              >
                {wd}
              </div>
            ))}
          </div>

          {/* Day Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {calendarCells.map((cell, idx) => {
              if (!cell) return <div key={`blank-${idx}`} className="h-8" />;
              const isSelected = cell.iso === value;
              const isToday = cell.iso === todayIso;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  disabled={cell.disabled}
                  onClick={() => handleSelectDay(cell.iso)}
                  className={cn(
                    'h-8 w-full rounded-md text-xs font-semibold tabular-nums transition-colors flex items-center justify-center',
                    cell.disabled
                      ? 'text-muted-foreground/35 cursor-not-allowed'
                      : 'cursor-pointer hover:bg-accent hover:text-accent-foreground',
                    isToday && !isSelected && 'ring-1 ring-primary/60 text-primary font-bold',
                    isSelected && 'bg-primary text-primary-foreground font-extrabold hover:bg-primary/90 hover:text-primary-foreground'
                  )}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Quick Footer */}
          <div className="flex items-center justify-between gap-2 pt-2.5 mt-2 border-t border-border text-xs">
            <button
              type="button"
              onClick={handleSelectToday}
              disabled={Boolean((min && todayIso < min) || (max && todayIso > max))}
              className="rounded-md px-2 py-1 font-bold text-primary hover:bg-primary/10 disabled:opacity-40 cursor-pointer"
            >
              اليوم
            </button>
            {clearable ? (
              <button
                type="button"
                onClick={() => handleClear()}
                className="rounded-md px-2 py-1 font-semibold text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              >
                مسح
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 font-semibold text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              >
                إغلاق
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
