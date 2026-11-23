import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ClipboardPenLine,
  Layers,
  PlusCircle,
  TableProperties,
  Trash2,
  UserRoundPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError } from '@/lib/api';
import { resolveReportsAndSheetsConfig } from '@/lib/systemConfig';

interface ManualEmployeeMeta {
  id: number;
  name: string;
  company?: string | null;
  shift?: string | null;
  department?: string | null;
}

interface ManualMetaResponse {
  ok: boolean;
  employees: ManualEmployeeMeta[];
  stages: string[];
  sections: string[];
}

const SUMMARY_FIELDS: { key: string; label: string; isText?: boolean }[] = [
  { key: 'total_achievement', label: 'إجمالي الإنجاز' },
  { key: 'total_target', label: 'إجمالي التارجت' },
  { key: 'percentage', label: 'نسبة التارجت (مثل 0.95)' },
  { key: 'bonus_tier', label: 'فئة الحافز', isText: true },
  { key: 'monthly_target', label: 'التارجت الشهري' },
  { key: 'work_nature_allowance', label: 'بدل طبيعة عمل' },
  { key: 'total_present_days', label: 'أيام الحضور' },
  { key: 'total_absence', label: 'إجمالي الغياب' },
  { key: 'total_absence_days', label: 'أيام الغياب' },
  { key: 'unauthorized_absence', label: 'غياب بدون إذن' },
  { key: 'casual_leave', label: 'إجازة عارضة' },
  { key: 'leave_with_permission', label: 'إجازة بإذن' },
  { key: 'leave_without_permission', label: 'إجازة بدون إذن' },
  { key: 'sick_leave', label: 'إجازة مرضية' },
  { key: 'late_days', label: 'أيام التأخير' },
  { key: 'late_hours', label: 'ساعات التأخير' },
  { key: 'overtime_days', label: 'أيام الإضافي' },
  { key: 'overtime_hours', label: 'ساعات الإضافي' },
  { key: 'special_bonus_days', label: 'أيام المكافآت الخاصة' },
  { key: 'special_deductions', label: 'الجزاءات / الخصومات' },
];

function buildDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return dates;
  const cur = new Date(start);
  while (cur <= end && dates.length <= 35) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

