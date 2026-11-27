const express = require('express');
const db = require('../database/init');
const {
  requireAuth,
  requireAdmin,
  requireSupervisor,
  isCreator,
  isAdmin,
  isHrManager,
  isAdminOrHr,
  getSupervisorShifts,
  normalizeShiftsList,
  getHrCompanies,
  normalizeCompaniesList,
  companyMatchesList,
} = require('../middleware/auth');
const { notifyUsers } = require('./notifications');
const { getSystemConfig } = require('../utils/systemSettings');

const router = express.Router();

['get', 'post', 'put', 'patch', 'delete'].forEach((m) => {
  const orig = router[m].bind(router);
  router[m] = (path, ...handlers) =>
    orig(
      path,
      ...handlers.map((fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next))
    );
});

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

const REQUEST_CATALOG = {
  exam_leave: {
    category: 'leaves_attendance',
    title: 'Exam Leave',
    arabicTitle: 'تسجيل الإجازة الخاصة بالاختبارات',
    requiredAttachments: ['studentCardAttachment', 'examScheduleAttachment'],
  },
  special_leave: {
    category: 'leaves_attendance',
    title: 'Special Leave',
    arabicTitle: 'نموذج طلب إجازة خاصة',
    requiredAttachments: [],
  },
  sick_leave: {
    category: 'leaves_attendance',
    title: 'Sick Leave',
    arabicTitle: 'تسجيل إجازة مرضية',
    requiredAttachments: ['prescriptionAttachment', 'medicalReportAttachment'],
  },
  extra_working_days: {
    category: 'leaves_attendance',
    title: 'Extra Working Days',
    arabicTitle: 'تسجيل الأيام الإضافية',
    requiredAttachments: [],
  },
  salary_entitlements: {
    category: 'financial',
    title: 'Salary Entitlements',
    arabicTitle: 'مستحقات الموظفين',
    requiredAttachments: [],
  },
  advance_request: {
    category: 'financial',
    title: 'Advance Request',
    arabicTitle: 'طلب سلفة',
    requiredAttachments: [],
  },
  employee_grant: {
    category: 'financial',
    title: 'Employee Grant',
    arabicTitle: 'منحة الموظفين المسؤولين بعد وفاة الأب',
    requiredAttachments: ['deathCertificateAttachment'],
  },
  marriage_grant: {
    category: 'financial',
    title: 'Marriage Grant',
    arabicTitle: 'منحة الزواج',
    requiredAttachments: ['marriageProofAttachment'],
  },
  general_request: {
    category: 'employee_affairs',
    title: 'General Employee Request',
    arabicTitle: 'طلب موظف',
    requiredAttachments: [],
  },
  shift_transfer: {
    category: 'employee_affairs',
    title: 'Shift Transfer',
    arabicTitle: 'طلب نقل شيفت',
    requiredAttachments: [],
  },
  resignation: {
    category: 'employee_affairs',
    title: 'Resignation',
    arabicTitle: 'نموذج استقالة',
    requiredAttachments: [],
  },
  resignation_withdrawal: {
    category: 'employee_affairs',
    title: 'Resignation Withdrawal',
    arabicTitle: 'طلب التراجع عن الاستقالة',
    requiredAttachments: [],
  },
  smart_business_request: {
    category: 'smart_business_services',
    title: 'Smart Business Company Request',
    arabicTitle: 'تقديم طلب شركة سمارت بيزنس',
    requiredAttachments: [],
  },
  medical_services: {
    category: 'smart_business_services',
    title: 'Medical Services',
    arabicTitle: 'خدمات طبية',
    requiredAttachments: [],
  },
};

const ALLOWED_FIELDS_BY_TYPE = {
  exam_leave: ['studyYear', 'examDaysCount', 'examDates', 'otherDates', 'notes'],
  special_leave: ['education', 'currentStage', 'militaryEducationDuringYear', 'startDate', 'endDate', 'leaveDaysCount', 'phone', 'reason', 'notes'],
  sick_leave: ['startDate', 'endDate', 'absenceDaysCount', 'notes'],
  extra_working_days: ['extraWorkingDate', 'shiftWorked', 'stage', 'notes'],
  salary_entitlements: ['entitlementType', 'details', 'paymentMethod', 'accountOrPhoneNumber', 'accountHolderName', 'whatsappNumber'],
  advance_request: ['requestedAmount', 'paymentMethod', 'walletOrInstaPayNumber', 'accountOwnerName', '_eligibility'],
  employee_grant: ['tenureInProject', 'notes'],
  marriage_grant: ['gender', 'termsAccepted', 'notes'],
  general_request: ['tenureCategory', 'currentStage', 'contactNumber', 'requestDetails'],
  shift_transfer: [
    'education',
    'tenureCategory',
    'currentShift',
    'requestedShift',
    'currentPeriodShift',
    'requestedPeriodShift',
    'performableStages',
    'reason',
  ],
  resignation: ['currentStage', 'whatsappNumber', 'lastWorkingDay', 'reason', 'suggestions'],
  resignation_withdrawal: ['residence', 'reasonForWithdrawal'],
  smart_business_request: ['smartRequestType', 'notes'],
  medical_services: [
    'labName',
    'recipientType',
    'familyRelation',
    'labVisitDate',
    'phone',
  ],
};

function sanitizeFormData(requestType, rawFormData) {
  const src = rawFormData && typeof rawFormData === 'object' ? rawFormData : {};
  const allowed = ALLOWED_FIELDS_BY_TYPE[requestType];
  if (!allowed) return {};
  const clean = {};
  for (const key of allowed) {
    const val = src[key];
    if (val === undefined || val === null || val === '') continue;
    if (Array.isArray(val) && val.length === 0) continue;
    clean[key] = val;
  }
  return clean;
}

const VALID_REQUEST_TYPES = Object.keys(REQUEST_CATALOG);
let cleanupPromise = null;

async function cleanLegacyRequestsDatabase(force = false) {
  if (cleanupPromise && !force) return cleanupPromise;
  const runCleanup = async () => {
    const stats = { deletedLegacy: 0, cleanedRows: 0, cleanedNotifications: 0 };
    if (db.isMock()) return stats;
    try {
      // 1. Delete legacy pre-rebuild or orphaned rows without a valid unified request_type
      const validPlaceholders = VALID_REQUEST_TYPES.map(() => '?').join(',');
      const delRes = await db
        .prepare(
          `DELETE FROM employee_requests WHERE request_type IS NULL OR request_type NOT IN (${validPlaceholders})`
        )
        .run(...VALID_REQUEST_TYPES);
      stats.deletedLegacy = delRes?.changes || 0;

      // 2. Sanitize existing rows so only fields authentic to that request_type remain in form_data
      const existing = await db
        .prepare('SELECT id, request_type, request_title, form_data FROM employee_requests')
        .all();
      for (const r of existing) {
        const cat = REQUEST_CATALOG[r.request_type];
        const parsed =
          typeof r.form_data === 'string'
            ? (() => {
                try { return JSON.parse(r.form_data || '{}'); } catch { return {}; }
              })()
            : r.form_data || {};
        const sanitized = sanitizeFormData(r.request_type, parsed);
        const targetTitle = cat?.arabicTitle || r.request_title;
        if (
          JSON.stringify(parsed) !== JSON.stringify(sanitized) ||
          (targetTitle && r.request_title !== targetTitle)
        ) {
          await db
            .prepare(
              'UPDATE employee_requests SET form_data = ?::jsonb, request_title = ? WHERE id = ?'
            )
            .run(JSON.stringify(sanitized), targetTitle, r.id);
          stats.cleanedRows += 1;
        }
      }

      // 3. Remove stale notifications from deprecated/removed legacy request routes
      const notifDel = await db
        .prepare("DELETE FROM notifications WHERE link LIKE '%missing-data%'")
        .run();
      stats.cleanedNotifications = notifDel?.changes || 0;

      // 4. Clean up legacy missing_data_requests table if old leftover test/pending records exist
      try {
        await db.prepare('DELETE FROM missing_data_requests').run();
      } catch {
        // ignore if table not present
      }

      if (stats.deletedLegacy || stats.cleanedRows || stats.cleanedNotifications) {
        console.log('[IEMS Requests] Database cleanup completed:', stats);
      }
    } catch (err) {
      console.warn('[IEMS Requests] Startup cleanup warning:', err.message);
    }
    return stats;
  };
  cleanupPromise = runCleanup();
  return cleanupPromise;
}

