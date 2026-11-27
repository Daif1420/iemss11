import { api } from '@/lib/api';
import type { PublicSystemConfigPayload, ReportsAndSheetsConfig } from '@/types/iems';

export const DEFAULT_REPORTS_AND_SHEETS_CONFIG: ReportsAndSheetsConfig = {
  reportSize: 'normal',
  reportOrientation: 'auto',
  tableAlignH: 'center',
  tableAlignV: 'middle',
  pageVerticalAlign: 'top',
  sheetStageBlockRows: 16,
  pdfMaxDatesPerBlock: 16,
  monthDaysCount: 'auto',
  targetPercentageColumn: 'auto',
};

let cachedPublicConfig: PublicSystemConfigPayload | null = null;
let cachedAt = 0;
let inflightPromise: Promise<PublicSystemConfigPayload | null> | null = null;
const CACHE_TTL_MS = 30_000;

export function normalizeReportsAndSheetsConfig(
  raw?: Partial<ReportsAndSheetsConfig> | null
): ReportsAndSheetsConfig {
  const rs = raw || {};
  const blockRows = Math.round(Number(rs.sheetStageBlockRows) || 16);
  const pdfDates = Math.round(Number(rs.pdfMaxDatesPerBlock) || 16);
  return {
    reportSize:
      rs.reportSize === 'compact' || rs.reportSize === 'normal' || rs.reportSize === 'large'
        ? rs.reportSize
        : 'normal',
    reportOrientation:
      rs.reportOrientation === 'auto' ||
      rs.reportOrientation === 'portrait' ||
      rs.reportOrientation === 'landscape'
        ? rs.reportOrientation
        : 'auto',
    tableAlignH:
      rs.tableAlignH === 'center' || rs.tableAlignH === 'right' || rs.tableAlignH === 'left'
        ? rs.tableAlignH
        : 'center',
    tableAlignV:
      rs.tableAlignV === 'middle' || rs.tableAlignV === 'top' || rs.tableAlignV === 'bottom'
        ? rs.tableAlignV
        : 'middle',
    pageVerticalAlign:
      rs.pageVerticalAlign === 'top' || rs.pageVerticalAlign === 'center'
        ? rs.pageVerticalAlign
        : 'top',
    sheetStageBlockRows: Math.min(40, Math.max(16, blockRows)),
    pdfMaxDatesPerBlock: Math.min(31, Math.max(8, pdfDates)),
    monthDaysCount:
      rs.monthDaysCount === 'auto' ||
      rs.monthDaysCount === '30' ||
      rs.monthDaysCount === '31'
        ? rs.monthDaysCount
        : 'auto',
    targetPercentageColumn: (() => {
      const col = String(rs.targetPercentageColumn ?? 'auto').trim().toUpperCase();
      if (!col || col === 'AUTO') return 'auto';
      return /^[A-Z]{1,2}$/.test(col) ? col : 'auto';
    })(),
  };
}

export async function getPublicSystemConfig(force = false): Promise<PublicSystemConfigPayload | null> {
  if (!force && cachedPublicConfig && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedPublicConfig;
  }
  if (inflightPromise && !force) return inflightPromise;
  inflightPromise = api<PublicSystemConfigPayload>('/api/admin/system/public-config')
    .then((cfg) => {
      cachedPublicConfig = cfg;
      cachedAt = Date.now();
      return cfg;
    })
    .catch(() => cachedPublicConfig)
    .finally(() => {
      inflightPromise = null;
    });
  return inflightPromise;
}

export async function resolveReportsAndSheetsConfig(): Promise<ReportsAndSheetsConfig> {
  const cfg = await getPublicSystemConfig();
  return normalizeReportsAndSheetsConfig(cfg?.reportsAndSheets);
}

export function invalidatePublicSystemConfigCache() {
  cachedPublicConfig = null;
  cachedAt = 0;
}