export function ManualEntryPage() {
  const [meta, setMeta] = useState<ManualMetaResponse>({ ok: true, employees: [], stages: [], sections: [] });
  const [maxGridDays, setMaxGridDays] = useState<number>(31);
  const [tab, setTab] = useState('employee');

  // 1) Employee tab
  const [empId, setEmpId] = useState('');
  const [empNum, setEmpNum] = useState('');
  const [empName, setEmpName] = useState('');
  const [empCompany, setEmpCompany] = useState('');
  const [empShift, setEmpShift] = useState('');
  const [empDept, setEmpDept] = useState('');
  const [empEducation, setEmpEducation] = useState('');
  const [empResidence, setEmpResidence] = useState('');
  const [savingEmp, setSavingEmp] = useState(false);

  // 2) Daily tab (single + batch grid)
  const [dailyMode, setDailyMode] = useState<'single' | 'grid'>('single');
  const [dailyEmp, setDailyEmp] = useState('');
  const [dailyStage, setDailyStage] = useState('');
  const [dailyDate, setDailyDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dailyValue, setDailyValue] = useState('');
  const [savingDaily, setSavingDaily] = useState(false);

  const [gridStage, setGridStage] = useState('');
  const [gridFrom, setGridFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [gridTo, setGridTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [gridShiftFilter, setGridShiftFilter] = useState('');
  const [gridDeptFilter, setGridDeptFilter] = useState('');
  const [gridDates, setGridDates] = useState<string[]>([]);
  const [gridValues, setGridValues] = useState<Record<string, string>>({});
  const [savingGrid, setSavingGrid] = useState(false);

  // 3) Summary tab
  const [sumEmp, setSumEmp] = useState('');
  const [sumFields, setSumFields] = useState<Record<string, string>>({});
  const [savingSummary, setSavingSummary] = useState(false);

  // 4) Supervisor target tab
  const [supEmpId, setSupEmpId] = useState('');
  const [supName, setSupName] = useState('');
  const [supSection, setSupSection] = useState('');
  const [supDate, setSupDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [supTargetDaily, setSupTargetDaily] = useState('');
  const [supTargetMonthly, setSupTargetMonthly] = useState('');
  const [supMetrics, setSupMetrics] = useState<{ key: string; value: string }[]>([]);
  const [savingSup, setSavingSup] = useState(false);

  const loadMeta = useCallback(async () => {
    try {
      const data = await api<ManualMetaResponse>('/api/admin/manual/meta');
      setMeta(data);
      if (data.employees.length) {
        setDailyEmp((prev) => prev || String(data.employees[0].id));
        setSumEmp((prev) => prev || String(data.employees[0].id));
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر تحميل البيانات المرجعية');
    }
  }, []);

  useEffect(() => {
    loadMeta();
    resolveReportsAndSheetsConfig()
      .then((cfg) => {
        setMaxGridDays(cfg.monthDaysCount === '30' ? 30 : 31);
      })
      .catch(() => {
        // default 31
      });
  }, [loadMeta]);

  const distinctCompanies = useMemo(
    () => Array.from(new Set(meta.employees.map((e) => e.company).filter(Boolean) as string[])),
    [meta.employees]
  );
  const distinctShifts = useMemo(
    () => Array.from(new Set(meta.employees.map((e) => e.shift).filter(Boolean) as string[])),
    [meta.employees]
  );
  const distinctDepts = useMemo(
    () => Array.from(new Set(meta.employees.map((e) => e.department).filter(Boolean) as string[])),
    [meta.employees]
  );

  const handlePrefillEmployee = (idStr: string) => {
    setEmpId(idStr);
    const matched = meta.employees.find((e) => String(e.id) === idStr);
    if (matched) {
      setEmpNum(String(matched.id));
      setEmpName(matched.name || '');
      setEmpCompany(matched.company || '');
      setEmpShift(matched.shift || '');
      setEmpDept(matched.department || '');
    }
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEmp(true);
    try {
      const res = await api<{ ok: boolean; created: boolean; defaultPassword?: string; message?: string }>(
        '/api/admin/manual/employee',
        {
          method: 'POST',
          body: JSON.stringify({
            id: empId,
            emp_num: empNum || null,
            name: empName,
            company: empCompany || null,
            shift: empShift || null,
            department: empDept || null,
            education: empEducation || null,
            residence: empResidence || null,
          }),
        }
      );
      let msg = res.message || 'تم الحفظ بنجاح';
      if (res.created && res.defaultPassword) {
        msg += ` (كلمة المرور الافتراضية: ${res.defaultPassword})`;
      }
      toast.success(msg);
      setEmpId('');
      setEmpNum('');
      setEmpName('');
      setEmpCompany('');
      setEmpShift('');
      setEmpDept('');
      setEmpEducation('');
      setEmpResidence('');
      loadMeta();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر حفظ بيانات الموظف');
    } finally {
      setSavingEmp(false);
    }
  };

  const handleSaveSingleDaily = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDaily(true);
    try {
      await api('/api/admin/manual/daily', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: dailyEmp,
          stage: dailyStage,
          entry_date: dailyDate,
          value: dailyValue,
        }),
      });
      toast.success('تم حفظ السجل اليومي بنجاح');
      setDailyValue('');
      loadMeta();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر حفظ السجل اليومي');
    } finally {
      setSavingDaily(false);
    }
  };

  const gridRows = useMemo(
    () =>
      meta.employees.filter(
        (e) =>
          (!gridShiftFilter || e.shift === gridShiftFilter) &&
          (!gridDeptFilter || e.department === gridDeptFilter)
      ),
    [meta.employees, gridShiftFilter, gridDeptFilter]
  );

  const handleBuildGrid = () => {
    if (!gridStage.trim()) {
      toast.error('اكتب اسم المرحلة أولاً.');
      return;
    }
    const dates = buildDateRange(gridFrom, gridTo);
    if (!dates.length) {
      toast.error('اختر نطاق تاريخ صحيح.');
      return;
    }
    if (dates.length > maxGridDays) {
      toast.error(`النطاق أكبر من الحد المسموح (${maxGridDays} يوماً كحد أقصى).`);
      return;
    }
    setGridDates(dates);
    setGridValues({});
  };

  const handleSaveGrid = async () => {
    if (!gridStage.trim()) {
      toast.error('اكتب اسم المرحلة أولاً.');
      return;
    }
    const entries: { employee_id: number; entry_date: string; value: string }[] = [];
    for (const emp of gridRows) {
      for (const date of gridDates) {
        const val = (gridValues[`${emp.id}|${date}`] || '').trim();
        if (val !== '') {
          entries.push({ employee_id: emp.id, entry_date: date, value: val });
        }
      }
    }
    if (!entries.length) {
      toast.error('لا توجد خلايا ممتلئة لحفظها.');
      return;
    }

    setSavingGrid(true);
    try {
      const res = await api<{ message?: string }>('/api/admin/manual/daily-batch', {
        method: 'POST',
        body: JSON.stringify({ stage: gridStage.trim(), entries }),
      });
      toast.success(res.message || 'تم حفظ الجدول بنجاح');
      setGridValues({});
      loadMeta();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر حفظ الجدول');
    } finally {
      setSavingGrid(false);
    }
  };

  const handleSaveSummary = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSummary(true);
    try {
      const payload: Record<string, string> = { employee_id: sumEmp };
      for (const f of SUMMARY_FIELDS) {
        if (sumFields[f.key] !== undefined) {
          payload[f.key] = sumFields[f.key];
        }
      }
      const res = await api<{ message?: string }>('/api/admin/manual/summary', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      toast.success(res.message || 'تم حفظ الملخص الشهري');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر حفظ الملخص الشهري');
    } finally {
      setSavingSummary(false);
    }
  };

  const handleSaveSupervisorTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSup(true);
    try {
      const metricsObj: Record<string, number | string> = {};
      for (const m of supMetrics) {
        const k = m.key.trim();
        if (!k) continue;
        const num = Number(m.value);
        metricsObj[k] = m.value.trim() !== '' && Number.isFinite(num) ? num : m.value;
      }

      const res = await api<{ message?: string }>('/api/admin/manual/supervisor-target', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: supEmpId || null,
          supervisor_name: supName,
          section: supSection,
          entry_date: supDate,
          target_daily: supTargetDaily || null,
          target_monthly: supTargetMonthly || null,
          metrics: metricsObj,
        }),
      });
      toast.success(res.message || 'تم حفظ تارجت الإشراف');
      loadMeta();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر حفظ تارجت الإشراف');
    } finally {
      setSavingSup(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">الإدخال اليدوي</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            إضافة وتعديل بيانات الموظفين، السجلات اليومية، الملخصات الشهرية وتارجت الإشراف مباشرة
          </p>
        </div>

        {/* Shared datalists */}
        <datalist id="dl-stages">
          {meta.stages.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <datalist id="dl-sections">
          {meta.sections.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <datalist id="dl-companies">
          {distinctCompanies.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <datalist id="dl-shifts">
          {distinctShifts.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <datalist id="dl-departments">
          {distinctDepts.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>

        <Tabs value={tab} onValueChange={setTab} dir="rtl">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="employee">
              <UserRoundPlus className="h-3.5 w-3.5" />
              <span>بيانات موظف</span>
            </TabsTrigger>
            <TabsTrigger value="daily">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>سجل يومي</span>
            </TabsTrigger>
            <TabsTrigger value="summary">
              <Layers className="h-3.5 w-3.5" />
              <span>ملخص شهري</span>
            </TabsTrigger>
            <TabsTrigger value="supervisor">
              <ClipboardPenLine className="h-3.5 w-3.5" />
              <span>تارجت الإشراف</span>
            </TabsTrigger>
          </TabsList>

          {/* 1. Employee Basic Info */}
          <TabsContent value="employee">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">إضافة أو تعديل بيانات موظف</CardTitle>
                <CardDescription>
                  إذا كان ID موجوداً يتم تحديث البيانات، وإذا كان جديداً يُنشأ بكلمة المرور
                  الافتراضية
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveEmployee} className="space-y-4">
                  <div className="space-y-1.5 max-w-md">
                    <Label htmlFor="prefill-emp">اختر موظفاً موجوداً للتعديل (اختياري)</Label>
                    <NativeSelect
                      id="prefill-emp"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) handlePrefillEmployee(e.target.value);
                      }}
                    >
                      <option value="">— إضافة موظف جديد أو اختر للتعبئة السريعة —</option>
                      {meta.employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.id} — {e.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="me-id">ID *</Label>
                      <Input
                        id="me-id"
                        type="number"
                        value={empId}
                        onChange={(e) => setEmpId(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="me-num">الرقم الوظيفي</Label>
                      <Input
                        id="me-num"
                        type="number"
                        value={empNum}
                        onChange={(e) => setEmpNum(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="me-name">الاسم الكامل *</Label>
                      <Input
                        id="me-name"
                        value={empName}
                        onChange={(e) => setEmpName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="me-company">الشركة</Label>
                      <Input
                        id="me-company"
                        list="dl-companies"
                        value={empCompany}
                        onChange={(e) => setEmpCompany(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="me-shift">الشيفت</Label>
                      <Input
                        id="me-shift"
                        list="dl-shifts"
                        value={empShift}
                        onChange={(e) => setEmpShift(e.target.value)}
                        placeholder="A / B / C / D / Other"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="me-dept">القسم</Label>
                      <Input
                        id="me-dept"
                        list="dl-departments"
                        value={empDept}
                        onChange={(e) => setEmpDept(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="me-edu">الفئة / المؤهل</Label>
                      <Input
                        id="me-edu"
                        value={empEducation}
                        onChange={(e) => setEmpEducation(e.target.value)}
                        placeholder="خريج / طالب"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="me-res">محل الإقامة</Label>
                      <Input
                        id="me-res"
                        value={empResidence}
                        onChange={(e) => setEmpResidence(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={savingEmp}>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{savingEmp ? 'جارٍ الحفظ...' : 'حفظ بيانات الموظف'}</span>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 2. Daily Record (Single + Batch Grid) */}
          <TabsContent value="daily">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">إدخال السجل اليومي</CardTitle>
                    <CardDescription>
                      سجّل قيمة فردية لموظف أو افتح جدول إدخال جماعي لفترة تصل إلى شهر
                    </CardDescription>
                  </div>
                  <div className="inline-flex rounded-lg bg-muted p-1">
                    <button
                      type="button"
                      onClick={() => setDailyMode('single')}
                      className={`px-3 py-1 text-xs font-bold rounded-md cursor-pointer transition-colors ${
                        dailyMode === 'single'
                          ? 'bg-card text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      إدخال فردي
                    </button>
                    <button
                      type="button"
                      onClick={() => setDailyMode('grid')}
                      className={`px-3 py-1 text-xs font-bold rounded-md cursor-pointer transition-colors ${
                        dailyMode === 'grid'
                          ? 'bg-card text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      جدول جماعي
                    </button>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {dailyMode === 'single' ? (
                  <form onSubmit={handleSaveSingleDaily} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="daily-emp">الموظف</Label>
                        <NativeSelect
                          id="daily-emp"
                          value={dailyEmp}
                          onChange={(e) => setDailyEmp(e.target.value)}
                          required
                        >
                          {meta.employees.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.id} — {e.name}
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="daily-stage">المرحلة</Label>
                        <Input
                          id="daily-stage"
                          list="dl-stages"
                          value={dailyStage}
                          onChange={(e) => setDailyStage(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="daily-date">التاريخ</Label>
                        <DatePicker
                          id="daily-date"
                          value={dailyDate}
                          onChange={setDailyDate}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="daily-val">القيمة / الحالة</Label>
                        <Input
                          id="daily-val"
                          value={dailyValue}
                          onChange={(e) => setDailyValue(e.target.value)}
                          placeholder="رقم أو رمز الحضور (1 / 0.5 / ع / ا / ب / م / ن / 0)"
                          required
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button type="submit" disabled={savingDaily}>
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{savingDaily ? 'جارٍ الحفظ...' : 'حفظ السجل اليومي'}</span>
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
                      <div className="space-y-1.5 lg:col-span-2">
                        <Label htmlFor="grid-stage">المرحلة</Label>
                        <Input
                          id="grid-stage"
                          list="dl-stages"
                          value={gridStage}
                          onChange={(e) => setGridStage(e.target.value)}
                          placeholder="اختر أو اكتب المرحلة"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="grid-from">من تاريخ</Label>
                        <DatePicker
                          id="grid-from"
                          value={gridFrom}
                          onChange={setGridFrom}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="grid-to">إلى تاريخ</Label>
                        <DatePicker
                          id="grid-to"
                          value={gridTo}
                          min={gridFrom || undefined}
                          onChange={setGridTo}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="grid-shift">الشيفت</Label>
                        <NativeSelect
                          id="grid-shift"
                          value={gridShiftFilter}
                          onChange={(e) => setGridShiftFilter(e.target.value)}
                        >
                          <option value="">الكل</option>
                          {distinctShifts.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                      <div>
                        <Button type="button" onClick={handleBuildGrid} className="w-full">
                          <TableProperties className="h-4 w-4" />
                          <span>بناء الجدول</span>
                        </Button>
                      </div>
                    </div>

                    {gridDates.length > 0 && (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {gridRows.length} موظف × {gridDates.length} يوم
                          </span>
                          <NativeSelect
                            className="w-48 h-8 text-xs"
                            value={gridDeptFilter}
                            onChange={(e) => setGridDeptFilter(e.target.value)}
                          >
                            <option value="">كل الأقسام</option>
                            {distinctDepts.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </NativeSelect>
                        </div>

                        <div className="overflow-x-auto rounded-lg border border-border max-h-[520px]">
                          <table className="w-full text-xs tabular-nums border-collapse">
                            <thead className="sticky top-0 z-10 bg-muted">
                              <tr className="border-b border-border">
                                <th className="sticky right-0 z-20 bg-muted px-3 py-2 text-start font-bold min-w-[200px] border-l border-border">
                                  الموظف
                                </th>
                                {gridDates.map((d) => (
                                  <th key={d} className="px-2 py-2 text-center font-bold min-w-[78px]">
                                    {d.slice(5)}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/70">
                              {gridRows.map((emp) => (
                                <tr key={emp.id} className="hover:bg-muted/30">
                                  <td className="sticky right-0 bg-card px-3 py-1.5 font-semibold border-l border-border whitespace-nowrap">
                                    {emp.id} — {emp.name}
                                  </td>
                                  {gridDates.map((d) => {
                                    const key = `${emp.id}|${d}`;
                                    return (
                                      <td key={d} className="p-1">
                                        <input
                                          type="text"
                                          value={gridValues[key] || ''}
                                          onChange={(e) =>
                                            setGridValues((prev) => ({ ...prev, [key]: e.target.value }))
                                          }
                                          placeholder="—"
                                          className="w-full h-7 rounded border border-input bg-background px-1.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                        />
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="flex justify-end">
                          <Button type="button" onClick={handleSaveGrid} disabled={savingGrid}>
                            <CheckCircle2 className="h-4 w-4" />
                            <span>{savingGrid ? 'جارٍ الحفظ...' : 'حفظ جميع الخانات المملوءة'}</span>
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 3. Monthly Summary */}
          <TabsContent value="summary">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">تحديث الملخص الشهري للموظف</CardTitle>
                <CardDescription>
                  إدخال أو تعديل إجمالي التارجت والإنجاز والحضور والإجازات والساعات الإضافية
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveSummary} className="space-y-4">
                  <div className="max-w-md space-y-1.5">
                    <Label htmlFor="sum-emp">الموظف</Label>
                    <NativeSelect
                      id="sum-emp"
                      value={sumEmp}
                      onChange={(e) => setSumEmp(e.target.value)}
                      required
                    >
                      {meta.employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.id} — {e.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {SUMMARY_FIELDS.map((field) => (
                      <div key={field.key} className="space-y-1.5">
                        <Label htmlFor={`sum-${field.key}`}>{field.label}</Label>
                        <Input
                          id={`sum-${field.key}`}
                          type={field.isText ? 'text' : 'number'}
                          step="any"
                          value={sumFields[field.key] || ''}
                          onChange={(e) =>
                            setSumFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={savingSummary}>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{savingSummary ? 'جارٍ الحفظ...' : 'حفظ الملخص الشهري'}</span>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 4. Supervisor Target */}
          <TabsContent value="supervisor">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">إدخال تارجت الإشراف</CardTitle>
                <CardDescription>
                  ربط سجل إشراف يومي أو شهري (OPP A / OPP B / QC / File Trail)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveSupervisorTarget} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="sup-name">اسم المشرف *</Label>
                      <Input
                        id="sup-name"
                        value={supName}
                        onChange={(e) => setSupName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sup-emp">الموظف المرتبط (اختياري)</Label>
                      <NativeSelect
                        id="sup-emp"
                        value={supEmpId}
                        onChange={(e) => setSupEmpId(e.target.value)}
                      >
                        <option value="">— بدون ربط —</option>
                        {meta.employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.id} — {e.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sup-section">القسم / Section *</Label>
                      <Input
                        id="sup-section"
                        list="dl-sections"
                        value={supSection}
                        onChange={(e) => setSupSection(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sup-date">التاريخ *</Label>
                      <DatePicker
                        id="sup-date"
                        value={supDate}
                        onChange={setSupDate}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sup-daily">التارجت اليومي</Label>
                      <Input
                        id="sup-daily"
                        type="number"
                        step="any"
                        value={supTargetDaily}
                        onChange={(e) => setSupTargetDaily(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sup-monthly">التارجت الشهري</Label>
                      <Input
                        id="sup-monthly"
                        type="number"
                        step="any"
                        value={supTargetMonthly}
                        onChange={(e) => setSupTargetMonthly(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Extra optional metrics */}
                  <div className="space-y-2 border-t border-border pt-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">مؤشرات إضافية (اختياري)</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => setSupMetrics((prev) => [...prev, { key: '', value: '' }])}
                      >
                        <PlusCircle className="h-3.5 w-3.5" />
                        <span>إضافة مؤشر</span>
                      </Button>
                    </div>
                    {supMetrics.map((m, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                        <Input
                          className="col-span-5"
                          placeholder="اسم المؤشر"
                          value={m.key}
                          onChange={(e) =>
                            setSupMetrics((prev) =>
                              prev.map((row, i) => (i === idx ? { ...row, key: e.target.value } : row))
                            )
                          }
                        />
                        <Input
                          className="col-span-6"
                          placeholder="القيمة"
                          value={m.value}
                          onChange={(e) =>
                            setSupMetrics((prev) =>
                              prev.map((row, i) => (i === idx ? { ...row, value: e.target.value } : row))
                            )
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="col-span-1"
                          onClick={() =>
                            setSupMetrics((prev) => prev.filter((_, i) => i !== idx))
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={savingSup}>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{savingSup ? 'جارٍ الحفظ...' : 'حفظ تارجت الإشراف'}</span>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
