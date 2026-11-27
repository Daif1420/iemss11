import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  FileUp,
  Info,
  Loader2,
  Paperclip,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { RequestCategoryKey, RequestMetaPayload, RequestTypeKey } from '@/types/iems';
import { REQUEST_ALLOWED_FIELDS, REQUEST_CATALOG_MAP } from './requestCatalog';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface AttachmentDraft {
  fieldKey: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  dataUrl: string;
}

export interface SubmittedRequestSummary {
  id: number;
  requestNumber: string;
  requestTitle: string;
  category?: RequestCategoryKey;
  status: string;
  submittedAt: string;
  employeeName?: string;
  employeeId?: number;
  company?: string | null;
  shift?: string | null;
}

interface RequestFormDialogProps {
  requestType: RequestTypeKey | null;
  meta: RequestMetaPayload | null;
  onClose: () => void;
  onSubmitted: (summary: SubmittedRequestSummary) => void;
}

const DEFAULT_MAX_FILE_MB = 5;

function isSmartBusiness(company?: string | null): boolean {
  const c = String(company || '').trim().toUpperCase();
  return c.includes('SMART') || c === 'SB';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.readAsDataURL(file);
  });
}

function daysBetweenInclusive(start: string, end: string): number | '' {
  if (!start || !end || end < start) return '';
  const diff = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  return Number.isFinite(diff) && diff > 0 ? diff : '';
}

function buildInitialFormData(
  requestType: RequestTypeKey,
  profile: NonNullable<RequestMetaPayload['profile']>,
  stages: RequestMetaPayload['stages']
): Record<string, unknown> {
  const normShift = ['A', 'B', 'C', 'D'].includes(String(profile.shift || '').toUpperCase())
    ? String(profile.shift).toUpperCase()
    : 'A';
  const normEdu =
    String(profile.education || '').includes('طالب') ||
    String(profile.education || '').toLowerCase().includes('student')
      ? 'طالب'
      : 'خريج';
  const matchedStage =
    stages.find((s) => s.name === profile.department)?.name ||
    profile.department ||
    stages[0]?.name ||
    '';

  switch (requestType) {
    case 'exam_leave':
      return {
        studyYear: 'الفرقة الأولى',
        examDaysCount: '',
        examDates: [],
        otherDates: '',
        notes: '',
      };
    case 'special_leave':
      return {
        education: normEdu,
        currentStage: matchedStage,
        militaryEducationDuringYear: 'لا',
        startDate: '',
        endDate: '',
        leaveDaysCount: '',
        phone: '',
        reason: '',
        notes: '',
      };
    case 'sick_leave':
      return {
        startDate: '',
        endDate: '',
        absenceDaysCount: '',
        notes: '',
      };
    case 'extra_working_days':
      return {
        extraWorkingDate: '',
        shiftWorked: normShift,
        stage: matchedStage,
        notes: '',
      };
    case 'salary_entitlements':
      return {
        entitlementType: 'الراتب لم يُصرف',
        details: '',
        paymentMethod: 'محفظة إلكترونية',
        accountOrPhoneNumber: '',
        accountHolderName: '',
        whatsappNumber: '',
      };
    case 'advance_request':
      return {
        requestedAmount: '',
        paymentMethod: 'محفظة إلكترونية',
        walletOrInstaPayNumber: '',
        accountOwnerName: '',
      };
    case 'employee_grant':
      return {
        tenureInProject: '',
        notes: '',
      };
    case 'marriage_grant':
      return {
        gender: 'ذكر',
        termsAccepted: false,
        notes: '',
      };
    case 'general_request':
      return {
        tenureCategory: 'من 6 إلى 11 شهراً',
        currentStage: matchedStage,
        contactNumber: '',
        requestDetails: '',
      };
    case 'shift_transfer':
      return {
        education: normEdu,
        tenureCategory: 'أكثر من 6 أشهر',
        currentShift: normShift,
        requestedShift: (['A', 'B', 'C', 'D'].find((s) => s !== normShift) || 'A'),
        currentPeriodShift: 'صباحي',
        requestedPeriodShift: 'بيني',
        performableStages: matchedStage ? [matchedStage] : [],
        reason: '',
      };
    case 'resignation':
      return {
        currentStage: matchedStage,
        whatsappNumber: '',
        lastWorkingDay: '',
        reason: 'فرصة عمل جديدة',
        suggestions: '',
      };
    case 'resignation_withdrawal':
      return {
        residence: profile.residence || 'العاشر من رمضان',
        reasonForWithdrawal: '',
      };
    case 'smart_business_request':
      return {
        smartRequestType: 'مفردات مرتب',
        notes: '',
      };
    case 'medical_services':
      return {
        labName: 'معمل فحوصات',
        recipientType: 'شخصي',
        familyRelation: '',
        labVisitDate: '',
        phone: '',
      };
    default:
      return {};
  }
}

