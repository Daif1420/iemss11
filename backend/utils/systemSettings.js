const db = require('../database/init');
const mockDb = require('../database/mock-db');

const DEFAULT_GOOGLE_FORM_SALARY_ENTITLEMENTS =
  'https://docs.google.com/forms/d/e/1FAIpQLSfkQ-R62KSoU6IgyU5Ku0C-I1kVImbhTIqWm3urnQc_dOkFBg/viewform';
const DEFAULT_GOOGLE_FORM_ADVANCE_REQUEST =
  'https://docs.google.com/forms/d/e/1FAIpQLSdlp6irPWTc8DQyN-Pzh1vZsDb4vK6wVrvgrApb_EjVDrDPeg/viewform?usp=send_form';
const DEFAULT_PAYROLL_PORTAL_URL = 'https://ziadkhaled14.pythonanywhere.com/';
const DEFAULT_WORK_REGULATIONS_URL =
  'https://drive.google.com/file/d/1c4Af3qdLm3dROQeAYOCe8kUlEDGclPA8/view';
const DEFAULT_SUPPORT_WHATSAPP = '201099843057';

const DEFAULT_FALLBACK_STAGES = [
  'تجهيز',
  'إسكان',
  'تجميع',
  'تحقق',
  'ربط الباليت',
  'سيستم',
  'ملاحظات السيستم',
  'مراجعه',
  'أخرى',
];

const DEFAULT_COMPANIES = ['SMART BUSINESS', 'BRAVOS'];
const DEFAULT_SHIFTS = ['A', 'B', 'C', 'D'];
const DEFAULT_DEPARTURE_REASONS = [
  'استقالة',
  'كثرة الغياب عن العمل',
  'ضعف الأداء / عدم تحقيق التارجت',
  'مخالفة لوائح العمل',
  'مخالفة إدارية / سلوكية',
  'ترك العمل بدون إخطار',
  'خدمة الوطن (الجيش)',
];

const DEFAULT_SYSTEM_CONFIG = {
  general: {
    systemName: 'IEMS',
    systemSubtitle: 'نظام إدارة الموظفين ومتابعة الأداء',
    defaultPassword: 'P@ssw0rd',
    requirePasswordChangeOnFirstLogin: false,
    allowForgotPassword: true,
    supportWhatsappNumber: DEFAULT_SUPPORT_WHATSAPP,
    sessionExpiryHours: 8,
    maxLoginAttempts: 8,
  },
  payroll: {
    cycleStartDay: 21,
    cycleEndDay: 20,
    unauthorizedAbsenceThreshold: 3,
    maxAttachmentSizeMb: 5,
  },
  displayAndFeatures: {
    showTop5ToEmployees: true,
    showBonusAndDeductionsToEmployee: true,
    allowEmployeeExport: true,
    allowSupervisorExport: true,
    systemNoticeEnabled: false,
    systemNoticeText: '',
    seasonalTheme: 'default',
    seasonalDecorEnabled: true,
  },
  departmentsAndLists: {
    companies: DEFAULT_COMPANIES,
    shifts: DEFAULT_SHIFTS,
    stages: DEFAULT_FALLBACK_STAGES,
    departureReasons: DEFAULT_DEPARTURE_REASONS,
  },
  financialFormLinks: {
    enabled: true,
    salaryEntitlementsUrl: DEFAULT_GOOGLE_FORM_SALARY_ENTITLEMENTS,
    advanceRequestUrl: DEFAULT_GOOGLE_FORM_ADVANCE_REQUEST,
    payrollPortalUrl: DEFAULT_PAYROLL_PORTAL_URL,
    workRegulationsUrl: DEFAULT_WORK_REGULATIONS_URL,
  },
  autoPurge: {
    enabled: false,
    retentionMonths: 3,
    categories: {
      daily: true,
      requests: false,
      logs: true,
    },
    lastRunAt: null,
    lastDeletedSummary: null,
  },
  reportsAndSheets: {
    reportSize: 'normal',
    reportOrientation: 'auto',
    tableAlignH: 'center',
    tableAlignV: 'middle',
    pageVerticalAlign: 'top',
    sheetStageBlockRows: 16,
    pdfMaxDatesPerBlock: 16,
    monthDaysCount: 'auto',
    targetPercentageColumn: 'auto',
  },
};

function sanitizeTargetColumnSetting(raw) {
  const s = String(raw ?? 'auto').trim().toUpperCase();
  if (!s || s === 'AUTO') return 'auto';
  return /^[A-Z]{1,2}$/.test(s) ? s : 'auto';
}

