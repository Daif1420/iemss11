import type { ReactNode } from 'react';
import { Snowflake, Sparkles, Star } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import type { SeasonalThemeId } from '@/types/iems';

export interface SeasonalThemeOption {
  id: SeasonalThemeId;
  name: string;
  description: string;
  previewPrimaryClass: string;
  previewAccentClass: string;
  greetingText?: string;
}

export const SEASONAL_THEME_OPTIONS: SeasonalThemeOption[] = [
  {
    id: 'default',
    name: 'الثيم الافتراضي (IEMS)',
    description: 'المظهر المؤسسي الأزرق الرسمي المعتمد طوال العام.',
    previewPrimaryClass: 'bg-[#065BAB]',
    previewAccentClass: 'bg-[#EFF6FF] border-[#BFDBFE]',
  },
  {
    id: 'new_year',
    name: 'ثيم رأس السنة (New Year)',
    description: 'أجواء شتوية ذهبية وزمردية مع ثلوج خفيفة وإطار احتفالي متناسق مع البانر.',
    previewPrimaryClass: 'bg-emerald-700',
    previewAccentClass: 'bg-amber-100 border-amber-300',
    greetingText: 'عام جديد سعيد — معاً نحو عام مليء بالنجاح والإنجازات',
  },
  {
    id: 'ramadan',
    name: 'ثيم الأعياد والمناسبات',
    description: 'لمسات ذهبية دافئة ونجوم متلألئة خفيفة متناسقة مع صورة البانر.',
    previewPrimaryClass: 'bg-amber-600',
    previewAccentClass: 'bg-amber-50 border-amber-300',
    greetingText: 'مناسبة سعيدة — أطيب التمنيات بالتوفيق والتميز المستمر',
  },
  {
    id: 'emerald',
    name: 'الثيم الزمردي التنفيذي',
    description: 'درجات خضراء هادئة ومريحة للعين طوال اليوم.',
    previewPrimaryClass: 'bg-emerald-600',
    previewAccentClass: 'bg-emerald-50 border-emerald-200',
  },
];

export function useActiveSeasonalTheme(): {
  seasonalTheme: SeasonalThemeId;
  seasonalDecorEnabled: boolean;
} {
  const { publicConfig } = useAuth();
  const raw = publicConfig?.displayAndFeatures?.seasonalTheme;
  const seasonalTheme: SeasonalThemeId =
    raw === 'new_year' || raw === 'ramadan' || raw === 'emerald' ? raw : 'default';
  const seasonalDecorEnabled =
    publicConfig?.displayAndFeatures?.seasonalDecorEnabled !== false;
  return { seasonalTheme, seasonalDecorEnabled };
}

export function SeasonalTopAccent() {
  const { seasonalTheme } = useActiveSeasonalTheme();
  if (seasonalTheme === 'new_year') {
    return (
      <div
        aria-hidden="true"
        className="h-1 w-full bg-gradient-to-l from-emerald-600 via-amber-400 to-emerald-600"
      />
    );
  }
  if (seasonalTheme === 'ramadan') {
    return (
      <div
        aria-hidden="true"
        className="h-1 w-full bg-gradient-to-l from-amber-600 via-yellow-300 to-amber-600"
      />
    );
  }
  return null;
}

export function SeasonalScreenOverlay() {
  const { seasonalTheme, seasonalDecorEnabled } = useActiveSeasonalTheme();
  if (!seasonalDecorEnabled) return null;

  if (seasonalTheme === 'new_year') {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-30 overflow-hidden select-none print:hidden"
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="iems-snow-flake text-emerald-600/35 dark:text-sky-200/35"
          >
            <Snowflake className={cn(i % 3 === 0 ? 'h-4 w-4' : 'h-3 w-3')} />
          </div>
        ))}
      </div>
    );
  }

  if (seasonalTheme === 'ramadan') {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-14 h-20 z-20 overflow-hidden select-none print:hidden"
      >
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="iems-twinkle-star text-amber-500/45 dark:text-amber-300/40"
          >
            <Star className={cn(i % 2 === 0 ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5')} />
          </div>
        ))}
      </div>
    );
  }

  return null;
}

interface SeasonalBannerFrameProps {
  children: ReactNode;
  themeOverride?: SeasonalThemeId;
  decorOverride?: boolean;
}

export function SeasonalBannerFrame({
  children,
  themeOverride,
  decorOverride,
}: SeasonalBannerFrameProps) {
  const ctx = useActiveSeasonalTheme();
  const activeTheme = themeOverride ?? ctx.seasonalTheme;
  const decorOn = decorOverride ?? ctx.seasonalDecorEnabled;
  const option = SEASONAL_THEME_OPTIONS.find((t) => t.id === activeTheme);

  if (activeTheme === 'new_year') {
    return (
      <div className="relative overflow-hidden rounded-xl border-2 border-amber-400/50 dark:border-amber-400/40 bg-card shadow-sm">
        {decorOn && (
          <div className="flex items-center justify-between gap-2 border-b border-amber-300/40 dark:border-amber-500/30 bg-gradient-to-l from-emerald-700 via-emerald-800 to-teal-800 px-3.5 py-1.5 text-white text-xs font-bold">
            <span className="inline-flex items-center gap-1.5">
              <Snowflake className="h-3.5 w-3.5 text-amber-300 shrink-0" />
              <span>{option?.greetingText}</span>
            </span>
            <Sparkles className="h-3.5 w-3.5 text-amber-300 shrink-0" />
          </div>
        )}
        <div className="relative">{children}</div>
      </div>
    );
  }

  if (activeTheme === 'ramadan') {
    return (
      <div className="relative overflow-hidden rounded-xl border-2 border-amber-500/45 bg-card shadow-sm">
        {decorOn && (
          <div className="flex items-center justify-between gap-2 border-b border-amber-400/40 bg-gradient-to-l from-amber-700 via-amber-600 to-yellow-700 px-3.5 py-1.5 text-white text-xs font-bold">
            <span className="inline-flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 text-yellow-200 shrink-0" />
              <span>{option?.greetingText}</span>
            </span>
            <Sparkles className="h-3.5 w-3.5 text-yellow-200 shrink-0" />
          </div>
        )}
        <div className="relative">{children}</div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      {children}
    </div>
  );
}