router.use(async (req, res, next) => {
  await cleanLegacyRequestsDatabase(false);
  next();
});

const VALID_STATUSES = ['submitted', 'under_review', 'approved', 'rejected', 'cancelled'];
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB per file base64 limit
const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf'];

function isSmartBusinessCompany(company) {
  const c = String(company || '').trim().toUpperCase();
  return c.includes('SMART') || c === 'SB';
}

function validDate(v) {
  const s = String(v ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? s : null;
}

function payrollCycleFor(dateStr, startDay = 21, endDay = 20) {
  const sDay = Math.min(28, Math.max(1, Math.round(Number(startDay) || 21)));
  const eDay = Math.min(31, Math.max(1, Math.round(Number(endDay) || 20)));
  const dt = new Date(`${dateStr}T00:00:00Z`);
  let y = dt.getUTCFullYear();
  let m = dt.getUTCMonth() + 1;
  const day = dt.getUTCDate();
  const pad = (n) => String(n).padStart(2, '0');
  if (sDay === 1 && eDay >= 28) {
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
      start: `${y}-${pad(m)}-01`,
      end: `${y}-${pad(m)}-${pad(Math.min(eDay, lastDay))}`,
    };
  }
  if (day < sDay) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  const start = `${y}-${pad(m)}-${pad(sDay)}`;
  let endY = y;
  let endM = m + 1;
  if (endM === 13) {
    endM = 1;
    endY += 1;
  }
  const nextMonthLast = new Date(Date.UTC(endY, endM, 0)).getUTCDate();
  const end = `${endY}-${pad(endM)}-${pad(Math.min(eDay, nextMonthLast))}`;
  return { start, end };
}

async function getSetting(key, fallback) {
  try {
    const row = await db.prepare('SELECT value_json FROM system_settings WHERE key = ?').get(key);
    if (row && row.value_json && typeof row.value_json === 'object') {
      return row.value_json;
    }
  } catch {
    // ignore missing setting
  }
  return fallback;
}

function clampWindowDays(rawStart, rawEnd) {
  const s = Number.isFinite(Number(rawStart))
    ? Math.min(28, Math.max(1, Math.round(Number(rawStart))))
    : 10;
  const e = Number.isFinite(Number(rawEnd))
    ? Math.min(31, Math.max(s, Math.round(Number(rawEnd))))
    : Math.max(s, 20);
  return { startDay: s, endDay: e };
}

function clampAttachmentMb(rawMb) {
  const n = Number(rawMb);
  return [2, 5, 10].includes(n) ? n : 5;
}

async function getModuleConfig() {
  const saved = await getSetting('request_module_config', {});
  const allowSup = Boolean(saved.allowSupervisorDecision);
  const decisionRoles = allowSup
    ? ['system_creator', 'admin', 'hr_manager', 'supervisor']
    : ['system_creator', 'admin', 'hr_manager'];
  const { startDay, endDay } = clampWindowDays(saved.advanceWindowStartDay, saved.advanceWindowEndDay);
  const supervisorAllowedTypes = Array.isArray(saved.supervisorAllowedTypes)
    ? [...new Set(saved.supervisorAllowedTypes.filter((t) => VALID_REQUEST_TYPES.includes(t)))]
    : [...VALID_REQUEST_TYPES];
  return {
    decisionRoles,
    allowSupervisorDecision: allowSup,
    supervisorAllowedTypes,
    requireDecisionReason: Boolean(saved.requireDecisionReason),
    allowEmployeeCancellation:
      saved.allowEmployeeCancellation === undefined ? true : Boolean(saved.allowEmployeeCancellation),
    allowReopenDecision:
      saved.allowReopenDecision === undefined ? true : Boolean(saved.allowReopenDecision),
    preventDuplicatePending: Boolean(saved.preventDuplicatePending),
    enforceAdvanceWindow: Boolean(saved.enforceAdvanceWindow),
    advanceWindowStartDay: startDay,
    advanceWindowEndDay: endDay,
    maxAttachmentSizeMb: clampAttachmentMb(saved.maxAttachmentSizeMb),
  };
}

async function getDynamicStages() {
  const fallbackSaved = await getSetting('request_fallback_stages', {});
  const fallbackList =
    Array.isArray(fallbackSaved.stages) && fallbackSaved.stages.length
      ? fallbackSaved.stages.map((s) => String(s).trim()).filter(Boolean)
      : DEFAULT_FALLBACK_STAGES;

  try {
    const dailyRows = await db
      .prepare(
        "SELECT DISTINCT stage FROM stage_daily WHERE stage NOT IN ('الحضور','TOTAL TARGET %') ORDER BY stage ASC"
      )
      .all();
    const targetRows = await db
      .prepare(
        "SELECT DISTINCT stage FROM employee_stage_targets WHERE stage NOT IN ('الحضور','TOTAL TARGET %') ORDER BY stage ASC"
      )
      .all();

    const unique = [
      ...new Set(
        [...dailyRows, ...targetRows]
          .map((r) => String(r.stage || '').trim())
          .filter((s) => s && s !== 'الحضور' && s !== 'TOTAL TARGET %')
      ),
    ];

    if (unique.length > 0) {
      return {
        stageSource: 'iems',
        fallbackStages: fallbackList,
        stages: unique.map((name) => ({ id: name, name, source: 'iems' })),
      };
    }
  } catch (err) {
    console.warn('[IEMS Requests] Dynamic stage load fallback:', err.message);
  }

  return {
    stageSource: 'fallback',
    fallbackStages: fallbackList,
    stages: fallbackList.map((name) => ({ id: name, name, source: 'fallback' })),
  };
}

async function computeEligibility(employeeId, empCreatedAt = null, config = null, sysConfig = null) {
  const cfg = config || (await getModuleConfig());
  const sc = sysConfig || (await getSystemConfig());
  const cycStartDay = sc?.payroll?.cycleStartDay || 21;
  const cycEndDay = sc?.payroll?.cycleEndDay || 20;
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const currentDay = today.getUTCDate();
  const { start, end } = payrollCycleFor(todayIso, cycStartDay, cycEndDay);

  const attRows = await db
    .prepare(
      "SELECT entry_date::text AS entry_date, value_num, value_text FROM stage_daily WHERE employee_id = ? AND stage = 'الحضور' ORDER BY entry_date DESC"
    )
    .all(Number(employeeId));

  // Use either current payroll cycle or latest cycle found in data if latest attendance date differs
  let cycleStart = start;
  let cycleEnd = end;
  if (attRows.length > 0) {
    const latestDate = String(attRows[0].entry_date || '').slice(0, 10);
    if (latestDate && (latestDate < start || latestDate > end)) {
      const cyc = payrollCycleFor(latestDate, cycStartDay, cycEndDay);
      cycleStart = cyc.start;
      cycleEnd = cyc.end;
    }
  }

  let actualAttendanceDays = 0;
  let unauthorizedAbsenceDays = 0;
  let earliestDate = empCreatedAt ? String(empCreatedAt).slice(0, 10) : null;

  for (const r of attRows) {
    const dt = String(r.entry_date || '').slice(0, 10);
    if (dt && (!earliestDate || dt < earliestDate)) earliestDate = dt;
    if (dt >= cycleStart && dt <= cycleEnd) {
      const num = r.value_num;
      const txt = String(r.value_text || '').trim();
      if (num === 0.5 || num === 1 || num === 1.5) actualAttendanceDays += Number(num);
      if (txt === 'ب') unauthorizedAbsenceDays += 1;
    }
  }

  let tenureMonthsEstimate = null;
  if (earliestDate) {
    const diffMs = Date.now() - Date.parse(earliestDate);
    if (Number.isFinite(diffMs) && diffMs >= 0) {
      tenureMonthsEstimate = Math.floor(diffMs / (30 * 86400000));
    }
  }

  const monthPrefix = `${todayIso.slice(0, 7)}-01`;
  const existingAdvanceRows = await db
    .prepare(
      "SELECT id FROM employee_requests WHERE employee_id = ? AND request_type = 'advance_request' AND status IN ('submitted','under_review','approved') AND submitted_at >= ?"
    )
    .all(Number(employeeId), monthPrefix);

  return {
    cycleStart,
    cycleEnd,
    actualAttendanceDays: Number(actualAttendanceDays.toFixed(1)),
    hasUnauthorizedAbsence: unauthorizedAbsenceDays > 0,
    unauthorizedAbsenceDays,
    inApplicationWindow:
      currentDay >= cfg.advanceWindowStartDay && currentDay <= cfg.advanceWindowEndDay,
    currentDayOfMonth: currentDay,
    windowStartDay: cfg.advanceWindowStartDay,
    windowEndDay: cfg.advanceWindowEndDay,
    enforceAdvanceWindow: cfg.enforceAdvanceWindow,
    existingAdvanceThisMonth: existingAdvanceRows.length > 0,
    tenureMonthsEstimate,
    meetsMinTenure2Months: tenureMonthsEstimate === null ? null : tenureMonthsEstimate >= 2,
  };
}

