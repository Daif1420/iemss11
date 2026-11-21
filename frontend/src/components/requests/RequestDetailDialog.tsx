import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  History,
  Loader2,
  Paperclip,
  RotateCcw,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { RequestItem } from '@/types/iems';
import {
  ATTACHMENT_FIELD_LABELS,
  FORM_FIELD_LABELS,
  HISTORY_ACTION_LABELS,
  REQUEST_ALLOWED_FIELDS,
  REQUEST_CATALOG_MAP,
  STATUS_DISPLAY,
} from './requestCatalog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

interface RequestDetailDialogProps {
  requestId: number | null;
  currentUserId: number | undefined;
  canDecide: boolean;
  allowEmployeeCancellation: boolean;
  allowReopenDecision?: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function RequestDetailDialog({
  requestId,
  currentUserId,
  canDecide,
  allowEmployeeCancellation,
  allowReopenDecision = true,
  onClose,
  onUpdated,
}: RequestDetailDialogProps) {
  const [loading, setLoading] = useState(false);
  const [item, setItem] = useState<RequestItem | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [showReopenBox, setShowReopenBox] = useState(false);
  const [busyAction, setBusyAction] = useState(false);

  const [previewAtt, setPreviewAtt] = useState<{
    fileName: string;
    contentType: string;
    dataUrl: string;
  } | null>(null);
  const [attBusyId, setAttBusyId] = useState<number | null>(null);

  const loadDetail = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    try {
      const res = await api<{ request: RequestItem }>(`/api/requests/${requestId}`);
      setItem(res.request);
      setRejectMode(false);
      setRejectReason('');
      setReopenReason('');
      setShowReopenBox(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر تحميل تفاصيل الطلب');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [requestId, onClose]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleFetchAttachment = async (attId: number, mode: 'preview' | 'download') => {
    setAttBusyId(attId);
    try {
      const res = await api<{
        id: number;
        file_name: string;
        content_type: string;
        data_url: string;
      }>(`/api/requests/attachments/${attId}`);

      if (mode === 'download') {
        const a = document.createElement('a');
        a.href = res.data_url;
        a.download = res.file_name;
        a.click();
      } else {
        setPreviewAtt({
          fileName: res.file_name,
          contentType: res.content_type,
          dataUrl: res.data_url,
        });
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر فتح المرفق');
    } finally {
      setAttBusyId(null);
    }
  };

  const handleMarkUnderReview = async () => {
    if (!item) return;
    setBusyAction(true);
    try {
      await api(`/api/requests/${item.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: 'under_review', comment: null }),
      });
      toast.success('تم تحديث حالة الطلب إلى قيد المراجعة');
      await loadDetail();
      onUpdated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر تحديث الحالة');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDecide = async (decision: 'approved' | 'rejected') => {
    if (!item) return;
    const reason = decision === 'rejected' ? rejectReason.trim() : '';
    if (decision === 'rejected' && !reason) {
      toast.error('يرجى كتابة سبب الرفض قبل التأكيد.');
      return;
    }
    setBusyAction(true);
    try {
      await api(`/api/requests/${item.id}/decide`, {
        method: 'POST',
        body: JSON.stringify({ decision, reason }),
      });
      toast.success(decision === 'approved' ? 'تمت الموافقة على الطلب' : 'تم رفض الطلب');
      await loadDetail();
      onUpdated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر حفظ القرار');
    } finally {
      setBusyAction(false);
    }
  };

  const handleReopen = async () => {
    if (!item) return;
    const reason = reopenReason.trim();
    if (!reason) {
      toast.error('يرجى إدخال سبب إعادة فتح الطلب للتوثيق.');
      return;
    }
    setBusyAction(true);
    try {
      await api(`/api/requests/${item.id}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      toast.success('تمت إعادة فتح الطلب بنجاح');
      await loadDetail();
      onUpdated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر إعادة فتح الطلب');
    } finally {
      setBusyAction(false);
    }
  };

  const handleCancel = async () => {
    if (!item) return;
    setBusyAction(true);
    try {
      await api(`/api/requests/${item.id}/cancel`, { method: 'POST' });
      toast.success('تم إلغاء الطلب');
      await loadDetail();
      onUpdated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر إلغاء الطلب');
    } finally {
      setBusyAction(false);
    }
  };

  const statusMeta = item ? STATUS_DISPLAY[item.status] || STATUS_DISPLAY.submitted : null;
  const catalog = item ? REQUEST_CATALOG_MAP[item.request_type] : null;
  const isOwner = item && currentUserId !== undefined && Number(item.employee_id) === Number(currentUserId);
  const canMakeFinalDecision = Boolean(
    item &&
      canDecide &&
      !isOwner &&
      (item.status === 'submitted' || item.status === 'under_review')
  );
  const canReopen = Boolean(
    item &&
      canDecide &&
      allowReopenDecision &&
      !isOwner &&
      (item.status === 'approved' || item.status === 'rejected')
  );
  const canCancel = Boolean(
    item && isOwner && allowEmployeeCancellation && item.status === 'submitted'
  );

  // Strictly display ONLY authentic non-empty fields registered for this request type
  const allowedKeys = item ? REQUEST_ALLOWED_FIELDS[item.request_type] || [] : [];
  const visibleEntries = item
    ? Object.entries(item.form_data || {}).filter(([k, v]) => {
        if (k.startsWith('_')) return false;
        if (allowedKeys.length > 0 && !allowedKeys.includes(k)) return false;
        if (v === undefined || v === null || v === '') return false;
        if (Array.isArray(v) && v.length === 0) return false;
        return true;
      })
    : [];

  return (
    <>
      <Dialog open={requestId !== null} onOpenChange={(o: boolean) => !o && onClose()}>
        <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {loading || !item ? (
            <div className="space-y-4 py-6">
              <Skeleton className="h-7 w-64" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : (
            <>
              <DialogHeader className="text-right border-b border-border pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2 pl-6">
                  <div>
                    <DialogTitle className="text-lg font-extrabold text-foreground">
                      {catalog?.arabicTitle || item.request_title}
                    </DialogTitle>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-xs">
                      <span className="font-extrabold text-primary tabular-nums" dir="ltr">
                        {item.request_number}
                      </span>
                      <span className="text-muted-foreground">·</span>
                      {statusMeta && (
                        <span className={cn('inline-flex items-center gap-1.5 font-bold', statusMeta.textClass)}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', statusMeta.dotClass)} />
                          <span>{statusMeta.label}</span>
                        </span>
                      )}
                      <span className="text-muted-foreground">·</span>
                      <span className="text-[11px] text-muted-foreground">
                        تقديم: {fmtDateTime(item.submitted_at)}
                      </span>
                    </div>
                  </div>
                </div>
                <DialogDescription className="sr-only">
                  تفاصيل الطلب والمرفقات وسجل المتابعة والقرار.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 pt-1">
                {/* Flat Employee Summary Strip */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg bg-secondary/40 border border-border px-4 py-2.5 text-xs">
                  <span>
                    <span className="text-muted-foreground">الموظف: </span>
                    <strong className="text-foreground">{item.employee_name}</strong>
                  </span>
                  <span className="tabular-nums">
                    <span className="text-muted-foreground">الكود: </span>
                    <strong className="text-foreground">#{item.employee_id}</strong>
                  </span>
                  <span>
                    <span className="text-muted-foreground">الشركة: </span>
                    <strong className="text-foreground">
                      {item.company || item.employee_profile?.company || '—'}
                    </strong>
                  </span>
                  <span>
                    <span className="text-muted-foreground">الشيفت / المرحلة: </span>
                    <strong className="text-foreground">
                      {item.shift || '—'} ·{' '}
                      {item.selected_stage_name_snapshot || item.department || '—'}
                    </strong>
                  </span>
                </div>

                {/* Final Decision Banner */}
                {(item.status === 'approved' || item.status === 'rejected') && (
                  <div
                    className={cn(
                      'rounded-lg border p-3.5 text-xs space-y-1.5',
                      item.status === 'approved'
                        ? 'border-emerald-500/35 bg-emerald-500/10'
                        : 'border-rose-500/35 bg-rose-500/10'
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-extrabold flex items-center gap-1.5 text-foreground">
                        {item.status === 'approved' ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-rose-600" />
                        )}
                        <span>
                          القرار النهائي: {item.status === 'approved' ? 'تمت الموافقة' : 'مرفوض'}
                        </span>
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {item.decided_at ? fmtDateTime(item.decided_at) : ''}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                      <div>
                        <span className="text-muted-foreground">متخذ القرار: </span>
                        <strong className="text-foreground">
                          {item.decision_maker_name_snapshot || 'المسؤول المختص'}
                        </strong>
                      </div>
                      {item.status === 'rejected' && item.decision_reason && (
                        <div>
                          <span className="text-muted-foreground">سبب الرفض: </span>
                          <strong className="text-foreground">{item.decision_reason}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Advance Request Eligibility Verification Snapshot */}
                {item.request_type === 'advance_request' && item.eligibility && (
                  <div className="rounded-lg border border-primary/25 bg-primary/5 p-3.5 space-y-2 text-xs">
                    <div className="font-bold text-foreground flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      <span>
                        التحقق من الأهلية من سجل الحضور ({item.eligibility.cycleStart} →{' '}
                        {item.eligibility.cycleEnd})
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-0.5 text-xs">
                      <div>
                        <div className="text-[11px] text-muted-foreground">الحضور الشهري</div>
                        <div className="font-extrabold tabular-nums">
                          {item.eligibility.actualAttendanceDays} يوم
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">غياب بدون إذن</div>
                        <div
                          className={cn(
                            'font-extrabold',
                            item.eligibility.hasUnauthorizedAbsence ? 'text-destructive' : 'text-emerald-600'
                          )}
                        >
                          {item.eligibility.hasUnauthorizedAbsence
                            ? `نعم (${item.eligibility.unauthorizedAbsenceDays} يوم)`
                            : 'لا يوجد'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">فترة التقديم</div>
                        <div className="font-extrabold">
                          {item.eligibility.inApplicationWindow
                            ? `مفتوحة (يوم ${item.eligibility.currentDayOfMonth})`
                            : `يوم ${item.eligibility.currentDayOfMonth}`}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">مدة العمل</div>
                        <div className="font-extrabold">
                          {item.eligibility.tenureMonthsEstimate !== null
                            ? `${item.eligibility.tenureMonthsEstimate} شهر`
                            : 'غير محدد'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Submitted Form Details (Only fields belonging to this request type) */}
                <div className="space-y-2.5 border-t border-border pt-4">
                  <div className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    <span>بيانات الطلب</span>
                  </div>
                  {visibleEntries.length === 0 ? (
                    <div className="text-xs text-muted-foreground">
                      تم تقديم الطلب بالبيانات الأساسية والمرفقات الموضحة أدناه.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                      {visibleEntries.map(([key, val]) => {
                        const label = FORM_FIELD_LABELS[key] || key;
                        const formattedVal = Array.isArray(val) ? val.join('، ') : String(val);
                        const isLong = formattedVal.length > 55;
                        return (
                          <div
                            key={key}
                            className={cn(
                              'rounded-lg border border-border/80 bg-secondary/25 px-3 py-2',
                              isLong && 'sm:col-span-2'
                            )}
                          >
                            <div className="text-[11px] font-semibold text-muted-foreground">
                              {label}
                            </div>
                            <div className="font-bold text-foreground mt-0.5 break-words" dir="auto">
                              {formattedVal}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Attachments */}
                <div className="space-y-2 border-t border-border pt-4">
                  <div className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5 text-primary" />
                    <span>المرفقات ({item.attachments?.length || 0})</span>
                  </div>
                  {!item.attachments || item.attachments.length === 0 ? (
                    <div className="text-xs text-muted-foreground">
                      لا توجد مستندات مرفقة بهذا الطلب.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {item.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/20 px-3 py-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-foreground truncate">{att.file_name}</div>
                            <div className="text-[11px] text-muted-foreground tabular-nums">
                              {ATTACHMENT_FIELD_LABELS[att.field_key] || att.field_key} ·{' '}
                              {Math.max(1, Math.round(att.file_size / 1024))} KB
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              disabled={attBusyId === att.id}
                              onClick={() => handleFetchAttachment(att.id, 'preview')}
                            >
                              <Eye className="h-3 w-3" />
                              <span>معاينة</span>
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              disabled={attBusyId === att.id}
                              onClick={() => handleFetchAttachment(att.id, 'download')}
                              aria-label="تنزيل"
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Activity Timeline */}
                {item.history && item.history.length > 0 && (
                  <div className="space-y-2 border-t border-border pt-4">
                    <div className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                      <History className="h-3.5 w-3.5 text-primary" />
                      <span>سجل المتابعة</span>
                    </div>
                    <div className="divide-y divide-border/60 rounded-lg border border-border/80 bg-secondary/15">
                      {item.history.map((h) => (
                        <div
                          key={h.id}
                          className="flex items-start justify-between gap-3 px-3 py-2 text-xs"
                        >
                          <div>
                            <div className="font-bold text-foreground">
                              {HISTORY_ACTION_LABELS[h.action] || h.action}
                              {h.new_status
                                ? ` · ${STATUS_DISPLAY[h.new_status as keyof typeof STATUS_DISPLAY]?.label || h.new_status}`
                                : ''}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              بواسطة: <strong>{h.action_by_name_snapshot || 'النظام'}</strong>
                              {h.comment ? ` — ${h.comment}` : ''}
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap tabular-nums">
                            {fmtDateTime(h.created_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Decision Maker Controls (Reason strictly required for Rejection only) */}
                {canMakeFinalDecision && (
                  <div className="rounded-lg border border-primary/35 bg-primary/5 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                        <UserCheck className="h-4 w-4 text-primary" />
                        <span>اتخاذ القرار النهائي</span>
                      </div>
                      {!rejectMode && (
                        <div className="flex flex-wrap items-center gap-2">
                          {item.status === 'submitted' && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busyAction}
                              onClick={handleMarkUnderReview}
                            >
                              <Clock className="h-3.5 w-3.5 text-amber-600" />
                              <span>نقل لقيد المراجعة</span>
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={busyAction}
                            onClick={() => setRejectMode(true)}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            <span>رفض الطلب</span>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={busyAction}
                            onClick={() => handleDecide('approved')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                          >
                            {busyAction ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            <span>الموافقة على الطلب</span>
                          </Button>
                        </div>
                      )}
                    </div>

                    {rejectMode && (
                      <div className="space-y-2.5 pt-1 border-t border-border/70">
                        <div className="space-y-1">
                          <Label className="text-xs font-bold">
                            سبب الرفض <span className="text-destructive">*</span>
                          </Label>
                          <Textarea
                            rows={2}
                            autoFocus
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="اكتب سبب رفض الطلب للموظف..."
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busyAction}
                            onClick={() => {
                              setRejectMode(false);
                              setRejectReason('');
                            }}
                          >
                            تراجع
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={busyAction}
                            onClick={() => handleDecide('rejected')}
                            className="font-bold"
                          >
                            {busyAction ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5" />
                            )}
                            <span>تأكيد الرفض</span>
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Audited Reopen */}
                {canReopen && (
                  <div className="border-t border-border pt-3">
                    {!showReopenBox ? (
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">
                          هل تحتاج لتعديل القرار السابق؟
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setShowReopenBox(true)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>إعادة فتح للمراجعة</span>
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2 rounded-lg border border-border bg-muted/35 p-3">
                        <Label className="text-xs font-bold">سبب إعادة الفتح *</Label>
                        <Textarea
                          rows={2}
                          value={reopenReason}
                          onChange={(e) => setReopenReason(e.target.value)}
                          placeholder="اكتب مبرر إعادة فتح الطلب..."
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setShowReopenBox(false)}
                          >
                            إلغاء
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleReopen}
                            disabled={busyAction}
                          >
                            تأكيد إعادة الفتح
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Employee Self-Cancel */}
                {canCancel && (
                  <div className="flex justify-end border-t border-border pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busyAction}
                      onClick={handleCancel}
                      className="text-destructive border-destructive/40 hover:bg-destructive/10"
                    >
                      <XCircle className="h-4 w-4" />
                      <span>إلغاء الطلب</span>
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Attachment Preview Lightbox */}
      <Dialog open={previewAtt !== null} onOpenChange={(o: boolean) => !o && setPreviewAtt(null)}>
        <DialogContent dir="rtl" className="max-w-3xl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-sm font-bold truncate pl-6">
              {previewAtt?.fileName}
            </DialogTitle>
            <DialogDescription className="sr-only">معاينة المرفق</DialogDescription>
          </DialogHeader>
          {previewAtt && (
            <div className="max-h-[72vh] overflow-auto rounded-lg border border-border bg-muted/20 p-2 flex justify-center">
              {previewAtt.contentType.startsWith('image/') ? (
                <img
                  src={previewAtt.dataUrl}
                  alt={previewAtt.fileName}
                  className="max-w-full max-h-[68vh] object-contain rounded"
                />
              ) : (
                <iframe
                  src={previewAtt.dataUrl}
                  title={previewAtt.fileName}
                  className="w-full h-[65vh] rounded"
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
