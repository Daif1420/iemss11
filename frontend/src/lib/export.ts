import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type {
  AttendancePayload,
  EmployeeRecord,
  ReportResult,
  RequestItem,
} from '@/types/iems';
import { IEMS_LOGO_PDF_HTML } from '@/components/shared/IemsLogo';
import { fmtDate, fmtDateTime, fmtPercent, weekdayArabic } from './format';

function escHtml(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}

function autoCols(rows: unknown[][], minW = 12): XLSX.ColInfo[] {
  if (!rows.length) return [];
  const sample = rows.slice(0, 80);
  return rows[0].map((_, colIdx) => ({
    wch: Math.max(minW, ...sample.map((r) => String(r[colIdx] ?? '').length + 3)),
  }));
}

function createRtlWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  return wb;
}

async function waitImages(container: HTMLElement): Promise<void> {
  const imgs = [...container.querySelectorAll('img')];
  await Promise.all(
    imgs.map((im) =>
      im.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            im.onload = () => resolve();
            im.onerror = () => resolve();
          })
    )
  );
}

function fmtEnDate(iso?: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  return y && m && d ? `${y}-${m}-${d}` : String(iso);
}

function fmtEnNum(n: unknown): string {
  return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function enPrintTimestamp(): string {
  const dt = new Date();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const yyyy = dt.getFullYear();
  let hours = dt.getHours();
  const minutes = String(dt.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${mm}/${dd}/${yyyy}, ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

async function ensurePdfFontsLoaded(): Promise<void> {
  if (!document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load('400 12px "Plus Jakarta Sans"'),
      document.fonts.load('500 12px "Plus Jakarta Sans"'),
      document.fonts.load('600 12px "Plus Jakarta Sans"'),
      document.fonts.load('700 12px "Plus Jakarta Sans"'),
      document.fonts.load('500 12px "Cairo"'),
      document.fonts.load('600 12px "Cairo"'),
      document.fonts.load('700 12px "Cairo"'),
    ]);
    await document.fonts.ready;
  } catch {
    // fallback silently
  }
}

// ---------------------------------------------------------------------------
// Unified ARMS White A4 PDF Engine (Matches ARMS_missing-projects_A4_bec8099d.pdf)
// ---------------------------------------------------------------------------
interface PdfMetaEntry {
  label: string;
  value: string;
}

interface PdfTableColumn {
  label: string;
  width?: string;
  bold?: boolean;
}

interface PdfSectionSpec {
  sectionTitle?: string;
  columns: PdfTableColumn[];
  rows: (string | number)[][];
}

function cellSpanHtml(v: unknown, extraStyle = ''): string {
  return `<div dir="auto" style="display:flex;align-items:center;justify-content:center;width:100%;min-height:18px;margin:0 auto;text-align:center;line-height:1.25;${extraStyle}">${escHtml(v)}</div>`;
}

function buildArmsPageChromeHtml(
  title: string,
  subtitle: string | undefined,
  metaItems: PdfMetaEntry[],
  bodyHtml: string,
  pageNum: number,
  pageCount: number,
  sheetWidthPx: number,
  orientation: 'portrait' | 'landscape',
  minHeightPx?: number
): string {
  const heightStyle = minHeightPx ? `min-height:${minHeightPx}px;` : '';
  const landscapeCls = orientation === 'landscape' ? ' pr-landscape' : '';
  const headerAndMeta = `<div class="pr-header">
      <div class="pr-header-left"><img src="/logo.png" alt="Intercom" crossorigin="anonymous"></div>
      <div class="pr-header-center"><h1>${escHtml(title)}</h1>${subtitle ? `<span>${escHtml(subtitle)}</span>` : ''}</div>
      <div class="pr-header-brand">${IEMS_LOGO_PDF_HTML}</div>
    </div>
    <div class="pr-meta-box" dir="ltr">
      ${metaItems
        .map(
          (it) =>
            `<div class="pr-meta-row"><span class="pr-meta-label">${escHtml(it.label)}</span><span class="pr-meta-val" dir="auto">${escHtml(it.value)}</span></div>`
        )
        .join('')}
    </div>
    <div class="pr-divider"></div>`;
  const mainContent =
    pageCount === 1
      ? `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;width:100%;margin:0 auto;">${headerAndMeta}<div>${bodyHtml}</div></div>`
      : `${headerAndMeta}<div style="flex:1;width:100%;margin:0 auto;">${bodyHtml}</div>`;
  return `<div class="pr-sheet pr-page${landscapeCls}" dir="ltr" style="width:${sheetWidthPx}px;${heightStyle}">
    ${mainContent}
    <div class="pr-footer"><span>Intercom IEMS</span><span>Page ${pageNum} of ${pageCount}</span></div>
  </div>`;
}

function buildArmsTableHtml(columns: PdfTableColumn[], rows: (string | number)[][]): string {
  const thead = `<thead><tr>${columns
    .map((c) => {
      const wStyle = c.width ? `width:${c.width};` : '';
      return `<th style="${wStyle}text-align:center;vertical-align:middle">${cellSpanHtml(c.label)}</th>`;
    })
    .join('')}</tr></thead>`;
  const tbody = `<tbody>${rows
    .map(
      (r) =>
        `<tr>${r
          .map((cell, cIdx) => {
            const boldStyle = columns[cIdx]?.bold ? 'font-weight:700;color:#0F172A;' : '';
            return `<td style="text-align:center;vertical-align:middle;${boldStyle}">${cellSpanHtml(cell, boldStyle)}</td>`;
          })
          .join('')}</tr>`
    )
    .join('')}</tbody>`;
  return `<table class="pr-table" dir="ltr">${thead}${tbody}</table>`;
}

async function generatePaginatedArmsPdf(options: {
  title: string;
  subtitle?: string;
  metaItems: PdfMetaEntry[];
  orientation: 'portrait' | 'landscape';
  filename: string;
  sections: PdfSectionSpec[];
}) {
  const { title, subtitle, metaItems, orientation, filename, sections } = options;
  const sheetWidthPx = orientation === 'landscape' ? 1123 : 794;

  const root = document.createElement('div');
  root.className = 'iems-pdf-offscreen';
  root.style.width = `${sheetWidthPx}px`;
  root.dir = 'ltr';
  document.body.appendChild(root);

  try {
    await ensurePdfFontsLoaded();

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    // Full-bleed A4 sheet matching ARMS PDF: page margins live cleanly inside .pr-sheet CSS padding
    const margin = 0;
    const usableW = pageW - margin * 2;
    const usableH = pageH - margin * 2;
    const targetSheetHeightPx = Math.floor((usableH * sheetWidthPx) / usableW);

    const measureHtml = (html: string) => {
      const holder = document.createElement('div');
      holder.innerHTML = html;
      const el = holder.firstElementChild as HTMLElement;
      root.appendChild(el);
      const rect = el.getBoundingClientRect();
      root.removeChild(el);
      return rect.height;
    };

    // Paginate each section cleanly with repeated ARMS chrome + table header on every page
    const pageDefs: { bodyHtml: string }[] = [];

    for (const sec of sections) {
      const headingHtml = sec.sectionTitle
        ? `<div class="pr-section-title">${escHtml(sec.sectionTitle)}</div>`
        : '';

      if (sec.rows.length === 0) {
        pageDefs.push({
          bodyHtml: `${headingHtml}${buildArmsTableHtml(sec.columns, [])}`,
        });
        continue;
      }

      const emptyH = measureHtml(
        buildArmsPageChromeHtml(
          title,
          subtitle,
          metaItems,
          `${headingHtml}${buildArmsTableHtml(sec.columns, [])}`,
          1,
          1,
          sheetWidthPx,
          orientation
        )
      );
      const sampleRows = sec.rows.slice(0, Math.min(8, sec.rows.length));
      const sampleH = measureHtml(
        buildArmsPageChromeHtml(
          title,
          subtitle,
          metaItems,
          `${headingHtml}${buildArmsTableHtml(sec.columns, sampleRows)}`,
          1,
          1,
          sheetWidthPx,
          orientation
        )
      );
      const avgRowH = Math.max(20, (sampleH - emptyH) / sampleRows.length);
      const safetyPx = 10;
      const estimatedPerPage = Math.max(
        1,
        Math.floor((targetSheetHeightPx - emptyH - safetyPx) / avgRowH)
      );

      let cursor = 0;
      while (cursor < sec.rows.length) {
        let count = Math.min(estimatedPerPage, sec.rows.length - cursor);
        while (count > 1) {
          const h = measureHtml(
            buildArmsPageChromeHtml(
              title,
              subtitle,
              metaItems,
              `${headingHtml}${buildArmsTableHtml(sec.columns, sec.rows.slice(cursor, cursor + count))}`,
              1,
              1,
              sheetWidthPx,
              orientation
            )
          );
          if (h <= targetSheetHeightPx) break;
          count -= 1;
        }
        pageDefs.push({
          bodyHtml: `${headingHtml}${buildArmsTableHtml(sec.columns, sec.rows.slice(cursor, cursor + count))}`,
        });
        cursor += count;
      }
    }

    const totalPages = Math.max(1, pageDefs.length);
    root.innerHTML = pageDefs
      .map((p, idx) =>
        buildArmsPageChromeHtml(
          title,
          subtitle,
          metaItems,
          p.bodyHtml,
          idx + 1,
          totalPages,
          sheetWidthPx,
          orientation,
          targetSheetHeightPx
        )
      )
      .join('');

    await waitImages(root);
    await new Promise((r) => setTimeout(r, 80));

    const pages = [...root.querySelectorAll('.pr-page')] as HTMLElement[];
    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        scrollX: 0,
        scrollY: 0,
        width: sheetWidthPx,
        windowWidth: sheetWidthPx,
      });
      const imgW = usableW;
      const imgH = (canvas.height * imgW) / canvas.width;
      const scale = Math.min(1, usableH / imgH);
      if (i > 0) pdf.addPage();
      pdf.addImage(
        canvas.toDataURL('image/jpeg', 0.96),
        'JPEG',
        margin + (usableW - imgW * scale) / 2,
        margin + (usableH - imgH * scale) / 2,
        imgW * scale,
        imgH * scale
      );
    }

    pdf.save(filename);
  } finally {
    root.remove();
  }
}

