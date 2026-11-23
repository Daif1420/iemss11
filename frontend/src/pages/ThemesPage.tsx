import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  FolderUp,
  ImageIcon,
  Palette,
  Snowflake,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/layout/AppShell';
import {
  SEASONAL_THEME_OPTIONS,
  SeasonalBannerFrame,
} from '@/components/shared/SeasonalDecor';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, fetchAuthenticatedBlobUrl } from '@/lib/api';
import { invalidatePublicSystemConfigCache } from '@/lib/systemConfig';
import { cn } from '@/lib/utils';
import type { SeasonalThemeId, SystemSettingsConfig } from '@/types/iems';

const MAX_BANNER_BYTES = 5 * 1024 * 1024;

function themeIcon(id: SeasonalThemeId) {
  if (id === 'new_year') return Snowflake;
  if (id === 'ramadan') return Star;
  if (id === 'emerald') return Sparkles;
  return Palette;
}

export function ThemesPage() {
  const { publicConfig, refreshPublicConfig } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [currentBannerUrl, setCurrentBannerUrl] = useState<string | null>(null);
  const [pendingDataUrl, setPendingDataUrl] = useState<string | null>(null);
  const [pendingFilename, setPendingFilename] = useState<string>('banner');
  const [bannerLoading, setBannerLoading] = useState(true);
  const [savingBanner, setSavingBanner] = useState(false);
  const [deletingBanner, setDeletingBanner] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [selectedTheme, setSelectedTheme] = useState<SeasonalThemeId>(
    publicConfig?.displayAndFeatures?.seasonalTheme || 'default'
  );
  const [decorEnabled, setDecorEnabled] = useState<boolean>(
    publicConfig?.displayAndFeatures?.seasonalDecorEnabled !== false
  );
  const [savingTheme, setSavingTheme] = useState(false);

  useEffect(() => {
    if (!publicConfig?.displayAndFeatures) return;
    if (publicConfig.displayAndFeatures.seasonalTheme) {
      setSelectedTheme(publicConfig.displayAndFeatures.seasonalTheme);
    }
    if (publicConfig.displayAndFeatures.seasonalDecorEnabled !== undefined) {
      setDecorEnabled(Boolean(publicConfig.displayAndFeatures.seasonalDecorEnabled));
    }
  }, [
    publicConfig?.displayAndFeatures?.seasonalTheme,
    publicConfig?.displayAndFeatures?.seasonalDecorEnabled,
  ]);

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

  const handleSaveTheme = async () => {
    setSavingTheme(true);
    try {
      const res = await api<{ ok: boolean; config: SystemSettingsConfig; message?: string }>(
        '/api/admin/system/settings',
        {
          method: 'PUT',
          body: JSON.stringify({
            displayAndFeatures: {
              seasonalTheme: selectedTheme,
              seasonalDecorEnabled: decorEnabled,
            },
          }),
        }
      );
      invalidatePublicSystemConfigCache();
      await refreshPublicConfig();
      const chosen = SEASONAL_THEME_OPTIONS.find((t) => t.id === selectedTheme);
      toast.success(
        res.message ? `تم تفعيل "${chosen?.name || 'الثيم'}" لجميع المستخدمين.` : 'تم حفظ الثيم.'
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'تعذر حفظ إعدادات الثيم');
    } finally {
      setSavingTheme(false);
    }
  };

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
      toast.info('تم تجهيز الصورة للمعاينة — اضغط حفظ البانر لتفعيلها.');
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
  const currentSavedTheme = publicConfig?.displayAndFeatures?.seasonalTheme || 'default';
  const currentSavedDecor = publicConfig?.displayAndFeatures?.seasonalDecorEnabled !== false;
  const themeDirty = selectedTheme !== currentSavedTheme || decorEnabled !== currentSavedDecor;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">
            الثيمات الموسمية وبانر الصفحة الرئيسية
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            تخصيص ثيم النظام العام (مثل ثيم رأس السنة والمناسبات) مع معاينة وتنسيق صورة البانر لجميع
            المستخدمين
          </p>
        </div>

        {/* 1. Seasonal System Theme Selector Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="h-4 w-4 text-primary" />
              <span>ثيم النظام والمناسبات</span>
            </CardTitle>
            <CardDescription>
              اختر ثيم النظام ليظهر تلقائياً لجميع المستخدمين ويتكامل مع صورة البانر المرفوعة
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {SEASONAL_THEME_OPTIONS.map((option) => {
                const Icon = themeIcon(option.id);
                const active = selectedTheme === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedTheme(option.id)}
                    className={cn(
                      'flex flex-col items-start gap-2.5 rounded-xl border p-3.5 text-right transition-all cursor-pointer',
                      active
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border bg-card hover:bg-secondary/40'
                    )}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-lg text-white shrink-0',
                            option.previewPrimaryClass
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span
                          className={cn(
                            'h-4 w-4 rounded-full border shrink-0',
                            option.previewAccentClass
                          )}
                        />
                      </div>
                      {active && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-extrabold text-foreground">{option.name}</div>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        {option.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/25 px-4 py-3 cursor-pointer">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-foreground">
                  إظهار الزينة والتأثيرات الخفيفة (الثلوج / النجوم وإطار البانر)
                </div>
                <div className="text-[11px] text-muted-foreground">
                  تأثير بصري خفيف لا يؤثر على وضوح الجداول أو سرعة التصفح
                </div>
              </div>
              <Checkbox
                checked={decorEnabled}
                onCheckedChange={(checked: boolean | 'indeterminate') =>
                  setDecorEnabled(checked === true)
                }
                aria-label="تفعيل الزينة الموسمية"
              />
            </label>

            <div className="flex justify-end">
              <Button
                type="button"
                disabled={savingTheme || !themeDirty}
                onClick={handleSaveTheme}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{savingTheme ? 'جارٍ تفعيل الثيم...' : 'حفظ وتفعيل الثيم للجميع'}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 2. Banner Management Card with Live Theme Integration Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="h-4 w-4 text-primary" />
              <span>صورة البانر (معاينة متكاملة مع الثيم)</span>
            </CardTitle>
            <CardDescription>
              يظهر البانر أعلى الصفحة الرئيسية مباشرة أسفل شريط التنقل داخل إطار الثيم المختار.
              الصيغ المدعومة: PNG / JPG / WEBP حتى 5MB
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SeasonalBannerFrame themeOverride={selectedTheme} decorOverride={decorEnabled}>
              {bannerLoading ? (
                <div className="h-44 flex items-center justify-center text-xs text-muted-foreground bg-secondary/30">
                  جارٍ التحقق من البانر الحالي...
                </div>
              ) : hasBanner ? (
                <img
                  src={previewSrc || ''}
                  alt="معاينة بانر الصفحة الرئيسية"
                  className="w-full max-h-60 object-cover block"
                />
              ) : (
                <div className="h-40 flex flex-col items-center justify-center gap-1.5 text-muted-foreground bg-secondary/30">
                  <ImageIcon className="h-7 w-7 opacity-50" />
                  <span className="text-xs font-medium">لا يوجد بانر مفعل حالياً</span>
                </div>
              )}
            </SeasonalBannerFrame>

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