async function writeAudit(req, action, entityId, details = {}) {
  try {
    await db
      .prepare(
        `INSERT INTO audit_logs (actor_id, actor_name, action, entity_type, entity_id, details_json, ip)
         VALUES (?, ?, ?, 'employee_request', ?, ?::jsonb, ?)`
      )
      .run(
        Number(req.user?.id) || null,
        req.user?.name || null,
        action,
        String(entityId),
        JSON.stringify(details || {}),
        req.ip || null
      );
  } catch (e) {
    console.error('[IEMS Requests] Audit log write failed:', e);
  }
}

async function appendHistory(requestId, { action, oldStatus = null, newStatus = null, user = null, comment = null }) {
  await db
    .prepare(
      `INSERT INTO request_history (request_id, action, old_status, new_status, action_by_user_id, action_by_name_snapshot, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      Number(requestId),
      action,
      oldStatus,
      newStatus,
      user ? Number(user.id) : null,
      user?.name || null,
      comment || null
    );
}

function parseFormData(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw || '{}');
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? raw : {};
}

function userCanDecide(req, config) {
  if (!req.user) return false;
  if (isAdminOrHr(req)) return true;
  if (req.user.role === 'supervisor') {
    return Boolean(
      config.allowSupervisorDecision &&
        Array.isArray(config.supervisorAllowedTypes) &&
        config.supervisorAllowedTypes.length > 0
    );
  }
  return false;
}

function hrCanAccessRequest(req, row) {
  if (!isHrManager(req)) return true;
  return companyMatchesList(row?.company, getHrCompanies(req));
}

function supervisorCanAccessRequest(req, row, config) {
  if (isHrManager(req)) return hrCanAccessRequest(req, row);
  if (isAdminOrHr(req)) return true;
  if (req.user?.role !== 'supervisor') return false;
  if (!config.allowSupervisorDecision) return false;
  const reqType = row.request_type || row.kind || '';
  if (!config.supervisorAllowedTypes.includes(reqType)) return false;

  const supShifts = getSupervisorShifts(req) || [];
  if (!supShifts.length) return false;

  const fd = parseFormData(row.form_data);
  if (reqType === 'shift_transfer') {
    const destShift = String(fd.requestedShift || '').trim().toUpperCase();
    if (destShift) {
      return supShifts.includes(destShift);
    }
  }
  const empShift = String(row.shift || '').trim().toUpperCase();
  return supShifts.includes(empShift);
}

async function decisionMakerRecipientsForRequest(config, requestType, originShift, originCompany, formData, excludeEmpId) {
  const rows = await db
    .prepare("SELECT id, role, shift, supervisor_shifts, hr_companies, company FROM employees WHERE role IN ('system_creator', 'admin', 'hr_manager', 'supervisor')")
    .all();

  const targetSupShift =
    requestType === 'shift_transfer' && formData?.requestedShift
      ? String(formData.requestedShift).trim().toUpperCase()
      : String(originShift || '').trim().toUpperCase();

  const allowSupForThisType =
    config.allowSupervisorDecision && config.supervisorAllowedTypes.includes(requestType);

  const ids = [];
  for (const r of rows) {
    const uid = Number(r.id);
    if (uid === Number(excludeEmpId)) continue;
    if (r.role === 'system_creator' || r.role === 'admin') {
      ids.push(uid);
      continue;
    }
    if (r.role === 'hr_manager') {
      const hrAllowed = normalizeCompaniesList(r.hr_companies, r.company);
      if (companyMatchesList(originCompany, hrAllowed)) {
        ids.push(uid);
      }
      continue;
    }
    if (r.role === 'supervisor' && allowSupForThisType && targetSupShift) {
      const supShifts = normalizeShiftsList(r.supervisor_shifts, r.shift);
      if (supShifts.includes(targetSupShift)) {
        ids.push(uid);
      }
    }
  }
  return ids;
}

function formatRequestRow(r) {
  let rawFormData = r.form_data;
  if (typeof rawFormData === 'string') {
    try {
      rawFormData = JSON.parse(rawFormData);
    } catch {
      rawFormData = {};
    }
  }
  const reqType = r.request_type || r.kind || 'general_request';
  const cleanFormData = sanitizeFormData(reqType, rawFormData);
  const cat = REQUEST_CATALOG[reqType];
  return {
    id: r.id,
    request_number: r.request_number || `REQ-${r.id}`,
    employee_id: Number(r.employee_id),
    employee_name: r.employee_name || '—',
    company: r.company || null,
    shift: r.shift || null,
    department: r.department || null,
    category: r.category || cat?.category || 'employee_affairs',
    request_type: reqType,
    request_title: cat?.arabicTitle || r.request_title || 'طلب موظف',
    status: r.status === 'pending' ? 'submitted' : r.status || 'submitted',
    selected_stage_id: r.selected_stage_id || null,
    selected_stage_name_snapshot: r.selected_stage_name_snapshot || null,
    form_data: cleanFormData,
    decision: r.decision || null,
    decision_maker_user_id: r.decision_maker_user_id != null ? Number(r.decision_maker_user_id) : null,
    decision_maker_name_snapshot: r.decision_maker_name_snapshot || r.reviewed_by_name || null,
    decision_reason: r.decision_reason || r.reject_reason || null,
    decided_at: r.decided_at || r.reviewed_at || null,
    submitted_at: r.submitted_at || r.created_at,
    last_updated_at: r.last_updated_at || r.decided_at || r.submitted_at || r.created_at,
    attachments_count: Number(r.attachments_count || 0),
    eligibility: reqType === 'advance_request' ? cleanFormData._eligibility || null : null,
  };
}

// ---- Metadata & Dynamic Stages ----
router.get('/meta', requireAuth, async (req, res) => {
  const empId = Number(req.user.id);
  const profile = await db
    .prepare(
      'SELECT id, emp_num, name, education, residence, company, shift, department, created_at FROM employees WHERE id = ?'
    )
    .get(empId);

  const [stageInfo, config, sysConfig] = await Promise.all([
    getDynamicStages(),
    getModuleConfig(),
    getSystemConfig(),
  ]);
  const eligibility = await computeEligibility(empId, profile?.created_at || null, config, sysConfig);

  const isDecisionOnlyAdmin = isAdminOrHr(req);
  const canManageRequestSettings = isAdmin(req) || isCreator(req);
  const supCanAct =
    req.user?.role === 'supervisor' &&
    config.allowSupervisorDecision &&
    config.supervisorAllowedTypes.length > 0;
  const allowSupExport = sysConfig?.displayAndFeatures?.allowSupervisorExport !== false;

  const fl = sysConfig?.financialFormLinks || {};
  const externalUrls = fl.enabled
    ? {
        ...(fl.salaryEntitlementsUrl ? { salary_entitlements: fl.salaryEntitlementsUrl } : {}),
        ...(fl.advanceRequestUrl ? { advance_request: fl.advanceRequestUrl } : {}),
      }
    : {};

  res.json({
    profile: profile || null,
    stages: stageInfo.stages,
    stageSource: stageInfo.stageSource,
    fallbackStages: stageInfo.fallbackStages,
    eligibility,
    externalUrls,
    permissions: {
      canSubmit: Boolean(req.user) && !isDecisionOnlyAdmin,
      canViewAdmin: isDecisionOnlyAdmin || supCanAct,
      canDecide: isDecisionOnlyAdmin || supCanAct,
      canExport: isDecisionOnlyAdmin || (supCanAct && allowSupExport),
      canManageSettings: canManageRequestSettings,
      decisionRoles: config.decisionRoles,
      supervisorAllowedTypes: config.supervisorAllowedTypes,
      supervisorShifts: getSupervisorShifts(req) || [],
      hrCompanies: getHrCompanies(req) || [],
      requireDecisionReason: config.requireDecisionReason,
      allowEmployeeCancellation: config.allowEmployeeCancellation,
      allowReopenDecision: config.allowReopenDecision,
      preventDuplicatePending: config.preventDuplicatePending,
      enforceAdvanceWindow: config.enforceAdvanceWindow,
      advanceWindowStartDay: config.advanceWindowStartDay,
      advanceWindowEndDay: config.advanceWindowEndDay,
      maxAttachmentSizeMb: config.maxAttachmentSizeMb,
    },
  });
});

// ---- Employee's Own Requests ----
router.get('/mine', requireAuth, async (req, res) => {
  if (isAdminOrHr(req)) {
    return res.status(403).json({
      error: 'حساب الإدارة أو مدير الموارد البشرية مخصص لمراجعة واعتماد الطلبات ولا يمكنه عرض طلبات شخصية.',
    });
  }
  const rows = await db
    .prepare(
      `SELECT id, request_number, employee_id, employee_name, company, shift, department,
              category, request_type, request_title, status, selected_stage_id,
              selected_stage_name_snapshot, form_data, decision, decision_maker_user_id,
              decision_maker_name_snapshot, decision_reason, decided_at,
              submitted_at, last_updated_at, created_at
         FROM employee_requests
        WHERE employee_id = ?
        ORDER BY submitted_at DESC, id DESC
        LIMIT 200`
    )
    .all(Number(req.user.id));

  const out = [];
  for (const r of rows) {
    const atts = await db
      .prepare('SELECT id FROM request_attachments WHERE request_id = ?')
      .all(r.id);
    const formatted = formatRequestRow(r);
    formatted.attachments_count = atts.length;
    out.push(formatted);
  }
  res.json({ requests: out });
});

// ---- Admin / Decision Maker Dashboard List & Counts ----
router.get('/admin', requireAuth, requireSupervisor, async (req, res) => {
  const config = await getModuleConfig();
  if (
    !isAdminOrHr(req) &&
    (!config.allowSupervisorDecision || !config.supervisorAllowedTypes.length)
  ) {
    return res
      .status(403)
      .json({ error: 'صلاحية إدارة الطلبات مفعلة لمتخذي القرار المعتمدين فقط.' });
  }

  const type = String(req.query.type || '').trim();
  const status = String(req.query.status || '').trim();
  const company = String(req.query.company || '').trim();
  const shift = String(req.query.shift || '').trim();
  const search = String(req.query.search || '').trim().toLowerCase();
  const from = validDate(req.query.from);
  const to = validDate(req.query.to);

  // Query base list (scoped cleanly in SQL and refined consistently across PG + mock-db)
  let rows = await db
    .prepare(
      `SELECT id, request_number, employee_id, employee_name, company, shift, department,
              category, request_type, request_title, status, selected_stage_id,
              selected_stage_name_snapshot, form_data, decision, decision_maker_user_id,
              decision_maker_name_snapshot, decision_reason, decided_at,
              submitted_at, last_updated_at, created_at
         FROM employee_requests
        ORDER BY submitted_at DESC, id DESC
        LIMIT 1000`
    )
    .all();

  if (req.user?.role === 'supervisor') {
    rows = rows.filter((r) => supervisorCanAccessRequest(req, r, config));
  } else if (isHrManager(req)) {
    const hrCompanies = getHrCompanies(req);
    rows = rows.filter((r) => companyMatchesList(r.company, hrCompanies));
  }

  const normalized = rows.map(formatRequestRow);

  const overviewCounts = {
    total: normalized.length,
    submitted: normalized.filter((r) => r.status === 'submitted').length,
    under_review: normalized.filter((r) => r.status === 'under_review').length,
    approved: normalized.filter((r) => r.status === 'approved').length,
    rejected: normalized.filter((r) => r.status === 'rejected').length,
    cancelled: normalized.filter((r) => r.status === 'cancelled').length,
    byType: normalized.reduce((acc, r) => {
      acc[r.request_type] = (acc[r.request_type] || 0) + 1;
      return acc;
    }, {}),
  };

  let filtered = normalized;
  if (type && REQUEST_CATALOG[type]) filtered = filtered.filter((r) => r.request_type === type);
  if (status && VALID_STATUSES.includes(status)) filtered = filtered.filter((r) => r.status === status);
  if (company) {
    filtered = filtered.filter((r) => String(r.company || '').toUpperCase().includes(company.toUpperCase()));
  }
  if (shift) filtered = filtered.filter((r) => String(r.shift || '').toUpperCase() === shift.toUpperCase());
  if (from) filtered = filtered.filter((r) => String(r.submitted_at || '').slice(0, 10) >= from);
  if (to) filtered = filtered.filter((r) => String(r.submitted_at || '').slice(0, 10) <= to);
  if (search) {
    filtered = filtered.filter(
      (r) =>
        String(r.request_number || '').toLowerCase().includes(search) ||
        String(r.employee_id).includes(search) ||
        String(r.employee_name || '').toLowerCase().includes(search)
    );
  }

  for (const item of filtered.slice(0, 300)) {
    const atts = await db
      .prepare('SELECT id FROM request_attachments WHERE request_id = ?')
      .all(item.id);
    item.attachments_count = atts.length;
  }

  res.json({ requests: filtered, counts: overviewCounts });
});

// ---- Configure Settings (Permissions, Windows & Limits) ----
router.put('/settings', requireAuth, requireAdmin, async (req, res) => {
  const {
    fallbackStages,
    allowSupervisorDecision,
    supervisorAllowedTypes,
    requireDecisionReason,
    allowEmployeeCancellation,
    allowReopenDecision,
    preventDuplicatePending,
    enforceAdvanceWindow,
    advanceWindowStartDay,
    advanceWindowEndDay,
    maxAttachmentSizeMb,
  } = req.body || {};

  if (Array.isArray(fallbackStages)) {
    const cleaned = [...new Set(fallbackStages.map((s) => String(s).trim()).filter(Boolean))];
    if (!cleaned.length) {
      return res.status(400).json({ error: 'يجب أن تحتوي قائمة المراحل الاحتياطية على مرحلة واحدة على الأقل.' });
    }
    await db
      .prepare(
        `INSERT INTO system_settings (key, value_json, updated_by)
         VALUES (?, ?::jsonb, ?)
         ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`
      )
      .run('request_fallback_stages', JSON.stringify({ stages: cleaned }), Number(req.user.id));
  }

  const curCfg = await getModuleConfig();
  const { startDay, endDay } = clampWindowDays(
    advanceWindowStartDay === undefined ? curCfg.advanceWindowStartDay : advanceWindowStartDay,
    advanceWindowEndDay === undefined ? curCfg.advanceWindowEndDay : advanceWindowEndDay
  );

  const cleanedSupTypes = Array.isArray(supervisorAllowedTypes)
    ? [...new Set(supervisorAllowedTypes.filter((t) => VALID_REQUEST_TYPES.includes(t)))]
    : curCfg.supervisorAllowedTypes;

  const nextCfg = {
    allowSupervisorDecision:
      allowSupervisorDecision === undefined ? curCfg.allowSupervisorDecision : Boolean(allowSupervisorDecision),
    supervisorAllowedTypes: cleanedSupTypes,
    requireDecisionReason:
      requireDecisionReason === undefined ? curCfg.requireDecisionReason : Boolean(requireDecisionReason),
    allowEmployeeCancellation:
      allowEmployeeCancellation === undefined
        ? curCfg.allowEmployeeCancellation
        : Boolean(allowEmployeeCancellation),
    allowReopenDecision:
      allowReopenDecision === undefined ? curCfg.allowReopenDecision : Boolean(allowReopenDecision),
    preventDuplicatePending:
      preventDuplicatePending === undefined
        ? curCfg.preventDuplicatePending
        : Boolean(preventDuplicatePending),
    enforceAdvanceWindow:
      enforceAdvanceWindow === undefined ? curCfg.enforceAdvanceWindow : Boolean(enforceAdvanceWindow),
    advanceWindowStartDay: startDay,
    advanceWindowEndDay: endDay,
    maxAttachmentSizeMb:
      maxAttachmentSizeMb === undefined ? curCfg.maxAttachmentSizeMb : clampAttachmentMb(maxAttachmentSizeMb),
  };

  await db
    .prepare(
      `INSERT INTO system_settings (key, value_json, updated_by)
       VALUES (?, ?::jsonb, ?)
       ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`
    )
    .run('request_module_config', JSON.stringify(nextCfg), Number(req.user.id));

  await writeAudit(req, 'request_settings_update', 'settings', nextCfg);
  res.json({ ok: true, config: nextCfg });
});

// ---- Submit New Request ----
router.post('/', requireAuth, async (req, res) => {
  if (isAdminOrHr(req)) {
    return res.status(403).json({
      error: 'حساب الإدارة أو مدير الموارد البشرية مخصص لإدارة ومراجعة الطلبات فقط ولا يمكنه تقديم طلبات شخصية.',
    });
  }
  const empId = Number(req.user.id);
  const requestType = String(req.body?.requestType || '').trim();
  const catalog = REQUEST_CATALOG[requestType];
  if (!catalog) {
    return res.status(400).json({ error: 'نوع الطلب غير صالح.' });
  }

  const emp = await db
    .prepare(
      'SELECT id, emp_num, name, education, residence, company, shift, department, role, created_at FROM employees WHERE id = ?'
    )
    .get(empId);
  if (!emp) {
    return res.status(404).json({ error: 'حساب الموظف غير موجود.' });
  }

  const config = await getModuleConfig();
  const maxAttBytes = (config.maxAttachmentSizeMb || 5) * 1024 * 1024 || MAX_ATTACHMENT_BYTES;

  if (config.preventDuplicatePending) {
    const pendingSame = await db
      .prepare(
        "SELECT id, request_number FROM employee_requests WHERE employee_id = ? AND request_type = ? AND status IN ('submitted','under_review','pending') LIMIT 1"
      )
      .get(empId, requestType);
    if (pendingSame) {
      return res.status(409).json({
        error: `لديك طلب من نفس النوع (${pendingSame.request_number || `#${pendingSame.id}`}) قيد المتابعة حالياً ولا يمكن إرسال طلب مكرر حتى البتّ فيه.`,
        code: 'duplicate',
      });
    }
  }

  const formData = req.body?.formData && typeof req.body.formData === 'object' ? { ...req.body.formData } : {};
  const rawAttachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

  // Enforce Smart Business restriction strictly from IEMS company profile
  if (
    (requestType === 'smart_business_request' || requestType === 'medical_services') &&
    !isSmartBusinessCompany(emp.company)
  ) {
    return res.status(403).json({
      error: 'هذا الطلب متاح لموظفي شركة Smart Business فقط وفقاً لبيانات ملفك الوظيفي في IEMS.',
    });
  }

  // Validate attachments format, MIME types & configurable max size
  const attachments = [];
  for (const att of rawAttachments.slice(0, 12)) {
    const fileName = String(att?.fileName || '').trim().slice(0, 180);
    const contentType = String(att?.contentType || 'application/octet-stream').trim().toLowerCase();
    const dataUrl = String(att?.dataUrl || '');
    const fieldKey = String(att?.fieldKey || 'attachment').trim().slice(0, 60);
    if (!fileName || !dataUrl.startsWith('data:')) continue;
    const mimeOk = ALLOWED_MIME_PREFIXES.some((p) => contentType.startsWith(p));
    if (!mimeOk) {
      return res.status(400).json({ error: `نوع الملف غير مدعوم (${fileName}). يُسمح بملفات PDF والصور فقط.` });
    }
    const approxBytes = Math.ceil((dataUrl.length * 3) / 4);
    if (approxBytes > maxAttBytes) {
      return res.status(400).json({
        error: `حجم الملف (${fileName}) يتجاوز الحد الأقصى (${config.maxAttachmentSizeMb}MB).`,
      });
    }
    attachments.push({ fieldKey, fileName, contentType, fileSize: approxBytes, dataUrl });
  }

  for (const reqField of catalog.requiredAttachments) {
    if (!attachments.some((a) => a.fieldKey === reqField)) {
      return res.status(400).json({ error: 'يرجى إرفاق جميع المستندات المطلوبة قبل إرسال الطلب.' });
    }
  }

  // Per-request dynamic field validation & duplicate prevention
  let selectedStageId = null;
  let selectedStageNameSnapshot = null;

  const setStageFromInput = (val) => {
    if (Array.isArray(val) && val.length > 0) {
      const cleaned = val.map((x) => String(x).trim()).filter(Boolean);
      selectedStageId = cleaned.join(',');
      selectedStageNameSnapshot = cleaned.join('، ');
    } else if (val && String(val).trim()) {
      selectedStageId = String(val).trim();
      selectedStageNameSnapshot = String(val).trim();
    }
  };

  if (requestType === 'exam_leave') {
    const studyYear = String(formData.studyYear || '').trim();
    const examDays = Number(formData.examDaysCount);
    const examDates = Array.isArray(formData.examDates) ? formData.examDates : [];
    const otherDates = String(formData.otherDates || '').trim();
    if (!studyYear) return res.status(400).json({ error: 'يرجى تحديد الفرقة الدراسية.' });
    if (!Number.isFinite(examDays) || examDays < 1 || examDays > 30) {
      return res.status(400).json({ error: 'يرجى إدخال عدد أيام اختبارات صحيح.' });
    }
    if (!examDates.length && !otherDates) {
      return res.status(400).json({ error: 'يرجى اختيار تواريخ الاختبارات أو كتابة التواريخ في خانة أخرى.' });
    }
  } else if (requestType === 'special_leave') {
    const startDate = validDate(formData.startDate);
    const endDate = validDate(formData.endDate);
    const reason = String(formData.reason || '').trim();
    setStageFromInput(formData.currentStage || emp.department);
    if (!startDate || !endDate || endDate < startDate) {
      return res.status(400).json({ error: 'يرجى تحديد تاريخ بداية ونهاية صحيح للإجازة.' });
    }
    if (!reason) return res.status(400).json({ error: 'يرجى توضيح سبب الإجازة الخاصة.' });
    if (attachments.length > 10) return res.status(400).json({ error: 'الحد الأقصى للمرفقات 10 ملفات.' });

    const existingLeaves = await db
      .prepare(
        "SELECT id, form_data FROM employee_requests WHERE employee_id = ? AND request_type IN ('special_leave','sick_leave') AND status IN ('submitted','under_review','approved')"
      )
      .all(empId);
    for (const ex of existingLeaves) {
      const fd = typeof ex.form_data === 'string' ? JSON.parse(ex.form_data || '{}') : ex.form_data || {};
      if (fd.startDate && fd.endDate && fd.startDate <= endDate && fd.endDate >= startDate) {
        return res.status(409).json({
          error: 'يوجد طلب إجازة نشط يتقاطع مع نفس الفترة المحددة.',
          code: 'duplicate',
        });
      }
    }
  } else if (requestType === 'sick_leave') {
    const startDate = validDate(formData.startDate);
    const endDate = validDate(formData.endDate);
    const absenceDaysCount = Number(formData.absenceDaysCount);
    if (!Number.isFinite(absenceDaysCount) || absenceDaysCount < 1 || absenceDaysCount > 60) {
      return res.status(400).json({ error: 'يرجى إدخال عدد أيام غياب مرضي صحيح.' });
    }
    if (!startDate || !endDate || endDate < startDate) {
      return res.status(400).json({ error: 'يرجى إدخال تاريخ بداية ونهاية الإجازة المرضية بشكل صحيح.' });
    }
    const existingLeaves = await db
      .prepare(
        "SELECT id, form_data FROM employee_requests WHERE employee_id = ? AND request_type IN ('special_leave','sick_leave') AND status IN ('submitted','under_review','approved')"
      )
      .all(empId);
    for (const ex of existingLeaves) {
      const fd = typeof ex.form_data === 'string' ? JSON.parse(ex.form_data || '{}') : ex.form_data || {};
      if (fd.startDate && fd.endDate && fd.startDate <= endDate && fd.endDate >= startDate) {
        return res.status(409).json({
          error: 'يوجد طلب إجازة مرضية أو خاصة نشط يتقاطع مع نفس الفترة.',
          code: 'duplicate',
        });
      }
    }
  } else if (requestType === 'extra_working_days') {
    const extraDate = validDate(formData.extraWorkingDate);
    const shiftWorked = String(formData.shiftWorked || '').trim();
    setStageFromInput(formData.stage);
    if (!extraDate) return res.status(400).json({ error: 'يرجى اختيار تاريخ اليوم الإضافي.' });
    if (!shiftWorked) return res.status(400).json({ error: 'يرجى تحديد الشيفت الذي تم العمل به.' });
    if (!selectedStageNameSnapshot) return res.status(400).json({ error: 'يرجى اختيار المرحلة.' });
  } else if (requestType === 'salary_entitlements') {
    if (!String(formData.entitlementType || '').trim()) {
      return res.status(400).json({ error: 'يرجى تحديد نوع المستحق.' });
    }
    if (!String(formData.paymentMethod || '').trim() || !String(formData.accountOrPhoneNumber || '').trim()) {
      return res.status(400).json({ error: 'يرجى إدخال وسيلة الدفع ورقم الحساب/المحفظة.' });
    }
  } else if (requestType === 'advance_request') {
    const eligibility = await computeEligibility(empId, emp.created_at || null, config);
    if (config.enforceAdvanceWindow && !eligibility.inApplicationWindow) {
      return res.status(400).json({
        error: `تقديم طلبات السلف متاح شهرياً من يوم ${config.advanceWindowStartDay} إلى يوم ${config.advanceWindowEndDay} فقط.`,
      });
    }
    if (eligibility.existingAdvanceThisMonth) {
      return res.status(409).json({
        error: 'تم استلام طلب سلفة نشط أو معتمد لهذا الشهر بالفعل (الحد الأقصى طلب واحد شهرياً).',
        code: 'duplicate',
      });
    }
    const amount = Number(formData.requestedAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 50000) {
      return res.status(400).json({ error: 'يرجى إدخال مبلغ سلفة صحيح.' });
    }
    if (!String(formData.paymentMethod || '').trim() || !String(formData.walletOrInstaPayNumber || '').trim()) {
      return res.status(400).json({ error: 'يرجى تحديد وسيلة استلام السلفة ورقم المحفظة / InstaPay.' });
    }
    formData._eligibility = eligibility;
    formData.actualAttendanceDays =
      formData.actualAttendanceDays !== undefined && formData.actualAttendanceDays !== ''
        ? Number(formData.actualAttendanceDays)
        : eligibility.actualAttendanceDays;
    formData.unauthorizedAbsence = eligibility.hasUnauthorizedAbsence ? 'Yes' : 'No';
  } else if (requestType === 'employee_grant') {
    if (!String(formData.tenureInProject || '').trim()) {
      return res.status(400).json({ error: 'يرجى تحديد مدة العمل بالمشروع.' });
    }
  } else if (requestType === 'marriage_grant') {
    const agreed =
      formData.termsAccepted === true ||
      formData.termsAccepted === 'true' ||
      formData.termsAccepted === 'موافق';
    if (!agreed) {
      return res.status(400).json({ error: 'يجب قراءة الشروط والموافقة عليها أولاً.' });
    }
    const gender = String(formData.gender || '').trim();
    if (!['ذكر', 'أنثى'].includes(gender)) {
      return res.status(400).json({ error: 'يرجى اختيار النوع (ذكر أو أنثى).' });
    }
    formData.termsAccepted = 'قرأت الشروط وموافق عليها';
    formData.gender = gender;
  } else if (requestType === 'general_request') {
    setStageFromInput(formData.currentStage || emp.department);
    if (!String(formData.requestDetails || '').trim()) {
      return res.status(400).json({ error: 'يرجى كتابة تفاصيل الطلب.' });
    }
    if (!String(formData.contactNumber || '').trim()) {
      return res.status(400).json({ error: 'يرجى إدخال رقم التواصل.' });
    }
    if (attachments.length > 5) return res.status(400).json({ error: 'الحد الأقصى للمرفقات 5 ملفات.' });
  } else if (requestType === 'shift_transfer') {
    setStageFromInput(formData.performableStages);
    const reqShift = String(formData.requestedShift || '').trim().toUpperCase();
    const curShift = String(emp.shift || formData.currentShift || '').trim().toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(reqShift)) {
      return res.status(400).json({ error: 'يرجى تحديد الشيفت المطلوب الانتقال إليه (A / B / C / D).' });
    }
    if (curShift && reqShift === curShift) {
      return res.status(400).json({ error: 'لا يمكن تقديم طلب نقل إلى نفس الشيفت الحالي المسجل لك.' });
    }
    formData.requestedShift = reqShift;
    if (curShift) formData.currentShift = curShift;
    if (!String(formData.currentPeriodShift || '').trim() || !String(formData.requestedPeriodShift || '').trim()) {
      return res.status(400).json({ error: 'يرجى اختيار الفترة الحالية والفترة المطلوبة.' });
    }
    if (!selectedStageNameSnapshot) {
      return res.status(400).json({ error: 'يرجى اختيار مرحلة واحدة على الأقل من المراحل التي يمكنك العمل بها.' });
    }
    if (!String(formData.reason || '').trim()) {
      return res.status(400).json({ error: 'يرجى توضيح سبب طلب نقل الشيفت.' });
    }
  } else if (requestType === 'resignation') {
    setStageFromInput(formData.currentStage || emp.department);
    if (!validDate(formData.lastWorkingDay)) {
      return res.status(400).json({ error: 'يرجى تحديد آخر يوم عمل صحيح.' });
    }
    if (!String(formData.reason || '').trim()) {
      return res.status(400).json({ error: 'يرجى اختيار سبب الاستقالة.' });
    }
    if (!String(formData.whatsappNumber || '').trim()) {
      return res.status(400).json({ error: 'يرجى إدخال رقم الواتساب للتواصل.' });
    }
  } else if (requestType === 'resignation_withdrawal') {
    if (!String(formData.reasonForWithdrawal || '').trim()) {
      return res.status(400).json({ error: 'يرجى ذكر سبب التراجع عن الاستقالة.' });
    }
  } else if (requestType === 'smart_business_request') {
    if (!String(formData.smartRequestType || '').trim()) {
      return res.status(400).json({ error: 'يرجى اختيار نوع طلب شركة سمارت بيزنس.' });
    }
  } else if (requestType === 'medical_services') {
    const labName = String(formData.labName || '').trim();
    if (!['معمل فحوصات', 'معمل النيل مصر'].includes(labName)) {
      return res.status(400).json({ error: 'يرجى اختيار المعمل المطلوب (معمل فحوصات أو معمل النيل مصر).' });
    }
    const recipientType = String(formData.recipientType || '').trim();
    if (!['شخصي', 'أحد أفراد الأسرة'].includes(recipientType)) {
      return res.status(400).json({ error: 'يرجى تحديد لمن يوجّه الخطاب (شخصي أو أحد أفراد الأسرة).' });
    }
    const familyRelation = String(formData.familyRelation || '').trim();
    const VALID_RELATIONS = ['أب', 'أم', 'أخ', 'أخت', 'ابن', 'ابنة'];
    if (recipientType === 'أحد أفراد الأسرة') {
      if (!VALID_RELATIONS.includes(familyRelation)) {
        return res.status(400).json({ error: 'يرجى تحديد صلة القرابة (أب، أم، أخ، أخت، ابن، أو ابنة).' });
      }
      formData.familyRelation = familyRelation;
    } else {
      delete formData.familyRelation;
    }
    const labVisitDate = validDate(formData.labVisitDate);
    if (!labVisitDate) {
      return res.status(400).json({ error: 'يرجى تحديد تاريخ التوجه للمعمل بشكل صحيح.' });
    }
    const phone = String(formData.phone || '').trim();
    const digitsOnly = phone.replace(/[^\d]/g, '');
    if (!phone || digitsOnly.length < 8 || digitsOnly.length > 15) {
      return res.status(400).json({ error: 'يرجى إدخال رقم هاتف صحيح.' });
    }
    formData.labName = labName;
    formData.recipientType = recipientType;
    formData.labVisitDate = labVisitDate;
    formData.phone = phone;
  }

  // Keep only fields belonging strictly to the submitted requestType
  const sanitizedFormData = sanitizeFormData(requestType, formData);

  const monthTag = new Date().toISOString().slice(0, 7).replace('-', '');
  const tempNumber = `REQ-${monthTag}-${Math.floor(100000 + Math.random() * 899999)}`;

  const created = await db
    .prepare(
      `INSERT INTO employee_requests (
         request_number, employee_id, employee_name, company, shift, department,
         kind, category, request_type, request_title, status,
         selected_stage_id, selected_stage_name_snapshot, form_data, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?::jsonb, ?)
       RETURNING id, request_number`
    )
    .get(
      tempNumber,
      empId,
      emp.name,
      emp.company || formData.company || null,
      emp.shift || formData.shift || null,
      emp.department || null,
      requestType,
      catalog.category,
      requestType,
      catalog.arabicTitle,
      selectedStageId,
      selectedStageNameSnapshot,
      JSON.stringify(sanitizedFormData),
      String(sanitizedFormData.notes || '').trim().slice(0, 1000) || null
    );

  const requestNumber = `REQ-${monthTag}-${String(created.id).padStart(4, '0')}`;
  await db
    .prepare('UPDATE employee_requests SET request_number = ? WHERE id = ?')
    .run(requestNumber, created.id);

  for (const att of attachments) {
    await db
      .prepare(
        `INSERT INTO request_attachments (request_id, field_key, file_name, content_type, file_size, data_url, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        created.id,
        att.fieldKey,
        att.fileName,
        att.contentType,
        att.fileSize,
        att.dataUrl,
        empId
      );
  }

  await appendHistory(created.id, {
    action: 'submitted',
    oldStatus: null,
    newStatus: 'submitted',
    user: { id: empId, name: emp.name },
    comment: catalog.arabicTitle,
  });

  await writeAudit(req, 'employee_request_create', created.id, {
    request_number: requestNumber,
    employee_id: empId,
    request_type: requestType,
    stage: selectedStageNameSnapshot,
  });

  const recipients = await decisionMakerRecipientsForRequest(
    config,
    requestType,
    emp.shift,
    emp.company || formData.company || null,
    sanitizedFormData,
    empId
  );
  await notifyUsers(recipients, {
    type: 'employee_request',
    title: `طلب جديد: ${catalog.arabicTitle}`,
    body: `${emp.name} (${requestNumber})`,
    link: '/requests.html',
  });

  await notifyUsers([empId], {
    type: 'employee_request_submitted',
    title: `تم استلام طلبك (${requestNumber})`,
    body: `${catalog.arabicTitle} — تم الإرسال بنجاح`,
    link: '/requests.html',
  });

  res.json({
    ok: true,
    id: created.id,
    request_number: requestNumber,
    request_title: catalog.arabicTitle,
    category: catalog.category,
    status: 'submitted',
    submitted_at: new Date().toISOString(),
    company: emp.company || formData.company || null,
    shift: emp.shift || formData.shift || null,
  });
});

