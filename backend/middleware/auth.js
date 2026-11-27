const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const db = require('../database/init');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_COOKIE_NAME = 'iems_session';

function parseCookies(req) {
  const header = String(req?.headers?.cookie || '');
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

function isHttpsRequest(req) {
  if (req?.secure) return true;
  const proto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return proto === 'https';
}

function getRequestHost(req) {
  const fwd = String(req?.headers?.['x-forwarded-host'] || '').split(',')[0].trim().toLowerCase();
  return fwd || String(req?.headers?.host || '').trim().toLowerCase();
}

function isSameOriginHeader(req) {
  const targetHost = getRequestHost(req);
  if (!targetHost) return false;
  const origin = String(req?.headers?.origin || '').trim();
  if (origin) {
    try {
      return new URL(origin).host.toLowerCase() === targetHost;
    } catch {
      return false;
    }
  }
  const referer = String(req?.headers?.referer || '').trim();
  if (referer) {
    try {
      return new URL(referer).host.toLowerCase() === targetHost;
    } catch {
      return false;
    }
  }
  return false;
}

function setSessionCookie(res, req, token, maxAgeMs) {
  const https = isHttpsRequest(req);
  const opts = {
    httpOnly: true,
    path: '/',
    sameSite: https ? 'none' : 'lax',
    ...(https ? { secure: true, partitioned: true } : {}),
    ...(typeof maxAgeMs === 'number' && maxAgeMs > 0 ? { maxAge: maxAgeMs } : {}),
  };
  res.cookie(SESSION_COOKIE_NAME, token, opts);
}

function clearSessionCookie(res, req) {
  const https = isHttpsRequest(req);
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    path: '/',
    sameSite: https ? 'none' : 'lax',
    ...(https ? { secure: true, partitioned: true } : {}),
  });
}

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

function normalizeCompanyToken(value) {
  const u = String(value || '').trim().toUpperCase();
  if (!u) return '';
  if (u.includes('SMART') || u === 'SB') return 'SMART BUSINESS';
  if (u.includes('BRAVOS')) return 'BRAVOS';
  return u;
}

function normalizeCompaniesList(rawCompanies, fallbackCompany) {
  const arr = Array.isArray(rawCompanies) && rawCompanies.length
    ? rawCompanies
    : (fallbackCompany ? [fallbackCompany] : []);
  return [...new Set(arr.map(normalizeCompanyToken).filter(Boolean))];
}

function getHrCompanies(req) {
  if (req.user?.role !== 'hr_manager') return null;
  return normalizeCompaniesList(req.user.hrCompanies || req.user.hr_companies, req.user.company);
}

function companyMatchesList(empCompany, allowedCompanies) {
  if (!allowedCompanies || !allowedCompanies.length) return false;
  const token = normalizeCompanyToken(empCompany);
  if (!token) return false;
  return allowedCompanies.map(normalizeCompanyToken).includes(token);
}

function companyCanonSql(col = 'e.company') {
  return `(CASE WHEN UPPER(TRIM(COALESCE(${col},''))) LIKE '%SMART%' OR UPPER(TRIM(COALESCE(${col},'')))='SB' THEN 'SMART BUSINESS' WHEN UPPER(TRIM(COALESCE(${col},''))) LIKE '%BRAVOS%' THEN 'BRAVOS' ELSE UPPER(TRIM(COALESCE(${col},''))) END)`;
}

function addHrCompanySql(sql, params, col, hrCompanies) {
  if (!hrCompanies) return sql;
  if (!hrCompanies.length) return `${sql} AND 1=0`;
  sql += ` AND ${companyCanonSql(col)} = ANY(?::text[])`;
  params.push(hrCompanies);
  return sql;
}

function requireJwtSecret(res) {
  if (JWT_SECRET) return true;
  res.status(500).json({ error: 'JWT_SECRET غير مضبوط في Environment Variables.' });
  return false;
}

