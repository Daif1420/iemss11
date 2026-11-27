const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/init');
const { requireAuth, normalizeCompaniesList, JWT_SECRET } = require('../middleware/auth');
const { getSystemConfig } = require('../utils/systemSettings');

const router = express.Router();

// simple in-memory rate limiting per IP for login attempts
const attempts = new Map(); // ip -> { count, resetAt }
const WINDOW_MS = 10 * 60 * 1000;

// Only FAILED attempts count. Previously every request (including successful
// logins) incremented the counter, so on a shared office IP the 9th employee
// signing in within 10 minutes was locked out with "too many attempts".
function isBlocked(ip, maxAttempts = 8) {
  const rec = attempts.get(ip);
  if (!rec) return false;
  if (Date.now() > rec.resetAt) { attempts.delete(ip); return false; }
  return rec.count >= maxAttempts;
}
function recordFailure(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.resetAt) attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else rec.count += 1;
}
function clearFailures(ip) { attempts.delete(ip); }

router.post('/login', async (req, res) => {
  const sysCfg = await getSystemConfig();
  const maxAttempts = sysCfg.general.maxLoginAttempts || 8;
  const sessionHours = sysCfg.general.sessionExpiryHours || 8;

  const ip = req.ip;
  if (isBlocked(ip, maxAttempts)) {
    return res.status(429).json({ error: 'محاولات كثيرة جدًا، حاول بعد قليل' });
  }

  if (!JWT_SECRET) {
    return res.status(500).json({ error: 'JWT_SECRET غير مضبوط في Environment Variables على Vercel.' });
  }

  const { id, password } = req.body || {};
  if (id === undefined || id === null || id === '' || !password) {
    return res.status(400).json({ error: 'من فضلك أدخل الـID وكلمة المرور' });
  }
  if (Number.isNaN(Number(id))) {
    return res.status(400).json({ error: 'الـID غير صحيح' });
  }

  const emp = (await db.prepare('SELECT * FROM employees WHERE id = ?').get(Number(id)));
  // Async compare: compareSync blocked the whole event loop for the duration of
  // the hash, stalling every other in-flight request on the same instance.
  const ok = !!emp && await bcrypt.compare(String(password), emp.password_hash);

  if (!ok) recordFailure(ip); else clearFailures(ip);

  // Audit rows are best-effort and run in parallel: a logging failure must never
  // block or break the login itself.
  const audits = [
    db.prepare('INSERT INTO login_audit (employee_id, success, ip) VALUES (?, ?, ?)')
      .run(emp ? emp.id : null, ok ? 1 : 0, ip),
  ];
  if (ok) {
    audits.push(db.prepare(`INSERT INTO audit_logs
      (actor_id, actor_name, action, entity_type, entity_id, details_json, ip)
      VALUES (?, ?, 'login_success', 'auth', ?, ?::jsonb, ?)`)
      .run(emp.id, emp.name, String(emp.id), JSON.stringify({ role: emp.role }), ip));
  }
  const results = await Promise.allSettled(audits);
  results.forEach(r => { if (r.status === 'rejected') console.error('[IEMS API] login audit failed', r.reason); });

  if (!ok) {
    return res.status(401).json({ error: 'الرقم التعريفي أو كلمة المرور غير صحيحة' });
  }

  const hrCompanies = emp.role === 'hr_manager'
    ? normalizeCompaniesList(emp.hr_companies, emp.company)
    : (Array.isArray(emp.hr_companies) ? emp.hr_companies : []);

  const token = jwt.sign(
    {
      id: emp.id,
      role: emp.role,
      name: emp.name,
      shift: emp.shift,
      supervisorShifts: emp.supervisor_shifts || [],
      hrCompanies,
    },
    JWT_SECRET,
    { expiresIn: `${sessionHours}h` }
  );

  res.json({
    token,
    user: {
      id: emp.id,
      name: emp.name,
      role: emp.role,
      shift: emp.shift,
      supervisorShifts: emp.supervisor_shifts || [],
      hrCompanies,
      hr_companies: hrCompanies,
      company: emp.company,
      department: emp.department,
      must_change_password: !!emp.must_change_password,
    },
  });
});

router.get('/forgot-password-options', async (_req, res) => {
  const sysCfg = await getSystemConfig();
  const defaultStages = sysCfg.departmentsAndLists.stages || [
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
  const reasons = [
    'نسيان كلمة المرور',
    'كلمة المرور لا تعمل عند تسجيل الدخول',
    'الحساب غير مفعّل أو موظف جديد',
    'مشكلة في الرقم التعريفي (ID)',
    'طلب تغيير كلمة المرور',
    'أخرى',
  ];

  let stages = [];
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
    stages = [
      ...new Set(
        [...dailyRows, ...targetRows]
          .map((r) => String(r.stage || '').trim())
          .filter((s) => s && s !== 'الحضور' && s !== 'TOTAL TARGET %')
      ),
    ];
  } catch {
    stages = [];
  }

  if (!stages.length) stages = defaultStages;
  res.json({
    stages,
    reasons,
    shifts: sysCfg.departmentsAndLists.shifts || ['A', 'B', 'C', 'D'],
    allowForgotPassword: sysCfg.general.allowForgotPassword,
    supportWhatsappNumber: sysCfg.general.supportWhatsappNumber,
    systemName: sysCfg.general.systemName,
    systemSubtitle: sysCfg.general.systemSubtitle,
  });
});

router.get('/me', requireAuth, async (req, res) => {
  const emp = await db.prepare('SELECT id, name, role, shift, supervisor_shifts, hr_companies, company, department, must_change_password FROM employees WHERE id = ?')
    .get(req.user.id);
  if (!emp) return res.status(404).json({ error: 'غير موجود' });
  const hrCompanies = emp.role === 'hr_manager'
    ? normalizeCompaniesList(emp.hr_companies, emp.company)
    : (Array.isArray(emp.hr_companies) ? emp.hr_companies : []);
  res.json({
    user: {
      id: emp.id,
      name: emp.name,
      role: emp.role,
      shift: emp.shift,
      supervisorShifts: emp.supervisor_shifts || [],
      supervisor_shifts: emp.supervisor_shifts || [],
      hrCompanies,
      hr_companies: hrCompanies,
      company: emp.company,
      department: emp.department,
      must_change_password: !!emp.must_change_password,
    },
  });
});

module.exports = router;