// ---- Admin Cleanup Endpoint for Legacy/Corrupted Request Data ----
router.post('/cleanup', requireAuth, requireAdmin, async (req, res) => {
  const stats = await cleanLegacyRequestsDatabase(true);
  await writeAudit(req, 'request_database_cleanup', 'all', stats);
  res.json({ ok: true, ...stats });
});

// ---- Secure Attachment Download / Preview (strict ACL + audit logging) ----
router.get('/attachments/:attId', requireAuth, async (req, res) => {
  const attId = Number(req.params.attId);
  if (!Number.isInteger(attId)) return res.status(400).json({ error: 'مرفق غير صالح.' });

  const att = await db
    .prepare(
      `SELECT a.id, a.request_id, a.field_key, a.file_name, a.content_type, a.file_size, a.data_url, a.uploaded_at,
              r.employee_id, r.company, r.shift, r.request_number, r.request_type, r.form_data
         FROM request_attachments a
         JOIN employee_requests r ON r.id = a.request_id
        WHERE a.id = ?`
    )
    .get(attId);

  if (!att) return res.status(404).json({ error: 'المرفق غير موجود.' });

  const config = await getModuleConfig();
  const isOwner = Number(att.employee_id) === Number(req.user.id);
  const canReview =
    (isAdminOrHr(req) && hrCanAccessRequest(req, att)) ||
    (req.user?.role === 'supervisor' && supervisorCanAccessRequest(req, att, config));

  if (!isOwner && !canReview) {
    return res.status(403).json({ error: 'غير مصرح لك بعرض هذا المرفق أو أنه خارج نطاق شركتك وصلاحياتك.' });
  }

  if (!isOwner) {
    await writeAudit(req, 'request_attachment_view', att.request_id, {
      attachment_id: att.id,
      file_name: att.file_name,
      request_number: att.request_number,
    });
  }

  res.json({
    id: att.id,
    file_name: att.file_name,
    content_type: att.content_type,
    file_size: att.file_size,
    data_url: att.data_url,
  });
});

