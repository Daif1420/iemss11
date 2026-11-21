import { useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  History,
  LockKeyhole,
  RefreshCw,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/layout/AppShell';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/context/AuthContext';
import { api, apiUploadWithProgress, ApiError } from '@/lib/api';
import { fmtDateTime, fmtNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ImportHistoryRow } from '@/types/iems';

const MAX_BYTES = 8 * 1024 * 1024;
const PW_BATCH_SIZE = 25;

interface ParsedPasswordData {
  fileName: string;
  rows: { id: number; password: string }[];
  skipped: { line: number; reason: string }[];
}

interface PasswordImportSummary {
  updated: number;
  skipped: number;
  notFound: number[];
  invalid: number;
  protectedCount: number;
  failedRows: number;
  lastError: string;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`تعذّر قراءة الملف "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function ImportPage() {
  const { isCreator } = useAuth();

  // Master sheet import state
  const masterInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploadingMaster, setUploadingMaster] = useState(false);
  const [masterProgress, setMasterProgress] = useState(0);
  const [masterProgressLabel, setMasterProgressLabel] = useState('');
  const [masterStatus, setMasterStatus] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Import history state
  const [history, setHistory] = useState<ImportHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Bulk passwords state (Creator only)
  const pwInputRef = useRef<HTMLInputElement | null>(null);
  const [pwDragActive, setPwDragActive] = useState(false);
  const [parsedPw, setParsedPw] = useState<ParsedPasswordData | null>(null);
  const [pwConfirmOpen, setPwConfirmOpen] = useState(false);
  const [pwUploading, setPwUploading] = useState(false);
  const [pwProgress, setPwProgress] = useState(0);
  const [pwProgressLabel, setPwProgressLabel] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSummary, setPwSummary] = useState<PasswordImportSummary | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await api<{ history: ImportHistoryRow[] }>('/api/admin/import-history');
      setHistory(res.history || []);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر تحميل سجل الاستيراد');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const addMasterFiles = (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    const all = Array.from(fileList);
    const valid = all.filter((f) => /\.xlsx$/i.test(f.name));
    const skipped = all.length - valid.length;

    setSelectedFiles((prev) => {
      const next = [...prev];
      for (const f of valid) {
        if (!next.some((e) => e.name === f.name && e.size === f.size)) {
          next.push(f);
        }
      }
      return next;
    });

    if (skipped > 0) {
      setMasterStatus({
        kind: 'error',
        text: `تم تجاهل ${skipped} ملف/ملفات لأنها ليست بصيغة XLSX.`,
      });
    } else {
      setMasterStatus(null);
    }
  };

  const handleUploadMaster = async () => {
    if (!selectedFiles.length) return;
    for (const f of selectedFiles) {
      if (f.size > MAX_BYTES) {
        setMasterStatus({
          kind: 'error',
          text: `حجم الملف "${f.name}" يتجاوز الحد المسموح به (8MB).`,
        });
        return;
      }
    }

    setUploadingMaster(true);
    setMasterProgress(2);
    setMasterProgressLabel('جارٍ التجهيز...');
    setMasterStatus(null);

    const queue = [...selectedFiles];
    const results: { fileName: string; ok: boolean; message: string }[] = [];
    let creepTimer: number | null = null;

    const stopCreep = () => {
      if (creepTimer !== null) {
        window.clearInterval(creepTimer);
        creepTimer = null;
      }
    };

    try {
      for (let i = 0; i < queue.length; i++) {
        const file = queue[i];
        const totalFiles = queue.length;
        const sliceStart = i / totalFiles;
        const slice = 1 / totalFiles;
        const tag = totalFiles > 1 ? ` (${i + 1}/${totalFiles})` : '';
        const setSlice = (frac: number, label: string) => {
          setMasterProgress(Math.round((sliceStart + frac * slice) * 100));
          setMasterProgressLabel(`${label}${tag}`);
        };

        try {
          stopCreep();
          setSlice(0.04, `جارٍ قراءة الملف${totalFiles > 1 ? `: ${file.name}` : ''}`);
          const dataUrl = await readAsDataUrl(file);
          setSlice(0.1, `جارٍ رفع الملف${totalFiles > 1 ? `: ${file.name}` : ''}`);

          const bodyStr = JSON.stringify({
            filename: file.name,
            data: dataUrl,
            merge: totalFiles > 1,
          });

          let proc = 0;
          const res = await apiUploadWithProgress<{ message?: string }>(
            '/api/admin/import-master',
            bodyStr,
            (fraction) => {
              setSlice(
                0.1 + 0.5 * fraction,
                fraction < 1 ? 'جارٍ رفع الملف' : 'جارٍ معالجة البيانات وحفظ السجلات...'
              );
              if (fraction >= 1 && creepTimer === null) {
                creepTimer = window.setInterval(() => {
                  proc += (1 - proc) * 0.06;
                  setSlice(0.6 + 0.35 * proc, 'جارٍ معالجة البيانات وحفظ السجلات...');
                }, 300);
              }
            }
          );

          stopCreep();
          setSlice(1, 'تم الانتهاء');
          results.push({ fileName: file.name, ok: true, message: res.message || 'تم التحديث بنجاح' });
        } catch (err) {
          stopCreep();
          results.push({
            fileName: file.name,
            ok: false,
            message: err instanceof Error ? err.message : 'فشل الاستيراد',
          });
        }
      }

      await loadHistory();

      const failed = results.filter((r) => !r.ok);
      const succeeded = results.filter((r) => r.ok);

      if (!failed.length) {
        setMasterProgress(100);
        setMasterProgressLabel(
          queue.length > 1 ? 'اكتمل استيراد جميع الملفات بنجاح' : 'اكتمل الاستيراد بنجاح'
        );
        const msg =
          queue.length > 1
            ? `تم تحديث ${queue.length} ملفات بنجاح.`
            : results[0]?.message || 'تم تحديث البيانات بنجاح.';
        setMasterStatus({ kind: 'success', text: msg });
        toast.success(msg);
      } else if (succeeded.length) {
        const msg = `تم تحديث ${succeeded.length} من ${queue.length} ملفات. فشل: ${failed
          .map((r) => `${r.fileName} (${r.message})`)
          .join('، ')}`;
        setMasterStatus({ kind: 'error', text: msg });
        toast.warning('اكتمل الاستيراد جزئياً');
      } else {
        const msg = `تعذّر تحديث أي ملف: ${failed.map((r) => `${r.fileName}: ${r.message}`).join('، ')}`;
        setMasterStatus({ kind: 'error', text: msg });
        toast.error('فشل استيراد الملفات');
      }

      setSelectedFiles([]);
      if (masterInputRef.current) masterInputRef.current.value = '';
    } finally {
      stopCreep();
      setUploadingMaster(false);
    }
  };

  // Parse bulk passwords Excel/CSV
  const handlePickPasswordFile = async (file?: File | null) => {
    if (!file) return;
    setParsedPw(null);
    setPwError('');
    setPwSummary(null);

    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      setPwError('الملف يجب أن يكون بصيغة XLSX أو CSV.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setPwError('حجم الملف يتجاوز الحد المسموح به (8MB).');
      return;
    }

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        raw: true,
        defval: '',
      });

      const ID_HEAD = /^\s*(id|الكود|كود|رقم الموظف|رقم)\s*$/i;
      const PW_HEAD = /(الباسورد|باسورد|كلمة المرور|كلمه المرور|password|pass)/i;

      let hRow = -1;
      let idCol = -1;
      let pwCol = -1;
      for (let r = 0; r < Math.min(aoa.length, 15) && hRow < 0; r++) {
        const row = aoa[r] || [];
        let ic = -1;
        let pc = -1;
        row.forEach((v, c) => {
          const text = String(v ?? '').trim();
          if (ic < 0 && ID_HEAD.test(text)) ic = c;
          else if (pc < 0 && PW_HEAD.test(text)) pc = c;
        });
        if (ic >= 0 && pc >= 0) {
          hRow = r;
          idCol = ic;
          pwCol = pc;
        }
      }

      if (hRow < 0) {
        setPwError('لم يتم العثور على عمودَي ID والباسورد في أول شيت. تأكد من العناوين.');
        return;
      }

      const rows: { id: number; password: string }[] = [];
      const skipped: { line: number; reason: string }[] = [];

      for (let r = hRow + 1; r < aoa.length; r++) {
        const row = aoa[r] || [];
        const rawId = row[idCol];
        const rawPw = row[pwCol];
        if ((rawId === '' || rawId == null) && (rawPw === '' || rawPw == null)) continue;
        const id = Number(String(rawId).trim());
        const password = (typeof rawPw === 'number' ? String(rawPw) : String(rawPw ?? '')).trim();
        if (!Number.isInteger(id) || id <= 0) {
          skipped.push({ line: r + 1, reason: 'ID غير صالح' });
          continue;
        }
        if (password.length < 4) {
          skipped.push({ line: r + 1, reason: 'كلمة مرور أقل من 4 أحرف' });
          continue;
        }
        rows.push({ id, password });
      }

      if (!rows.length) {
        setPwError('لا توجد صفوف صالحة لتحديث كلمات المرور.');
        return;
      }

      setParsedPw({ fileName: file.name, rows, skipped });
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'تعذّر قراءة ملف كلمات المرور.');
    }
  };

  const executeBulkPasswordUpload = async () => {
    if (!parsedPw || !parsedPw.rows.length) return;
    setPwConfirmOpen(false);
    setPwUploading(true);
    setPwProgress(0);
    setPwError('');
    setPwSummary(null);

    const total = parsedPw.rows.length;
    const batches: { id: number; password: string }[][] = [];
    for (let i = 0; i < total; i += PW_BATCH_SIZE) {
      batches.push(parsedPw.rows.slice(i, i + PW_BATCH_SIZE));
    }

    const agg: PasswordImportSummary = {
      updated: 0,
      skipped: parsedPw.skipped.length,
      notFound: [],
      invalid: 0,
      protectedCount: 0,
      failedRows: 0,
      lastError: '',
    };

    try {
      for (let b = 0; b < batches.length; b++) {
        setPwProgressLabel(`جارٍ تحديث كلمات المرور (${b + 1} من ${batches.length})...`);
        setPwProgress(Math.round((b / batches.length) * 100));
        try {
          const data = await api<{
            updated?: number;
            notFound?: number[];
            invalid?: unknown[];
            protected?: number[];
          }>('/api/admin/import-passwords', {
            method: 'POST',
            body: JSON.stringify({ rows: batches[b] }),
          });
          agg.updated += Number(data.updated || 0);
          agg.notFound.push(...(data.notFound || []));
          agg.invalid += (data.invalid || []).length;
          agg.protectedCount += (data.protected || []).length;
        } catch (err) {
          agg.failedRows += batches[b].length;
          agg.lastError = err instanceof Error ? err.message : 'خطأ غير متوقع';
        }
        setPwProgress(Math.round(((b + 1) / batches.length) * 100));
      }

      setPwSummary(agg);
      setPwProgressLabel(
        agg.failedRows === 0 ? 'اكتمل تحديث كلمات المرور' : 'اكتمل التحديث مع وجود أخطاء'
      );
      if (agg.failedRows === 0) {
        toast.success(`تم تحديث ${agg.updated} كلمة مرور بنجاح`);
      } else {
        toast.warning(`تم تحديث ${agg.updated} وفشل ${agg.failedRows}`);
      }
      setParsedPw(null);
      if (pwInputRef.current) pwInputRef.current.value = '';
    } finally {
      setPwUploading(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">تحديث البيانات</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            رفع ملفات Master الشهرية لتحديث بيانات الموظفين، السجلات اليومية، التارجت وتاريخ الحضور
          </p>
        </div>

        {/* Master Upload Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              <span>رفع شيت Master (.xlsx)</span>
            </CardTitle>
            <CardDescription>
              يمكنك تحديد أو سحب أكثر من ملف معاً (مثل Shift A + Shift B) ليتم دمجهما في دفعة واحدة
              — الحد الأقصى 8MB لكل ملف
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
                addMasterFiles(e.dataTransfer?.files || null);
              }}
              onClick={() => masterInputRef.current?.click()}
              className={cn(
                'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer',
                dragActive
                  ? 'border-primary bg-accent/50'
                  : 'border-border bg-secondary/20 hover:bg-secondary/40'
              )}
            >
              <UploadCloud className="h-8 w-8 text-primary mb-2" />
              <p className="text-sm font-bold text-foreground">
                اسحب ملفات Excel هنا أو اضغط للاختيار
              </p>
              <p className="text-xs text-muted-foreground mt-1">صيغة .xlsx فقط — حتى 8MB للملف</p>
              <input
                ref={masterInputRef}
                type="file"
                accept=".xlsx"
                multiple
                className="hidden"
                onChange={(e) => {
                  addMasterFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-muted-foreground">
                  الملفات المحددة ({selectedFiles.length})
                </div>
                <div className="divide-y divide-border rounded-lg border border-border bg-card">
                  {selectedFiles.map((f, idx) => (
                    <div
                      key={`${f.name}-${f.size}`}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-semibold truncate">{f.name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {formatSize(f.size)}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={uploadingMaster}
                        onClick={() =>
                          setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))
                        }
                        aria-label="إزالة الملف"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(uploadingMaster || masterProgress > 0) && (
              <div className="space-y-1.5 rounded-lg border border-border bg-secondary/20 p-3">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>{masterProgressLabel}</span>
                  <span className="tabular-nums">{masterProgress}%</span>
                </div>
                <Progress value={masterProgress} />
              </div>
            )}

            {masterStatus && (
              <div
                className={cn(
                  'flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-semibold',
                  masterStatus.kind === 'success'
                    ? 'border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]'
                    : 'border-destructive/30 bg-destructive/10 text-destructive'
                )}
              >
                {masterStatus.kind === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                )}
                <span>{masterStatus.text}</span>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="button"
                disabled={!selectedFiles.length || uploadingMaster}
                onClick={handleUploadMaster}
              >
                <UploadCloud className="h-4 w-4" />
                <span>{uploadingMaster ? 'جارٍ رفع ومعالجة البيانات...' : 'رفع وتحديث البيانات'}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* System Creator Only: Bulk Passwords Upload */}
        {isCreator && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LockKeyhole className="h-4 w-4 text-primary" />
                <span>تحديث كلمات المرور الجماعي</span>
              </CardTitle>
              <CardDescription>
                ارفع ملف XLSX أو CSV يحتوي على عمودي (ID / الكود) و(الباسورد / Password) لتعيين
                كلمات المرور دفعة واحدة
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPwDragActive(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPwDragActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPwDragActive(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPwDragActive(false);
                  handlePickPasswordFile(e.dataTransfer?.files?.[0]);
                }}
                onClick={() => pwInputRef.current?.click()}
                className={cn(
                  'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer',
                  pwDragActive
                    ? 'border-primary bg-accent/50'
                    : 'border-border bg-secondary/20 hover:bg-secondary/40'
                )}
              >
                <LockKeyhole className="h-7 w-7 text-primary mb-2" />
                <p className="text-sm font-bold text-foreground">
                  اسحب ملف كلمات المرور (XLSX / CSV) أو اضغط للاختيار
                </p>
                <input
                  ref={pwInputRef}
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={(e) => {
                    handlePickPasswordFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>

              {parsedPw && (
                <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-3.5 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{parsedPw.fileName}</span>
                    <Badge variant="success" className="tabular-nums">
                      {parsedPw.rows.length} حساب جاهز
                    </Badge>
                    {parsedPw.skipped.length > 0 && (
                      <Badge variant="warning" className="tabular-nums">
                        {parsedPw.skipped.length} صف سيتم تخطيه
                      </Badge>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setParsedPw(null)}
                    disabled={pwUploading}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              )}

              {pwError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs font-semibold text-destructive">
                  {pwError}
                </div>
              )}

              {(pwUploading || pwProgress > 0) && (
                <div className="space-y-1.5 rounded-lg border border-border bg-secondary/20 p-3">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span>{pwProgressLabel}</span>
                    <span className="tabular-nums">{pwProgress}%</span>
                  </div>
                  <Progress value={pwProgress} />
                </div>
              )}

              {pwSummary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg border border-border bg-secondary/20 p-3 text-xs">
                  <div>
                    <div className="text-muted-foreground">تم التحديث</div>
                    <div className="text-base font-extrabold text-[var(--success)] tabular-nums">
                      {fmtNumber(pwSummary.updated)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">تم تخطيه بالملف</div>
                    <div className="text-base font-extrabold tabular-nums">
                      {fmtNumber(pwSummary.skipped)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">غير موجود بالنظام</div>
                    <div className="text-base font-extrabold text-[var(--warning)] tabular-nums">
                      {fmtNumber(pwSummary.notFound.length)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">مرفوض / فشل</div>
                    <div className="text-base font-extrabold text-destructive tabular-nums">
                      {fmtNumber(pwSummary.invalid + pwSummary.failedRows)}
                    </div>
                  </div>
                  {pwSummary.notFound.length > 0 && (
                    <div className="col-span-full text-[11px] text-muted-foreground tabular-nums">
                      الأكواد غير الموجودة: {pwSummary.notFound.join(', ')}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={!parsedPw || !parsedPw.rows.length || pwUploading}
                  onClick={() => setPwConfirmOpen(true)}
                >
                  <LockKeyhole className="h-4 w-4" />
                  <span>{pwUploading ? 'جارٍ الرفع...' : 'تحديث كلمات المرور'}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Durable Import History Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">سجل عمليات التحديث السابقة</CardTitle>
              </div>
              <Button variant="ghost" size="sm" onClick={loadHistory} disabled={historyLoading}>
                <RefreshCw className={cn('h-3.5 w-3.5', historyLoading && 'animate-spin')} />
                <span>تحديث</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {historyLoading ? (
              <div className="p-6 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : history.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                لا توجد عمليات استيراد مسجلة حتى الآن
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>بواسطة</TableHead>
                    <TableHead>الدورة</TableHead>
                    <TableHead>اسم الملف</TableHead>
                    <TableHead>محدث</TableHead>
                    <TableHead>جديد</TableHead>
                    <TableHead>سجل يومي</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDateTime(h.created_at)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {h.imported_by_name || `ID ${h.imported_by ?? '—'}`}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {h.month_start ? String(h.month_start).slice(0, 7) : '—'}
                      </TableCell>
                      <TableCell className="font-medium">{h.filename || 'Master.xlsx'}</TableCell>
                      <TableCell>{fmtNumber(h.updated_count)}</TableCell>
                      <TableCell>{fmtNumber(h.created_count)}</TableCell>
                      <TableCell>{fmtNumber(h.daily_count)}</TableCell>
                      <TableCell>
                        <Badge variant={h.status === 'success' ? 'success' : 'destructive'}>
                          {h.status === 'success' ? 'ناجح' : 'فشل'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Confirm Bulk Password Upload Dialog */}
      <AlertDialog open={pwConfirmOpen} onOpenChange={setPwConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد تغيير كلمات المرور الجماعي</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم تحديث كلمة المرور لـ {parsedPw?.rows.length || 0} حساب موظف. هل تريد المتابعة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={executeBulkPasswordUpload}>تأكيد وتحديث</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