export function RequestFormDialog({
  requestType,
  meta,
  onClose,
  onSubmitted,
}: RequestFormDialogProps) {
  const catalog = requestType ? REQUEST_CATALOG_MAP[requestType] : null;
  const profile = meta?.profile || null;
  const stages = useMemo(() => meta?.stages || [], [meta?.stages]);
  const eligibility = meta?.eligibility || null;

  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Strict per-type reset so only authentic fields for the active request exist
  useEffect(() => {
    if (!requestType || !profile) return;
    setAttachments([]);
    setFormData(buildInitialFormData(requestType, profile, stages));
  }, [requestType, profile, stages]);

  if (!requestType || !catalog) return null;

  const setField = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const smartBusinessBlocked =
    (requestType === 'smart_business_request' || requestType === 'medical_services') &&
    !isSmartBusiness(profile?.company);
  const advanceWindowBlocked = Boolean(
    requestType === 'advance_request' &&
      eligibility?.enforceAdvanceWindow &&
      !eligibility.inApplicationWindow
  );
  const maxFileMb = meta?.permissions.maxAttachmentSizeMb || DEFAULT_MAX_FILE_MB;
  const maxFileBytes = maxFileMb * 1024 * 1024;
  const rawExternalUrl = meta?.externalUrls?.[requestType];
  const safeExternalUrl =
    rawExternalUrl && rawExternalUrl.startsWith('https://') ? rawExternalUrl : null;

  const handleAttachFiles = async (
    fieldKey: string,
    files: FileList | null,
    maxForField = 1
  ) => {
    if (!files || !files.length) return;
    const existingForField = attachments.filter((a) => a.fieldKey === fieldKey);
    const remainingSlots = maxForField - existingForField.length;
    if (remainingSlots <= 0 && maxForField > 1) {
      toast.error(`الحد الأقصى لهذا القسم ${maxForField} ملفات.`);
      return;
    }

    const picked = Array.from(files).slice(0, maxForField === 1 ? 1 : remainingSlots);
    const nextDrafts: AttachmentDraft[] = [];

    for (const file of picked) {
      const mime = String(file.type || '').toLowerCase();
      if (!mime.startsWith('image/') && mime !== 'application/pdf') {
        toast.error(`نوع الملف غير مدعوم: ${file.name}. يُسمح بالصور أو PDF فقط.`);
        continue;
      }
      if (file.size > maxFileBytes) {
        toast.error(`حجم الملف كبير جداً: ${file.name} (الحد الأقصى ${maxFileMb}MB).`);
        continue;
      }
      const dataUrl = await readFileAsDataUrl(file);
      nextDrafts.push({
        fieldKey,
        fileName: file.name,
        contentType: mime,
        fileSize: file.size,
        dataUrl,
      });
    }

    if (!nextDrafts.length) return;
    setAttachments((prev) => {
      if (maxForField === 1) {
        return [...prev.filter((a) => a.fieldKey !== fieldKey), ...nextDrafts];
      }
      return [...prev, ...nextDrafts];
    });
  };

  const removeAttachment = (indexInList: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== indexInList));
  };

  const toggleExamDate = (d: string) => {
    if (!d) return;
    const cur = Array.isArray(formData.examDates) ? (formData.examDates as string[]) : [];
    if (cur.includes(d)) {
      setField(
        'examDates',
        cur.filter((x) => x !== d)
      );
    } else {
      setField('examDates', [...cur, d].sort());
    }
  };

  const togglePerformableStage = (stageName: string) => {
    const cur = Array.isArray(formData.performableStages)
      ? (formData.performableStages as string[])
      : [];
    if (cur.includes(stageName)) {
      setField(
        'performableStages',
        cur.filter((s) => s !== stageName)
      );
    } else {
      setField('performableStages', [...cur, stageName]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (smartBusinessBlocked) {
      toast.error('هذا الطلب متاح لموظفي شركة Smart Business فقط.');
      return;
    }
    if (advanceWindowBlocked) {
      toast.error(
        `تقديم طلبات السلف متاح شهرياً من يوم ${eligibility?.windowStartDay ?? 10} إلى يوم ${eligibility?.windowEndDay ?? 20} فقط.`
      );
      return;
    }
    if (requestType === 'marriage_grant' && formData.termsAccepted !== true) {
      toast.error('يجب قراءة الشروط والموافقة عليها أولاً.');
      return;
    }
    if (requestType === 'medical_services') {
      if (!String(formData.labName || '').trim()) {
        toast.error('يرجى اختيار المعمل المطلوب.');
        return;
      }
      if (!String(formData.recipientType || '').trim()) {
        toast.error('يرجى تحديد لمن يوجّه الخطاب.');
        return;
      }
      if (
        formData.recipientType === 'أحد أفراد الأسرة' &&
        !String(formData.familyRelation || '').trim()
      ) {
        toast.error('يرجى تحديد صلة القرابة.');
        return;
      }
      if (!String(formData.labVisitDate || '').trim()) {
        toast.error('يرجى تحديد تاريخ التوجه للمعمل.');
        return;
      }
      const digitsOnly = String(formData.phone || '').replace(/[^\d]/g, '');
      if (digitsOnly.length < 8 || digitsOnly.length > 15) {
        toast.error('يرجى إدخال رقم هاتف صحيح.');
        return;
      }
    }

    // Send strictly the allowed fields for this requestType
    const allowed = REQUEST_ALLOWED_FIELDS[requestType] || [];
    const payloadData: Record<string, unknown> = {};
    for (const k of allowed) {
      if (
        requestType === 'medical_services' &&
        k === 'familyRelation' &&
        formData.recipientType !== 'أحد أفراد الأسرة'
      ) {
        continue;
      }
      const val = formData[k];
      if (val !== undefined && val !== null && val !== '') {
        payloadData[k] = val;
      }
    }

    setSubmitting(true);
    try {
      const res = await api<{
        ok: boolean;
        id: number;
        request_number: string;
        request_title?: string;
        category?: RequestCategoryKey;
        status?: string;
        submitted_at?: string;
        company?: string | null;
        shift?: string | null;
      }>('/api/requests', {
        method: 'POST',
        body: JSON.stringify({
          requestType,
          formData: payloadData,
          attachments,
        }),
      });
      onSubmitted({
        id: res.id,
        requestNumber: res.request_number,
        requestTitle: res.request_title || catalog.arabicTitle,
        category: res.category || catalog.category,
        status: res.status || 'submitted',
        submittedAt: res.submitted_at || new Date().toISOString(),
        employeeName: profile?.name,
        employeeId: profile?.id,
        company: res.company ?? profile?.company,
        shift: res.shift ?? profile?.shift,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر إرسال الطلب.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderAttachmentSlot = (
    fieldKey: string,
    label: string,
    required: boolean,
    maxFiles = 1
  ) => {
    const items = attachments
      .map((att, idx) => ({ att, idx }))
      .filter((x) => x.att.fieldKey === fieldKey);

    return (
      <div className="space-y-1.5 rounded-lg border border-dashed border-border bg-secondary/25 p-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-bold">
            {label} {required && <span className="text-destructive">*</span>}
          </Label>
          <span className="text-[11px] text-muted-foreground">
            {maxFiles > 1 ? `حتى ${maxFiles} ملفات · ${maxFileMb}MB` : `صورة أو PDF · ${maxFileMb}MB`}
          </span>
        </div>

        <label className="flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:border-primary/50 hover:bg-accent/40 cursor-pointer transition-colors">
          <FileUp className="h-3.5 w-3.5 text-primary" />
          <span>{items.length ? 'إضافة / تغيير الملف' : 'اختر ملفاً للإرفاق'}</span>
          <input
            type="file"
            accept="application/pdf,image/*"
            multiple={maxFiles > 1}
            className="hidden"
            onChange={(e) => {
              handleAttachFiles(fieldKey, e.target.files, maxFiles);
              e.target.value = '';
            }}
          />
        </label>

        {items.length > 0 && (
          <div className="space-y-1 pt-1">
            {items.map(({ att, idx }) => (
              <div
                key={`${att.fileName}-${idx}`}
                className="flex items-center justify-between gap-2 rounded bg-card border border-border px-2.5 py-1.5 text-xs"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Paperclip className="h-3 w-3 text-primary shrink-0" />
                  <span className="truncate font-medium">{att.fileName}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                    ({Math.max(1, Math.round(att.fileSize / 1024))} KB)
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(idx)}
                  className="text-destructive hover:text-destructive/80 p-0.5 cursor-pointer"
                  aria-label="حذف الملف"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={!!requestType} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-right border-b border-border pb-3">
          <DialogTitle className="text-lg font-extrabold text-foreground pl-6">
            {catalog.arabicTitle}
          </DialogTitle>
          <DialogDescription className="text-xs pt-0.5">{catalog.description}</DialogDescription>
        </DialogHeader>

        {/* Quiet Single-Line Employee Summary */}
        {profile && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-secondary/45 px-3.5 py-2.5 text-xs border border-border">
            <span>
              <span className="text-muted-foreground">الموظف: </span>
              <strong className="text-foreground">{profile.name}</strong>
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="tabular-nums">
              <span className="text-muted-foreground">الكود: </span>
              <strong className="text-foreground">#{profile.id}</strong>
            </span>
            <span className="text-muted-foreground">·</span>
            <span>
              <span className="text-muted-foreground">الشركة: </span>
              <strong className="text-foreground">{profile.company || '—'}</strong>
            </span>
            <span className="text-muted-foreground">·</span>
            <span>
              <span className="text-muted-foreground">الشيفت: </span>
              <strong className="text-foreground">{profile.shift || '—'}</strong>
            </span>
          </div>
        )}

        {smartBusinessBlocked && (
          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">خدمة خاصة بموظفي Smart Business</div>
              <p className="mt-0.5">
                هذا الطلب مخصص لموظفي شركة <strong>Smart Business</strong> فقط حسب البيانات المسجلة بملفك.
              </p>
            </div>
          </div>
        )}

        {safeExternalUrl ? (
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2.5 text-xs">
              <div className="font-extrabold text-sm text-foreground">
                نموذج تقديم خارجي عبر Google Forms
              </div>
              <p className="text-muted-foreground leading-relaxed">
                يتم استقبال طلبات <strong>{catalog.arabicTitle}</strong> مباشرة عبر نموذج Google
                المعتمد من الإدارة. اضغط على الزر أدناه للانتقال إلى النموذج وتعبئة البيانات.
              </p>
              <div className="pt-1 flex flex-wrap items-center gap-2">
                <a
                  href={safeExternalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>فتح نموذج {catalog.arabicTitle}</span>
                </a>
                <Button type="button" variant="outline" size="sm" onClick={onClose}>
                  إغلاق
                </Button>
              </div>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {requestType === 'exam_leave' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">الفرقة الدراسية *</Label>
                  <NativeSelect
                    value={String(formData.studyYear || 'الفرقة الأولى')}
                    onChange={(e) => setField('studyYear', e.target.value)}
                  >
                    <option value="الفرقة الأولى">الفرقة الأولى</option>
                    <option value="الفرقة الثانية">الفرقة الثانية</option>
                    <option value="الفرقة الثالثة">الفرقة الثالثة</option>
                    <option value="الفرقة الرابعة">الفرقة الرابعة</option>
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">عدد أيام الاختبارات *</Label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={String(formData.examDaysCount ?? '')}
                    onChange={(e) => setField('examDaysCount', e.target.value)}
                    placeholder="مثال: 5"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">تواريخ الاختبارات (اختر كل يوم من التقويم لإضافته مباشرة) *</Label>
                <div className="max-w-[260px]">
                  <DatePicker
                    value=""
                    onChange={(d) => {
                      if (!d) return;
                      const cur = Array.isArray(formData.examDates)
                        ? (formData.examDates as string[])
                        : [];
                      if (!cur.includes(d)) {
                        setField('examDates', [...cur, d].sort());
                      }
                    }}
                    placeholder="اختر يوم امتحان لإضافته..."
                  />
                </div>
                {Array.isArray(formData.examDates) && formData.examDates.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(formData.examDates as string[]).map((dt) => (
                      <button
                        key={dt}
                        type="button"
                        onClick={() => toggleExamDate(dt)}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-semibold hover:border-destructive/50 cursor-pointer"
                      >
                        <span className="tabular-nums">{dt}</span>
                        <span className="text-muted-foreground hover:text-destructive">×</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">تواريخ إضافية (اختياري)</Label>
                <Input
                  value={String(formData.otherDates || '')}
                  onChange={(e) => setField('otherDates', e.target.value)}
                  placeholder="في حال وجود تواريخ خارج القائمة..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {renderAttachmentSlot('studentCardAttachment', 'صورة الكارنيه أو إيصال المصروفات', true, 1)}
                {renderAttachmentSlot('examScheduleAttachment', 'صورة جدول الامتحانات', true, 1)}
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">ملاحظات (اختياري)</Label>
                <Textarea
                  rows={2}
                  value={String(formData.notes || '')}
                  onChange={(e) => setField('notes', e.target.value)}
                />
              </div>
            </div>
          )}

          {requestType === 'special_leave' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">الموقف التعليمي</Label>
                  <NativeSelect
                    value={String(formData.education || 'خريج')}
                    onChange={(e) => setField('education', e.target.value)}
                  >
                    <option value="طالب">طالب</option>
                    <option value="خريج">خريج</option>
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">المرحلة الحالية *</Label>
                  <NativeSelect
                    value={String(formData.currentStage || '')}
                    onChange={(e) => setField('currentStage', e.target.value)}
                  >
                    {stages.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">التربية العسكرية خلال العام</Label>
                  <NativeSelect
                    value={String(formData.militaryEducationDuringYear || 'لا')}
                    onChange={(e) => setField('militaryEducationDuringYear', e.target.value)}
                  >
                    <option value="لا">لا</option>
                    <option value="نعم">نعم</option>
                  </NativeSelect>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">تاريخ بداية الإجازة *</Label>
                  <DatePicker
                    value={String(formData.startDate || '')}
                    onChange={(v) => {
                      setField('startDate', v);
                      const d = daysBetweenInclusive(v, String(formData.endDate || ''));
                      if (d !== '') setField('leaveDaysCount', d);
                    }}
                    placeholder="اختر البداية"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">تاريخ نهاية الإجازة *</Label>
                  <DatePicker
                    value={String(formData.endDate || '')}
                    min={String(formData.startDate || '') || undefined}
                    onChange={(v) => {
                      setField('endDate', v);
                      const d = daysBetweenInclusive(String(formData.startDate || ''), v);
                      if (d !== '') setField('leaveDaysCount', d);
                    }}
                    placeholder="اختر النهاية"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">عدد أيام الإجازة *</Label>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={String(formData.leaveDaysCount ?? '')}
                    onChange={(e) => setField('leaveDaysCount', e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">رقم الهاتف *</Label>
                  <Input
                    value={String(formData.phone || '')}
                    onChange={(e) => setField('phone', e.target.value)}
                    placeholder="01XXXXXXXXX"
                    dir="ltr"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">سبب الإجازة *</Label>
                  <Input
                    value={String(formData.reason || '')}
                    onChange={(e) => setField('reason', e.target.value)}
                    placeholder="اكتب سبب الإجازة بوضوح"
                    required
                  />
                </div>
              </div>

              {renderAttachmentSlot('attachments', 'مستندات داعمة (اختياري)', false, 10)}

              <div className="space-y-1">
                <Label className="text-xs font-bold">ملاحظات (اختياري)</Label>
                <Textarea
                  rows={2}
                  value={String(formData.notes || '')}
                  onChange={(e) => setField('notes', e.target.value)}
                />
              </div>
            </div>
          )}

          {requestType === 'sick_leave' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">تاريخ بداية الغياب *</Label>
                  <DatePicker
                    value={String(formData.startDate || '')}
                    onChange={(v) => {
                      setField('startDate', v);
                      const d = daysBetweenInclusive(v, String(formData.endDate || ''));
                      if (d !== '') setField('absenceDaysCount', d);
                    }}
                    placeholder="اختر البداية"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">تاريخ نهاية الغياب *</Label>
                  <DatePicker
                    value={String(formData.endDate || '')}
                    min={String(formData.startDate || '') || undefined}
                    onChange={(v) => {
                      setField('endDate', v);
                      const d = daysBetweenInclusive(String(formData.startDate || ''), v);
                      if (d !== '') setField('absenceDaysCount', d);
                    }}
                    placeholder="اختر النهاية"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">عدد أيام الغياب المرضي *</Label>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={String(formData.absenceDaysCount ?? '')}
                    onChange={(e) => setField('absenceDaysCount', e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {renderAttachmentSlot('prescriptionAttachment', 'صورة الروشتة الطبية', true, 1)}
                {renderAttachmentSlot('medicalReportAttachment', 'صورة التقرير الطبي المعتمد', true, 1)}
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">ملاحظات طبية (اختياري)</Label>
                <Textarea
                  rows={2}
                  value={String(formData.notes || '')}
                  onChange={(e) => setField('notes', e.target.value)}
                  placeholder="أي تفاصيل طبية إضافية..."
                />
              </div>
            </div>
          )}

          {requestType === 'extra_working_days' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">تاريخ اليوم الإضافي *</Label>
                  <DatePicker
                    value={String(formData.extraWorkingDate || '')}
                    onChange={(v) => setField('extraWorkingDate', v)}
                    placeholder="اختر التاريخ"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">الشيفت الذي تم العمل به *</Label>
                  <NativeSelect
                    value={String(formData.shiftWorked || 'A')}
                    onChange={(e) => setField('shiftWorked', e.target.value)}
                  >
                    <option value="A">Shift A</option>
                    <option value="B">Shift B</option>
                    <option value="C">Shift C</option>
                    <option value="D">Shift D</option>
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">المرحلة *</Label>
                  <NativeSelect
                    value={String(formData.stage || '')}
                    onChange={(e) => setField('stage', e.target.value)}
                  >
                    {stages.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">ملاحظات (اختياري)</Label>
                <Textarea
                  rows={2}
                  value={String(formData.notes || '')}
                  onChange={(e) => setField('notes', e.target.value)}
                />
              </div>
            </div>
          )}

          {requestType === 'salary_entitlements' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold">نوع المستحق *</Label>
                <NativeSelect
                  value={String(formData.entitlementType || 'الراتب لم يُصرف')}
                  onChange={(e) => setField('entitlementType', e.target.value)}
                >
                  <option value="الراتب لم يُصرف">الراتب لم يُصرف</option>
                  <option value="بدل يوم إضافي (أسبوعي / إجازة رسمية)">
                    بدل يوم إضافي (أسبوعي / إجازة رسمية)
                  </option>
                  <option value="تارجت شهري">تارجت شهري</option>
                  <option value="أيام حضور">أيام حضور</option>
                  <option value="أخرى">أخرى</option>
                </NativeSelect>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">تفاصيل المستحق *</Label>
                <Textarea
                  rows={2}
                  value={String(formData.details || '')}
                  onChange={(e) => setField('details', e.target.value)}
                  placeholder="اشرح تفاصيل المستحق أو الفارق المالي بدقة..."
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">وسيلة الصرف *</Label>
                  <NativeSelect
                    value={String(formData.paymentMethod || 'محفظة إلكترونية')}
                    onChange={(e) => setField('paymentMethod', e.target.value)}
                  >
                    <option value="محفظة إلكترونية">محفظة إلكترونية</option>
                    <option value="InstaPay">InstaPay</option>
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">رقم المحفظة / الحساب *</Label>
                  <Input
                    value={String(formData.accountOrPhoneNumber || '')}
                    onChange={(e) => setField('accountOrPhoneNumber', e.target.value)}
                    placeholder="رقم الهاتف أو عنوان InstaPay"
                    dir="ltr"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">اسم صاحب الحساب *</Label>
                  <Input
                    value={String(formData.accountHolderName || '')}
                    onChange={(e) => setField('accountHolderName', e.target.value)}
                    placeholder="الاسم المسجل على المحفظة أو الحساب"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">رقم الواتساب *</Label>
                  <Input
                    value={String(formData.whatsappNumber || '')}
                    onChange={(e) => setField('whatsappNumber', e.target.value)}
                    placeholder="01XXXXXXXXX"
                    dir="ltr"
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {requestType === 'advance_request' && (
            <div className="space-y-3">
              {eligibility && (
                <div className="rounded-lg border border-border bg-secondary/35 p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      <span>أهلية السلفة للدورة الحالية ({eligibility.cycleStart} → {eligibility.cycleEnd})</span>
                    </span>
                    {eligibility.existingAdvanceThisMonth && (
                      <span className="text-[11px] font-bold text-destructive">
                        يوجد طلب سلفة هذا الشهر
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5 text-[11px]">
                    <div>
                      <span className="text-muted-foreground">الحضور الشهري: </span>
                      <strong className="tabular-nums">{eligibility.actualAttendanceDays} يوم</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground">غياب بدون إذن: </span>
                      <strong className={eligibility.hasUnauthorizedAbsence ? 'text-destructive' : 'text-emerald-600'}>
                        {eligibility.hasUnauthorizedAbsence
                          ? `${eligibility.unauthorizedAbsenceDays} يوم`
                          : 'لا يوجد'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground">نافذة التقديم: </span>
                      <strong className={eligibility.inApplicationWindow ? 'text-emerald-600' : 'text-amber-600'}>
                        {eligibility.inApplicationWindow
                          ? `مفتوحة (${eligibility.windowStartDay ?? 10}–${eligibility.windowEndDay ?? 20})`
                          : `يوم ${eligibility.currentDayOfMonth} (من ${eligibility.windowStartDay ?? 10} إلى ${eligibility.windowEndDay ?? 20})`}
                      </strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground">مدة العمل: </span>
                      <strong>
                        {eligibility.tenureMonthsEstimate !== null
                          ? `${eligibility.tenureMonthsEstimate} شهر`
                          : 'تُراجع إدارياً'}
                      </strong>
                    </div>
                  </div>
                  {advanceWindowBlocked && (
                    <div className="rounded-md border border-destructive/35 bg-destructive/10 px-2.5 py-1.5 text-[11px] font-semibold text-destructive">
                      نافذة تقديم طلبات السلف مقفلة حالياً (يُسمح بالتقديم من يوم {eligibility.windowStartDay ?? 10} إلى {eligibility.windowEndDay ?? 20} من كل شهر فقط).
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">مبلغ السلفة المطلوب (جنيه) *</Label>
                  <Input
                    type="number"
                    min={50}
                    max={50000}
                    value={String(formData.requestedAmount ?? '')}
                    onChange={(e) => setField('requestedAmount', e.target.value)}
                    placeholder="مثال: 1500"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">وسيلة الاستلام *</Label>
                  <NativeSelect
                    value={String(formData.paymentMethod || 'محفظة إلكترونية')}
                    onChange={(e) => setField('paymentMethod', e.target.value)}
                  >
                    <option value="محفظة إلكترونية">محفظة إلكترونية</option>
                    <option value="InstaPay">InstaPay</option>
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">رقم المحفظة / InstaPay *</Label>
                  <Input
                    value={String(formData.walletOrInstaPayNumber || '')}
                    onChange={(e) => setField('walletOrInstaPayNumber', e.target.value)}
                    dir="ltr"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">اسم صاحب الحساب *</Label>
                  <Input
                    value={String(formData.accountOwnerName || '')}
                    onChange={(e) => setField('accountOwnerName', e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {requestType === 'employee_grant' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold">مدة العمل بالمشروع *</Label>
                <Input
                  value={String(formData.tenureInProject || '')}
                  onChange={(e) => setField('tenureInProject', e.target.value)}
                  placeholder="مثال: 6 أشهر"
                  required
                />
              </div>
              {renderAttachmentSlot('deathCertificateAttachment', 'صورة شهادة الوفاة', true, 1)}
              <div className="space-y-1">
                <Label className="text-xs font-bold">ملاحظات (اختياري)</Label>
                <Textarea
                  rows={2}
                  value={String(formData.notes || '')}
                  onChange={(e) => setField('notes', e.target.value)}
                />
              </div>
            </div>
          )}

          {requestType === 'marriage_grant' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold">النوع *</Label>
                <NativeSelect
                  value={String(formData.gender || 'ذكر')}
                  onChange={(e) => setField('gender', e.target.value)}
                >
                  <option value="ذكر">ذكر</option>
                  <option value="أنثى">أنثى</option>
                </NativeSelect>
              </div>
              {renderAttachmentSlot(
                'marriageProofAttachment',
                'صورة شهادة الزواج أو ظهر البطاقة الشخصية للزوجة (متزوج)',
                true,
                1
              )}
              <div className="space-y-1">
                <Label className="text-xs font-bold">ملاحظات (اختياري)</Label>
                <Textarea
                  rows={2}
                  value={String(formData.notes || '')}
                  onChange={(e) => setField('notes', e.target.value)}
                />
              </div>
            </div>
          )}

          {requestType === 'general_request' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">مدة الخدمة *</Label>
                  <NativeSelect
                    value={String(formData.tenureCategory || 'من 6 إلى 11 شهراً')}
                    onChange={(e) => setField('tenureCategory', e.target.value)}
                  >
                    <option value="أكثر من 24 شهراً">أكثر من 24 شهراً</option>
                    <option value="أكثر من 18 شهراً">أكثر من 18 شهراً</option>
                    <option value="أكثر من 12 شهراً">أكثر من 12 شهراً</option>
                    <option value="من 6 إلى 11 شهراً">من 6 إلى 11 شهراً</option>
                    <option value="من شهر إلى 5 أشهر">من شهر إلى 5 أشهر</option>
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">المرحلة الحالية *</Label>
                  <NativeSelect
                    value={String(formData.currentStage || '')}
                    onChange={(e) => setField('currentStage', e.target.value)}
                  >
                    {stages.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">رقم التواصل *</Label>
                  <Input
                    value={String(formData.contactNumber || '')}
                    onChange={(e) => setField('contactNumber', e.target.value)}
                    placeholder="01XXXXXXXXX"
                    dir="ltr"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">تفاصيل الطلب *</Label>
                <Textarea
                  rows={3}
                  value={String(formData.requestDetails || '')}
                  onChange={(e) => setField('requestDetails', e.target.value)}
                  placeholder="اكتب تفاصيل طلبك بالكامل..."
                  required
                />
              </div>

              {renderAttachmentSlot('attachments', 'مرفقات داعمة (اختياري)', false, 5)}
            </div>
          )}

          {requestType === 'shift_transfer' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">الموقف التعليمي</Label>
                  <NativeSelect
                    value={String(formData.education || 'خريج')}
                    onChange={(e) => setField('education', e.target.value)}
                  >
                    <option value="طالب">طالب</option>
                    <option value="خريج">خريج</option>
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">مدة العمل بالمشروع *</Label>
                  <NativeSelect
                    value={String(formData.tenureCategory || 'أكثر من 6 أشهر')}
                    onChange={(e) => setField('tenureCategory', e.target.value)}
                  >
                    <option value="أكثر من 3 أشهر">أكثر من 3 أشهر</option>
                    <option value="أكثر من 6 أشهر">أكثر من 6 أشهر</option>
                    <option value="أكثر من 12 شهراً">أكثر من 12 شهراً</option>
                    <option value="أكثر من 24 شهراً">أكثر من 24 شهراً</option>
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">الشيفت الحالي</Label>
                  <Input
                    value={`Shift ${String(profile?.shift || formData.currentShift || '—')}`}
                    readOnly
                    disabled
                    className="bg-muted/50 font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">الشيفت المطلوب الانتقال إليه *</Label>
                  <NativeSelect
                    value={String(formData.requestedShift || 'A')}
                    onChange={(e) => setField('requestedShift', e.target.value)}
                  >
                    {['A', 'B', 'C', 'D']
                      .filter((s) => s !== String(profile?.shift || '').trim().toUpperCase())
                      .map((s) => (
                        <option key={s} value={s}>
                          Shift {s}
                        </option>
                      ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">الفترة الحالية *</Label>
                  <NativeSelect
                    value={String(formData.currentPeriodShift || 'صباحي')}
                    onChange={(e) => setField('currentPeriodShift', e.target.value)}
                  >
                    <option value="صباحي">صباحي</option>
                    <option value="بيني">بيني</option>
                    <option value="ليلي">ليلي</option>
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">الفترة المطلوبة *</Label>
                  <NativeSelect
                    value={String(formData.requestedPeriodShift || 'بيني')}
                    onChange={(e) => setField('requestedPeriodShift', e.target.value)}
                  >
                    <option value="صباحي">صباحي</option>
                    <option value="بيني">بيني</option>
                    <option value="ليلي">ليلي</option>
                  </NativeSelect>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">
                  المراحل التي يمكنك العمل بها (اختر مرحلة أو أكثر) *
                </Label>
                <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-secondary/20 p-2.5">
                  {stages.map((st) => {
                    const selected =
                      Array.isArray(formData.performableStages) &&
                      (formData.performableStages as string[]).includes(st.name);
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => togglePerformableStage(st.name)}
                        className={cn(
                          'rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer',
                          selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-card text-foreground hover:bg-muted'
                        )}
                      >
                        {st.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">سبب طلب النقل *</Label>
                <Textarea
                  rows={2}
                  value={String(formData.reason || '')}
                  onChange={(e) => setField('reason', e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          {requestType === 'resignation' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">المرحلة الحالية *</Label>
                  <NativeSelect
                    value={String(formData.currentStage || '')}
                    onChange={(e) => setField('currentStage', e.target.value)}
                  >
                    {stages.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">رقم الواتساب *</Label>
                  <Input
                    value={String(formData.whatsappNumber || '')}
                    onChange={(e) => setField('whatsappNumber', e.target.value)}
                    placeholder="01XXXXXXXXX"
                    dir="ltr"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">آخر يوم عمل *</Label>
                  <DatePicker
                    value={String(formData.lastWorkingDay || '')}
                    onChange={(v) => setField('lastWorkingDay', v)}
                    placeholder="اختر آخر يوم عمل"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">سبب الاستقالة *</Label>
                <NativeSelect
                  value={String(formData.reason || 'فرصة عمل جديدة')}
                  onChange={(e) => setField('reason', e.target.value)}
                >
                  <option value="فرصة عمل جديدة">فرصة عمل جديدة</option>
                  <option value="السفر خارج البلاد">السفر خارج البلاد</option>
                  <option value="التجنيد / الخدمة العسكرية">التجنيد / الخدمة العسكرية</option>
                  <option value="سوء معاملة من بعض الزملاء">سوء معاملة من بعض الزملاء</option>
                  <option value="سوء معاملة من المشرف / مسؤول الشيفت">
                    سوء معاملة من المشرف / مسؤول الشيفت
                  </option>
                  <option value="ملاحظات على الإدارة">ملاحظات على الإدارة</option>
                  <option value="أخرى">أخرى</option>
                </NativeSelect>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">مقترحات تحسين (اختياري)</Label>
                <Textarea
                  rows={2}
                  value={String(formData.suggestions || '')}
                  onChange={(e) => setField('suggestions', e.target.value)}
                />
              </div>
            </div>
          )}

          {requestType === 'resignation_withdrawal' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold">منطقة السكن *</Label>
                <NativeSelect
                  value={String(formData.residence || 'العاشر من رمضان')}
                  onChange={(e) => setField('residence', e.target.value)}
                >
                  <option value="العاشر من رمضان">العاشر من رمضان</option>
                  <option value="القاهرة">القاهرة</option>
                  <option value="الزقازيق">الزقازيق</option>
                  {profile?.residence &&
                    !['العاشر من رمضان', 'القاهرة', 'الزقازيق'].includes(profile.residence) && (
                      <option value={profile.residence}>{profile.residence}</option>
                    )}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">سبب التراجع عن الاستقالة *</Label>
                <Textarea
                  rows={3}
                  value={String(formData.reasonForWithdrawal || '')}
                  onChange={(e) => setField('reasonForWithdrawal', e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          {requestType === 'smart_business_request' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold">نوع الطلب *</Label>
                <NativeSelect
                  value={String(formData.smartRequestType || 'مفردات مرتب')}
                  onChange={(e) => setField('smartRequestType', e.target.value)}
                >
                  <option value="مفردات مرتب">مفردات مرتب</option>
                  <option value="كارنيه عمل">كارنيه عمل</option>
                  <option value="شهادة خبرة">شهادة خبرة</option>
                  <option value="استرداد مسوغات التعيين">استرداد مسوغات التعيين</option>
                  <option value="أخرى">أخرى</option>
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">ملاحظات (اختياري)</Label>
                <Textarea
                  rows={2}
                  value={String(formData.notes || '')}
                  onChange={(e) => setField('notes', e.target.value)}
                />
              </div>
            </div>
          )}

          {requestType === 'medical_services' && (
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">المعمل المطلوب *</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(['معمل فحوصات', 'معمل النيل مصر'] as const).map((lab) => {
                    const active = formData.labName === lab;
                    return (
                      <button
                        key={lab}
                        type="button"
                        onClick={() => setField('labName', lab)}
                        className={cn(
                          'flex items-center justify-center rounded-lg border px-3 py-2.5 text-xs font-bold transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-card text-foreground hover:bg-muted'
                        )}
                      >
                        {lab}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold">الخطاب موجّه لمن؟ *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(['شخصي', 'أحد أفراد الأسرة'] as const).map((target) => {
                    const active = formData.recipientType === target;
                    return (
                      <button
                        key={target}
                        type="button"
                        onClick={() => {
                          setField('recipientType', target);
                          if (target !== 'أحد أفراد الأسرة') {
                            setField('familyRelation', '');
                          }
                        }}
                        className={cn(
                          'flex items-center justify-center rounded-lg border px-3 py-2.5 text-xs font-bold transition-colors cursor-pointer',
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-card text-foreground hover:bg-muted'
                        )}
                      >
                        {target}
                      </button>
                    );
                  })}
                </div>

                {formData.recipientType === 'أحد أفراد الأسرة' && (
                  <div className="space-y-1.5 rounded-lg border border-border bg-secondary/20 p-3">
                    <Label className="text-xs font-bold">صلة القرابة *</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {(['أب', 'أم', 'أخ', 'أخت', 'ابن', 'ابنة'] as const).map((rel) => {
                        const selected = formData.familyRelation === rel;
                        return (
                          <button
                            key={rel}
                            type="button"
                            onClick={() => setField('familyRelation', rel)}
                            className={cn(
                              'rounded-md border px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer',
                              selected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-card text-foreground hover:bg-muted'
                            )}
                          >
                            {rel}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">تاريخ التوجه للمعمل *</Label>
                  <DatePicker
                    value={String(formData.labVisitDate || '')}
                    onChange={(v) => setField('labVisitDate', v)}
                    placeholder="اختر تاريخ التوجه للمعمل"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">رقم الهاتف *</Label>
                  <Input
                    value={String(formData.phone || '')}
                    onChange={(e) => setField('phone', e.target.value)}
                    placeholder="01XXXXXXXXX"
                    dir="ltr"
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {catalog.conditions.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/35 p-3 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-foreground">
                <Info className="h-3.5 w-3.5 text-primary" />
                <span>شروط وضوابط التقديم</span>
              </div>
              <ul className="list-disc pr-5 space-y-0.5 text-[11px] text-muted-foreground">
                {catalog.conditions.map((c, idx) => (
                  <li key={idx}>{c}</li>
                ))}
              </ul>
              {requestType === 'marriage_grant' && (
                <label className="flex items-start gap-2.5 pt-2 border-t border-border/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.termsAccepted === true}
                    onChange={(e) => setField('termsAccepted', e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-primary shrink-0"
                    required
                  />
                  <span className="text-[11px] font-bold text-foreground leading-relaxed">
                    قرأت الشروط وموافق عليها وفي حالة وجود خطأ في البيانات المقدمة يتم استبعادي من
                    المنحة نهائياً <span className="text-destructive">*</span>
                  </span>
                </label>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={submitting || smartBusinessBlocked || advanceWindowBlocked}
              className="font-bold"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>جاري الإرسال...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>إرسال الطلب</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