function sanitizeHttpsUrl(raw, fallback = '') {
  const s = String(raw || '').trim();
  if (!s) return fallback;
  try {
    const parsed = new URL(s);
    if (parsed.protocol !== 'https:') return fallback;
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function cleanPhoneDigits(raw, fallback = DEFAULT_SUPPORT_WHATSAPP) {
  const digits = String(raw || '').replace(/\D+/g, '').slice(0, 18);
  return digits.length >= 8 ? digits : fallback;
}

function cleanStringList(raw, fallbackList) {
  if (!Array.isArray(raw)) return [...fallbackList];
  const cleaned = [...new Set(raw.map((x) => String(x || '').trim()).filter(Boolean))];
  return cleaned.length ? cleaned : [...fallbackList];
}

function clampInt(val, min, max, fallback) {
  const n = Math.round(Number(val));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function validDateStr(v) {
  const s = String(v ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? s : null;
}

async function readSettingJson(key, fallback = {}) {
  try {
    const row = await db.prepare('SELECT value_json FROM system_settings WHERE key = ?').get(key);
    let val = row?.value_json;
    if (typeof val === 'string') {
      try {
        val = JSON.parse(val);
      } catch {
        val = {};
      }
    }
    if (val && typeof val === 'object') return val;
  } catch {
    // ignore missing setting
  }
  return fallback;
}

async function writeSettingJson(key, valObj, updatedBy = null) {
  await db
    .prepare(
      `INSERT INTO system_settings (key, value_json, updated_by)
       VALUES (?, ?::jsonb, ?)
       ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`
    )
    .run(key, JSON.stringify(valObj), updatedBy == null ? null : Number(updatedBy));
}

async function getSystemConfig() {
  const saved = await readSettingJson('system_settings_config', {});
  const fallbackStagesSaved = await readSettingJson('request_fallback_stages', {});

  const g = saved.general && typeof saved.general === 'object' ? saved.general : {};
  const p = saved.payroll && typeof saved.payroll === 'object' ? saved.payroll : {};
  const df =
    saved.displayAndFeatures && typeof saved.displayAndFeatures === 'object'
      ? saved.displayAndFeatures
      : {};
  const dl =
    saved.departmentsAndLists && typeof saved.departmentsAndLists === 'object'
      ? saved.departmentsAndLists
      : {};
  const fl =
    saved.financialFormLinks && typeof saved.financialFormLinks === 'object'
      ? saved.financialFormLinks
      : {};
  const ap = saved.autoPurge && typeof saved.autoPurge === 'object' ? saved.autoPurge : {};
  const apCats = ap.categories && typeof ap.categories === 'object' ? ap.categories : {};
  const rs =
    saved.reportsAndSheets && typeof saved.reportsAndSheets === 'object'
      ? saved.reportsAndSheets
      : {};

  const stagesFromFallback =
    Array.isArray(fallbackStagesSaved.stages) && fallbackStagesSaved.stages.length
      ? fallbackStagesSaved.stages
      : DEFAULT_FALLBACK_STAGES;

  return {
    general: {
      systemName: String(g.systemName || DEFAULT_SYSTEM_CONFIG.general.systemName).trim() || 'IEMS',
      systemSubtitle:
        String(g.systemSubtitle || DEFAULT_SYSTEM_CONFIG.general.systemSubtitle).trim() ||
        DEFAULT_SYSTEM_CONFIG.general.systemSubtitle,
      defaultPassword:
        typeof g.defaultPassword === 'string' && g.defaultPassword.trim().length >= 4
          ? g.defaultPassword.trim()
          : DEFAULT_SYSTEM_CONFIG.general.defaultPassword,
      requirePasswordChangeOnFirstLogin: Boolean(g.requirePasswordChangeOnFirstLogin),
      allowForgotPassword: g.allowForgotPassword === undefined ? true : Boolean(g.allowForgotPassword),
      supportWhatsappNumber: cleanPhoneDigits(g.supportWhatsappNumber, DEFAULT_SUPPORT_WHATSAPP),
      sessionExpiryHours: clampInt(g.sessionExpiryHours, 1, 720, 8),
      maxLoginAttempts: clampInt(g.maxLoginAttempts, 3, 30, 8),
    },
    payroll: {
      cycleStartDay: clampInt(p.cycleStartDay, 1, 28, DEFAULT_SYSTEM_CONFIG.payroll.cycleStartDay),
      cycleEndDay: clampInt(p.cycleEndDay, 1, 31, DEFAULT_SYSTEM_CONFIG.payroll.cycleEndDay),
      unauthorizedAbsenceThreshold: clampInt(
        p.unauthorizedAbsenceThreshold,
        1,
        30,
        DEFAULT_SYSTEM_CONFIG.payroll.unauthorizedAbsenceThreshold
      ),
      maxAttachmentSizeMb: [2, 5, 10].includes(Number(p.maxAttachmentSizeMb))
        ? Number(p.maxAttachmentSizeMb)
        : 5,
    },
    displayAndFeatures: {
      showTop5ToEmployees:
        df.showTop5ToEmployees === undefined ? true : Boolean(df.showTop5ToEmployees),
      showBonusAndDeductionsToEmployee:
        df.showBonusAndDeductionsToEmployee === undefined
          ? true
          : Boolean(df.showBonusAndDeductionsToEmployee),
      allowEmployeeExport:
        df.allowEmployeeExport === undefined ? true : Boolean(df.allowEmployeeExport),
      allowSupervisorExport:
        df.allowSupervisorExport === undefined ? true : Boolean(df.allowSupervisorExport),
      systemNoticeEnabled: Boolean(df.systemNoticeEnabled),
      systemNoticeText: String(df.systemNoticeText || '').trim().slice(0, 300),
      seasonalTheme: ['default', 'new_year', 'ramadan', 'emerald'].includes(String(df.seasonalTheme))
        ? String(df.seasonalTheme)
        : 'default',
      seasonalDecorEnabled:
        df.seasonalDecorEnabled === undefined ? true : Boolean(df.seasonalDecorEnabled),
    },
    departmentsAndLists: {
      companies: cleanStringList(dl.companies, DEFAULT_COMPANIES),
      shifts: cleanStringList(dl.shifts, DEFAULT_SHIFTS).map((s) => s.toUpperCase()),
      stages: cleanStringList(dl.stages || stagesFromFallback, DEFAULT_FALLBACK_STAGES),
      departureReasons: cleanStringList(dl.departureReasons, DEFAULT_DEPARTURE_REASONS),
    },
    financialFormLinks: {
      enabled: fl.enabled === undefined ? true : Boolean(fl.enabled),
      salaryEntitlementsUrl: sanitizeHttpsUrl(
        fl.salaryEntitlementsUrl,
        DEFAULT_GOOGLE_FORM_SALARY_ENTITLEMENTS
      ),
      advanceRequestUrl: sanitizeHttpsUrl(fl.advanceRequestUrl, DEFAULT_GOOGLE_FORM_ADVANCE_REQUEST),
      payrollPortalUrl: sanitizeHttpsUrl(fl.payrollPortalUrl, DEFAULT_PAYROLL_PORTAL_URL),
      workRegulationsUrl: sanitizeHttpsUrl(fl.workRegulationsUrl, DEFAULT_WORK_REGULATIONS_URL),
    },
    autoPurge: {
      enabled: Boolean(ap.enabled),
      retentionMonths: clampInt(ap.retentionMonths, 1, 36, 3),
      categories: {
        daily: apCats.daily === undefined ? true : Boolean(apCats.daily),
        requests: Boolean(apCats.requests),
        logs: apCats.logs === undefined ? true : Boolean(apCats.logs),
      },
      lastRunAt: ap.lastRunAt || null,
      lastDeletedSummary: ap.lastDeletedSummary || null,
    },
    reportsAndSheets: {
      reportSize: ['compact', 'normal', 'large'].includes(rs.reportSize) ? rs.reportSize : 'normal',
      reportOrientation: ['auto', 'portrait', 'landscape'].includes(rs.reportOrientation)
        ? rs.reportOrientation
        : 'auto',
      tableAlignH: ['center', 'right', 'left'].includes(rs.tableAlignH)
        ? rs.tableAlignH
        : 'center',
      tableAlignV: ['middle', 'top', 'bottom'].includes(rs.tableAlignV)
        ? rs.tableAlignV
        : 'middle',
      pageVerticalAlign: ['top', 'center'].includes(rs.pageVerticalAlign)
        ? rs.pageVerticalAlign
        : 'top',
      sheetStageBlockRows: clampInt(rs.sheetStageBlockRows, 16, 40, 16),
      pdfMaxDatesPerBlock: clampInt(rs.pdfMaxDatesPerBlock, 8, 31, 16),
      monthDaysCount: ['auto', '30', '31'].includes(String(rs.monthDaysCount))
        ? String(rs.monthDaysCount)
        : 'auto',
      targetPercentageColumn: sanitizeTargetColumnSetting(rs.targetPercentageColumn),
    },
  };
}

async function saveSystemConfig(partial, updatedBy = null) {
  const cur = await getSystemConfig();
  const next = {
    general: {
      ...cur.general,
      ...(partial.general && typeof partial.general === 'object' ? partial.general : {}),
    },
    payroll: {
      ...cur.payroll,
      ...(partial.payroll && typeof partial.payroll === 'object' ? partial.payroll : {}),
    },
    displayAndFeatures: {
      ...cur.displayAndFeatures,
      ...(partial.displayAndFeatures && typeof partial.displayAndFeatures === 'object'
        ? partial.displayAndFeatures
        : {}),
    },
    departmentsAndLists: {
      ...cur.departmentsAndLists,
      ...(partial.departmentsAndLists && typeof partial.departmentsAndLists === 'object'
        ? partial.departmentsAndLists
        : {}),
    },
    financialFormLinks: {
      ...cur.financialFormLinks,
      ...(partial.financialFormLinks && typeof partial.financialFormLinks === 'object'
        ? partial.financialFormLinks
        : {}),
    },
    autoPurge: {
      ...cur.autoPurge,
      ...(partial.autoPurge && typeof partial.autoPurge === 'object' ? partial.autoPurge : {}),
      categories: {
        ...cur.autoPurge.categories,
        ...(partial.autoPurge?.categories && typeof partial.autoPurge.categories === 'object'
          ? partial.autoPurge.categories
          : {}),
      },
    },
    reportsAndSheets: {
      ...cur.reportsAndSheets,
      ...(partial.reportsAndSheets && typeof partial.reportsAndSheets === 'object'
        ? partial.reportsAndSheets
        : {}),
    },
  };

  if (partial.financialFormLinks) {
    if (partial.financialFormLinks.salaryEntitlementsUrl !== undefined) {
      const s = String(partial.financialFormLinks.salaryEntitlementsUrl || '').trim();
      if (s && !sanitizeHttpsUrl(s, '')) {
        throw new Error('رابط نموذج مستحقات الموظفين يجب أن يبدأ بـ https:// بشكل صحيح.');
      }
      next.financialFormLinks.salaryEntitlementsUrl = sanitizeHttpsUrl(s, '');
    }
    if (partial.financialFormLinks.advanceRequestUrl !== undefined) {
      const s = String(partial.financialFormLinks.advanceRequestUrl || '').trim();
      if (s && !sanitizeHttpsUrl(s, '')) {
        throw new Error('رابط نموذج طلب السلفة المالية يجب أن يبدأ بـ https:// بشكل صحيح.');
      }
      next.financialFormLinks.advanceRequestUrl = sanitizeHttpsUrl(s, '');
    }
    if (partial.financialFormLinks.payrollPortalUrl !== undefined) {
      const s = String(partial.financialFormLinks.payrollPortalUrl || '').trim();
      if (s && !sanitizeHttpsUrl(s, '')) {
        throw new Error('رابط بوابة المرتبات يجب أن يبدأ بـ https:// بشكل صحيح.');
      }
      next.financialFormLinks.payrollPortalUrl = sanitizeHttpsUrl(s, '');
    }
    if (partial.financialFormLinks.workRegulationsUrl !== undefined) {
      const s = String(partial.financialFormLinks.workRegulationsUrl || '').trim();
      if (s && !sanitizeHttpsUrl(s, '')) {
        throw new Error('رابط لائحة العمل يجب أن يبدأ بـ https:// بشكل صحيح.');
      }
      next.financialFormLinks.workRegulationsUrl = sanitizeHttpsUrl(s, '');
    }
  }

  next.general.systemName =
    String(next.general.systemName || 'IEMS').trim().slice(0, 40) || 'IEMS';
  next.general.systemSubtitle =
    String(next.general.systemSubtitle || DEFAULT_SYSTEM_CONFIG.general.systemSubtitle)
      .trim()
      .slice(0, 120) || DEFAULT_SYSTEM_CONFIG.general.systemSubtitle;
  if (typeof next.general.defaultPassword !== 'string' || next.general.defaultPassword.trim().length < 4) {
    next.general.defaultPassword = cur.general.defaultPassword;
  } else {
    next.general.defaultPassword = next.general.defaultPassword.trim();
  }
  next.general.allowForgotPassword = Boolean(next.general.allowForgotPassword);
  next.general.supportWhatsappNumber = cleanPhoneDigits(
    next.general.supportWhatsappNumber,
    cur.general.supportWhatsappNumber || DEFAULT_SUPPORT_WHATSAPP
  );
  next.general.sessionExpiryHours = clampInt(next.general.sessionExpiryHours, 1, 720, 8);
  next.general.maxLoginAttempts = clampInt(next.general.maxLoginAttempts, 3, 30, 8);

  next.payroll.cycleStartDay = clampInt(next.payroll.cycleStartDay, 1, 28, 21);
  next.payroll.cycleEndDay = clampInt(next.payroll.cycleEndDay, 1, 31, 20);
  next.payroll.unauthorizedAbsenceThreshold = clampInt(
    next.payroll.unauthorizedAbsenceThreshold,
    1,
    30,
    3
  );
  next.payroll.maxAttachmentSizeMb = [2, 5, 10].includes(Number(next.payroll.maxAttachmentSizeMb))
    ? Number(next.payroll.maxAttachmentSizeMb)
    : 5;

  next.displayAndFeatures = {
    showTop5ToEmployees: Boolean(next.displayAndFeatures.showTop5ToEmployees),
    showBonusAndDeductionsToEmployee: Boolean(
      next.displayAndFeatures.showBonusAndDeductionsToEmployee
    ),
    allowEmployeeExport: Boolean(next.displayAndFeatures.allowEmployeeExport),
    allowSupervisorExport: Boolean(next.displayAndFeatures.allowSupervisorExport),
    systemNoticeEnabled: Boolean(next.displayAndFeatures.systemNoticeEnabled),
    systemNoticeText: String(next.displayAndFeatures.systemNoticeText || '').trim().slice(0, 300),
    seasonalTheme: ['default', 'new_year', 'ramadan', 'emerald'].includes(
      String(next.displayAndFeatures.seasonalTheme)
    )
      ? String(next.displayAndFeatures.seasonalTheme)
      : 'default',
    seasonalDecorEnabled:
      next.displayAndFeatures.seasonalDecorEnabled === undefined
        ? true
        : Boolean(next.displayAndFeatures.seasonalDecorEnabled),
  };

  next.departmentsAndLists.companies = cleanStringList(
    next.departmentsAndLists.companies,
    DEFAULT_COMPANIES
  );
  next.departmentsAndLists.shifts = cleanStringList(
    next.departmentsAndLists.shifts,
    DEFAULT_SHIFTS
  ).map((s) => s.toUpperCase());
  next.departmentsAndLists.stages = cleanStringList(
    next.departmentsAndLists.stages,
    DEFAULT_FALLBACK_STAGES
  );
  next.departmentsAndLists.departureReasons = cleanStringList(
    next.departmentsAndLists.departureReasons,
    DEFAULT_DEPARTURE_REASONS
  );

  next.autoPurge.retentionMonths = clampInt(next.autoPurge.retentionMonths, 1, 36, 3);

  const rsNext = next.reportsAndSheets || {};
  next.reportsAndSheets = {
    reportSize: ['compact', 'normal', 'large'].includes(rsNext.reportSize)
      ? rsNext.reportSize
      : 'normal',
    reportOrientation: ['auto', 'portrait', 'landscape'].includes(rsNext.reportOrientation)
      ? rsNext.reportOrientation
      : 'auto',
    tableAlignH: ['center', 'right', 'left'].includes(rsNext.tableAlignH)
      ? rsNext.tableAlignH
      : 'center',
    tableAlignV: ['middle', 'top', 'bottom'].includes(rsNext.tableAlignV)
      ? rsNext.tableAlignV
      : 'middle',
    pageVerticalAlign: ['top', 'center'].includes(rsNext.pageVerticalAlign)
      ? rsNext.pageVerticalAlign
      : 'top',
    sheetStageBlockRows: clampInt(rsNext.sheetStageBlockRows, 16, 40, 16),
    pdfMaxDatesPerBlock: clampInt(rsNext.pdfMaxDatesPerBlock, 8, 31, 16),
    monthDaysCount: ['auto', '30', '31'].includes(String(rsNext.monthDaysCount))
      ? String(rsNext.monthDaysCount)
      : 'auto',
    targetPercentageColumn: sanitizeTargetColumnSetting(rsNext.targetPercentageColumn),
  };

  await writeSettingJson('system_settings_config', next, updatedBy);

  // Sync fallback stages & attachment size limit with requests module settings so both views stay unified
  await writeSettingJson(
    'request_fallback_stages',
    { stages: next.departmentsAndLists.stages },
    updatedBy
  );
  const reqCfg = await readSettingJson('request_module_config', {});
  await writeSettingJson(
    'request_module_config',
    { ...reqCfg, maxAttachmentSizeMb: next.payroll.maxAttachmentSizeMb },
    updatedBy
  );

  return next;
}

function monthRangeBounds(ym) {
  if (!/^\d{4}-\d{2}$/.test(String(ym || ''))) return null;
  const [y, m] = ym.split('-').map(Number);
  if (m < 1 || m > 12) return null;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start: `${ym}-01`,
    end: `${ym}-${String(lastDay).padStart(2, '0')}`,
  };
}

async function getDatabaseInventory() {
  if (db.isMock()) {
    const s = mockDb.store;
    const monthMap = new Map();
    const ensureMonth = (ym) => {
      if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return null;
      if (!monthMap.has(ym)) {
        monthMap.set(ym, {
          month: ym,
          dailyRows: 0,
          supervisorRows: 0,
          monthlySummaryRows: 0,
          requestRows: 0,
          logRows: 0,
        });
      }
      return monthMap.get(ym);
    };

    let minDate = null;
    let maxDate = null;
    const trackDate = (d) => {
      const ds = String(d || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return;
      if (!minDate || ds < minDate) minDate = ds;
      if (!maxDate || ds > maxDate) maxDate = ds;
    };

    for (const r of s.stage_daily) {
      trackDate(r.entry_date);
      const m = ensureMonth(String(r.entry_date || '').slice(0, 7));
      if (m) m.dailyRows += 1;
    }
    for (const r of s.supervisor_targets) {
      trackDate(r.entry_date);
      const m = ensureMonth(String(r.entry_date || '').slice(0, 7));
      if (m) m.supervisorRows += 1;
    }
    for (const r of s.employee_monthly_summary) {
      const m = ensureMonth(String(r.month_start || '').slice(0, 7));
      if (m) m.monthlySummaryRows += 1;
    }
    for (const r of s.employee_requests) {
      const m = ensureMonth(String(r.submitted_at || r.created_at || '').slice(0, 7));
      if (m) m.requestRows += 1;
    }
    for (const r of s.audit_logs) {
      const m = ensureMonth(String(r.created_at || '').slice(0, 7));
      if (m) m.logRows += 1;
    }

    const availableMonths = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));
    return {
      minDate,
      maxDate,
      totalMonths: availableMonths.length,
      availableMonths,
      counts: {
        employees: s.employees.filter((e) => e.role === 'employee').length,
        stageDaily: s.stage_daily.length,
        supervisorTargets: s.supervisor_targets.length,
        employeeMonthlySummary: s.employee_monthly_summary.length,
        employeeStageTargets: s.employee_stage_targets.length,
        importHistory: s.import_history.length,
        employeeRequests: s.employee_requests.length,
        requestAttachments: s.request_attachments.length,
        auditLogs: s.audit_logs.length,
        loginAudit: s.login_audit.length,
        notifications: s.notifications.length,
      },
    };
  }

  const countsRow = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM employees WHERE role = 'employee')::int AS employees,
        (SELECT COUNT(*) FROM stage_daily)::int AS stage_daily,
        (SELECT COUNT(*) FROM supervisor_targets)::int AS supervisor_targets,
        (SELECT COUNT(*) FROM employee_monthly_summary)::int AS employee_monthly_summary,
        (SELECT COUNT(*) FROM employee_stage_targets)::int AS employee_stage_targets,
        (SELECT COUNT(*) FROM import_history)::int AS import_history,
        (SELECT COUNT(*) FROM employee_requests)::int AS employee_requests,
        (SELECT COUNT(*) FROM request_attachments)::int AS request_attachments,
        (SELECT COUNT(*) FROM audit_logs)::int AS audit_logs,
        (SELECT COUNT(*) FROM login_audit)::int AS login_audit,
        (SELECT COUNT(*) FROM notifications)::int AS notifications,
        (SELECT MIN(entry_date)::text FROM stage_daily) AS min_daily_date,
        (SELECT MAX(entry_date)::text FROM stage_daily) AS max_daily_date`
    )
    .get();

  const [dailyMonths, supMonths, sumMonths, reqMonths, logMonths] = await Promise.all([
    db
      .prepare(
        `SELECT to_char(entry_date, 'YYYY-MM') AS month, COUNT(*)::int AS c
           FROM stage_daily GROUP BY 1 ORDER BY 1`
      )
      .all(),
    db
      .prepare(
        `SELECT to_char(entry_date, 'YYYY-MM') AS month, COUNT(*)::int AS c
           FROM supervisor_targets GROUP BY 1 ORDER BY 1`
      )
      .all(),
    db
      .prepare(
        `SELECT to_char(month_start, 'YYYY-MM') AS month, COUNT(*)::int AS c
           FROM employee_monthly_summary GROUP BY 1 ORDER BY 1`
      )
      .all(),
    db
      .prepare(
        `SELECT to_char(COALESCE(submitted_at, created_at), 'YYYY-MM') AS month, COUNT(*)::int AS c
           FROM employee_requests GROUP BY 1 ORDER BY 1`
      )
      .all(),
    db
      .prepare(
        `SELECT to_char(created_at, 'YYYY-MM') AS month, COUNT(*)::int AS c
           FROM audit_logs GROUP BY 1 ORDER BY 1`
      )
      .all(),
  ]);

  const monthMap = new Map();
  const ensureMonth = (ym) => {
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return null;
    if (!monthMap.has(ym)) {
      monthMap.set(ym, {
        month: ym,
        dailyRows: 0,
        supervisorRows: 0,
        monthlySummaryRows: 0,
        requestRows: 0,
        logRows: 0,
      });
    }
    return monthMap.get(ym);
  };

  for (const r of dailyMonths) {
    const m = ensureMonth(r.month);
    if (m) m.dailyRows = Number(r.c || 0);
  }
  for (const r of supMonths) {
    const m = ensureMonth(r.month);
    if (m) m.supervisorRows = Number(r.c || 0);
  }
  for (const r of sumMonths) {
    const m = ensureMonth(r.month);
    if (m) m.monthlySummaryRows = Number(r.c || 0);
  }
  for (const r of reqMonths) {
    const m = ensureMonth(r.month);
    if (m) m.requestRows = Number(r.c || 0);
  }
  for (const r of logMonths) {
    const m = ensureMonth(r.month);
    if (m) m.logRows = Number(r.c || 0);
  }

  const availableMonths = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  return {
    minDate: countsRow?.min_daily_date || null,
    maxDate: countsRow?.max_daily_date || null,
    totalMonths: availableMonths.length,
    availableMonths,
    counts: {
      employees: Number(countsRow?.employees || 0),
      stageDaily: Number(countsRow?.stage_daily || 0),
      supervisorTargets: Number(countsRow?.supervisor_targets || 0),
      employeeMonthlySummary: Number(countsRow?.employee_monthly_summary || 0),
      employeeStageTargets: Number(countsRow?.employee_stage_targets || 0),
      importHistory: Number(countsRow?.import_history || 0),
      employeeRequests: Number(countsRow?.employee_requests || 0),
      requestAttachments: Number(countsRow?.request_attachments || 0),
      auditLogs: Number(countsRow?.audit_logs || 0),
      loginAudit: Number(countsRow?.login_audit || 0),
      notifications: Number(countsRow?.notifications || 0),
    },
  };
}

async function executeDatabasePurge({
  mode = 'range',
  from = null,
  to = null,
  keepMonths = null,
  months = null,
  categories = { daily: true, requests: false, logs: true },
}) {
  const cats = {
    daily: Boolean(categories?.daily),
    requests: Boolean(categories?.requests),
    logs: Boolean(categories?.logs),
  };
  if (!cats.daily && !cats.requests && !cats.logs) {
    throw new Error('اختر فئة واحدة على الأقل من البيانات لمسحها.');
  }

  let ranges = [];

  if (mode === 'range') {
    const f = validDateStr(from);
    const t = validDateStr(to);
    if (!f || !t || f > t) {
      throw new Error('حدد فترة تاريخ صالحة (من تاريخ إلى تاريخ).');
    }
    ranges = [{ from: f, to: t }];
  } else if (mode === 'months') {
    const cleanedMonths = Array.isArray(months)
      ? [...new Set(months.map((m) => String(m || '').trim()).filter((m) => /^\d{4}-\d{2}$/.test(m)))]
      : [];
    if (!cleanedMonths.length) {
      throw new Error('اختر شهراً واحداً على الأقل للمسح.');
    }
    ranges = cleanedMonths.map((ym) => monthRangeBounds(ym)).filter(Boolean).map((b) => ({ from: b.start, to: b.end }));
  } else if (mode === 'older_than_months') {
    const keepN = clampInt(keepMonths, 1, 36, 3);
    const inv = await getDatabaseInventory();
    const sortedMonths = inv.availableMonths.map((x) => x.month).sort();
    if (sortedMonths.length <= keepN) {
      return {
        skipped: true,
        reason: `عدد الأشهر المسجلة حالياً (${sortedMonths.length}) لا يتجاوز مدة الاحتفاظ المحددة (${keepN} شهر).`,
        cutoffDate: null,
        deleted: {
          stageDaily: 0,
          supervisorTargets: 0,
          employeeMonthlySummary: 0,
          employeeStageTargets: 0,
          importHistory: 0,
          employeeRequests: 0,
          auditLogs: 0,
          loginAudit: 0,
          notifications: 0,
          total: 0,
        },
      };
    }
    const cutoffMonth = sortedMonths[sortedMonths.length - keepN];
    const cutoffStart = `${cutoffMonth}-01`;
    const dtCutoff = new Date(`${cutoffStart}T00:00:00Z`);
    dtCutoff.setUTCDate(dtCutoff.getUTCDate() - 1);
    const prevDay = dtCutoff.toISOString().slice(0, 10);
    ranges = [{ from: '1800-01-01', to: prevDay, cutoffExclusive: cutoffStart }];
  } else {
    throw new Error('وضع المسح غير صالح.');
  }

  const deleted = {
    stageDaily: 0,
    supervisorTargets: 0,
    employeeMonthlySummary: 0,
    employeeStageTargets: 0,
    importHistory: 0,
    employeeRequests: 0,
    auditLogs: 0,
    loginAudit: 0,
    notifications: 0,
    total: 0,
  };

  if (db.isMock()) {
    const s = mockDb.store;
    const inAnyRange = (dateStr) => {
      const ds = String(dateStr || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return false;
      return ranges.some((r) => ds >= r.from && ds <= r.to);
    };

    if (cats.daily) {
      const p1 = s.stage_daily.length;
      s.stage_daily = s.stage_daily.filter((r) => !inAnyRange(r.entry_date));
      deleted.stageDaily = p1 - s.stage_daily.length;

      const p2 = s.supervisor_targets.length;
      s.supervisor_targets = s.supervisor_targets.filter((r) => !inAnyRange(r.entry_date));
      deleted.supervisorTargets = p2 - s.supervisor_targets.length;

      const p3 = s.employee_monthly_summary.length;
      s.employee_monthly_summary = s.employee_monthly_summary.filter((r) => !inAnyRange(r.month_start));
      deleted.employeeMonthlySummary = p3 - s.employee_monthly_summary.length;

      const p4 = s.employee_stage_targets.length;
      s.employee_stage_targets = s.employee_stage_targets.filter((r) => !inAnyRange(r.month_start));
      deleted.employeeStageTargets = p4 - s.employee_stage_targets.length;

      const p5 = s.import_history.length;
      s.import_history = s.import_history.filter(
        (r) => !inAnyRange(r.month_start || r.created_at)
      );
      deleted.importHistory = p5 - s.import_history.length;
    }

    if (cats.requests) {
      const keepIds = new Set();
      const prevLen = s.employee_requests.length;
      s.employee_requests = s.employee_requests.filter((r) => {
        const drop = inAnyRange(r.submitted_at || r.created_at);
        if (!drop) keepIds.add(r.id);
        return !drop;
      });
      deleted.employeeRequests = prevLen - s.employee_requests.length;
      s.request_attachments = s.request_attachments.filter((a) => keepIds.has(a.request_id));
      s.request_history = s.request_history.filter((h) => keepIds.has(h.request_id));
    }

    if (cats.logs) {
      const pAudit = s.audit_logs.length;
      s.audit_logs = s.audit_logs.filter((r) => !inAnyRange(r.created_at));
      deleted.auditLogs = pAudit - s.audit_logs.length;

      const pLogin = s.login_audit.length;
      s.login_audit = s.login_audit.filter((r) => !inAnyRange(r.ts));
      deleted.loginAudit = pLogin - s.login_audit.length;

      const pNotif = s.notifications.length;
      s.notifications = s.notifications.filter((r) => !inAnyRange(r.created_at));
      deleted.notifications = pNotif - s.notifications.length;
    }
  } else {
    const runTx = db.transaction(async () => {
      for (const rg of ranges) {
        const f = rg.from;
        const t = rg.to;
        const monthFrom = `${f.slice(0, 7)}-01`;
        const tsFrom = `${f}T00:00:00Z`;
        const tsTo = `${t}T23:59:59.999Z`;

        if (cats.daily) {
          const r1 = await db
            .prepare('DELETE FROM stage_daily WHERE entry_date BETWEEN ?::date AND ?::date')
            .run(f, t);
          deleted.stageDaily += r1.changes || 0;

          const r2 = await db
            .prepare('DELETE FROM supervisor_targets WHERE entry_date BETWEEN ?::date AND ?::date')
            .run(f, t);
          deleted.supervisorTargets += r2.changes || 0;

          const r3 = await db
            .prepare(
              'DELETE FROM employee_monthly_summary WHERE month_start BETWEEN ?::date AND ?::date'
            )
            .run(monthFrom, t);
          deleted.employeeMonthlySummary += r3.changes || 0;

          const r4 = await db
            .prepare(
              'DELETE FROM employee_stage_targets WHERE month_start BETWEEN ?::date AND ?::date'
            )
            .run(monthFrom, t);
          deleted.employeeStageTargets += r4.changes || 0;

          const r5 = await db
            .prepare(
              'DELETE FROM import_history WHERE COALESCE(month_start, created_at::date) BETWEEN ?::date AND ?::date'
            )
            .run(f, t);
          deleted.importHistory += r5.changes || 0;
        }

        if (cats.requests) {
          const rReq = await db
            .prepare(
              'DELETE FROM employee_requests WHERE COALESCE(submitted_at, created_at) BETWEEN ?::timestamptz AND ?::timestamptz'
            )
            .run(tsFrom, tsTo);
          deleted.employeeRequests += rReq.changes || 0;
        }

        if (cats.logs) {
          const rA = await db
            .prepare('DELETE FROM audit_logs WHERE created_at BETWEEN ?::timestamptz AND ?::timestamptz')
            .run(tsFrom, tsTo);
          deleted.auditLogs += rA.changes || 0;

          const rL = await db
            .prepare('DELETE FROM login_audit WHERE ts BETWEEN ?::timestamptz AND ?::timestamptz')
            .run(tsFrom, tsTo);
          deleted.loginAudit += rL.changes || 0;

          const rN = await db
            .prepare(
              'DELETE FROM notifications WHERE created_at BETWEEN ?::timestamptz AND ?::timestamptz'
            )
            .run(tsFrom, tsTo);
          deleted.notifications += rN.changes || 0;
        }
      }
    });
    await runTx();
  }

  deleted.total =
    deleted.stageDaily +
    deleted.supervisorTargets +
    deleted.employeeMonthlySummary +
    deleted.employeeStageTargets +
    deleted.importHistory +
    deleted.employeeRequests +
    deleted.auditLogs +
    deleted.loginAudit +
    deleted.notifications;

  return {
    skipped: false,
    ranges,
    deleted,
  };
}

let autoPurgeLock = false;
async function maybeRunAutoPurge(force = false) {
  if (autoPurgeLock) return { skipped: true, reason: 'جاري تشغيل المسح التلقائي بالفعل.' };
  autoPurgeLock = true;
  try {
    const cfg = await getSystemConfig();
    if (!cfg.autoPurge.enabled && !force) {
      return { skipped: true, reason: 'المسح التلقائي غير مفعل.' };
    }
    if (!force && cfg.autoPurge.lastRunAt) {
      const elapsedMs = Date.now() - Date.parse(cfg.autoPurge.lastRunAt);
      if (Number.isFinite(elapsedMs) && elapsedMs < 20 * 3600 * 1000) {
        return { skipped: true, reason: 'تم تنفيذ الفحص التلقائي مؤخراً.' };
      }
    }

    const res = await executeDatabasePurge({
      mode: 'older_than_months',
      keepMonths: cfg.autoPurge.retentionMonths,
      categories: cfg.autoPurge.categories,
    });

    const summary = {
      ranAt: new Date().toISOString(),
      retentionMonths: cfg.autoPurge.retentionMonths,
      deletedTotal: res.deleted?.total || 0,
      skipped: Boolean(res.skipped),
      reason: res.reason || null,
    };

    await saveSystemConfig(
      {
        autoPurge: {
          ...cfg.autoPurge,
          lastRunAt: summary.ranAt,
          lastDeletedSummary: summary,
        },
      },
      null
    );

    if (!res.skipped && (res.deleted?.total || 0) > 0) {
      try {
        await db
          .prepare(
            `INSERT INTO audit_logs (actor_id, actor_name, action, entity_type, entity_id, details_json, ip)
             VALUES (NULL, 'النظام (تلقائي)', 'auto_database_purge', 'database', 'retention', ?::jsonb, NULL)`
          )
          .run(JSON.stringify({ retentionMonths: cfg.autoPurge.retentionMonths, deleted: res.deleted }));
      } catch {
        // non-fatal
      }
    }

    return { ...res, summary };
  } finally {
    autoPurgeLock = false;
  }
}

module.exports = {
  DEFAULT_SYSTEM_CONFIG,
  DEFAULT_GOOGLE_FORM_SALARY_ENTITLEMENTS,
  DEFAULT_GOOGLE_FORM_ADVANCE_REQUEST,
  sanitizeHttpsUrl,
  getSystemConfig,
  saveSystemConfig,
  getDatabaseInventory,
  executeDatabasePurge,
  maybeRunAutoPurge,
};