// ---------------------------------------------------------------------------
// 1. Attendance Analytics Export (Excel + Unified White ARMS Landscape PDF)
// ---------------------------------------------------------------------------
export function exportAttendanceExcel(data: AttendancePayload) {
  const wb = createRtlWorkbook();
  const totals: unknown[][] = [
    ['البند', 'القيمة'],
    ['إجمالي الموظفين', data.totals.employee_count],
    ['الحضور', data.totals.present],
    ['الغياب', data.totals.absent],
    ['غياب بدون إذن', data.totals.unauthorized],
    ['مرضي', data.totals.medical],
    ['نسبة الحضور', `${Number(data.totals.attendance_rate || 0).toFixed(1)}%`],
  ];
  const companies: unknown[][] = [
    ['الشركة', 'عدد الموظفين', 'الحضور', 'الغياب', 'حضور الخريجين', 'غياب الخريجين', 'حضور الطلاب', 'غياب الطلاب', 'نسبة الحضور'],
    ...(data.companies || []).map((r) => {
      const p = +r.present || 0;
      const a = +r.absent || 0;
      const t = p + a;
      return [
        r.name,
        r.employee_count,
        p,
        a,
        r.graduate_present,
        r.graduate_absent,
        r.student_present,
        r.student_absent,
        `${(t ? (p / t) * 100 : 0).toFixed(1)}%`,
      ];
    }),
  ];
  const employees: unknown[][] = [
    ['الموظف', 'ID', 'الشركة', 'الشيفت', 'المرحلة', 'إجمالي الحضور', 'إجمالي الغياب', 'إجازة عارضة', 'إجازة بإذن', 'إجازة بدون إذن', 'إجازة مرضي', 'نسبة الحضور'],
    ...(data.employees || []).map((r) => [
      r.name,
      r.id,
      r.company || '',
      r.shift || '',
      r.department || '',
      r.present,
      r.absent,
      r.casual,
      r.permission,
      r.unauthorized,
      r.medical,
      `${(+r.attendance_rate || 0).toFixed(1)}%`,
    ]),
  ];
  const daily: unknown[][] = [
    ['التاريخ', 'اليوم', 'الإجمالي الحضور', 'إجمالي الغياب', 'إجازة عارضة', 'إجازة بإذن', 'إجازة بدون إذن', 'إجازة مرضي', 'نسبة الحضور'],
    ...(data.daily || []).map((r) => [
      fmtDate(r.date),
      weekdayArabic(r.date),
      r.present,
      r.absent,
      r.casual,
      r.permission,
      r.unauthorized,
      r.medical,
      `${(+r.attendance_rate || 0).toFixed(1)}%`,
    ]),
  ];
  const sheets: [string, unknown[][]][] = [
    ['ملخص', totals],
    ['ملخص الشركات', companies],
    ['الموظفون', employees],
    ['يومي', daily],
  ];
  for (const [name, rows] of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = autoCols(rows);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, `IEMS_Attendance_${data.range.from}_${data.range.to}.xlsx`);
}

