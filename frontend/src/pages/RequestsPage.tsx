import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Award,
  Banknote,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  Clock,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  FilterX,
  GraduationCap,
  HeartHandshake,
  HeartPulse,
  Inbox,
  LayoutGrid,
  Plus,
  Search,
  Undo2,
  UserMinus,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/lib/api';
import { exportRequestsExcel } from '@/lib/export';
import { fmtDateTime, fmtNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type {
  RequestCategoryKey,
  RequestItem,
  RequestMetaPayload,
  RequestTypeKey,
} from '@/types/iems';
import { AppShell } from '@/components/layout/AppShell';
import { KpiCard } from '@/components/shared/KpiCard';
import { RequestDetailDialog } from '@/components/requests/RequestDetailDialog';
import { RequestFormDialog } from '@/components/requests/RequestFormDialog';
import {
  REQUEST_CATALOG,
  REQUEST_CATALOG_MAP,
  REQUEST_CATEGORIES,
  STATUS_DISPLAY,
} from '@/components/requests/requestCatalog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

type TabKey = 'catalog' | 'mine' | 'admin';

interface AdminCounts {
  total: number;
  submitted: number;
  under_review: number;
  approved: number;
  rejected: number;
  cancelled: number;
}

function iconForRequestType(type: RequestTypeKey) {
  switch (type) {
    case 'exam_leave':
      return GraduationCap;
    case 'special_leave':
      return CalendarClock;
    case 'sick_leave':
      return HeartPulse;
    case 'extra_working_days':
      return CalendarPlus;
    case 'salary_entitlements':
      return Banknote;
    case 'advance_request':
      return Wallet;
    case 'employee_grant':
      return Award;
    case 'marriage_grant':
      return HeartHandshake;
    case 'general_request':
      return FileText;
    case 'shift_transfer':
      return ArrowLeftRight;
    case 'resignation':
      return UserMinus;
    case 'resignation_withdrawal':
      return Undo2;
    case 'smart_business_request':
      return Building2;
    default:
      return ClipboardList;
  }
}

export function RequestsPage() {
  const { user, isEmployee, isAdminUp } = useAuth();

  const [meta, setMeta] = useState<RequestMetaPayload | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<TabKey>(isAdminUp ? 'admin' : 'catalog');
  const initialTabResolvedRef = useRef(false);
  const [selectedCategory, setSelectedCategory] = useState<'all' | RequestCategoryKey>('all');
  const [catalogSearch, setCatalogSearch] = useState('');

  // Dialog states
  const [openFormType, setOpenFormType] = useState<RequestTypeKey | null>(null);
  const [detailRequestId, setDetailRequestId] = useState<number | null>(null);

  // Employee My Requests
  const [myRequests, setMyRequests] = useState<RequestItem[]>([]);
  const [myStatusFilter, setMyStatusFilter] = useState('');
  const [myLoading, setMyLoading] = useState(false);

  // Admin Dashboard State & Filters
  const [adminRequests, setAdminRequests] = useState<RequestItem[]>([]);
  const [adminCounts, setAdminCounts] = useState<AdminCounts | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterShift, setFilterShift] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const canSubmit = meta ? meta.permissions.canSubmit : !isAdminUp;
  const canViewAdmin = meta ? meta.permissions.canViewAdmin : isAdminUp;
  const canExportQueue = canViewAdmin && (meta?.permissions.canExport ?? true);

  const loadMeta = useCallback(async () => {
    setMetaLoading(true);
    try {
      const m = await api<RequestMetaPayload>('/api/requests/meta');
      setMeta(m);
      setActiveTab((prev) => {
        if (!initialTabResolvedRef.current) {
          initialTabResolvedRef.current = true;
          return m.permissions.canViewAdmin ? 'admin' : 'catalog';
        }
        if (!m.permissions.canSubmit && m.permissions.canViewAdmin) return 'admin';
        if (!m.permissions.canViewAdmin && prev === 'admin') return 'catalog';
        return prev;
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر تحميل إعدادات الطلبات');
    } finally {
      setMetaLoading(false);
    }
  }, []);

  const loadMyRequests = useCallback(async () => {
    if (!meta?.permissions.canSubmit) {
      setMyRequests([]);
      return;
    }
    setMyLoading(true);
    try {
      const res = await api<{ requests: RequestItem[] }>('/api/requests/mine');
      setMyRequests(res.requests || []);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر تحميل طلباتك');
    } finally {
      setMyLoading(false);
    }
  }, [meta?.permissions.canSubmit]);

  const loadAdminRequests = useCallback(async () => {
    if (!meta?.permissions.canViewAdmin) return;
    setAdminLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterType) qs.set('type', filterType);
      if (filterStatus) qs.set('status', filterStatus);
      if (filterCompany) qs.set('company', filterCompany);
      if (filterShift) qs.set('shift', filterShift);
      if (filterSearch.trim()) qs.set('search', filterSearch.trim());
      if (filterFrom) qs.set('from', filterFrom);
      if (filterTo) qs.set('to', filterTo);

      const res = await api<{ requests: RequestItem[]; counts: AdminCounts }>(
        `/api/requests/admin?${qs}`
      );
      setAdminRequests(res.requests || []);
      setAdminCounts(res.counts || null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر تحميل سجل الطلبات');
    } finally {
      setAdminLoading(false);
    }
  }, [
    meta?.permissions.canViewAdmin,
    filterType,
    filterStatus,
    filterCompany,
    filterShift,
    filterSearch,
    filterFrom,
    filterTo,
  ]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!meta) return;
    if (meta.permissions.canSubmit) loadMyRequests();
    if (meta.permissions.canViewAdmin) loadAdminRequests();
  }, [meta, loadMyRequests, loadAdminRequests]);

  const handleRefreshAfterChange = () => {
    loadMeta();
    if (meta?.permissions.canSubmit) loadMyRequests();
    if (meta?.permissions.canViewAdmin) loadAdminRequests();
    window.dispatchEvent(new Event('iems:refresh-badges'));
  };

  const handleResetFilters = () => {
    setFilterType('');
    setFilterStatus('');
    setFilterCompany('');
    setFilterShift('');
    setFilterSearch('');
    setFilterFrom('');
    setFilterTo('');
  };

  const isSmartUser = useMemo(() => {
    const c = String(meta?.profile?.company || '').toUpperCase();
    return c.includes('SMART') || c === 'SB';
  }, [meta?.profile?.company]);

  const availableCatalog = useMemo(() => {
    return REQUEST_CATALOG.filter((entry) => {
      if (entry.key === 'smart_business_request' && isEmployee && !isSmartUser) return false;
      return true;
    });
  }, [isEmployee, isSmartUser]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: availableCatalog.length };
    for (const c of REQUEST_CATEGORIES) {
      counts[c.key] = availableCatalog.filter((x) => x.category === c.key).length;
    }
    return counts;
  }, [availableCatalog]);

  const filteredServices = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return availableCatalog.filter((entry) => {
      if (selectedCategory !== 'all' && entry.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        entry.title.toLowerCase().includes(q) ||
        entry.arabicTitle.includes(q) ||
        entry.description.toLowerCase().includes(q)
      );
    });
  }, [availableCatalog, catalogSearch, selectedCategory]);

  const mySummary = useMemo(() => {
    return {
      total: myRequests.length,
      pending: myRequests.filter(
        (r) => r.status === 'submitted' || r.status === 'under_review'
      ).length,
      approved: myRequests.filter((r) => r.status === 'approved').length,
      rejected: myRequests.filter((r) => r.status === 'rejected').length,
      cancelled: myRequests.filter((r) => r.status === 'cancelled').length,
    };
  }, [myRequests]);

  const filteredMyRequests = useMemo(() => {
    if (!myStatusFilter) return myRequests;
    if (myStatusFilter === 'pending') {
      return myRequests.filter((r) => r.status === 'submitted' || r.status === 'under_review');
    }
    return myRequests.filter((r) => r.status === myStatusFilter);
  }, [myRequests, myStatusFilter]);

  const hasActiveAdminFilters = Boolean(
    filterType ||
      filterStatus ||
      filterCompany ||
      filterShift ||
      filterSearch ||
      filterFrom ||
      filterTo
  );

  const showWorkspaceTabs = (canViewAdmin && canSubmit) || canSubmit;

  return (
    <AppShell>
      <div className="space-y-5">
        {/* Clean Contextual Workspace Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border pb-4">
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
              {canViewAdmin && !canSubmit ? 'إدارة طلبات الموظفين' : 'بوابة الطلبات والخدمات'}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {canViewAdmin && !canSubmit
                ? 'مراجعة واعتماد أو رفض طلبات الإجازات، السلف، والمستحقات الواردة من الموظفين.'
                : 'تقديم ومتابعة طلبات الإجازات، السلف، المستحقات، وطلبات شؤون الموظفين.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {showWorkspaceTabs && (
              <div className="inline-flex items-center rounded-xl border border-border bg-secondary/50 p-1">
                {canViewAdmin && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('admin')}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap',
                      activeTab === 'admin'
                        ? 'bg-card text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Briefcase className="h-3.5 w-3.5 text-primary" />
                    <span>إدارة الطلبات</span>
                    {adminCounts && adminCounts.submitted + adminCounts.under_review > 0 && (
                      <span className="text-[11px] font-extrabold text-primary tabular-nums">
                        ({adminCounts.submitted + adminCounts.under_review})
                      </span>
                    )}
                  </button>
                )}

                {canSubmit && (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveTab('catalog')}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap',
                        activeTab === 'catalog'
                          ? 'bg-card text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <LayoutGrid className="h-3.5 w-3.5 text-primary" />
                      <span>خدمات الطلبات</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('mine')}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap',
                        activeTab === 'mine'
                          ? 'bg-card text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Inbox className="h-3.5 w-3.5 text-primary" />
                      <span>طلباتي</span>
                      <span className="text-[11px] font-extrabold text-muted-foreground tabular-nums">
                        ({myRequests.length})
                      </span>
                    </button>
                  </>
                )}
              </div>
            )}

            {canExportQueue && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={adminRequests.length === 0}
                onClick={() => exportRequestsExcel(adminRequests)}
                className="h-9 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>تصدير Excel ({adminRequests.length})</span>
              </Button>
            )}
          </div>
        </div>

        {/* Loading Skeleton */}
        {metaLoading && !meta ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : null}

        {/* ================= TAB 1: ADMIN QUEUE CONSOLE ================= */}
        {activeTab === 'admin' && canViewAdmin && (
          <div className="space-y-4">
            {adminCounts && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <KpiCard
                  label="إجمالي الطلبات"
                  value={fmtNumber(adminCounts.total)}
                  icon={ClipboardList}
                  tone="primary"
                  active={filterStatus === ''}
                  onClick={() => setFilterStatus('')}
                />
                <KpiCard
                  label="جديدة (بانتظار المراجعة)"
                  value={fmtNumber(adminCounts.submitted)}
                  icon={Inbox}
                  tone="default"
                  active={filterStatus === 'submitted'}
                  onClick={() => setFilterStatus('submitted')}
                />
                <KpiCard
                  label="قيد المراجعة"
                  value={fmtNumber(adminCounts.under_review)}
                  icon={Clock}
                  tone="warning"
                  active={filterStatus === 'under_review'}
                  onClick={() => setFilterStatus('under_review')}
                />
                <KpiCard
                  label="تمت الموافقة"
                  value={fmtNumber(adminCounts.approved)}
                  icon={CheckCircle2}
                  tone="success"
                  active={filterStatus === 'approved'}
                  onClick={() => setFilterStatus('approved')}
                />
                <KpiCard
                  label="مرفوضة"
                  value={fmtNumber(adminCounts.rejected)}
                  icon={FilterX}
                  tone="danger"
                  active={filterStatus === 'rejected'}
                  onClick={() => setFilterStatus('rejected')}
                />
              </div>
            )}

            {/* Slim Filter Toolbar with Calendar DatePickers */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-foreground">
                    <Filter className="h-3.5 w-3.5 text-primary" />
                    <span>تصفية سجل الطلبات</span>
                    {hasActiveAdminFilters && (
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer mr-2"
                      >
                        <FilterX className="h-3 w-3" />
                        <span>إعادة تعيين</span>
                      </button>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    المعروض: <strong className="text-foreground">{adminRequests.length}</strong> طلب
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2.5 items-end">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-muted-foreground">
                      نوع الطلب
                    </Label>
                    <NativeSelect
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="h-9 text-xs"
                    >
                      <option value="">كل الأنواع</option>
                      {(isAdminUp || !meta?.permissions.supervisorAllowedTypes?.length
                        ? REQUEST_CATALOG
                        : REQUEST_CATALOG.filter((c) =>
                            meta.permissions.supervisorAllowedTypes!.includes(c.key)
                          )
                      ).map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.arabicTitle}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-muted-foreground">الحالة</Label>
                    <NativeSelect
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="h-9 text-xs"
                    >
                      <option value="">كل الحالات</option>
                      <option value="submitted">تم الإرسال</option>
                      <option value="under_review">قيد المراجعة</option>
                      <option value="approved">تمت الموافقة</option>
                      <option value="rejected">مرفوض</option>
                      <option value="cancelled">ملغي</option>
                    </NativeSelect>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-muted-foreground">الشركة</Label>
                    <NativeSelect
                      value={filterCompany}
                      onChange={(e) => setFilterCompany(e.target.value)}
                      className="h-9 text-xs"
                    >
                      <option value="">كل الشركات</option>
                      <option value="SMART">Smart Business</option>
                      <option value="BRAVOS">Bravos</option>
                    </NativeSelect>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-muted-foreground">الشيفت</Label>
                    {(() => {
                      const supShifts =
                        meta?.permissions.supervisorShifts ||
                        (user?.shift ? [String(user.shift).trim().toUpperCase()] : []);
                      if (!isAdminUp && supShifts.length === 1) {
                        return (
                          <Input
                            value={`Shift ${supShifts[0]}`}
                            readOnly
                            disabled
                            className="h-9 text-xs bg-muted/50 font-bold"
                          />
                        );
                      }
                      const shiftList = isAdminUp ? ['A', 'B', 'C', 'D'] : supShifts;
                      return (
                        <NativeSelect
                          value={filterShift}
                          onChange={(e) => setFilterShift(e.target.value)}
                          className="h-9 text-xs"
                        >
                          <option value="">{isAdminUp ? 'كل الشيفتات' : 'كل الشيفتات المسندة'}</option>
                          {shiftList.map((s) => (
                            <option key={s} value={s}>
                              Shift {s}
                            </option>
                          ))}
                        </NativeSelect>
                      );
                    })()}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-muted-foreground">من تاريخ</Label>
                    <DatePicker
                      value={filterFrom}
                      onChange={setFilterFrom}
                      clearable
                      placeholder="من تاريخ"
                      className="text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-muted-foreground">إلى تاريخ</Label>
                    <DatePicker
                      value={filterTo}
                      min={filterFrom || undefined}
                      onChange={setFilterTo}
                      clearable
                      placeholder="إلى تاريخ"
                      className="text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-muted-foreground">
                      بحث (اسم / كود / رقم)
                    </Label>
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 text-muted-foreground absolute right-2.5 top-2.5" />
                      <Input
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                        placeholder="بحث..."
                        className="h-9 pr-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Admin Requests Data Grid */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>رقم الطلب</TableHead>
                        <TableHead>الموظف</TableHead>
                        <TableHead>الشركة / الشيفت</TableHead>
                        <TableHead>نوع الطلب</TableHead>
                        <TableHead>تاريخ التقديم</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead>متخذ القرار</TableHead>
                        <TableHead className="text-center">الإجراء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adminLoading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="py-10 text-center text-xs text-muted-foreground">
                            جاري تحميل الطلبات...
                          </TableCell>
                        </TableRow>
                      ) : adminRequests.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="py-12 text-center text-xs text-muted-foreground">
                            لا توجد طلبات مطابقة للفلاتر المحددة.
                          </TableCell>
                        </TableRow>
                      ) : (
                        adminRequests.map((r) => {
                          const st = STATUS_DISPLAY[r.status] || STATUS_DISPLAY.submitted;
                          const cat = REQUEST_CATALOG_MAP[r.request_type];
                          return (
                            <TableRow
                              key={r.id}
                              onClick={() => setDetailRequestId(r.id)}
                              className="hover:bg-muted/35 cursor-pointer"
                            >
                              <TableCell className="font-extrabold text-primary tabular-nums whitespace-nowrap" dir="ltr">
                                {r.request_number}
                              </TableCell>
                              <TableCell>
                                <div className="font-bold text-foreground whitespace-nowrap">
                                  {r.employee_name}
                                </div>
                                <div className="text-[11px] text-muted-foreground tabular-nums">
                                  #{r.employee_id}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                                {r.company || '—'} · Shift {r.shift || '—'}
                              </TableCell>
                              <TableCell className="font-semibold text-xs whitespace-nowrap">
                                {cat?.arabicTitle || r.request_title}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                                {fmtDateTime(r.submitted_at)}
                              </TableCell>
                              <TableCell>
                                <span className={cn('inline-flex items-center gap-1.5 text-xs font-bold whitespace-nowrap', st.textClass)}>
                                  <span className={cn('h-1.5 w-1.5 rounded-full', st.dotClass)} />
                                  <span>{st.label}</span>
                                </span>
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap">
                                {r.decision_maker_name_snapshot || '—'}
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDetailRequestId(r.id);
                                  }}
                                  className="h-7 px-2.5 text-xs"
                                >
                                  <Eye className="h-3.5 w-3.5 text-primary" />
                                  <span>مراجعة</span>
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ================= TAB 2: SPLIT SERVICE DIRECTORY (Employees & Supervisors only) ================= */}
        {activeTab === 'catalog' && canSubmit && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Sidebar Rail: Categories, Search & Quick Activity */}
            <aside className="lg:col-span-4 xl:col-span-3 space-y-4">
              <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-muted-foreground absolute right-3 top-2.5" />
                  <Input
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder="ابحث عن طلب أو خدمة..."
                    className="pr-9 h-9 text-xs"
                  />
                </div>

                <nav className="space-y-1" aria-label="تصنيف الطلبات">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className={cn(
                      'w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-bold transition-colors cursor-pointer',
                      selectedCategory === 'all'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-secondary/60'
                    )}
                  >
                    <span>جميع الخدمات</span>
                    <span className="tabular-nums opacity-80">{categoryCounts.all}</span>
                  </button>
                  {REQUEST_CATEGORIES.map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setSelectedCategory(cat.key)}
                      className={cn(
                        'w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-bold transition-colors cursor-pointer',
                        selectedCategory === cat.key
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground hover:bg-secondary/60'
                      )}
                    >
                      <span>{cat.title}</span>
                      <span className="tabular-nums opacity-80">{categoryCounts[cat.key] || 0}</span>
                    </button>
                  ))}
                </nav>
              </div>

              {/* Compact Recent Activity Rail */}
              {myRequests.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-foreground">أحدث طلباتي</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('mine')}
                      className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                    >
                      عرض الكل ({myRequests.length})
                    </button>
                  </div>
                  <div className="divide-y divide-border/70">
                    {myRequests.slice(0, 3).map((r) => {
                      const st = STATUS_DISPLAY[r.status] || STATUS_DISPLAY.submitted;
                      const cat = REQUEST_CATALOG_MAP[r.request_type];
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setDetailRequestId(r.id)}
                          className="w-full py-2 text-start hover:bg-secondary/35 rounded px-1.5 -mx-1.5 transition-colors cursor-pointer space-y-0.5"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-bold text-foreground truncate">
                              {cat?.title || r.request_title}
                            </span>
                            <span className={cn('inline-flex items-center gap-1 text-[11px] font-bold shrink-0', st.textClass)}>
                              <span className={cn('h-1.5 w-1.5 rounded-full', st.dotClass)} />
                              <span>{st.label}</span>
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground tabular-nums" dir="ltr">
                            {r.request_number} · {fmtDateTime(r.submitted_at)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </aside>

            {/* Main Service Directory Grid */}
            <div className="lg:col-span-8 xl:col-span-9">
              {filteredServices.length === 0 ? (
                <div className="rounded-xl border border-border bg-card py-16 text-center text-xs text-muted-foreground">
                  لا توجد خدمات مطابقة لبحثك.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredServices.map((item) => {
                    const Icon = iconForRequestType(item.key);
                    const catTitle = REQUEST_CATEGORIES.find((c) => c.key === item.category)?.title;
                    const externalUrl = meta?.externalUrls?.[item.key];
                    const isSafeExternal = Boolean(externalUrl && externalUrl.startsWith('https://'));

                    const cardInner = (
                      <>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors mt-0.5">
                          <Icon className="h-5 w-5" />
                        </span>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="text-sm font-extrabold text-foreground group-hover:text-primary transition-colors truncate">
                              {item.title}
                            </h3>
                            {isSafeExternal ? (
                              <ExternalLink className="h-3.5 w-3.5 text-primary shrink-0" />
                            ) : (
                              <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-transform group-hover:-translate-x-0.5 shrink-0" />
                            )}
                          </div>

                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                            {item.description}
                          </p>

                          <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground">
                            <span>{catTitle}</span>
                            {isSafeExternal ? (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-bold text-primary truncate">
                                  نموذج Google Forms خارجي
                                </span>
                              </>
                            ) : (
                              item.requiredDocsNote && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-medium text-foreground/80 truncate">
                                    {item.requiredDocsNote}
                                  </span>
                                </>
                              )
                            )}
                          </div>
                        </div>
                      </>
                    );

                    if (isSafeExternal && externalUrl) {
                      return (
                        <a
                          key={item.key}
                          href={externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group text-start flex items-start gap-3.5 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/60 hover:bg-accent/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {cardInner}
                        </a>
                      );
                    }

                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setOpenFormType(item.key)}
                        className="group text-start flex items-start gap-3.5 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/60 hover:bg-accent/15 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {cardInner}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: MY REQUESTS (Employees & Supervisors only) ================= */}
        {activeTab === 'mine' && canSubmit && (
          <div className="space-y-4">
            {/* Clean Interactive Status Tabs & Quick New CTA */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-1">
                {[
                  { key: '', label: 'الكل', count: mySummary.total },
                  { key: 'pending', label: 'قيد المتابعة', count: mySummary.pending },
                  { key: 'approved', label: 'تمت الموافقة', count: mySummary.approved },
                  { key: 'rejected', label: 'مرفوضة', count: mySummary.rejected },
                  { key: 'cancelled', label: 'ملغاة', count: mySummary.cancelled },
                ].map((tab) => (
                  <button
                    key={tab.key || 'all'}
                    type="button"
                    onClick={() => setMyStatusFilter(tab.key)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer',
                      myStatusFilter === tab.key
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    )}
                  >
                    <span>{tab.label}</span>
                    <span className="tabular-nums opacity-80">({tab.count})</span>
                  </button>
                ))}
              </div>

              <Button
                type="button"
                size="sm"
                onClick={() => setActiveTab('catalog')}
                className="h-8 font-bold"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>تقديم طلب جديد</span>
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>رقم الطلب</TableHead>
                        <TableHead>نوع الطلب</TableHead>
                        <TableHead>تاريخ التقديم</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead>متخذ القرار</TableHead>
                        <TableHead>سبب الرفض</TableHead>
                        <TableHead className="text-center">التفاصيل</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myLoading ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-10 text-center text-xs text-muted-foreground">
                            جاري تحميل طلباتك...
                          </TableCell>
                        </TableRow>
                      ) : filteredMyRequests.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-12 text-center text-xs text-muted-foreground">
                            {myRequests.length === 0
                              ? 'لم تقم بتقديم أي طلبات بعد. اضغط «تقديم طلب جديد» للبدء.'
                              : 'لا توجد طلبات مطابقة للحالة المختارة.'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredMyRequests.map((r) => {
                          const st = STATUS_DISPLAY[r.status] || STATUS_DISPLAY.submitted;
                          const cat = REQUEST_CATALOG_MAP[r.request_type];
                          return (
                            <TableRow
                              key={r.id}
                              onClick={() => setDetailRequestId(r.id)}
                              className="hover:bg-muted/35 cursor-pointer"
                            >
                              <TableCell className="font-extrabold text-primary tabular-nums whitespace-nowrap" dir="ltr">
                                {r.request_number}
                              </TableCell>
                              <TableCell className="font-bold text-xs whitespace-nowrap">
                                {cat?.arabicTitle || r.request_title}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                                {fmtDateTime(r.submitted_at)}
                              </TableCell>
                              <TableCell>
                                <span className={cn('inline-flex items-center gap-1.5 text-xs font-bold whitespace-nowrap', st.textClass)}>
                                  <span className={cn('h-1.5 w-1.5 rounded-full', st.dotClass)} />
                                  <span>{st.label}</span>
                                </span>
                              </TableCell>
                              <TableCell className="text-xs font-semibold whitespace-nowrap">
                                {r.decision_maker_name_snapshot || '—'}
                              </TableCell>
                              <TableCell className="text-xs max-w-[220px] truncate" dir="auto">
                                {r.status === 'rejected' && r.decision_reason ? r.decision_reason : '—'}
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDetailRequestId(r.id);
                                  }}
                                  className="h-7 px-2.5 text-xs"
                                >
                                  <Eye className="h-3.5 w-3.5 text-primary" />
                                  <span>عرض</span>
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Request Submission Form Modal (Disabled for Admins & System Creators) */}
      {canSubmit && (
        <RequestFormDialog
          requestType={openFormType}
          meta={meta}
          onClose={() => setOpenFormType(null)}
          onSubmitted={() => {
            setOpenFormType(null);
            setActiveTab('mine');
            handleRefreshAfterChange();
          }}
        />
      )}

      {/* Request Detail & Decision Modal */}
      <RequestDetailDialog
        requestId={detailRequestId}
        currentUserId={user?.id}
        canDecide={Boolean(meta?.permissions.canDecide)}
        allowEmployeeCancellation={Boolean(meta?.permissions.allowEmployeeCancellation)}
        allowReopenDecision={meta?.permissions.allowReopenDecision ?? true}
        onClose={() => setDetailRequestId(null)}
        onUpdated={handleRefreshAfterChange}
      />
    </AppShell>
  );
}