async function requireAuth(req, res, next) {
  if (!requireJwtSecret(res)) return;
  const header = req.headers.authorization || '';
  const bearerToken = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const cookies = parseCookies(req);
  const cookieToken = cookies[SESSION_COOKIE_NAME] || null;
  const token = bearerToken || cookieToken;
  const authSource = bearerToken ? 'bearer' : 'cookie';

  if (!token) return res.status(401).json({ error: 'مطلوب تسجيل الدخول' });

  // Protect cookie-authenticated state-changing requests against CSRF
  if (
    authSource === 'cookie' &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(req.method || '').toUpperCase())
  ) {
    const hasCustomHeader = Boolean(req.headers['x-requested-with']);
    if (!hasCustomHeader && !isSameOriginHeader(req)) {
      return res.status(403).json({ error: 'تم رفض الطلب لأسباب أمنية.' });
    }
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (_) {
    return res.status(401).json({ error: 'الجلسة منتهية، من فضلك سجل الدخول مرة أخرى' });
  }
  try {
    const fresh = await db
      .prepare('SELECT id, name, role, shift, supervisor_shifts, hr_companies, company, department FROM employees WHERE id = ?')
      .get(Number(decoded.id));
    if (!fresh) {
      return res.status(401).json({ error: 'الحساب غير موجود، سجل الدخول مرة أخرى' });
    }
    const supShifts = normalizeShiftsList(fresh.supervisor_shifts, fresh.shift);
    const hrCompanies = fresh.role === 'hr_manager'
      ? normalizeCompaniesList(fresh.hr_companies, fresh.company)
      : (Array.isArray(fresh.hr_companies) ? fresh.hr_companies.map(normalizeCompanyToken).filter(Boolean) : []);
    req.authSource = authSource;
    req.user = {
      ...decoded,
      id: fresh.id,
      name: fresh.name,
      role: fresh.role,
      shift: fresh.shift,
      supervisorShifts: supShifts,
      supervisor_shifts: supShifts,
      hrCompanies,
      hr_companies: hrCompanies,
      company: fresh.company,
      department: fresh.department,
    };
    next();
  } catch (err) {
    return next(err);
  }
}

const isCreator = req => req.user?.role === 'system_creator';
const isHrManager = req => req.user?.role === 'hr_manager';
const isAdmin = req => req.user?.role === 'admin' || isCreator(req);
const isAdminOrHr = req => isAdmin(req) || isHrManager(req);
const isSupervisor = req => isAdminOrHr(req) || req.user?.role === 'supervisor';

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

function requireAdminOrHr(req, res, next) {
  if (!requireJwtSecret(res)) return;
  if (!isAdminOrHr(req)) return res.status(403).json({ error: 'هذا الإجراء متاح لإدارة الموارد البشرية أو مدير النظام فقط.' });
  next();
}

function requireSupervisor(req, res, next) {
  if (!requireJwtSecret(res)) return;
  if (!isSupervisor(req)) return res.status(403).json({ error: 'هذا الإجراء متاح لمدير النظام أو الموارد البشرية أو المشرف فقط.' });
  next();
}


function requireUploader(req, res, next) {
  if (!requireJwtSecret(res)) return;
  if (!isAdmin(req) && req.user?.role !== 'supervisor') {
    return res.status(403).json({ error: 'رفع وتحديث الشيتات متاح للإدارة والمشرفين فقط.' });
  }
  next();
}

module.exports = {
  requireAuth, requireAdmin, requireAdminOrHr, requireSupervisor,
  requireUploader, requireSystemCreator, isCreator, isHrManager, isAdmin, isAdminOrHr, isSupervisor,
  getSupervisorShifts, normalizeShiftsList,
  normalizeCompanyToken, normalizeCompaniesList, getHrCompanies, companyMatchesList, companyCanonSql, addHrCompanySql,
  parseCookies, setSessionCookie, clearSessionCookie, getRequestHost, isHttpsRequest,
  JWT_SECRET, SESSION_COOKIE_NAME
};
