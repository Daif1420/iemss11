import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import type { EmployeeDetailPayload } from '@/types/iems';
import { AppShell } from '@/components/layout/AppShell';
import { EmployeePerformanceSection } from '@/components/shared/EmployeePerformanceSection';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function EmployeeDetailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const employeeId = searchParams.get('id');

  const [data, setData] = useState<EmployeeDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!employeeId) {
      navigate('/admin-employees.html', { replace: true });
      return;
    }
    let active = true;
    setLoading(true);
    setErrorMsg('');
    api<EmployeeDetailPayload>(`/api/employee/${encodeURIComponent(employeeId)}`)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        const msg = err instanceof ApiError ? err.message : 'تعذر تحميل بيانات الموظف';
        if (active) {
          setErrorMsg(msg);
          toast.error(msg);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [employeeId, navigate]);

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3 no-print">
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => navigate(-1)}>
              <ArrowRight className="h-4 w-4" />
              <span>رجوع</span>
            </Button>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link to="/admin-employees.html" className="hover:text-primary font-semibold">
                دليل الموظفين
              </Link>
              <span>/</span>
              <span className="font-bold text-foreground">
                {data ? data.employee.name : 'ملف الموظف'}
              </span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 rounded-xl" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-80 rounded-xl" />
          </div>
        ) : errorMsg ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm font-semibold text-destructive">
            {errorMsg}
          </div>
        ) : (
          data && <EmployeePerformanceSection data={data} showAllResidenceField />
        )}
      </div>
    </AppShell>
  );
}
