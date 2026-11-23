const jwt = require('jsonwebtoken');
const db = require('../database/init');

// No fallback in production: a missing secret must fail loudly, never fall back to a known value.
const JWT_SECRET = process.env.JWT_SECRET
  || (process.env.NODE_ENV === 'production' ? '' : 'iems-local-dev-secret-not-for-production');

function normalizeShiftsList(rawShifts, fallbackShift) {
  const arr = Array.isArray(rawShifts) && rawShifts.length
    ? rawShifts
    : (fallbackShift ? [fallbackShift] : []);
  return [...new Set(arr.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))];
}

function getSupervisorShifts(req) {
  if (req.user?.role !== 'supervisor') return null;
  return normalizeShiftsList(req.user.supervisorShifts || req.user.supervisor_shifts, req.user.shift);
}

function requireJwtSecret(res) {
  if (JWT_SECRET) return true;
  res.status(500).json({ error: 'JWT_SECRET غير مضبوط في Environment Variables على Vercel.' });
  return false;
}

async function requireAuth(req, res, next) {
  if (!requireJwtSecret(res)) return;
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'مطلوب تسجيل الدخول' });
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (_) {
    return res.status(401).json({ error: 'الجلسة منتهية، من فضلك سجل الدخول مرة أخرى' });
  }
  try {
    const fresh = await db
      .prepare('SELECT id, name, role, shift, supervisor_shifts, company, department FROM employees WHERE id = ?')
      .get(Number(decoded.id));
    if (!fresh) {
      return res.status(401).json({ error: 'الحساب غير موجود، سجل الدخول مرة أخرى' });
    }
    const supShifts = normalizeShiftsList(fresh.supervisor_shifts, fresh.shift);
    req.user = {
      ...decoded,
      id: fresh.id,
      name: fresh.name,
      role: fresh.role,
      shift: fresh.shift,
      supervisorShifts: supShifts,
      supervisor_shifts: supShifts,
      company: fresh.company,
      department: fresh.department,
    };
    next();
  } catch (err) {
    return next(err);
  }
}

const isCreator = req => req.user?.role === 'system_creator';
const isAdmin = req => req.user?.role === 'admin' || isCreator(req);
const isSupervisor = req => isAdmin(req) || req.user?.role === 'supervisor';

function requireSystemCreator(req, res, next) {
  if (!requireJwtSecret(res)) return;
  if (!isCreator(req)) return res.status(403).json({ error: 'هذه الصفحة متاحة لمنشئ النظام فقط.' });
  next();
}

function requireAdmin(req, res, next) {
  if (!requireJwtSecret(res)) return;
  if (!isAdmin(req)) return res.status(403).json({ error: 'هذا الإجراء متاح لمدير النظام أو منشئ النظام فقط.' });
  next();
}

function requireSupervisor(req, res, next) {
  if (!requireJwtSecret(res)) return;
  if (!isSupervisor(req)) return res.status(403).json({ error: 'هذا الإجراء متاح لمدير النظام أو المشرف فقط.' });
  next();
}

function requireAdminOrSupervisor(req, res, next) { return requireSupervisor(req, res, next); }
const requireUploader = requireSupervisor;

module.exports = {
  requireAuth, requireAdmin, requireSupervisor, requireAdminOrSupervisor,
  requireUploader, requireSystemCreator, isCreator, isAdmin, isSupervisor,
  getSupervisorShifts, normalizeShiftsList, JWT_SECRET
};