export async function exportAttendancePdf(data: AttendancePayload, preparedBy = '—') {
  const generatedAt = enPrintTimestamp();

  const summaryCols: PdfTableColumn[] = [
    { label: 'Total Employees', bold: true },
    { label: 'Total Present', bold: true },
    { label: 'Total Absent' },
    { label: 'Unauthorized' },
    { label: 'Medical' },
    { label: 'Attendance %', bold: true },
  ];
  const summaryRows: (string | number)[][] = [[
    fmtEnNum(data.totals.employee_count),
    fmtEnNum(data.totals.present),
    fmtEnNum(data.totals.absent),
    fmtEnNum(data.totals.unauthorized),
    fmtEnNum(data.totals.medical),
    `${Number(data.totals.attendance_rate || 0).toFixed(1)}%`,
  ]];

  const companyCols: PdfTableColumn[] = [
    { label: 'Company', bold: true },
    { label: 'Employees' },
    { label: 'Present' },
    { label: 'Absent' },
    { label: 'Grad Present' },
    { label: 'Grad Absent' },
    { label: 'Student Present' },
    { label: 'Student Absent' },
    { label: '%', bold: true },
  ];
  const companyRows = (data.companies || []).map((r) => {
    const p = +r.present || 0;
    const a = +r.absent || 0;
    const t = p + a;
    return [
      r.name,
      r.employee_count,
      fmtEnNum(p),
      fmtEnNum(a),
      fmtEnNum(r.graduate_present),
      fmtEnNum(r.graduate_absent),
      fmtEnNum(r.student_present),
      fmtEnNum(r.student_absent),
      `${(t ? (p / t) * 100 : 0).toFixed(1)}%`,
    ];
  });

  const empCols: PdfTableColumn[] = [
    { label: '#', width: '38px' },
    { label: 'Employee', bold: true },
    { label: 'ID', width: '64px' },
    { label: 'Company', width: '110px' },
    { label: 'Shift', width: '54px' },
    { label: 'Stage' },
    { label: 'Present', width: '64px' },
    { label: 'Absent', width: '64px' },
    { label: 'Casual', width: '60px' },
    { label: 'Permission', width: '74px' },
    { label: 'Unauth', width: '62px' },
    { label: 'Medical', width: '62px' },
    { label: '%', width: '60px', bold: true },
  ];
  const empRows = (data.employees || []).map((r, i) => [
    i + 1,
    r.name || '—',
    r.id,
    r.company || '—',
    r.shift || '—',
    r.department || '—',
    fmtEnNum(r.present),
    fmtEnNum(r.absent),
    fmtEnNum(r.casual),
    fmtEnNum(r.permission),
    fmtEnNum(r.unauthorized),
    fmtEnNum(r.medical),
    `${Number(r.attendance_rate || 0).toFixed(1)}%`,
  ]);

  const dailyCols: PdfTableColumn[] = [
    { label: 'Date', bold: true },
    { label: 'Present' },
    { label: 'Absent' },
    { label: 'Casual' },
    { label: 'Permission' },
    { label: 'Unauthorized' },
    { label: 'Medical' },
    { label: '%', bold: true },
  ];
  const dailyRows = (data.daily || []).map((r) => [
    fmtEnDate(r.date),
    fmtEnNum(r.present),
    fmtEnNum(r.absent),
    fmtEnNum(r.casual),
    fmtEnNum(r.permission),
    fmtEnNum(r.unauthorized),
    fmtEnNum(r.medical),
    `${Number(r.attendance_rate || 0).toFixed(1)}%`,
  ]);

  const sections: PdfSectionSpec[] = [
    { sectionTitle: 'Summary Metrics', columns: summaryCols, rows: summaryRows },
    ...(companyRows.length
      ? [{ sectionTitle: 'Company Breakdown', columns: companyCols, rows: companyRows }]
      : []),
    ...(empRows.length
      ? [{ sectionTitle: 'Employee Attendance Details', columns: empCols, rows: empRows }]
      : []),
    ...(dailyRows.length
      ? [{ sectionTitle: 'Daily Breakdown', columns: dailyCols, rows: dailyRows }]
      : []),
  ];

  await generatePaginatedArmsPdf({
    title: 'Attendance & Absence Report',
    metaItems: [
      { label: 'Scope :', value: `${fmtEnDate(data.range.from)} → ${fmtEnDate(data.range.to)}` },
      { label: 'Print Date :', value: generatedAt },
      {
        label: 'Total :',
        value: `${fmtEnNum(data.totals.employee_count)} Employees · Attendance ${Number(data.totals.attendance_rate || 0).toFixed(1)}%`,
      },
      { label: 'Prepared By :', value: preparedBy || '—' },
    ],
    orientation: 'landscape',
    filename: `IEMS_Attendance_${data.range.from}_${data.range.to}.pdf`,
    sections,
  });
}

