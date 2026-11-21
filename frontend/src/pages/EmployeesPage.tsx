import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowUpDown,
  Award,
  Check,
  CheckCircle2,
  Eye,
  FilterX,
  Lock,
  LockKeyhole,
  PencilLine,
  RotateCcw,
  Search,
  Trash2,
  UserRoundCheck,
  UserRoundMinus,
  UserRoundPlus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/lib/api';
import {
  DEPARTURE_REASONS,
  ROLE_LABELS,
  STATUS_LABELS,
  fmtDate,
  fmtNumber,
} from '@/lib/format';
import { exportDepartedExcel, exportDepartedPdf } from '@/lib/export';
import type {
  EmployeeRecord,
  EmployeeStatus,
  PublicSystemConfigPayload,
  Role,
} from '@/types/iems';
import { cn } from '@/lib/utils';
import { AppShell } from '@/components/layout/AppShell';
import { ExportActionButton } from '@/components/shared/ExportButtons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

export type EmployeesPageMode = 'all' | 'current' | 'left' | 'new';

const SECTION_TABS: { mode: EmployeesPageMode; to: string; label: string; icon: typeof Users }[] = [
  { mode: 'all', to: '/admin-employees.html', label: 'كل الموظفين', icon: Users },
  { mode: 'current', to: '/employees-current.html', label: 'الحاليون', icon: UserRoundCheck },
  { mode: 'left', to: '/employees-left.html', label: 'المغادرون', icon: UserRoundMinus },
  { mode: 'new', to: '/employees-new.html', label: 'الجدد', icon: UserRoundPlus },
];

const SHIFT_CHOICES = ['A', 'B', 'C', 'D', 'OTHER'] as const;

type SortKey = 'name' | 'id' | 'company' | 'shift' | 'left_date' | 'created_at';