// ---- Request Detail + History + Attachments ----
router.get('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'طلب غير صالح.' });

  const r = await db.prepare('SELECT * FROM employee_requests WHERE id = ?').get(id);
  if (!r) return res.status(404).json({ error: 'الطلب غير موجود.' });

  const config = await getModuleConfig();
  const isOwner = Number(r.employee_id) === Number(req.user.id);
  const canReview =
    (isAdminOrHr(req) && hrCanAccessRequest(req, r)) ||
    (req.user?.role === 'supervisor' && supervisorCanAccessRequest(req, r, config));

  if (!isOwner && !canReview) {
    return res.status(403).json({ error: 'غير مصرح لك بعرض تفاصيل هذا الطلب أو أنه خارج نطاق شركتك وشيفتك.' });
  }

  if (!isOwner) {
    await writeAudit(req, 'employee_request_view', r.id, {
      request_number: r.request_number || `REQ-${r.id}`,
      employee_id: r.employee_id,
      request_type: r.request_type,
    });
  }

  const attachments = await db
    .prepare(
      'SELECT id, request_id, field_key, file_name, content_type, file_size, uploaded_at FROM request_attachments WHERE request_id = ? ORDER BY id ASC'
    )
    .all(id);

  const history = await db
    .prepare(
      'SELECT id, request_id, action, old_status, new_status, action_by_user_id, action_by_name_snapshot, comment, created_at FROM request_history WHERE request_id = ? ORDER BY created_at ASC, id ASC'
    )
    .all(id);

  const empProfile = await db
    .prepare(
      'SELECT id, emp_num, name, company, shift, department, education, residence, created_at FROM employees WHERE id = ?'
    )
    .get(Number(r.employee_id));

  const formatted = formatRequestRow(r);
  formatted.attachments = attachments;
  formatted.attachments_count = attachments.length;
  formatted.history = history;
  formatted.employee_profile = empProfile || null;

  res.json({ request: formatted });
});