// ---------------------------------------------------------------------------
// 2. Employee Detail Export (Excel + Unified White ARMS Landscape PDF)
// ---------------------------------------------------------------------------
export interface EmployeeExportPayload {
  employee: EmployeeRecord;
  grandAchievement: number;
  grandTarget: number;
  grandPercent: number | null;
  from: string;
  to: string;
  dates: string[];
  rows: {
    shift: string;
    stage: string;
    isAttendance: boolean;
    values: Record<string, string | number>;
    total: number | null;
    target: number | null;
    percentage: number | null;
  }[];
}

export function exportEmployeeDetailExcel(payload: EmployeeExportPayload) {
  const wb = createRtlWorkbook();
  const head = ['الشيفت', 'المرحلة', ...payload.dates.map(fmtDate), 'الإجمالي', 'التارجت الشهري', 'نسبة الإنجاز'];
  const dataRows = payload.rows.map((r) => [
    r.shift,
    r.stage,
    ...payload.dates.map((d) => r.values[d] ?? ''),
    r.total ?? '',
    r.target ?? '',
    r.percentage === null ? '' : fmtPercent(r.percentage),
  ]);
  const aoa: unknown[][] = [
    ['الموظف', payload.employee.name],
    ['ID', payload.employee.id],
    ['الفترة', `${fmtDate(payload.from)} → ${fmtDate(payload.to)}`],
    ['النسبة الإجمالية', fmtPercent(payload.grandPercent)],
    ['إجمالي الإنجاز', payload.grandAchievement],
    ['إجمالي التارجت', payload.grandTarget],
    [],
    head,
    ...dataRows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = autoCols([head, ...dataRows], 13);
  XLSX.utils.book_append_sheet(wb, ws, 'تفاصيل الموظف');
  XLSX.writeFile(wb, `IEMS_Employee_${payload.employee.id}_${payload.from || 'all'}_${payload.to || 'all'}.xlsx`);
}

export async function exportEmployeeDetailPdf(
  payload: EmployeeExportPayload,
  preparedBy = '—'
) {
  const generatedAt = enPrintTimestamp();
  const rangeLabel =
    payload.from || payload.to
      ? `${fmtEnDate(payload.from)} → ${fmtEnDate(payload.to)}`
      : payload.dates.length
        ? `${fmtEnDate(payload.dates[0])} → ${fmtEnDate(payload.dates[payload.dates.length - 1])}`
        : 'All Dates';

  const fmtCell = (v: string | number | undefined) => {
    if (v === undefined || v === null || v === '') return '—';
    const num = Number(v);
    return Number.isFinite(num) && String(v).trim() !== '' ? fmtEnNum(num) : String(v);
  };
  const fmtDateShort = (d: string) => (d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : d);

  const MAX_DATES_PER_BLOCK = 15;
  const dateChunks: string[][] = [];
  for (let i = 0; i < payload.dates.length; i += MAX_DATES_PER_BLOCK) {
    dateChunks.push(payload.dates.slice(i, i + MAX_DATES_PER_BLOCK));
  }
  if (!dateChunks.length) dateChunks.push([]);

  const sections: PdfSectionSpec[] = dateChunks.map((chunkDates, blockIdx) => {
    const isLastBlock = blockIdx === dateChunks.length - 1;
    const columns: PdfTableColumn[] = [
      { label: 'Shift', width: '56px' },
      { label: 'Stage', bold: true },
      ...chunkDates.map((d) => ({ label: fmtDateShort(d) })),
      ...(isLastBlock
        ? [
            { label: 'Total', bold: true },
            { label: 'Target' },
            { label: '%', bold: true },
          ]
        : []),
    ];
    const rows = payload.rows.map((r) => [
      r.shift,
      r.stage,
      ...chunkDates.map((d) => fmtCell(r.values[d])),
      ...(isLastBlock
        ? [
            r.total != null ? fmtEnNum(r.total) : '—',
            r.target != null ? fmtEnNum(r.target) : '—',
            r.percentage === null ? '—' : fmtPercent(r.percentage),
          ]
        : []),
    ]);
    const sectionTitle =
      dateChunks.length > 1
        ? `Period (${fmtDateShort(chunkDates[0])} → ${fmtDateShort(chunkDates[chunkDates.length - 1])})${isLastBlock ? ' + Summary' : ''}`
        : undefined;
    return { sectionTitle, columns, rows };
  });

  await generatePaginatedArmsPdf({
    title: 'Employee Daily Stage Report',
    metaItems: [
      { label: 'Scope :', value: `${payload.employee.name} (#${payload.employee.id}) · ${rangeLabel}` },
      { label: 'Print Date :', value: generatedAt },
      {
        label: 'Total :',
        value: `Achieved ${fmtEnNum(payload.grandAchievement)} / Target ${fmtEnNum(payload.grandTarget)} (${fmtPercent(payload.grandPercent)})`,
      },
      { label: 'Prepared By :', value: preparedBy || '—' },
    ],
    orientation: 'landscape',
    filename: `IEMS_Employee_${payload.employee.id}_${payload.from || 'all'}_${payload.to || 'all'}.pdf`,
    sections,
  });
}

// ---------------------------------------------------------------------------
// 3. Reports Studio Export (English Excel + Unified White ARMS A4 Portrait PDF)
// ---------------------------------------------------------------------------
export function exportReportExcel(result: ReportResult) {
  const stageName = Array.isArray(result.stage) ? result.stage.join(' + ') : result.stage || 'Stage';
  const rows = result.employees.map((e, idx) => ({
    '#': idx + 1,
    'Employee': e.name,
    'Company': e.company || '—',
    'Shift': e.shift || '—',
    [`${stageName} Achieved`]: Number(e.stage_target) || 0,
    'Sheet Target': e.sheet_target != null ? Number(e.sheet_target) : '—',
    'Achievement %': e.achievement_pct != null ? `${Number(e.achievement_pct).toFixed(1)}%` : '—',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 30 },
    { wch: 16 },
    { wch: 10 },
    { wch: 18 },
    { wch: 15 },
    { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Performance Report');
  const stageFile = stageName.replace(/[^a-zA-Z0-9\u0600-\u06FF_-]+/g, '-');
  XLSX.writeFile(wb, `IEMS_Report_${stageFile}_${result.from}_to_${result.to}.xlsx`);
}

export async function exportReportPdf(result: ReportResult, preparedBy: string) {
  const stageName = Array.isArray(result.stage) ? result.stage.join(' + ') : result.stage || 'Stage';
  const totalEmployees = Number(result.total) || result.employees.length;
  const totalAchievedSum = result.employees.reduce((acc, e) => acc + (Number(e.stage_target) || 0), 0);
  const generatedAt = enPrintTimestamp();
  const stageFile = stageName.replace(/[^a-zA-Z0-9\u0600-\u06FF_-]+/g, '-');

  const columns: PdfTableColumn[] = [
    { label: '#', width: '42px' },
    { label: 'Employee', bold: true },
    { label: 'Company', width: '108px' },
    { label: 'Shift', width: '60px' },
    { label: 'Achieved', width: '92px', bold: true },
    { label: 'Target', width: '88px' },
    { label: '%', width: '74px', bold: true },
  ];

  const rows = result.employees.map((e, idx) => [
    idx + 1,
    e.name || '—',
    e.company || '—',
    e.shift || '—',
    fmtEnNum(e.stage_target),
    e.sheet_target != null ? fmtEnNum(e.sheet_target) : '—',
    e.achievement_pct != null ? `${Number(e.achievement_pct).toFixed(1)}%` : '—',
  ]);

  await generatePaginatedArmsPdf({
    title: 'Employee Performance Report',
    metaItems: [
      { label: 'Scope :', value: `${stageName} · ${fmtEnDate(result.from)} to ${fmtEnDate(result.to)}` },
      { label: 'Print Date :', value: generatedAt },
      {
        label: 'Total :',
        value: `${fmtEnNum(totalEmployees)} Employees · Achieved ${fmtEnNum(totalAchievedSum)}`,
      },
      { label: 'Prepared By :', value: preparedBy || '—' },
    ],
    orientation: 'portrait',
    filename: `IEMS_Report_${stageFile}_${result.from}_to_${result.to}.pdf`,
    sections: [{ columns, rows }],
  });
}

// ---------------------------------------------------------------------------
// 4. Departed Employees Export (Excel + Unified White ARMS Landscape PDF)
// ---------------------------------------------------------------------------
export function exportDepartedExcel(rows: EmployeeRecord[]) {
  const HEAD = ['م', 'الاسم', 'ID', 'الشركة', 'القسم', 'الشيفت', 'الفئة', 'تاريخ المغادرة', 'سبب المغادرة'];
  const data = rows.map((e, i) => [
    i + 1,
    e.name || '',
    e.id,
    e.company || '',
    e.department || '',
    e.shift || '',
    e.education || '',
    e.left_date ? fmtDate(e.left_date) : '',
    e.departure_reason || '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([HEAD, ...data]);
  ws['!cols'] = [{ wch: 5 }, { wch: 32 }, { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 34 }];
  const wb = createRtlWorkbook();
  XLSX.utils.book_append_sheet(wb, ws, 'المغادرون');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `iems-left-employees_${stamp}.xlsx`);
}

export async function exportDepartedPdf(
  rows: EmployeeRecord[],
  filterSummaryText: string,
  preparedBy = '—'
) {
  const stamp = new Date().toISOString().slice(0, 10);
  const generatedAt = enPrintTimestamp();

  const columns: PdfTableColumn[] = [
    { label: '#', width: '40px' },
    { label: 'Employee', bold: true },
    { label: 'ID', width: '68px' },
    { label: 'Company', width: '110px' },
    { label: 'Department' },
    { label: 'Shift', width: '58px' },
    { label: 'Category', width: '88px' },
    { label: 'Left Date', width: '92px' },
    { label: 'Reason' },
  ];

  const tableRows = rows.map((e, i) => [
    i + 1,
    e.name || '—',
    e.id,
    e.company || '—',
    e.department || '—',
    e.shift || '—',
    e.education || '—',
    e.left_date ? fmtEnDate(e.left_date) : '—',
    e.departure_reason || '—',
  ]);

  await generatePaginatedArmsPdf({
    title: 'Departed Employees Report',
    metaItems: [
      { label: 'Scope :', value: filterSummaryText || 'All Records' },
      { label: 'Print Date :', value: generatedAt },
      { label: 'Total :', value: `${fmtEnNum(rows.length)} Employees` },
      { label: 'Prepared By :', value: preparedBy || '—' },
    ],
    orientation: 'landscape',
    filename: `iems-left-employees_${stamp}.pdf`,
    sections: [{ columns, rows: tableRows }],
  });
}

// ---------------------------------------------------------------------------
// 5. Employee Requests & Services Export (RTL Arabic Excel)
// ---------------------------------------------------------------------------
const REQUEST_STATUS_AR: Record<string, string> = {
  submitted: 'تم الإرسال',
  under_review: 'قيد المراجعة',
  approved: 'تمت الموافقة',
  rejected: 'مرفوض',
  cancelled: 'ملغي',
};

export function exportRequestsExcel(rows: RequestItem[]) {
  const head = [
    'م',
    'رقم الطلب',
    'ID الموظف',
    'اسم الموظف',
    'الشركة',
    'الشيفت',
    'القسم',
    'نوع الطلب',
    'المرحلة',
    'الحالة',
    'تاريخ التقديم',
    'آخر تحديث',
    'متخذ القرار',
    'تاريخ القرار',
    'سبب القرار',
  ];
  const data = rows.map((r, idx) => [
    idx + 1,
    r.request_number || `REQ-${r.id}`,
    r.employee_id,
    r.employee_name || '—',
    r.company || '—',
    r.shift || '—',
    r.department || '—',
    r.request_title || r.request_type,
    r.selected_stage_name_snapshot || '—',
    REQUEST_STATUS_AR[r.status] || r.status,
    fmtDateTime(r.submitted_at),
    fmtDateTime(r.last_updated_at),
    r.decision_maker_name_snapshot || '—',
    r.decided_at ? fmtDateTime(r.decided_at) : '—',
    r.decision_reason || '—',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([head, ...data]);
  ws['!cols'] = autoCols([head, ...data], 13);
  const wb = createRtlWorkbook();
  XLSX.utils.book_append_sheet(wb, ws, 'طلبات الموظفين');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `IEMS_Employee_Requests_${stamp}.xlsx`);
}
