import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  FolderUp,
  ImageIcon,
  Trash2,
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, ApiError, fetchAuthenticatedBlobUrl } from '@/lib/api';

const MAX_BANNER_BYTES = 5 * 1024 * 1024;

export function ThemesPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [currentBannerUrl, setCurrentBannerUrl] = useState<string | null>(null);
  const [pendingDataUrl, setPendingDataUrl] = useState<string | null>(null);
  const [pendingFilename, setPendingFilename] = useState<string>('banner');
  const [bannerLoading, setBannerLoading] = useState(true);
  const [savingBanner, setSavingBanner] = useState(false);
  const [deletingBanner, setDeletingBanner] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const loadBanner = useCallback(async () => {
    setBannerLoading(true);
    try {
      const url = await fetchAuthenticatedBlobUrl('/api/admin/banner/image');
      setCurrentBannerUrl((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return url;
      });
    } finally {
      setBannerLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBanner();
    return () => {
      setCurrentBannerUrl((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [loadBanner]);

  const handlePickBanner = (file?: File | null) => {
    if (!file) return;
    if (file.size > MAX_BANNER_BYTES) {
      toast.error('حجم الصورة أكبر من 5MB.');
      return;
    }
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      toast.error('ارفع صورة PNG أو JPG أو WEBP صالحة.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPendingDataUrl(String(reader.result || ''));
      setPendingFilename(file.name || 'banner');
      toast.info('تم تجهيز الصورة للمعاينة — اضغط حفظ لتفعيلها.');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveBanner = async () => {
    if (!pendingDataUrl) return;
    setSavingBanner(true);
    try {
      const res = await api<{ ok: boolean; message?: string }>('/api/admin/banner', {
        method: 'PUT',
        body: JSON.stringify({ data: pendingDataUrl, filename: pendingFilename }),
      });
      toast.success(res.message || 'تم تحديث صورة البانر.');
      setPendingDataUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadBanner();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر حفظ صورة البانر');
    } finally {
      setSavingBanner(false);
    }
  };

  const handleDeleteBanner = async () => {
    setDeleteDialogOpen(false);
    setDeletingBanner(true);
    try {
      const res = await api<{ ok: boolean; message?: string }>('/api/admin/banner', {
        method: 'DELETE',
      });
      setPendingDataUrl(null);
      setCurrentBannerUrl((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return null;
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.success(res.message || 'تم حذف صورة البانر.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر حذف البانر');
    } finally {
      setDeletingBanner(false);
    }
  };

  const previewSrc = pendingDataUrl || currentBannerUrl;
  const hasBanner = Boolean(previewSrc);

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">
            بانر الصفحة الرئيسية
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            إدارة وتحديث صورة بانر الصفحة الرئيسية الظاهرة لجميع المستخدمين
          </p>
        </div>

        {/* Banner Management Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="h-4 w-4 text-primary" />
              <span>صورة البانر</span>
            </CardTitle>
            <CardDescription>
              يظهر البانر أعلى الصفحة الرئيسية مباشرة أسفل شريط التنقل. الصيغ المدعومة: PNG / JPG /
              WEBP حتى 5MB
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-border bg-secondary/30">
              {bannerLoading ? (
                <div className="h-44 flex items-center justify-center text-xs text-muted-foreground">
                  جارٍ التحقق من البانر الحالي...
                </div>
              ) : hasBanner ? (
                <img
                  src={previewSrc || ''}
                  alt="معاينة بانر الصفحة الرئيسية"
                  className="w-full max-h-60 object-cover"
                />
              ) : (
                <div className="h-40 flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
                  <ImageIcon className="h-7 w-7 opacity-50" />
                  <span className="text-xs font-medium">لا يوجد بانر مفعل حالياً</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => handlePickBanner(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FolderUp className="h-4 w-4" />
                  <span>اختيار صورة جديدة</span>
                </Button>
                <Button
                  type="button"
                  disabled={!pendingDataUrl || savingBanner}
                  onClick={handleSaveBanner}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{savingBanner ? 'جارٍ الحفظ...' : 'حفظ البانر'}</span>
                </Button>
              </div>

              <Button
                type="button"
                variant="destructive"
                disabled={(!currentBannerUrl && !pendingDataUrl) || deletingBanner}
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                <span>{deletingBanner ? 'جارٍ الحذف...' : 'حذف البانر'}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف بانر الصفحة الرئيسية</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد حذف صورة البانر الحالية نهائياً؟ يمكنك رفع صورة جديدة في أي وقت.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteBanner}>
              حذف البانر
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