export function EmployeesPage({ mode }: { mode: EmployeesPageMode }) {
  const { user, isCreator, isAdminUp } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [rows, setRows] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState(() => searchParams.get('company') || '__ALL__');
  const [shiftFilter, setShiftFilter] = useState('__ALL__');
  const [deptFilter, setDeptFilter] = useState('__ALL__');
  const [eduFilter, setEduFilter] = useState(() => searchParams.get('education') || '__ALL__');
  const [roleFilter, setRoleFilter] = useState('__ALL__');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || '__ALL__');

  // Left-mode extra filters
  const [reasonFilter, setReasonFilter] = useState('__ALL__');
  const [leftDateFrom, setLeftDateFrom] = useState('');
  const [leftDateTo, setLeftDateTo] = useState('');

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Bulk selection (creator on all mode)
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // Modals state
  const [editEmp, setEditEmp] = useState<EmployeeRecord | null>(null);
  const [editForm, setEditForm] = useState({
    newId: '',
    name: '',
    company: '',
    shift: '',
    department: '',
    education: '',
    residence: '',
  });
  const [editSaving, setEditSaving] = useState(false);

  const [pwEmp, setPwEmp] = useState<EmployeeRecord | null>(null);
  const [pwValue, setPwValue] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const [supRoleEmp, setSupRoleEmp] = useState<EmployeeRecord | null>(null);
  const [supShifts, setSupShifts] = useState<string[]>([]);
  const [supSaving, setSupSaving] = useState(false);

  const [departureEmp, setDepartureEmp] = useState<EmployeeRecord | null>(null);
  const [departureDate, setDepartureDate] = useState('');
  const [departureReason, setDepartureReason] = useState('');
  const [departureSaving, setDepartureSaving] = useState(false);

  const [confirmAction, setConfirmAction] = useState<{
    type: 'delete' | 'reset-default' | 'reactivate';
    emp: EmployeeRecord;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [configuredDepartureReasons, setConfiguredDepartureReasons] = useState<string[]>([
    ...DEPARTURE_REASONS,
  ]);

  useEffect(() => {
    let active = true;
    api<PublicSystemConfigPayload>('/api/admin/system/public-config')
      .then((cfg) => {
        if (!active) return;
        const list = cfg.departmentsAndLists?.departureReasons;
        if (Array.isArray(list) && list.length) {
          setConfiguredDepartureReasons([...new Set([...list, ...DEPARTURE_REASONS])]);
        }
      })
      .catch(() => {
        // default DEPARTURE_REASONS already set
      });
    return () => {
      active = false;
    };
  }, []);

  // Sync initial URL filters when navigating from Home KPIs
  useEffect(() => {
    if (mode === 'all') {
      setCompanyFilter(searchParams.get('company') || '__ALL__');
      setEduFilter(searchParams.get('education') || '__ALL__');
      setStatusFilter(searchParams.get('status') || '__ALL__');
    } else {
      setCompanyFilter('__ALL__');
      setEduFilter('__ALL__');
      setStatusFilter('__ALL__');
      setRoleFilter('__ALL__');
    }
    setSearch('');
    setShiftFilter('__ALL__');
    setDeptFilter('__ALL__');
    setReasonFilter('__ALL__');
    setLeftDateFrom('');
    setLeftDateTo('');
    setSelectedIds([]);
  }, [mode, searchParams]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === 'all') {
        const res = await api<{ employees: EmployeeRecord[] }>('/api/admin/employees');
        setRows(res.employees || []);
      } else {
        const grp = mode === 'new' ? 'all' : mode;
        const res = await api<{ employees: EmployeeRecord[] }>(`/api/admin/employee-group/${grp}`);
        let list = res.employees || [];
        if (mode === 'new') {
          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          list = list.filter((e) => {
            if (!e.created_at) return false;
            const d = new Date(e.created_at);
            return Number.isFinite(d.getTime()) && d >= monthStart;
          });
        }
        setRows(list);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر تحميل قائمة الموظفين');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Distinct dropdown options
  const metaOptions = useMemo(() => {
    const companies = [...new Set(rows.map((r) => String(r.company || '').trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'ar')
    );
    const shifts = [...new Set(rows.map((r) => String(r.shift || '').trim()).filter(Boolean))].sort();
    const departments = [...new Set(rows.map((r) => String(r.department || '').trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'ar')
    );
    const educations = [...new Set(rows.map((r) => String(r.education || '').trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'ar')
    );
    return { companies, shifts, departments, educations };
  }, [rows]);

  // Base filtered rows (excluding departure reason for accurate reason KPI counts on left mode)
  const baseFilteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((e) => {
      if (q) {
        const match =
          e.name.toLowerCase().includes(q) ||
          String(e.id).includes(q) ||
          String(e.company || '').toLowerCase().includes(q) ||
          String(e.department || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      if (companyFilter !== '__ALL__') {
        const compUpper = String(e.company || '').toUpperCase().trim();
        if (companyFilter === 'smart') {
          if (!compUpper.includes('SMART') && compUpper !== 'SB') return false;
        } else if (companyFilter === 'bravos') {
          if (!compUpper.includes('BRAVOS')) return false;
        } else if (String(e.company || '').trim() !== companyFilter) {
          return false;
        }
      }

      if (shiftFilter !== '__ALL__' && String(e.shift || '').trim() !== shiftFilter) return false;
      if (deptFilter !== '__ALL__' && String(e.department || '').trim() !== deptFilter) return false;
      if (eduFilter !== '__ALL__' && String(e.education || '').trim() !== eduFilter) return false;

      if (mode === 'all') {
        if (roleFilter !== '__ALL__' && (e.role || 'employee') !== roleFilter) return false;
        if (statusFilter !== '__ALL__' && (e.status || 'active') !== statusFilter) return false;
      }

      if (mode === 'left') {
        const ld = e.left_date ? String(e.left_date).slice(0, 10) : '';
        if (leftDateFrom && (!ld || ld < leftDateFrom)) return false;
        if (leftDateTo && (!ld || ld > leftDateTo)) return false;
      }

      return true;
    });
  }, [
    rows,
    search,
    companyFilter,
    shiftFilter,
    deptFilter,
    eduFilter,
    mode,
    roleFilter,
    statusFilter,
    leftDateFrom,
    leftDateTo,
  ]);

  const departureReasonCounts = useMemo(() => {
    if (mode !== 'left') return [];
    const reasons = [
      ...new Set(rows.map((e) => String(e.departure_reason || '').trim()).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b, 'ar'));
    return reasons.map((reason) => ({
      reason,
      count: baseFilteredRows.filter((e) => String(e.departure_reason || '').trim() === reason).length,
    }));
  }, [mode, rows, baseFilteredRows]);

  const filteredAndSortedRows = useMemo(() => {
    const list =
      mode === 'left' && reasonFilter !== '__ALL__'
        ? baseFilteredRows.filter((e) => String(e.departure_reason || '').trim() === reasonFilter)
        : baseFilteredRows;

    return [...list].sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'id') return (a.id - b.id) * mul;
      const va = String(a[sortKey] || '');
      const vb = String(b[sortKey] || '');
      return va.localeCompare(vb, 'ar') * mul;
    });
  }, [baseFilteredRows, mode, reasonFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const resetAllFilters = () => {
    setSearch('');
    setCompanyFilter('__ALL__');
    setShiftFilter('__ALL__');
    setDeptFilter('__ALL__');
    setEduFilter('__ALL__');
    setRoleFilter('__ALL__');
    setStatusFilter('__ALL__');
    setReasonFilter('__ALL__');
    setLeftDateFrom('');
    setLeftDateTo('');
    if (mode === 'all') setSearchParams({}, { replace: true });
  };

  // Selectable IDs (creator bulk delete excludes primary admin & self)
  const selectableIds = useMemo(
    () =>
      filteredAndSortedRows
        .filter((e) => !e.is_primary_admin && e.id !== user?.id)
        .map((e) => e.id),
    [filteredAndSortedRows, user?.id]
  );

  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !selectableIds.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...selectableIds])]);
    }
  };

  // Role Change Handler
  const handleRoleChange = async (emp: EmployeeRecord, nextRole: Role) => {
    if (nextRole === 'supervisor') {
      setSupRoleEmp(emp);
      setSupShifts(
        Array.isArray(emp.supervisor_shifts) && emp.supervisor_shifts.length
          ? emp.supervisor_shifts
          : emp.shift
            ? [String(emp.shift).toUpperCase()]
            : []
      );
      return;
    }
    try {
      await api(`/api/admin/employee/${emp.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      });
      toast.success(`تم تحديث صلاحية ${emp.name} إلى ${ROLE_LABELS[nextRole]}`);
      loadData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر تحديث الصلاحية');
    }
  };

  const handleSaveSupervisorRole = async () => {
    if (!supRoleEmp) return;
    if (!supShifts.length) {
      toast.error('اختر شيفتًا واحدًا على الأقل للمشرف.');
      return;
    }
    setSupSaving(true);
    try {
      await api(`/api/admin/employee/${supRoleEmp.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: 'supervisor', supervisorShifts: supShifts }),
      });
      toast.success(`تم تعيين ${supRoleEmp.name} مشرفًا للشيفتات المحددة`);
      setSupRoleEmp(null);
      loadData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر حفظ الصلاحية');
    } finally {
      setSupSaving(false);
    }
  };

  // Edit Employee Handler
  const openEditDialog = (emp: EmployeeRecord) => {
    setEditEmp(emp);
    setEditForm({
      newId: String(emp.id),
      name: emp.name || '',
      company: emp.company || '',
      shift: emp.shift || '',
      department: emp.department || '',
      education: emp.education || '',
      residence: emp.residence || '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEmp) return;
    setEditSaving(true);
    try {
      await api(`/api/admin/employee/${editEmp.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          newId: Number(editForm.newId),
          name: editForm.name.trim(),
          company: editForm.company.trim() || null,
          shift: editForm.shift.trim() || null,
          department: editForm.department.trim() || null,
          education: editForm.education.trim() || null,
          residence: editForm.residence.trim() || null,
        }),
      });
      toast.success('تم تحديث بيانات الموظف بنجاح');
      setEditEmp(null);
      loadData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر تحديث بيانات الموظف');
    } finally {
      setEditSaving(false);
    }
  };

  // Password Change Handler
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwEmp) return;
    if (pwValue.length < 4) {
      toast.error('كلمة المرور يجب أن تكون 4 أحرف على الأقل.');
      return;
    }
    setPwSaving(true);
    try {
      await api(`/api/admin/employee/${pwEmp.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: pwValue }),
      });
      toast.success(`تم تغيير كلمة مرور ${pwEmp.name}`);
      setPwEmp(null);
      setPwValue('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر تغيير كلمة المرور');
    } finally {
      setPwSaving(false);
    }
  };

  // Departure Handler
  const openDepartureDialog = (emp: EmployeeRecord) => {
    setDepartureEmp(emp);
    setDepartureDate(
      emp.left_date ? String(emp.left_date).slice(0, 10) : new Date().toISOString().slice(0, 10)
    );
    setDepartureReason(emp.departure_reason || '');
  };

  const handleSaveDeparture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!departureEmp) return;
    if (!departureDate || !departureReason) {
      toast.error('اختر تاريخ المغادرة وسبب المغادرة.');
      return;
    }
    setDepartureSaving(true);
    try {
      await api(`/api/admin/employee/${departureEmp.id}/departure`, {
        method: 'PATCH',
        body: JSON.stringify({ leftDate: departureDate, reason: departureReason }),
      });
      toast.success(`تم تحديث حالة مغادرة ${departureEmp.name}`);
      setDepartureEmp(null);
      loadData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر حفظ بيانات المغادرة');
    } finally {
      setDepartureSaving(false);
    }
  };

  // Single Confirmed Action Handler
  const executeConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, emp } = confirmAction;
    setConfirmBusy(true);
    try {
      if (type === 'delete') {
        await api(`/api/admin/employee/${emp.id}`, { method: 'DELETE' });
        toast.success(`تم حذف ${emp.name} بنجاح`);
        setSelectedIds((prev) => prev.filter((id) => id !== emp.id));
      } else if (type === 'reset-default') {
        const res = await api<{ password?: string }>(
          `/api/admin/employee/${emp.id}/reset-default`,
          { method: 'POST' }
        );
        toast.success(`تمت إعادة كلمة مرور ${emp.name} إلى الافتراضية (${res.password || 'P@ssw0rd'})`);
      } else if (type === 'reactivate') {
        await api(`/api/admin/employee/${emp.id}/reactivate`, { method: 'PATCH' });
        toast.success(`تمت إعادة تفعيل ${emp.name} على رأس العمل`);
      }
      setConfirmAction(null);
      loadData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر تنفيذ العملية');
    } finally {
      setConfirmBusy(false);
    }
  };

  // Bulk Delete Handler
  const executeBulkDelete = async () => {
    if (!selectedIds.length) return;
    setConfirmBusy(true);
    let okCount = 0;
    let failCount = 0;
    for (const id of selectedIds) {
      try {
        await api(`/api/admin/employee/${id}`, { method: 'DELETE' });
        okCount++;
      } catch {
        failCount++;
      }
    }
    setConfirmBusy(false);
    setBulkDeleteOpen(false);
    setSelectedIds([]);
    if (okCount) toast.success(`تم حذف ${okCount} موظف بنجاح`);
    if (failCount) toast.error(`تعذر حذف ${failCount} حساب`);
    loadData();
  };

  const handleExportLeftPdf = async () => {
    setPdfBusy(true);
    try {
      const parts = [
        reasonFilter !== '__ALL__' ? `السبب: ${reasonFilter}` : 'كل الأسباب',
        shiftFilter !== '__ALL__' ? `شيفت ${shiftFilter}` : null,
        companyFilter !== '__ALL__' ? companyFilter : null,
        leftDateFrom || leftDateTo ? `${leftDateFrom || '...'} → ${leftDateTo || '...'}` : null,
      ].filter(Boolean);
      await exportDepartedPdf(filteredAndSortedRows, parts.join(' · '), user?.name || '—');
      toast.success('تم إنشاء ملف PDF');
    } catch {
      toast.error('تعذر إنشاء ملف PDF');
    } finally {
      setPdfBusy(false);
    }
  };

  const pageMeta = {
    all: {
      title: 'إدارة الموظفين',
      sub: 'عرض وتصفية كافة الموظفين والتحكم بالبيانات والصلاحيات',
    },
    current: {
      title: 'الموظفون الحاليون',
      sub: 'الموظفون النشطون على رأس العمل حالياً',
    },
    left: {
      title: 'الموظفون المغادرون',
      sub: 'سجل حالات المغادرة مع تواريخ وأسباب ترك العمل',
    },
    new: {
      title: 'الموظفون الجدد',
      sub: 'الموظفون المضافون إلى النظام خلال الشهر الحالي',
    },
  }[mode];

  const colSpanCount =
    mode === 'all'
      ? (isCreator ? 1 : 0) + 9
      : mode === 'left'
        ? 9
        : mode === 'new'
          ? 8
          : 8;

  return (
    <AppShell>
      <div className="space-y-5">
        {/* Top Section Tabs + Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
              {pageMeta.title}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{pageMeta.sub}</p>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1">
            {SECTION_TABS.map((t) => {
              const Icon = t.icon;
              const active = t.mode === mode;
              return (
                <Link
                  key={t.mode}
                  to={t.to}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{t.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Left-mode Dynamic Departure Reason Filter Cards */}
        {mode === 'left' && !loading && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setReasonFilter('__ALL__')}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors cursor-pointer',
                reasonFilter === '__ALL__'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-foreground hover:bg-muted/50'
              )}
            >
              <span>كل الأسباب</span>
              <Badge variant="secondary" className="tabular-nums">
                {baseFilteredRows.length}
              </Badge>
            </button>

            {departureReasonCounts.map((item) => (
              <button
                key={item.reason}
                type="button"
                onClick={() =>
                  setReasonFilter((cur) => (cur === item.reason ? '__ALL__' : item.reason))
                }
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer',
                  reasonFilter === item.reason
                    ? 'border-primary bg-primary/10 text-primary font-bold'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <span>{item.reason}</span>
                <Badge variant="outline" className="tabular-nums">
                  {item.count}
                </Badge>
              </button>
            ))}
          </div>
        )}

        {/* Filter Card */}
        <Card>
          <CardContent className="p-3.5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2.5">
              <div className="relative sm:col-span-2 md:col-span-2 xl:col-span-1">
                <Search className="h-3.5 w-3.5 text-muted-foreground absolute right-2.5 top-2.5" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث بالاسم أو ID..."
                  className="h-9 pr-8 text-xs"
                />
              </div>

              <NativeSelect
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="h-9 text-xs"
              >
                <option value="__ALL__">كل الشركات</option>
                <option value="smart">SMART BUSINESS</option>
                <option value="bravos">BRAVOS</option>
                {metaOptions.companies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>

              <NativeSelect
                value={shiftFilter}
                onChange={(e) => setShiftFilter(e.target.value)}
                className="h-9 text-xs"
              >
                <option value="__ALL__">كل الشيفتات</option>
                {metaOptions.shifts.map((s) => (
                  <option key={s} value={s}>
                    Shift {s}
                  </option>
                ))}
              </NativeSelect>

              <NativeSelect
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="h-9 text-xs"
              >
                <option value="__ALL__">كل الأقسام</option>
                {metaOptions.departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </NativeSelect>

              <NativeSelect
                value={eduFilter}
                onChange={(e) => setEduFilter(e.target.value)}
                className="h-9 text-xs"
              >
                <option value="__ALL__">كل الفئات</option>
                {metaOptions.educations.map((ed) => (
                  <option key={ed} value={ed}>
                    {ed}
                  </option>
                ))}
              </NativeSelect>

              {mode === 'all' ? (
                <NativeSelect
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-9 text-xs"
                >
                  <option value="__ALL__">كل الحالات</option>
                  <option value="active">نشط</option>
                  <option value="left">غادر</option>
                  <option value="archive">أرشيف</option>
                </NativeSelect>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetAllFilters}
                  className="h-9 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>إعادة ضبط</span>
                </Button>
              )}
            </div>

            {mode === 'all' && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/60">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-44">
                    <NativeSelect
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                      className="h-8 text-xs"
                    >
                      <option value="__ALL__">كل الصلاحيات</option>
                      <option value="employee">موظف</option>
                      <option value="supervisor">مشرف</option>
                      <option value="admin">مدير النظام</option>
                      <option value="system_creator">منشئ النظام</option>
                    </NativeSelect>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resetAllFilters}
                    className="h-8 text-xs text-muted-foreground"
                  >
                    <FilterX className="h-3.5 w-3.5" />
                    <span>مسح الفلاتر</span>
                  </Button>
                </div>

                {isCreator && selectedIds.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="tabular-nums">
                      محدد: {selectedIds.length}
                    </Badge>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setBulkDeleteOpen(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>حذف المحدد</span>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {mode === 'left' && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/60">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">من:</span>
                    <div className="w-40">
                      <DatePicker
                        value={leftDateFrom}
                        onChange={setLeftDateFrom}
                        clearable
                        placeholder="من تاريخ"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">إلى:</span>
                    <div className="w-40">
                      <DatePicker
                        value={leftDateTo}
                        min={leftDateFrom || undefined}
                        onChange={setLeftDateTo}
                        clearable
                        placeholder="إلى تاريخ"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <ExportActionButton
                    kind="excel"
                    onClick={() => exportDepartedExcel(filteredAndSortedRows)}
                  />
                  <ExportActionButton
                    kind="pdf"
                    loading={pdfBusy}
                    onClick={handleExportLeftPdf}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Employees Table */}
        <Card>
          <CardHeader className="py-3 px-4 flex-row items-center justify-between space-y-0 border-b border-border">
            <CardTitle className="text-sm font-bold">
              النتائج ({fmtNumber(filteredAndSortedRows.length)})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-2.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-md" />
                ))}
              </div>
            ) : (
              <div className="max-h-[620px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {mode === 'all' && isCreator && (
                        <TableHead className="w-10 text-center">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={toggleSelectAll}
                            aria-label="تحديد الكل"
                          />
                        </TableHead>
                      )}
                      <TableHead>
                        <button
                          type="button"
                          onClick={() => toggleSort('name')}
                          className="inline-flex items-center gap-1 cursor-pointer hover:text-foreground"
                        >
                          <span>الاسم</span>
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
                      <TableHead>
                        <button
                          type="button"
                          onClick={() => toggleSort('company')}
                          className="inline-flex items-center gap-1 cursor-pointer hover:text-foreground"
                        >
                          <span>الشركة</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          onClick={() => toggleSort('shift')}
                          className="inline-flex items-center gap-1 cursor-pointer hover:text-foreground"
                        >
                          <span>الشيفت</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                      <TableHead>القسم</TableHead>
                      <TableHead>الفئة</TableHead>
                      {mode === 'all' && <TableHead>الحالة</TableHead>}
                      {mode === 'all' && <TableHead>الصلاحية</TableHead>}
                      {mode === 'left' && (
                        <>
                          <TableHead>
                            <button
                              type="button"
                              onClick={() => toggleSort('left_date')}
                              className="inline-flex items-center gap-1 cursor-pointer hover:text-foreground"
                            >
                              <span>تاريخ المغادرة</span>
                              <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </TableHead>
                          <TableHead>سبب المغادرة</TableHead>
                        </>
                      )}
                      {mode === 'new' && (
                        <TableHead>
                          <button
                            type="button"
                            onClick={() => toggleSort('created_at')}
                            className="inline-flex items-center gap-1 cursor-pointer hover:text-foreground"
                          >
                            <span>تاريخ الإضافة</span>
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </TableHead>
                      )}
                      <TableHead className="text-center">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAndSortedRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={colSpanCount}
                          className="py-10 text-center text-xs text-muted-foreground"
                        >
                          لا توجد نتائج مطابقة
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAndSortedRows.map((emp) => {
                        const statusVal = (emp.status || 'active') as EmployeeStatus;
                        const roleVal = (emp.role || 'employee') as Role;
                        const isProtected = !!emp.is_primary_admin;
                        const isSelf = emp.id === user?.id;
                        const canManageRole =
                          mode === 'all' &&
                          isAdminUp &&
                          !isProtected &&
                          !isSelf &&
                          (isCreator || roleVal !== 'system_creator');

                        return (
                          <TableRow key={emp.id}>
                            {mode === 'all' && isCreator && (
                              <TableCell className="text-center">
                                {!isProtected && !isSelf ? (
                                  <Checkbox
                                    checked={selectedIds.includes(emp.id)}
                                    onCheckedChange={(checked: boolean | 'indeterminate') => {
                                      setSelectedIds((prev) =>
                                        checked
                                          ? [...prev, emp.id]
                                          : prev.filter((id) => id !== emp.id)
                                      );
                                    }}
                                    aria-label={`تحديد ${emp.name}`}
                                  />
                                ) : (
                                  <Lock className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
                                )}
                              </TableCell>
                            )}

                            <TableCell className="font-bold">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Link
                                  to={`/employee.html?id=${emp.id}`}
                                  className="hover:text-primary hover:underline"
                                >
                                  {emp.name}
                                </Link>
                                {emp.is_top5 && (
                                  <Badge
                                    variant="default"
                                    className="h-5 px-1.5 text-[10px] gap-0.5"
                                    title="ضمن أفضل 5 في إحدى المراحل"
                                  >
                                    <Award className="h-3 w-3" />
                                    <span>Top 5</span>
                                  </Badge>
                                )}
                                {isProtected && (
                                  <Badge
                                    variant="secondary"
                                    className="h-5 px-1.5 text-[10px] gap-0.5"
                                    title="الحساب الأساسي المحمي"
                                  >
                                    <Lock className="h-2.5 w-2.5" />
                                    <span>محمي</span>
                                  </Badge>
                                )}
                              </div>
                            </TableCell>

                            <TableCell className="text-muted-foreground font-medium">
                              {emp.id}
                            </TableCell>
                            <TableCell>{emp.company || '—'}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{emp.shift || '—'}</Badge>
                            </TableCell>
                            <TableCell>{emp.department || '—'}</TableCell>
                            <TableCell>{emp.education || '—'}</TableCell>

                            {mode === 'all' && (
                              <TableCell>
                                <Badge
                                  variant={
                                    statusVal === 'active'
                                      ? 'success'
                                      : statusVal === 'left'
                                        ? 'destructive'
                                        : 'secondary'
                                  }
                                >
                                  {STATUS_LABELS[statusVal]}
                                </Badge>
                              </TableCell>
                            )}

                            {mode === 'all' && (
                              <TableCell>
                                {canManageRole ? (
                                  <div className="flex items-center gap-1">
                                    <NativeSelect
                                      value={roleVal}
                                      onChange={(e) =>
                                        handleRoleChange(emp, e.target.value as Role)
                                      }
                                      className="h-8 w-32 text-xs"
                                    >
                                      <option value="employee">موظف</option>
                                      <option value="supervisor">مشرف</option>
                                      <option value="admin">مدير النظام</option>
                                      {isCreator && (
                                        <option value="system_creator">منشئ النظام</option>
                                      )}
                                    </NativeSelect>
                                    {roleVal === 'supervisor' &&
                                      Array.isArray(emp.supervisor_shifts) &&
                                      emp.supervisor_shifts.length > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => handleRoleChange(emp, 'supervisor')}
                                          className="text-[10px] font-bold text-primary hover:underline cursor-pointer"
                                          title="تعديل شيفتات المشرف"
                                        >
                                          ({emp.supervisor_shifts.join(',')})
                                        </button>
                                      )}
                                  </div>
                                ) : (
                                  <Badge variant="outline">{ROLE_LABELS[roleVal]}</Badge>
                                )}
                              </TableCell>
                            )}

                            {mode === 'left' && (
                              <>
                                <TableCell>{fmtDate(emp.left_date)}</TableCell>
                                <TableCell className="text-xs font-semibold">
                                  {emp.departure_reason || '—'}
                                </TableCell>
                              </>
                            )}

                            {mode === 'new' && (
                              <TableCell>{fmtDate(emp.created_at)}</TableCell>
                            )}

                            {/* Actions */}
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  asChild
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title="عرض الملف التفصيلي"
                                >
                                  <Link to={`/employee.html?id=${emp.id}`}>
                                    <Eye className="h-3.5 w-3.5 text-primary" />
                                  </Link>
                                </Button>

                                {(mode === 'current' || mode === 'left') && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title={
                                      mode === 'left' ? 'تعديل بيانات المغادرة' : 'تسجيل مغادرة'
                                    }
                                    onClick={() => openDepartureDialog(emp)}
                                  >
                                    <UserRoundMinus className="h-3.5 w-3.5 text-amber-600" />
                                  </Button>
                                )}

                                {mode === 'left' && isCreator && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="إعادة تفعيل الموظف"
                                    onClick={() => setConfirmAction({ type: 'reactivate', emp })}
                                  >
                                    <RotateCcw className="h-3.5 w-3.5 text-emerald-600" />
                                  </Button>
                                )}

                                {mode === 'all' && isCreator && !isProtected && (
                                  <>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      title="تعديل بيانات الموظف"
                                      onClick={() => openEditDialog(emp)}
                                    >
                                      <PencilLine className="h-3.5 w-3.5" />
                                    </Button>

                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      title="تعيين كلمة مرور جديدة"
                                      onClick={() => {
                                        setPwEmp(emp);
                                        setPwValue('');
                                      }}
                                    >
                                      <LockKeyhole className="h-3.5 w-3.5 text-primary" />
                                    </Button>

                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      title="إعادة كلمة المرور للافتراضية"
                                      onClick={() =>
                                        setConfirmAction({ type: 'reset-default', emp })
                                      }
                                    >
                                      <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                                    </Button>

                                    {!isSelf && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        title="حذف الحساب"
                                        onClick={() => setConfirmAction({ type: 'delete', emp })}
                                      >
                                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Supervisor Multi-Shift Dialog */}
      <Dialog open={!!supRoleEmp} onOpenChange={(o: boolean) => !o && setSupRoleEmp(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تحديد شيفتات الإشراف</DialogTitle>
            <DialogDescription>
              اختر شيفتًا واحدًا أو أكثر للمشرف <b>{supRoleEmp?.name}</b>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 py-2">
            {SHIFT_CHOICES.map((sh) => {
              const checked = supShifts.includes(sh);
              return (
                <button
                  key={sh}
                  type="button"
                  onClick={() =>
                    setSupShifts((prev) =>
                      prev.includes(sh) ? prev.filter((x) => x !== sh) : [...prev, sh]
                    )
                  }
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer',
                    checked
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:bg-muted'
                  )}
                >
                  {checked && <Check className="h-3.5 w-3.5" />}
                  <span>Shift {sh}</span>
                </button>
              );
            })}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSupRoleEmp(null)} disabled={supSaving}>
              إلغاء
            </Button>
            <Button onClick={handleSaveSupervisorRole} disabled={supSaving}>
              {supSaving ? 'جاري الحفظ...' : 'حفظ الصلاحية'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Employee Dialog (System Creator) */}
      <Dialog open={!!editEmp} onOpenChange={(o: boolean) => !o && setEditEmp(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>تعديل بيانات الموظف</DialogTitle>
            <DialogDescription>تحديث البيانات التعريفية أو تعديل الرقم التعريفي ID</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-3.5 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>ID</Label>
                <Input
                  type="number"
                  value={editForm.newId}
                  onChange={(e) => setEditForm((f) => ({ ...f, newId: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>الاسم</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>الشركة</Label>
                <Input
                  value={editForm.company}
                  onChange={(e) => setEditForm((f) => ({ ...f, company: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>الشيفت</Label>
                <Input
                  value={editForm.shift}
                  onChange={(e) => setEditForm((f) => ({ ...f, shift: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>القسم</Label>
                <Input
                  value={editForm.department}
                  onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>الفئة</Label>
                <Input
                  value={editForm.education}
                  onChange={(e) => setEditForm((f) => ({ ...f, education: e.target.value }))}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>الإقامة / العنوان</Label>
                <Input
                  value={editForm.residence}
                  onChange={(e) => setEditForm((f) => ({ ...f, residence: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditEmp(null)}
                disabled={editSaving}
              >
                إلغاء
              </Button>
              <Button type="submit" disabled={editSaving}>
                <CheckCircle2 className="h-4 w-4" />
                <span>{editSaving ? 'جاري الحفظ...' : 'حفظ التعديلات'}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={!!pwEmp} onOpenChange={(o: boolean) => !o && setPwEmp(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تغيير كلمة المرور</DialogTitle>
            <DialogDescription>
              تعيين كلمة مرور جديدة للحساب <b>{pwEmp?.name}</b> (ID: {pwEmp?.id})
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSavePassword} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>كلمة المرور الجديدة</Label>
              <Input
                type="password"
                value={pwValue}
                onChange={(e) => setPwValue(e.target.value)}
                placeholder="4 أحرف على الأقل"
                required
              />
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPwEmp(null)}
                disabled={pwSaving}
              >
                إلغاء
              </Button>
              <Button type="submit" disabled={pwSaving}>
                <LockKeyhole className="h-4 w-4" />
                <span>{pwSaving ? 'جاري التغيير...' : 'حفظ كلمة المرور'}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Departure Dialog */}
      <Dialog open={!!departureEmp} onOpenChange={(o: boolean) => !o && setDepartureEmp(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تسجيل / تعديل بيانات المغادرة</DialogTitle>
            <DialogDescription>
              الموظف: <b>{departureEmp?.name}</b> (ID: {departureEmp?.id})
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveDeparture} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>تاريخ المغادرة</Label>
              <DatePicker
                value={departureDate}
                onChange={setDepartureDate}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>سبب المغادرة</Label>
              <NativeSelect
                value={departureReason}
                onChange={(e) => setDepartureReason(e.target.value)}
                required
              >
                <option value="">اختر السبب...</option>
                {configuredDepartureReasons.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDepartureEmp(null)}
                disabled={departureSaving}
              >
                إلغاء
              </Button>
              <Button type="submit" disabled={departureSaving}>
                <CheckCircle2 className="h-4 w-4" />
                <span>{departureSaving ? 'جاري الحفظ...' : 'حفظ بيانات المغادرة'}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Single Action Confirmation AlertDialog */}
      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(o: boolean) => !o && !confirmBusy && setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === 'delete' && 'تأكيد حذف الحساب'}
              {confirmAction?.type === 'reset-default' && 'إعادة كلمة المرور للافتراضية'}
              {confirmAction?.type === 'reactivate' && 'إعادة تفعيل الموظف'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === 'delete' &&
                `هل أنت متأكد من حذف حساب "${confirmAction.emp.name}" نهائيًا مع كافة سجلاته؟`}
              {confirmAction?.type === 'reset-default' &&
                `سيتم إعادة تعيين كلمة مرور "${confirmAction.emp.name}" إلى الكلمة الافتراضية للنظام.`}
              {confirmAction?.type === 'reactivate' &&
                `سيتم إعادة "${confirmAction.emp.name}" إلى قائمة الموظفين النشطين وحذف سجل المغادرة.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmBusy}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.preventDefault();
                executeConfirmAction();
              }}
              disabled={confirmBusy}
              className={
                confirmAction?.type === 'delete'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : undefined
              }
            >
              {confirmBusy ? 'جاري التنفيذ...' : 'تأكيد'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete AlertDialog */}
      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={(o: boolean) => !o && !confirmBusy && setBulkDeleteOpen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف الجماعي</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف {selectedIds.length} حساب موظف نهائياً من النظام وكافة بياناتهم اليومية.
              هل تريد المتابعة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmBusy}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.preventDefault();
                executeBulkDelete();
              }}
              disabled={confirmBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {confirmBusy ? 'جاري الحذف...' : `حذف (${selectedIds.length})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