// ---- Employee Cancellation (Submitted requests only when enabled) ----
router.post('/:id/cancel', requireAuth, async (req, res) => {
  const config = await getModuleConfig();
  if (!config.allowEmployeeCancellation) {
    return res.status(403).json({ error: 'تم تعطيل إلغاء الطلبات من إعدادات النظام.' });
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'طلب غير صالح.' });

  const existing = await db.prepare('SELECT * FROM employee_requests WHERE id = ?').get(id);
  if (!existing || Number(existing.employee_id) !== Number(req.user.id)) {
    return res.status(404).json({ error: 'الطلب غير موجود.' });
  }
  const curStatus = existing.status === 'pending' ? 'submitted' : existing.status;
  if (curStatus !== 'submitted') {
    return res.status(409).json({ error: 'لا يمكن إلغاء الطلب بعد بدء مراجعته أو اتخاذ قرار بشأنه.' });
  }

  await db
    .prepare(
      "UPDATE employee_requests SET status = 'cancelled', last_updated_at = CURRENT_TIMESTAMP WHERE id = ? AND employee_id = ?"
    )
    .run(id, Number(req.user.id));

  await appendHistory(id, {
    action: 'cancelled',
    oldStatus: curStatus,
    newStatus: 'cancelled',
    user: req.user,
    comment: 'تم إلغاء الطلب بواسطة مقدم الطلب',
  });
  await writeAudit(req, 'employee_request_cancel', id, { request_number: existing.request_number });
  res.json({ ok: true });
});

