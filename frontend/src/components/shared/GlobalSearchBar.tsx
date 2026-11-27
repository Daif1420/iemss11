import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Compass,
  Layers,
  Search,
  User,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { EmployeeRecord } from '@/types/iems';

interface GlobalSearchBarProps {
  isAdminUp: boolean;
  isCreator: boolean;
  isHrManager?: boolean;
  companies: string[];
  departments: string[];
  fallbackEmployees?: { id: number; name: string; company?: string | null; shift?: string | null; department?: string | null }[];
  onFilterCompany: (company: string) => void;
  onFilterDepartment: (department: string) => void;
}

type SearchResultItem =
  | {
      kind: 'employee';
      id: string;
      title: string;
      subtitle: string;
      statusLabel?: string;
      to: string;
    }
  | {
      kind: 'department';
      id: string;
      title: string;
      subtitle: string;
      value: string;
    }
  | {
      kind: 'company';
      id: string;
      title: string;
      subtitle: string;
      value: string;
    }
  | {
      kind: 'page';
      id: string;
      title: string;
      subtitle: string;
      to: string;
    };

export function GlobalSearchBar({
  isAdminUp,
  isCreator,
  isHrManager = false,
  companies,
  departments,
  fallbackEmployees = [],
  onFilterCompany,
  onFilterDepartment,
}: GlobalSearchBarProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [directory, setDirectory] = useState<EmployeeRecord[]>([]);

  // Load complete employee directory once (active + new + left) so search spans everyone
  useEffect(() => {
    let active = true;
    api<{ employees: EmployeeRecord[] }>('/api/admin/employees')
      .then((res) => {
        if (active && Array.isArray(res.employees)) {
          setDirectory(res.employees);
        }
      })
      .catch(() => {
        // Silently keep fallbackEmployees if directory fails
      });
    return () => {
      active = false;
    };
  }, []);

  // Keyboard shortcut Ctrl+K / Cmd+K or "/" when not typing inside another input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      } else if (!inInput && e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Close on outside click
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const quickPages = useMemo(() => {
    const base = [
      { title: 'الموظفون الحاليون', subtitle: 'إدارة الموظفين النشطين على رأس العمل', to: '/employees-current.html', keywords: 'حاليون نشطين موظفين active' },
      { title: 'كل الموظفين', subtitle: 'الدليل الكامل لجميع حسابات النظام', to: '/admin-employees.html', keywords: 'الكل جميع الموظفين directory' },
      { title: 'الموظفون الجدد', subtitle: 'قائمة التعيينات والانضمامات الحديثة', to: '/employees-new.html', keywords: 'جدد جديد تعيينات new' },
      { title: 'الموظفون المغادرون', subtitle: 'سجل المغادرة وأسباب الترك', to: '/employees-left.html', keywords: 'مغادرون استقالة ترك left' },
      { title: 'طلبات الموظفين', subtitle: 'مراجعة واعتماد طلبات الإجازات والخدمات', to: '/requests.html', keywords: 'طلبات اجازات سلف requests' },
    ];
    if (!isHrManager) {
      base.push(
        { title: 'التقارير وتحليل الأداء', subtitle: 'تقارير المراحل و Top 5 وتصدير PDF / Excel', to: '/reports.html', keywords: 'تقارير تارجت اداء top 5 reports' },
        { title: 'تحديث البيانات (Excel)', subtitle: 'استيراد شيت الماستر وتحديث السجلات', to: '/admin-import.html', keywords: 'استيراد تحديث اكسل شيت import' }
      );
    }
    if (isAdminUp) {
      base.push({
        title: 'الإدخال اليدوي',
        subtitle: 'إضافة أو تعديل قيم المراحل والحضور يدوياً',
        to: '/admin-manual-entry.html',
        keywords: 'يدوي ادخال تعديل manual',
      });
    }
    if (isCreator) {
      base.push(
        {
          title: 'إعدادات النظام والبيانات',
          subtitle: 'المسح التلقائي للبيانات، الأقسام، الشيفتات، وروابط الطلبات',
          to: '/settings.html',
          keywords: 'اعدادات مسح حذف بيانات تلقائي اقسام شيفتات فورم settings purge',
        },
        {
          title: 'سجل العمليات',
          subtitle: 'مراجعة حركات التعديل والتدقيق الأمني',
          to: '/audit-logs.html',
          keywords: 'سجل عمليات تدقيق audit logs',
        },
        {
          title: 'بانر الصفحة الرئيسية',
          subtitle: 'إدارة وتحديث صورة بانر الصفحة الرئيسية',
          to: '/themes.html',
          keywords: 'بانر صورة اعلان themes banner',
        }
      );
    }
    return base;
  }, [isAdminUp, isCreator, isHrManager]);

  const results = useMemo<SearchResultItem[]>(() => {
    const q = query.trim().toLowerCase();
    const pool = directory.length ? directory : fallbackEmployees;

    const list: SearchResultItem[] = [];

    if (!q) {
      // Quick suggested navigation when opened empty
      quickPages.slice(0, 5).forEach((p) => {
        list.push({
          kind: 'page',
          id: `page-${p.to}`,
          title: p.title,
          subtitle: p.subtitle,
          to: p.to,
        });
      });
      return list;
    }

    // 1. Employees
    const empMatches: SearchResultItem[] = [];
    for (const emp of pool) {
      const nameMatch = String(emp.name || '').toLowerCase().includes(q);
      const idMatch = String(emp.id).includes(q);
      const empNumMatch =
        'emp_num' in emp && emp.emp_num != null && String(emp.emp_num).includes(q);
      const deptMatch = String(emp.department || '').toLowerCase().includes(q);
      const compMatch = String(emp.company || '').toLowerCase().includes(q);
      if (nameMatch || idMatch || empNumMatch || deptMatch || compMatch) {
        const metaParts = [
          `#${emp.id}`,
          emp.company,
          emp.shift ? `Shift ${emp.shift}` : null,
          emp.department,
        ].filter(Boolean);
        const statusVal = 'status' in emp ? emp.status : undefined;
        empMatches.push({
          kind: 'employee',
          id: `emp-${emp.id}`,
          title: emp.name,
          subtitle: metaParts.join(' · '),
          statusLabel: statusVal === 'left' ? 'مغادر' : undefined,
          to: `/employee.html?id=${emp.id}`,
        });
      }
      if (empMatches.length >= 8) break;
    }
    list.push(...empMatches);

    // 2. Departments / Stages
    departments
      .filter((d) => d.toLowerCase().includes(q))
      .slice(0, 4)
      .forEach((d) => {
        list.push({
          kind: 'department',
          id: `dept-${d}`,
          title: d,
          subtitle: 'فلترة اللوحة الرئيسية حسب القسم / المرحلة',
          value: d,
        });
      });

    // 3. Companies
    companies
      .filter((c) => c.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((c) => {
        list.push({
          kind: 'company',
          id: `comp-${c}`,
          title: c,
          subtitle: 'فلترة اللوحة الرئيسية حسب الشركة',
          value: c,
        });
      });

    // 4. Pages
    quickPages
      .filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.subtitle.toLowerCase().includes(q) ||
          p.keywords.includes(q)
      )
      .slice(0, 4)
      .forEach((p) => {
        list.push({
          kind: 'page',
          id: `page-${p.to}`,
          title: p.title,
          subtitle: p.subtitle,
          to: p.to,
        });
      });

    return list;
  }, [query, directory, fallbackEmployees, departments, companies, quickPages]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, results.length]);

  const selectItem = (item: SearchResultItem) => {
    setOpen(false);
    if (item.kind === 'employee' || item.kind === 'page') {
      navigate(item.to);
    } else if (item.kind === 'department') {
      onFilterDepartment(item.value);
    } else if (item.kind === 'company') {
      onFilterCompany(item.value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (results.length ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        results.length ? (prev - 1 + results.length) % results.length : 0
      );
    } else if (e.key === 'Enter' && open && results[activeIndex]) {
      e.preventDefault();
      selectItem(results[activeIndex]);
    }
  };

  const renderIcon = (kind: SearchResultItem['kind']) => {
    if (kind === 'employee') return <User className="h-4 w-4 text-primary" />;
    if (kind === 'department') return <Layers className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
    if (kind === 'company') return <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
    return <Compass className="h-4 w-4 text-muted-foreground" />;
  };

  const kindLabel = (kind: SearchResultItem['kind']) => {
    if (kind === 'employee') return 'موظف';
    if (kind === 'department') return 'قسم / مرحلة';
    if (kind === 'company') return 'شركة';
    return 'صفحة';
  };

  return (
    <div ref={containerRef} className="relative w-full no-print">
      <div
        className={cn(
          'flex items-center gap-2.5 rounded-xl border bg-card px-3.5 h-11 transition-all',
          open
            ? 'border-primary ring-2 ring-primary/20 shadow-sm'
            : 'border-border hover:border-primary/40'
        )}
      >
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="بحث شامل: ابحث باسم الموظف، الرقم التعريفي (ID)، القسم، الشركة، أو صفحة بالنظام..."
          className="w-full bg-transparent text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          aria-label="بحث شامل في النظام"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="مسح البحث"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd
            dir="ltr"
            className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground shrink-0"
          >
            Ctrl+K
          </kbd>
        )}
      </div>

      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-50 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3.5 py-2 text-[11px] font-semibold text-muted-foreground">
            <span>
              {query.trim()
                ? `نتائج البحث (${results.length})`
                : 'وصول سريع — ابدأ الكتابة للبحث في الموظفين والأقسام'}
            </span>
            <span className="hidden sm:inline tabular-nums">
              {directory.length ? `${directory.length} حساب مسجل` : ''}
            </span>
          </div>

          {results.length === 0 ? (
            <div className="py-8 px-4 text-center text-xs text-muted-foreground">
              لا توجد نتائج مطابقة لـ «{query.trim()}»
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
              {results.map((item, idx) => {
                const isSelected = idx === activeIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => selectItem(item)}
                    className={cn(
                      'w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-start transition-colors cursor-pointer',
                      isSelected ? 'bg-accent/70' : 'hover:bg-muted/40'
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary/80 border border-border">
                        {renderIcon(item.kind)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-bold text-foreground truncate">
                            {item.title}
                          </span>
                          {item.kind === 'employee' && item.statusLabel && (
                            <span className="text-[10px] font-bold text-destructive">
                              ({item.statusLabel})
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate tabular-nums">
                          {item.subtitle}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        {kindLabel(item.kind)}
                      </span>
                      <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground/70" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
