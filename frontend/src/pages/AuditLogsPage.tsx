import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ScrollText, Search } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/layout/AppShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { api, ApiError } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AuditLogRow } from '@/types/iems';

const ACTION_LABELS: Record<string, string> = {
  import_master: 'تحديث Master',
  change_role: 'تغيير صلاحية',
  change_password: 'تغيير كلمة المرور',
  reset_default_password: 'إعادة كلمة المرور الافتراضية',
  bulk_import_passwords: 'تحديث جماعي لكلمات المرور',
  delete_employee: 'حذف موظف',
  mark_employee_left: 'تسجيل مغادرة موظف',
  reactivate_employee: 'إعادة تنشيط موظف',
  update_banner: 'تحديث البانر',
  remove_banner: 'حذف البانر',
  approve_missing_request: 'اعتماد استكمال بيانات',
  reject_missing_request: 'رفض استكمال بيانات',
  revert_missing_request: 'التراجع عن استكمال بيانات',
  approve_employee_request: 'اعتماد طلب إجازة/سلفة',
  reject_employee_request: 'رفض طلب إجازة/سلفة',
};

function formatDetails(details?: Record<string, unknown>): string {
  if (!details || !Object.keys(details).length) return '—';
  return Object.entries(details)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v ?? '')}`)
    .join(' · ');
}

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ logs: AuditLogRow[] }>('/api/admin/audit-logs?limit=300');
      setLogs(res.logs || []);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر تحميل سجل العمليات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const actionsList = useMemo(() => {
    const set = new Set(logs.map((l) => l.action).filter(Boolean));
    return Array.from(set);
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((l) => {
      if (actionFilter && l.action !== actionFilter) return false;
      if (!q) return true;
      const detailsText = formatDetails(l.details).toLowerCase();
      return (
        String(l.actor_name || '').toLowerCase().includes(q) ||
        String(l.actor_id || '').includes(q) ||
        String(l.action || '').toLowerCase().includes(q) ||
        (ACTION_LABELS[l.action] || '').toLowerCase().includes(q) ||
        String(l.entity_id || '').includes(q) ||
        detailsText.includes(q)
      );
    });
  }, [logs, query, actionFilter]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">سجل العمليات</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              متابعة كافة الإجراءات الإدارية وعمليات التحديث والصلاحيات المسجلة على النظام
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            <span>تحديث السجل</span>
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">أحدث العمليات</CardTitle>
                <Badge variant="secondary" className="tabular-nums">
                  {filteredLogs.length} عملية
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="h-3.5 w-3.5 text-muted-foreground absolute right-3 top-2.5" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="بحث بالمنفذ، العملية، التفاصيل..."
                    className="h-8 pr-8 text-xs"
                  />
                </div>
                <NativeSelect
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="h-8 w-full sm:w-48 text-xs"
                >
                  <option value="">كل العمليات</option>
                  {actionsList.map((a) => (
                    <option key={a} value={a}>
                      {ACTION_LABELS[a] || a}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                لا توجد عمليات مسجلة مطابقة للبحث
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التوقيت</TableHead>
                    <TableHead>بواسطة</TableHead>
                    <TableHead>العملية</TableHead>
                    <TableHead>العنصر المستهدف</TableHead>
                    <TableHead>التفاصيل</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDateTime(log.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-xs">{log.actor_name || '—'}</div>
                        <div className="text-[11px] text-muted-foreground tabular-nums">
                          ID {log.actor_id ?? '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">
                          {ACTION_LABELS[log.action] || log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {log.entity_type || '—'} {log.entity_id ? `#${log.entity_id}` : ''}
                      </TableCell>
                      <TableCell className="text-xs max-w-md break-words text-muted-foreground">
                        {formatDetails(log.details)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {log.ip || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