// ---- Status Transition: Submitted -> Under Review ----
router.post('/:id/status', requireAuth, async (req, res) => {
  const config = await getModuleConfig();
  if (!userCanDecide(req, config)) {
    return res.status(403).json({ error: 'ليس لديك صلاحية تحديث حالة هذا الطلب.' });
  }
  const id = Number(req.params.id);
  const nextStatus = String(req.body?.status || '').trim();
  const comment = String(req.body?.comment || '').trim().slice(0, 500) || null;
  if (nextStatus !== 'under_review') {
    return res.status(400).json({ error: 'هذا المسار مخصص لوضع الطلب قيد المراجعة فقط.' });
  }

  const existing = await db.prepare('SELECT * FROM employee_requests WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'الطلب غير موجود.' });
  if (Number(existing.employee_id) === Number(req.user.id)) {
    return res.status(403).json({ error: 'لا يمكن لمتخذ القرار مراجعة طلبه الشخصي.' });
  }
  if (!supervisorCanAccessRequest(req, existing, config)) {
    return res.status(403).json({ error: 'هذا الطلب خارج نطاق الشركات أو الشيفتات المسندة إليك.' });
  }
  const curStatus = existing.status === 'pending' ? 'submitted' : existing.status;
  if (curStatus !== 'submitted') {
    return res.status(409).json({ error: 'يمكن تحويل الطلب إلى قيد المراجعة من حالة Submitted فقط.' });
  }

  await db
    .prepare(
      "UPDATE employee_requests SET status = 'under_review', last_updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
    .run(id);

  await appendHistory(id, {
    action: 'status_changed',
    oldStatus: curStatus,
    newStatus: 'under_review',
    user: req.user,
    comment: comment || 'الطلب قيد المراجعة',
  });
  await writeAudit(req, 'employee_request_under_review', id, {
    request_number: existing.request_number,
    comment,
  });

  const cat = REQUEST_CATALOG[existing.request_type];
  await notifyUsers([existing.employee_id], {
    type: 'employee_request_under_review',
    title: `طلبك قيد المراجعة (${existing.request_number || `REQ-${id}`})`,
    body: `${cat?.arabicTitle || existing.request_title} — قيد المراجعة الآن بواسطة ${req.user.name}`,
    link: '/requests.html',
  });

  res.json({ ok: true });
});

// ---- One Final Decision Maker Only: Approve or Reject ----
router.post('/:id/decide', requireAuth, async (req, res) => {
  const config = await getModuleConfig();
  if (!userCanDecide(req, config)) {
    return res.status(403).json({ error: 'ليس لديك صلاحية اتخاذ القرار في هذا الطلب.' });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'طلب غير صالح.' });

  const decision = String(req.body?.decision || '').trim();
  const rawReason = String(req.body?.reason || '').trim().slice(0, 1000);
  if (decision !== 'approved' && decision !== 'rejected') {
    return res.status(400).json({ error: 'القرار يجب أن يكون approved أو rejected فقط.' });
  }
  if (decision === 'rejected' && !rawReason) {
    return res.status(400).json({ error: 'يرجى كتابة سبب الرفض قبل التأكيد.' });
  }
  // Reason applies strictly to rejected requests; approved decisions do not carry a reason
  const reason = decision === 'rejected' ? rawReason : '';

  const existing = await db.prepare('SELECT * FROM employee_requests WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'الطلب غير موجود.' });
  if (Number(existing.employee_id) === Number(req.user.id)) {
    return res.status(403).json({ error: 'لا يمكن لمتخذ القرار اعتماد أو رفض طلبه الشخصي.' });
  }

  if (!supervisorCanAccessRequest(req, existing, config)) {
    return res.status(403).json({ error: 'هذا الطلب خارج نطاق الشركات أو الشيفتات المسندة إليك.' });
  }

  const curStatus = existing.status === 'pending' ? 'submitted' : existing.status;
  if (!['submitted', 'under_review'].includes(curStatus)) {
    return res.status(409).json({
      error: 'تم تسجيل قرار نهائي لهذا الطلب بالفعل ولا يمكن تعديله مباشرة إلا عبر إجراء إعادة الفتح الموثّق.',
    });
  }

  await db
    .prepare(
      `UPDATE employee_requests
          SET status = ?,
              decision = ?,
              decision_maker_user_id = ?,
              decision_maker_name_snapshot = ?,
              decision_reason = ?,
              decided_at = CURRENT_TIMESTAMP,
              last_updated_at = CURRENT_TIMESTAMP,
              reviewed_by = ?,
              reviewed_by_name = ?,
              reviewed_at = CURRENT_TIMESTAMP,
              reject_reason = ?
        WHERE id = ? AND status IN ('submitted', 'under_review', 'pending')`
    )
    .run(
      decision,
      decision,
      Number(req.user.id),
      req.user.name || null,
      reason || null,
      Number(req.user.id),
      req.user.name || null,
      decision === 'rejected' ? reason || null : null,
      id
    );

  await appendHistory(id, {
    action: decision,
    oldStatus: curStatus,
    newStatus: decision,
    user: req.user,
    comment: reason || null,
  });

  await writeAudit(req, `employee_request_${decision}`, id, {
    request_number: existing.request_number,
    employee_id: existing.employee_id,
    request_type: existing.request_type,
    decision,
    reason: reason || null,
    decision_maker: req.user.name,
  });

  const cat = REQUEST_CATALOG[existing.request_type];
  const decisionAr = decision === 'approved' ? 'تمت الموافقة (Approved)' : 'تم الرفض (Rejected)';
  const reqNum = existing.request_number || `REQ-${id}`;
  await notifyUsers([existing.employee_id], {
    type: `employee_request_${decision}`,
    title: `${decisionAr}: ${cat?.arabicTitle || existing.request_title} (${reqNum})`,
    body: `متخذ القرار: ${req.user.name}${reason ? ` · سبب الرفض: ${reason}` : ''}`,
    link: '/requests.html',
  });

  res.json({ ok: true });
});

// ---- Audited Reopen / Correction (Never silent overwrite) ----
router.post('/:id/reopen', requireAuth, async (req, res) => {
  const config = await getModuleConfig();
  if (!config.allowReopenDecision) {
    return res.status(403).json({ error: 'تم تعطيل إعادة فتح الطلبات المغلقة من إعدادات النظام.' });
  }
  if (!userCanDecide(req, config)) {
    return res.status(403).json({ error: 'ليس لديك صلاحية إعادة فتح الطلب.' });
  }
  const id = Number(req.params.id);
  const reason = String(req.body?.reason || '').trim().slice(0, 1000);
  if (!reason) {
    return res.status(400).json({ error: 'يجب كتابة سبب إعادة فتح الطلب للتصحيح (مطلوب في سجل التدقيق).' });
  }

  const existing = await db.prepare('SELECT * FROM employee_requests WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'الطلب غير موجود.' });
  if (!supervisorCanAccessRequest(req, existing, config)) {
    return res.status(403).json({ error: 'هذا الطلب خارج نطاق الشركات أو الشيفتات المسندة إليك.' });
  }
  if (!['approved', 'rejected'].includes(existing.status)) {
    return res.status(409).json({ error: 'يمكن إعادة فتح الطلبات التي صدر بشأنها قرار نهائي فقط.' });
  }

  await db
    .prepare(
      `UPDATE employee_requests
          SET status = 'under_review',
              decision = NULL,
              decision_maker_user_id = NULL,
              decision_maker_name_snapshot = NULL,
              decision_reason = NULL,
              decided_at = NULL,
              last_updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status IN ('approved', 'rejected')`
    )
    .run(id);

  await appendHistory(id, {
    action: 'reopened',
    oldStatus: existing.status,
    newStatus: 'under_review',
    user: req.user,
    comment: reason,
  });

  await writeAudit(req, 'employee_request_reopen', id, {
    request_number: existing.request_number,
    previous_decision: existing.status,
    previous_maker: existing.decision_maker_name_snapshot,
    reopen_reason: reason,
  });

  const cat = REQUEST_CATALOG[existing.request_type];
  await notifyUsers([existing.employee_id], {
    type: 'employee_request_reopened',
    title: `إعادة فتح ومراجعة طلب (${existing.request_number || `REQ-${id}`})`,
    body: `${cat?.arabicTitle || existing.request_title} — أُعيد للمراجعة بواسطة ${req.user.name}: ${reason}`,
    link: '/requests.html',
  });

  res.json({ ok: true });
});

module.exports = router;
