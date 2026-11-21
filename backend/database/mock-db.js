const fs = require('fs');
const path = require('path');

function normalizeShift(s) {
  const v = String(s || '').trim().toUpperCase();
  return ['A', 'B', 'C', 'D'].includes(v) ? v : 'Other';
}

function createInitialStore() {
  const store = {
    employees: [],
    employee_summary: [],
    employee_monthly_summary: [],
    stage_daily: [],
    employee_stage_targets: [],
    employee_shift_profiles: [],
    supervisor_targets: [],
    login_audit: [],
    audit_logs: [],
    import_history: [],
    system_settings: [],
    notifications: [],
    missing_data_requests: [],
    employee_requests: [],
    request_attachments: [],
    request_history: [],
    seq: {
      stage_daily: 1,
      supervisor_targets: 1,
      login_audit: 1,
      audit_logs: 1,
      import_history: 1,
      notifications: 1,
      missing_data_requests: 1,
      employee_requests: 1,
      request_attachments: 1,
      request_history: 1,
    },
  };

  const seedPath = path.join(__dirname, '../../database/initial-data.json');
  if (fs.existsSync(seedPath)) {
    try {
      const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      if (Array.isArray(seed.employees)) {
        store.employees = seed.employees.map((e) => ({
          ...e,
          id: Number(e.id),
          target_shift: e.target_shift || normalizeShift(e.shift),
          must_change_password: Boolean(e.must_change_password),
          status: e.status || 'active',
          left_date: e.left_date || null,
          departure_reason: e.departure_reason || null,
          supervisor_shifts: Array.isArray(e.supervisor_shifts) ? e.supervisor_shifts : [],
        }));
      }
      if (Array.isArray(seed.employee_summary)) {
        store.employee_summary = seed.employee_summary.map((s) => ({ ...s, employee_id: Number(s.employee_id) }));
      }
      if (Array.isArray(seed.stage_daily)) {
        store.stage_daily = seed.stage_daily.map((d, idx) => ({
          ...d,
          id: Number(d.id || idx + 1),
          employee_id: Number(d.employee_id),
          entry_date: String(d.entry_date).slice(0, 10),
        }));
        store.seq.stage_daily = store.stage_daily.length + 1;
      }
      if (Array.isArray(seed.supervisor_targets)) {
        store.supervisor_targets = seed.supervisor_targets.map((t, idx) => ({
          ...t,
          id: Number(t.id || idx + 1),
          employee_id: t.employee_id == null ? null : Number(t.employee_id),
          entry_date: String(t.entry_date).slice(0, 10),
        }));
        store.seq.supervisor_targets = store.supervisor_targets.length + 1;
      }
      if (Array.isArray(seed.login_audit)) {
        store.login_audit = seed.login_audit.map((a, idx) => ({ ...a, id: Number(a.id || idx + 1) }));
        store.seq.login_audit = store.login_audit.length + 1;
      }
    } catch (err) {
      console.warn('[IEMS Mock DB] Failed to load initial-data.json:', err.message);
    }
  }

  // Ensure protected ID 0 system_creator exists (matches bootstrap.sql)
  let admin0 = store.employees.find((e) => e.id === 0);
  if (!admin0) {
    admin0 = {
      id: 0,
      emp_num: 0,
      name: 'منشئ النظام',
      education: null,
      residence: null,
      company: null,
      shift: null,
      target_shift: 'Other',
      department: null,
      password_hash: '$2a$10$jgAAd7acszesuDTBuihE2OGRjg4NSKPIvjA5iEORJBfnfFNhtSSIy',
      role: 'system_creator',
      must_change_password: true,
      status: 'active',
      created_at: new Date().toISOString(),
      left_date: null,
      departure_reason: null,
      supervisor_shifts: [],
    };
    store.employees.unshift(admin0);
  } else {
    admin0.role = 'system_creator';
    if (admin0.name === 'مدير النظام') admin0.name = 'منشئ النظام';
  }

  return store;
}

const store = createInitialStore();

function likeMatch(val, pattern) {
  const hay = String(val ?? '').toLowerCase();
  const pat = String(pattern ?? '').toLowerCase();
  const escaped = pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${escaped}$`).test(hay);
}

function classifyCompany(company) {
  const u = String(company || '').trim().toUpperCase();
  if (u.includes('SMART') || u === 'SB') return 'SMART BUSINESS';
  if (u.includes('BRAVOS')) return 'BRAVOS';
  return null;
}

function attendanceFlags(row) {
  const num = row.value_num;
  const txt = String(row.value_text || '').trim();
  const isPresent = num === 0.5 || num === 1 || num === 1.5;
  const isCasual = num !== null && num !== undefined && num === 0;
  const isPermission = txt === 'ا';
  const isUnauthorized = txt === 'ب';
  const isMedical = txt === 'م';
  const isAbsent = isCasual || isPermission || isUnauthorized || isMedical;
  return { isPresent, isCasual, isPermission, isUnauthorized, isMedical, isAbsent };
}

function filterEmployeesWhere(sql, params, empList) {
  let idx = 0;
  let rows = empList.slice();
  const s = sql;

  if (/role\s*=\s*'employee'/i.test(s)) rows = rows.filter((e) => e.role === 'employee');
  if (/COALESCE\s*\(\s*e?\.?status\s*,\s*'active'\s*\)\s*=\s*'active'/i.test(s)) {
    rows = rows.filter((e) => (e.status || 'active') === 'active');
  } else if (/e?\.?status\s*=\s*'left'/i.test(s)) {
    rows = rows.filter((e) => e.status === 'left');
  } else if (/e?\.?status\s*=\s*'archive'/i.test(s)) {
    rows = rows.filter((e) => e.status === 'archive');
  }

  // Extract inline single-quoted shift if present (attendance /meta)
  const inlineShift = s.match(/shift\s*=\s*'([^']*)'/i);
  if (inlineShift) rows = rows.filter((e) => String(e.shift || '') === inlineShift[1]);
  const inlineId = s.match(/AND\s+id\s*=\s*(\d+)/i);
  if (inlineId) rows = rows.filter((e) => Number(e.id) === Number(inlineId[1]));

  // Positional parameters in order of appearance
  const tokens = [...s.matchAll(/(\b(?:e\.)?id\s*=\s*\$\d+|(?:e\.)?shift\s*=\s*ANY\(\$\d+::text\[\]\)|COALESCE\((?:e\.)?(company|department|shift),''\)\s*IN\s*\((?:\$\d+,?\s*)+\)|(?:e\.)?shift\s*IN\s*\((?:\$\d+,?\s*)+\)|(?:e\.)?shift\s*=\s*\$\d+|CAST\((?:e\.)?id AS TEXT\)\s*LIKE\s*\$\d+|e?\.?education\s*=\s*'([^']+)'|UPPER\(e\.company\)\s*LIKE\s*'%SMART%'|UPPER\(e\.company\)\s*LIKE\s*'%BRAVOS%')/gi)];
  for (const m of tokens) {
    const frag = m[0];
    if (/UPPER\(e\.company\)\s*LIKE\s*'%SMART%'/i.test(frag)) {
      rows = rows.filter((e) => {
        const u = String(e.company || '').toUpperCase();
        return u.includes('SMART') || u === 'SB';
      });
    } else if (/UPPER\(e\.company\)\s*LIKE\s*'%BRAVOS%'/i.test(frag)) {
      rows = rows.filter((e) => String(e.company || '').toUpperCase().includes('BRAVOS'));
    } else if (/education\s*=\s*'([^']+)'/i.test(frag)) {
      const edu = frag.match(/'([^']+)'/)[1];
      rows = rows.filter((e) => e.education === edu);
    } else if (/ANY\(\$(\d+)/i.test(frag)) {
      const pIdx = Number(frag.match(/\$(\d+)/)[1]) - 1;
      const arr = Array.isArray(params[pIdx]) ? params[pIdx] : [params[pIdx]];
      rows = rows.filter((e) => arr.includes(String(e.shift || '')));
    } else if (/IN\s*\(/i.test(frag)) {
      const pNums = [...frag.matchAll(/\$(\d+)/g)].map((x) => params[Number(x[1]) - 1]);
      const colMatch = frag.match(/COALESCE\((?:e\.)?(company|department|shift)/i);
      const col = colMatch ? colMatch[1].toLowerCase() : 'shift';
      rows = rows.filter((e) => pNums.includes(String(e[col] || '')));
    } else if (/CAST\((?:e\.)?id AS TEXT\)\s*LIKE/i.test(frag)) {
      const pNums = [...s.slice(m.index).matchAll(/\$(\d+)/g)];
      const q = params[Number(pNums[0][1]) - 1];
      rows = rows.filter((e) => likeMatch(String(e.id), q) || likeMatch(e.name, q));
    } else if (/shift\s*=\s*\$(\d+)/i.test(frag)) {
      const pIdx = Number(frag.match(/\$(\d+)/)[1]) - 1;
      rows = rows.filter((e) => String(e.shift || '') === String(params[pIdx] || ''));
    } else if (/id\s*=\s*\$(\d+)/i.test(frag)) {
      const pIdx = Number(frag.match(/\$(\d+)/)[1]) - 1;
      rows = rows.filter((e) => Number(e.id) === Number(params[pIdx]));
    }
    idx++;
  }
  return rows;
}

function filterStageDailyWithEmployees(sql, params) {
  const empById = new Map(store.employees.map((e) => [e.id, e]));
  let rows = store.stage_daily
    .map((sd) => ({ sd, e: empById.get(sd.employee_id) }))
    .filter((x) => Boolean(x.e));

  if (/e\.role\s*=\s*'employee'/i.test(sql)) {
    rows = rows.filter((x) => x.e.role === 'employee');
  }
  if (/sd\.stage\s*=\s*'الحضور'/i.test(sql)) {
    rows = rows.filter((x) => x.sd.stage === 'الحضور');
  }
  if (/sd\.stage\s*NOT\s*IN\s*\('الحضور',\s*'TOTAL TARGET %'\)/i.test(sql)) {
    rows = rows.filter((x) => x.sd.stage !== 'الحضور' && x.sd.stage !== 'TOTAL TARGET %');
  }
  if (/TRIM\(COALESCE\(sd\.value_text,\s*''\)\)\s*=\s*'ب'/i.test(sql)) {
    rows = rows.filter((x) => String(x.sd.value_text || '').trim() === 'ب');
  }

  // Apply positional conditions
  const condRegex = /(e\.id\s*=\s*\$\d+|e\.shift\s*=\s*\$\d+|e\.shift\s*IN\s*\((?:\$\d+,?\s*)+\)|sd\.stage\s*IN\s*\((?:\$\d+,?\s*)+\)|COALESCE\(e\.(company|department|shift),''\)\s*IN\s*\((?:\$\d+,?\s*)+\)|sd\.entry_date\s*>=\s*\$\d+|sd\.entry_date\s*<=\s*\$\d+|CAST\(e\.id AS TEXT\)\s*LIKE\s*\$\d+)/gi;
  for (const m of sql.matchAll(condRegex)) {
    const frag = m[0];
    if (/e\.id\s*=\s*\$(\d+)/i.test(frag)) {
      const v = Number(params[Number(frag.match(/\$(\d+)/)[1]) - 1]);
      rows = rows.filter((x) => x.e.id === v);
    } else if (/e\.shift\s*=\s*\$(\d+)/i.test(frag)) {
      const v = String(params[Number(frag.match(/\$(\d+)/)[1]) - 1] || '');
      rows = rows.filter((x) => String(x.e.shift || '') === v);
    } else if (/e\.shift\s*IN/i.test(frag)) {
      const vals = [...frag.matchAll(/\$(\d+)/g)].map((p) => params[Number(p[1]) - 1]);
      rows = rows.filter((x) => vals.includes(x.e.shift));
    } else if (/sd\.stage\s*IN/i.test(frag)) {
      const vals = [...frag.matchAll(/\$(\d+)/g)].map((p) => params[Number(p[1]) - 1]);
      rows = rows.filter((x) => vals.includes(x.sd.stage));
    } else if (/COALESCE\(e\.(company|department|shift)/i.test(frag)) {
      const col = frag.match(/COALESCE\(e\.(company|department|shift)/i)[1].toLowerCase();
      const vals = [...frag.matchAll(/\$(\d+)/g)].map((p) => params[Number(p[1]) - 1]);
      rows = rows.filter((x) => vals.includes(String(x.e[col] || '')));
    } else if (/sd\.entry_date\s*>=\s*\$(\d+)/i.test(frag)) {
      const v = String(params[Number(frag.match(/\$(\d+)/)[1]) - 1]);
      rows = rows.filter((x) => x.sd.entry_date >= v);
    } else if (/sd\.entry_date\s*<=\s*\$(\d+)/i.test(frag)) {
      const v = String(params[Number(frag.match(/\$(\d+)/)[1]) - 1]);
      rows = rows.filter((x) => x.sd.entry_date <= v);
    } else if (/CAST\(e\.id AS TEXT\)\s*LIKE\s*\$(\d+)/i.test(frag)) {
      const v = params[Number(frag.match(/\$(\d+)/)[1]) - 1];
      rows = rows.filter((x) => likeMatch(String(x.e.id), v) || likeMatch(x.e.name, v));
    }
  }

  // Handle attendance status filter from attendance.js: AND ((...) OR (...))
  const statusConds = [];
  if (/\(sd\.value_num IN \(0\.5,1,1\.5\)\)/i.test(sql) && /WHERE[\s\S]*AND\s*\(/i.test(sql)) {
    const afterWhere = sql.split(/WHERE/i)[1] || '';
    const statusChunkMatch = afterWhere.match(/AND\s*\(((?:[\s\S](?!GROUP BY|ORDER BY))+)\)/i);
    if (statusChunkMatch && /value_num|value_text/i.test(statusChunkMatch[1])) {
      const chunk = statusChunkMatch[1];
      if (/0\.5,1,1\.5/.test(chunk)) statusConds.push('present');
      if (/value_num=0/.test(chunk)) statusConds.push('casual');
      if (/='ا'/.test(chunk)) statusConds.push('permission');
      if (/='ب'/.test(chunk)) statusConds.push('unauthorized');
      if (/='م'/.test(chunk)) statusConds.push('medical');
    }
  }
  if (statusConds.length) {
    rows = rows.filter((x) => {
      const f = attendanceFlags(x.sd);
      return (
        (statusConds.includes('present') && f.isPresent) ||
        (statusConds.includes('casual') && f.isCasual) ||
        (statusConds.includes('permission') && f.isPermission) ||
        (statusConds.includes('unauthorized') && f.isUnauthorized) ||
        (statusConds.includes('medical') && f.isMedical)
      );
    });
  }

  return rows;
}

async function query(rawSql, params = []) {
  const sql = String(rawSql || '').replace(/\s+/g, ' ').trim();
  const sLow = sql.toLowerCase();

  // 1. Auth & employee single-row / list queries
  if (/^select \* from employees where id = \$1$/i.test(sql)) {
    const emp = store.employees.find((e) => e.id === Number(params[0]));
    return { rows: emp ? [{ ...emp }] : [], rowCount: emp ? 1 : 0 };
  }
  if (/from employees where id = \$1 and role = 'employee'/i.test(sql)) {
    const emp = store.employees.find((e) => e.id === Number(params[0]) && e.role === 'employee');
    return { rows: emp ? [{ ...emp }] : [], rowCount: emp ? 1 : 0 };
  }
  if (/select id, name, role, shift, supervisor_shifts, company, department from employees where id = \$1$/i.test(sql)) {
    const emp = store.employees.find((e) => e.id === Number(params[0]));
    return { rows: emp ? [{ ...emp }] : [], rowCount: emp ? 1 : 0 };
  }
  if (/select id, role(, shift(, left_date, departure_reason, status)?)? from employees where id = \$1/i.test(sql)) {
    const emp = store.employees.find((e) => e.id === Number(params[0]));
    return { rows: emp ? [{ ...emp }] : [], rowCount: emp ? 1 : 0 };
  }
  if (/select id from employees where id = \$1$/i.test(sql)) {
    const emp = store.employees.find((e) => e.id === Number(params[0]));
    return { rows: emp ? [{ id: emp.id }] : [], rowCount: emp ? 1 : 0 };
  }
  if (/select password_hash from employees where id = \$1$/i.test(sql)) {
    const emp = store.employees.find((e) => e.id === Number(params[0]));
    return { rows: emp ? [{ password_hash: emp.password_hash }] : [], rowCount: emp ? 1 : 0 };
  }
  if (/select id, name, role, shift, company, department, must_change_password from employees where id = \$1/i.test(sql)) {
    const emp = store.employees.find((e) => e.id === Number(params[0]));
    return { rows: emp ? [{ ...emp }] : [], rowCount: emp ? 1 : 0 };
  }
  if (/select id, emp_num, name, education, residence, company, shift, department from employees where id = \$1/i.test(sql)) {
    const emp = store.employees.find((e) => e.id === Number(params[0]));
    return { rows: emp ? [{ ...emp }] : [], rowCount: emp ? 1 : 0 };
  }
  if (/select id, name, shift, company, department from employees where id = \$1$/i.test(sql)) {
    const emp = store.employees.find((e) => e.id === Number(params[0]));
    return { rows: emp ? [{ ...emp }] : [], rowCount: emp ? 1 : 0 };
  }
  if (/select id, name, shift from employees where id = \$1 and role = 'employee'/i.test(sql)) {
    const emp = store.employees.find((e) => e.id === Number(params[0]) && e.role === 'employee');
    return { rows: emp ? [{ ...emp }] : [], rowCount: emp ? 1 : 0 };
  }
  if (/select id from employees where role in \('system_creator','admin'\)/i.test(sql)) {
    const admins = store.employees
      .filter((e) => e.role === 'system_creator' || e.role === 'admin')
      .sort((a, b) => (a.role === 'system_creator' ? 0 : 1) - (b.role === 'system_creator' ? 0 : 1) || a.id - b.id);
    return { rows: admins.length ? [{ id: admins[0].id }] : [], rowCount: admins.length ? 1 : 0 };
  }
  if (/select id from employees where role = 'system_creator' limit 1/i.test(sql)) {
    const c = store.employees.find((e) => e.role === 'system_creator');
    return { rows: c ? [{ id: c.id }] : [], rowCount: c ? 1 : 0 };
  }
  if (/from employees where id = \$1$/i.test(sql)) {
    const emp = store.employees.find((e) => e.id === Number(params[0]));
    return { rows: emp ? [{ ...emp }] : [], rowCount: emp ? 1 : 0 };
  }
  if (/select id from employees where role = any\(\$1::text\[\]\)/i.test(sql)) {
    const roles = Array.isArray(params[0]) ? params[0] : [];
    const rows = store.employees.filter((e) => roles.includes(e.role)).map((e) => ({ id: e.id }));
    return { rows, rowCount: rows.length };
  }
  if (/select id from employees where role in \('admin','system_creator'\)/i.test(sql)) {
    const shiftVal = String(params[0] || '');
    const rows = store.employees
      .filter((e) =>
        e.role === 'admin' ||
        e.role === 'system_creator' ||
        (e.role === 'supervisor' && (e.shift === shiftVal || (e.supervisor_shifts || []).includes(shiftVal)))
      )
      .map((e) => ({ id: e.id }));
    return { rows, rowCount: rows.length };
  }

  // 2. Employee lists / management / groups
  if (/from employees\b/i.test(sql) && /^select\b/i.test(sql) && !/join/i.test(sql) && !/count\(/i.test(sql) && !/distinct/i.test(sql)) {
    if (/where id in \(/i.test(sql)) {
      const idSet = new Set(params.map(Number));
      const rows = store.employees
        .filter((e) => idSet.has(e.id) && (!/role = 'employee'/i.test(sql) || e.role === 'employee'))
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'));
      return { rows: rows.map((e) => ({ ...e })), rowCount: rows.length };
    }
    const rows = filterEmployeesWhere(sql, params, store.employees)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'));
    return { rows: rows.map((e) => ({ ...e })), rowCount: rows.length };
  }

  // 3. COUNT(*) FROM employees
  if (/select count\(\*\)(?:::int)?(?: as)? c from employees\b/i.test(sql) && !/group by/i.test(sql)) {
    if (/created_at >=/i.test(sql)) {
      const now = new Date();
      const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
      let rows = store.employees.filter((e) => e.role === 'employee' && String(e.created_at || '') >= monthStart);
      if (/e\.shift = \$1/i.test(sql)) rows = rows.filter((e) => e.shift === params[0]);
      return { rows: [{ c: rows.length }], rowCount: 1 };
    }
    const rows = filterEmployeesWhere(sql, params, store.employees);
    return { rows: [{ c: rows.length }], rowCount: 1 };
  }

  // 4. DISTINCT metadata queries
  if (/select distinct stage from stage_daily/i.test(sql)) {
    const excludeAtt = /not in \('الحضور'/i.test(sql);
    const stages = [
      ...new Set(
        store.stage_daily
          .map((d) => d.stage)
          .filter(
            (st) =>
              st &&
              String(st).trim() !== '' &&
              st !== 'TOTAL TARGET %' &&
              (!excludeAtt || st !== 'الحضور')
          )
      ),
    ].sort();
    return { rows: stages.map((stage) => ({ stage })), rowCount: stages.length };
  }
  if (/select distinct stage from employee_stage_targets/i.test(sql)) {
    const stages = [
      ...new Set(
        store.employee_stage_targets
          .map((d) => d.stage)
          .filter((st) => st && String(st).trim() !== '' && st !== 'الحضور' && st !== 'TOTAL TARGET %')
      ),
    ].sort();
    return { rows: stages.map((stage) => ({ stage })), rowCount: stages.length };
  }
  if (/select entry_date::text as entry_date, value_num, value_text from stage_daily where employee_id = \$1 and stage = 'الحضور'/i.test(sql)) {
    const empId = Number(params[0]);
    const rows = store.stage_daily
      .filter((d) => d.employee_id === empId && d.stage === 'الحضور')
      .sort((a, b) => String(b.entry_date).localeCompare(String(a.entry_date)))
      .map((d) => ({ entry_date: d.entry_date, value_num: d.value_num, value_text: d.value_text }));
    return { rows, rowCount: rows.length };
  }
  if (/select distinct entry_date from stage_daily/i.test(sql)) {
    let items = store.stage_daily;
    if (/stage='الحضور'/i.test(sql)) items = items.filter((d) => d.stage === 'الحضور');
    const dates = [...new Set(items.map((d) => d.entry_date).filter(Boolean))].sort();
    return { rows: dates.map((entry_date) => ({ entry_date })), rowCount: dates.length };
  }
  if (/select distinct shift from employees/i.test(sql)) {
    const shifts = [...new Set(store.employees.filter((e) => e.role === 'employee' && e.shift && String(e.shift).trim() !== '').map((e) => e.shift))].sort();
    return { rows: shifts.map((shift) => ({ shift })), rowCount: shifts.length };
  }
  if (/select distinct coalesce\((company|department|shift),''\) v from employees/i.test(sql)) {
    const col = sql.match(/coalesce\((company|department|shift),''\)/i)[1].toLowerCase();
    const rows = filterEmployeesWhere(sql, params, store.employees);
    const vals = [...new Set(rows.map((e) => String(e[col] || '')))].sort();
    return { rows: vals.map((v) => ({ v })), rowCount: vals.length };
  }
  if (/select distinct month_start from employee_monthly_summary/i.test(sql)) {
    const ms = [...new Set(store.employee_monthly_summary.map((r) => r.month_start))].sort().reverse();
    return { rows: ms.map((month_start) => ({ month_start })), rowCount: ms.length };
  }
  if (/select distinct section from supervisor_targets/i.test(sql)) {
    const secs = [...new Set(store.supervisor_targets.map((r) => r.section).filter(Boolean))].sort();
    return { rows: secs.map((section) => ({ section })), rowCount: secs.length };
  }

  // 5. Attendance min/max date
  if (/select min\(entry_date\) min,max\(entry_date\) max from stage_daily/i.test(sql)) {
    const dates = store.stage_daily.filter((d) => d.stage === 'الحضور').map((d) => d.entry_date).sort();
    return { rows: [{ min: dates[0] || null, max: dates[dates.length - 1] || null }], rowCount: 1 };
  }

  // 6. Attendance route queries (grouped & totals)
  if (/from stage_daily sd join employees e on e\.id\s*=\s*sd\.employee_id/i.test(sql)) {
    const joined = filterStageDailyWithEmployees(sql, params);

    // computeTop5ByStage
    if (/select sd\.employee_id, e\.name, e\.company, e\.shift, sd\.stage, sd\.entry_date/i.test(sql)) {
      const out = joined
        .map((x) => ({
          employee_id: x.sd.employee_id,
          name: x.e.name,
          company: x.e.company,
          shift: x.e.shift,
          stage: x.sd.stage,
          entry_date: x.sd.entry_date,
          value_num: x.sd.value_num !== null && x.sd.value_num !== undefined ? x.sd.value_num : null,
        }))
        .sort((a, b) => a.stage.localeCompare(b.stage) || a.employee_id - b.employee_id || a.entry_date.localeCompare(b.entry_date));
      return { rows: out, rowCount: out.length };
    }

    // dashboard attendance summary
    if (/as present_days, count\(case when sd\.value_num = 0/i.test(sql)) {
      let present_days = 0, absent_days = 0;
      const distinctPresent = new Set();
      for (const { sd } of joined) {
        if (sd.value_num === 0.5 || sd.value_num === 1 || sd.value_num === 1.5) {
          present_days += sd.value_num;
          distinctPresent.add(`${sd.employee_id}:${sd.entry_date}`);
        }
        if (sd.value_num === 0) absent_days += 1;
      }
      return {
        rows: [{
          present_days,
          absent_days,
          attendance_entries: joined.length,
          distinct_present_days: distinctPresent.size,
        }],
        rowCount: 1,
      };
    }

    // dashboard attendanceByEmployee
    if (/select sd\.employee_id as id, coalesce\(sum\(/i.test(sql)) {
      const map = new Map();
      for (const { sd } of joined) {
        const add = (sd.value_num === 0.5 || sd.value_num === 1 || sd.value_num === 1.5) ? sd.value_num : 0;
        map.set(sd.employee_id, (map.get(sd.employee_id) || 0) + add);
      }
      const rows = [...map.entries()].map(([id, present_days]) => ({ id, present_days }));
      return { rows, rowCount: rows.length };
    }

    // dashboard unauthorizedAbsenceEmployees
    if (/as unauthorized_days,/i.test(sql)) {
      const map = new Map();
      for (const { sd, e } of joined) {
        if (!map.has(e.id)) {
          map.set(e.id, {
            id: e.id, name: e.name, company: e.company, shift: e.shift, department: e.department,
            unauthorized_days: 0, first_absence: sd.entry_date, last_absence: sd.entry_date,
          });
        }
        const rec = map.get(e.id);
        rec.unauthorized_days += 1;
        if (sd.entry_date < rec.first_absence) rec.first_absence = sd.entry_date;
        if (sd.entry_date > rec.last_absence) rec.last_absence = sd.entry_date;
      }
      const rows = [...map.values()]
        .filter((r) => r.unauthorized_days >= 3)
        .sort((a, b) => b.unauthorized_days - a.unauthorized_days || String(a.name).localeCompare(String(b.name), 'ar'));
      return { rows, rowCount: rows.length };
    }

    // attendance totals
    if (/select count\(\*\) total,sum\(/i.test(sql)) {
      let present = 0, absent = 0, casual = 0, permission = 0, unauthorized = 0, medical = 0;
      for (const { sd } of joined) {
        const f = attendanceFlags(sd);
        if (f.isPresent) present += sd.value_num;
        if (f.isAbsent) absent += 1;
        if (f.isCasual) casual += 1;
        if (f.isPermission) permission += 1;
        if (f.isUnauthorized) unauthorized += 1;
        if (f.isMedical) medical += 1;
      }
      return { rows: [{ total: joined.length, present, absent, casual, permission, unauthorized, medical }], rowCount: 1 };
    }

    // attendance companies breakdown
    if (/graduate_present\b/i.test(sql)) {
      const map = new Map();
      for (const { sd, e } of joined) {
        const name = classifyCompany(e.company) || 'أخرى';
        if (!map.has(name)) {
          map.set(name, {
            name, total: 0, present: 0, absent: 0,
            graduate_present: 0, graduate_absent: 0, student_present: 0, student_absent: 0,
            casual: 0, permission: 0, unauthorized: 0, medical: 0,
          });
        }
        const r = map.get(name);
        const f = attendanceFlags(sd);
        r.total += 1;
        if (f.isPresent) r.present += sd.value_num;
        if (f.isAbsent) r.absent += 1;
        if (f.isCasual) r.casual += 1;
        if (f.isPermission) r.permission += 1;
        if (f.isUnauthorized) r.unauthorized += 1;
        if (f.isMedical) r.medical += 1;
        if (e.education === 'خريج') {
          if (f.isPresent) r.graduate_present += sd.value_num;
          else r.graduate_absent += 1;
        }
        if (e.education === 'طالب') {
          if (f.isPresent) r.student_present += sd.value_num;
          else r.student_absent += 1;
        }
      }
      const rows = [...map.values()].sort((a, b) => b.total - a.total);
      return { rows, rowCount: rows.length };
    }

    // attendance stage_matrix
    if (/coalesce\(nullif\(trim\(e\.department\),''\),'غير محدد'\)\s+(?:as\s+)?stage/i.test(sql)) {
      const map = new Map();
      for (const { sd, e } of joined) {
        const stage = (e.department && String(e.department).trim()) ? String(e.department).trim() : 'غير محدد';
        const company = classifyCompany(e.company) || '__OTHER__';
        const k = `${stage}||${company}`;
        if (!map.has(k)) map.set(k, { stage, company, present: 0, absent: 0 });
        const r = map.get(k);
        const f = attendanceFlags(sd);
        if (f.isPresent) r.present += sd.value_num;
        else r.absent += 1;
      }
      const rows = [...map.values()];
      return { rows, rowCount: rows.length };
    }

    // attendance daily
    if (/select sd\.entry_date date,count\(\*\) total/i.test(sql)) {
      const map = new Map();
      for (const { sd } of joined) {
        if (!map.has(sd.entry_date)) {
          map.set(sd.entry_date, { date: sd.entry_date, total: 0, present: 0, absent: 0, casual: 0, permission: 0, unauthorized: 0, medical: 0 });
        }
        const r = map.get(sd.entry_date);
        const f = attendanceFlags(sd);
        r.total += 1;
        if (f.isPresent) r.present += sd.value_num;
        if (f.isAbsent) r.absent += 1;
        if (f.isCasual) r.casual += 1;
        if (f.isPermission) r.permission += 1;
        if (f.isUnauthorized) r.unauthorized += 1;
        if (f.isMedical) r.medical += 1;
      }
      const rows = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
      return { rows, rowCount: rows.length };
    }

    // attendance employeeRows
    if (/attendance_days\b/i.test(sql)) {
      const sumById = new Map(store.employee_summary.map((s) => [s.employee_id, s]));
      const map = new Map();
      for (const { sd, e } of joined) {
        if (!map.has(e.id)) {
          const es = sumById.get(e.id);
          map.set(e.id, {
            id: e.id, name: e.name, company: e.company, shift: e.shift, department: e.department,
            present: 0, absent: 0, casual: 0, permission: 0, unauthorized: 0, medical: 0,
            master_present_value: es ? es.total_present_days : null, attendance_days: 0,
          });
        }
        const r = map.get(e.id);
        const f = attendanceFlags(sd);
        r.attendance_days += 1;
        if (f.isPresent) r.present += sd.value_num;
        if (f.isAbsent) r.absent += 1;
        if (f.isCasual) r.casual += 1;
        if (f.isPermission) r.permission += 1;
        if (f.isUnauthorized) r.unauthorized += 1;
        if (f.isMedical) r.medical += 1;
      }
      const rows = [...map.values()].sort((a, b) => b.absent - a.absent || String(a.name).localeCompare(String(b.name), 'ar'));
      return { rows, rowCount: rows.length };
    }

    // report/attendance employee IDs
    if (/select distinct sd\.employee_id from stage_daily sd/i.test(sql)) {
      const from = String(params[0]);
      const to = String(params[1]);
      let items = joined.filter((x) => x.sd.entry_date >= from && x.sd.entry_date <= to);
      const rest = params.slice(2);
      // Params after [from, to]: stages, then optional shift(s) or employee id
      const stagesCount = (sql.match(/sd\.stage IN \(([^)]+)\)/i)?.[1].match(/\$/g) || []).length;
      const stages = rest.slice(0, stagesCount);
      if (stages.length) items = items.filter((x) => stages.includes(x.sd.stage));
      const afterStages = rest.slice(stagesCount);
      if (/e\.shift = \$/i.test(sql) && afterStages.length) {
        items = items.filter((x) => String(x.e.shift || '') === String(afterStages[0] || ''));
      } else if (/e\.id = \$/i.test(sql) && afterStages.length) {
        items = items.filter((x) => x.e.id === Number(afterStages[0]));
      } else if (/e\.shift IN/i.test(sql) && afterStages.length) {
        items = items.filter((x) => afterStages.includes(x.e.shift));
      }
      const ids = [...new Set(items.map((x) => x.sd.employee_id))];
      return { rows: ids.map((employee_id) => ({ employee_id })), rowCount: ids.length };
    }
  }

  // attendance company employee_count
  if (/name,count\(\*\) employee_count from employees/i.test(sql)) {
    const rows = filterEmployeesWhere(sql, params, store.employees);
    const counts = new Map();
    for (const e of rows) {
      const name = classifyCompany(e.company) || 'أخرى';
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    const out = [...counts.entries()].map(([name, employee_count]) => ({ name, employee_count }));
    return { rows: out, rowCount: out.length };
  }

  // 7. Single employee detail queries
  if (/select max\(entry_date\) as d from stage_daily where employee_id = \$1/i.test(sql)) {
    const empId = Number(params[0]);
    const dates = store.stage_daily.filter((d) => d.employee_id === empId).map((d) => d.entry_date).sort();
    return { rows: [{ d: dates.length ? dates[dates.length - 1] : null }], rowCount: 1 };
  }
  if (/from employee_monthly_summary where employee_id = \$1/i.test(sql)) {
    const [empId, mFrom, mTo] = params;
    const rows = store.employee_monthly_summary
      .filter((r) => r.employee_id === Number(empId) && r.month_start >= mFrom && r.month_start < mTo)
      .sort((a, b) => b.month_start.localeCompare(a.month_start));
    return { rows: rows.slice(0, 1), rowCount: rows.length ? 1 : 0 };
  }
  if (/from employee_summary where employee_id = \$1/i.test(sql)) {
    const row = store.employee_summary.find((r) => r.employee_id === Number(params[0]));
    return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
  }
  if (/select stage, entry_date, value_num, value_text from stage_daily where employee_id = \$1/i.test(sql)) {
    const empId = Number(params[0]);
    let idx = 1;
    let items = store.stage_daily.filter((d) => d.employee_id === empId);
    if (/entry_date >= \$/i.test(sql)) { const v = params[idx++]; items = items.filter((d) => d.entry_date >= v); }
    if (/entry_date <= \$/i.test(sql)) { const v = params[idx++]; items = items.filter((d) => d.entry_date <= v); }
    if (/stage = \$/i.test(sql)) { const v = params[idx++]; items = items.filter((d) => d.stage === v); }
    items = items.slice().sort((a, b) => a.stage.localeCompare(b.stage) || a.entry_date.localeCompare(b.entry_date));
    return { rows: items.map((d) => ({ ...d })), rowCount: items.length };
  }
  if (/from stage_daily where employee_id = \$1 and stage = 'الحضور'/i.test(sql)) {
    const empId = Number(params[0]);
    let idx = 1;
    let items = store.stage_daily.filter((d) => d.employee_id === empId && d.stage === 'الحضور');
    if (/entry_date >= \$/i.test(sql)) { const v = params[idx++]; items = items.filter((d) => d.entry_date >= v); }
    if (/entry_date <= \$/i.test(sql)) { const v = params[idx++]; items = items.filter((d) => d.entry_date <= v); }
    let present_days = 0, casual_leave = 0, leave_with_permission = 0, leave_without_permission = 0, sick_leave = 0;
    for (const d of items) {
      const f = attendanceFlags(d);
      if (f.isPresent) present_days += d.value_num;
      if (f.isCasual) casual_leave += 1;
      if (f.isPermission) leave_with_permission += 1;
      if (f.isUnauthorized) leave_without_permission += 1;
      if (f.isMedical) sick_leave += 1;
    }
    return { rows: [{ present_days, casual_leave, leave_with_permission, leave_without_permission, sick_leave }], rowCount: 1 };
  }
  if (/select coalesce\(sum\(value_num\),0\) t from stage_daily where employee_id = \$1/i.test(sql)) {
    const empId = Number(params[0]);
    const hasStageIn = /stage in \(/i.test(sql);
    const stages = hasStageIn ? params.slice(1, params.length - 2) : [];
    const from = params[params.length - 2];
    const to = params[params.length - 1];
    let sum = 0;
    for (const d of store.stage_daily) {
      if (d.employee_id !== empId) continue;
      if (d.entry_date < from || d.entry_date > to) continue;
      if (hasStageIn && !stages.includes(d.stage)) continue;
      if (typeof d.value_num === 'number') sum += d.value_num;
    }
    return { rows: [{ t: sum }], rowCount: 1 };
  }
  if (/select stage, target_monthly, month_start, source_formula from employee_stage_targets/i.test(sql)) {
    const empId = Number(params[0]);
    const shift = String(params[1]);
    let rows = store.employee_stage_targets.filter((t) => t.employee_id === empId && t.shift === shift);
    if (/month_start >=/i.test(sql)) rows = rows.filter((t) => t.month_start >= params[2] && t.month_start < params[3]);
    else if (/month_start <=/i.test(sql)) rows = rows.filter((t) => t.month_start <= params[2]);
    rows = rows.slice().sort((a, b) => b.month_start.localeCompare(a.month_start));
    return { rows, rowCount: rows.length };
  }
  if (/select profile_json from employee_shift_profiles where employee_id = \$1 and shift = \$2/i.test(sql)) {
    const row = store.employee_shift_profiles.find((r) => r.employee_id === Number(params[0]) && r.shift === params[1]);
    return { rows: row ? [{ profile_json: row.profile_json }] : [], rowCount: row ? 1 : 0 };
  }
  if (/select shift, profile_json from employee_shift_profiles where employee_id = \$1/i.test(sql)) {
    const order = { A: 1, B: 2, C: 3, D: 4 };
    const rows = store.employee_shift_profiles
      .filter((r) => r.employee_id === Number(params[0]))
      .sort((a, b) => (order[a.shift] || 5) - (order[b.shift] || 5) || a.shift.localeCompare(b.shift));
    return { rows, rowCount: rows.length };
  }
  if (/from supervisor_targets where employee_id = \$1/i.test(sql)) {
    let idx = 1;
    let rows = store.supervisor_targets.filter((r) => r.employee_id === Number(params[0]));
    if (/entry_date >= \$/i.test(sql)) { const v = params[idx++]; rows = rows.filter((r) => r.entry_date >= v); }
    if (/entry_date <= \$/i.test(sql)) { const v = params[idx++]; rows = rows.filter((r) => r.entry_date <= v); }
    return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
  }
  if (/from supervisor_targets where employee_id is null/i.test(sql)) {
    let idx = 0;
    let rows = store.supervisor_targets.filter((r) => r.employee_id === null);
    if (/entry_date >= \$/i.test(sql)) { const v = params[idx++]; rows = rows.filter((r) => r.entry_date >= v); }
    if (/entry_date <= \$/i.test(sql)) { const v = params[idx++]; rows = rows.filter((r) => r.entry_date <= v); }
    return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
  }

  // 8. System settings (permissions & banner)
  if (/select value_json from system_settings where key =/i.test(sql)) {
    const key = /key = 'home_banner'/i.test(sql) ? 'home_banner' : params[0];
    const row = store.system_settings.find((r) => r.key === key);
    return { rows: row ? [{ value_json: row.value_json }] : [], rowCount: row ? 1 : 0 };
  }
  if (/insert into system_settings/i.test(sql)) {
    const isBanner = /'home_banner'/i.test(sql);
    const key = isBanner ? 'home_banner' : params[0];
    const rawVal = isBanner ? params[0] : params[1];
    const updatedBy = isBanner ? params[1] : params[2];
    const valObj = typeof rawVal === 'string' ? JSON.parse(rawVal) : rawVal;
    const existing = store.system_settings.find((r) => r.key === key);
    if (existing) {
      existing.value_json = valObj;
      existing.updated_by = updatedBy;
      existing.updated_at = new Date().toISOString();
    } else {
      store.system_settings.push({ key, value_json: valObj, updated_by: updatedBy, updated_at: new Date().toISOString() });
    }
    return { rows: [], rowCount: 1 };
  }
  if (/delete from system_settings where key = 'home_banner'/i.test(sql)) {
    const prev = store.system_settings.length;
    store.system_settings = store.system_settings.filter((r) => r.key !== 'home_banner');
    return { rows: [], rowCount: prev - store.system_settings.length };
  }

  // 9. Audit logs & Login audit & Import history
  if (/insert into login_audit/i.test(sql)) {
    store.login_audit.push({
      id: store.seq.login_audit++,
      employee_id: params[0],
      success: params[1],
      ip: params[2],
      ts: new Date().toISOString(),
    });
    return { rows: [], rowCount: 1 };
  }
  if (/insert into audit_logs/i.test(sql)) {
    const actionLit = sql.match(/'login_success'/i) ? 'login_success' : null;
    const entityLit = sql.match(/'(auth|missing_data_request|employee_request)'/i)?.[1] || null;
    let rec;
    if (actionLit === 'login_success') {
      rec = {
        id: store.seq.audit_logs++,
        actor_id: params[0], actor_name: params[1], action: 'login_success',
        entity_type: 'auth', entity_id: params[2],
        details_json: typeof params[3] === 'string' ? JSON.parse(params[3]) : params[3],
        ip: params[4], created_at: new Date().toISOString(),
      };
    } else if (entityLit === 'missing_data_request' || entityLit === 'employee_request') {
      rec = {
        id: store.seq.audit_logs++,
        actor_id: params[0], actor_name: params[1], action: params[2],
        entity_type: entityLit, entity_id: params[3],
        details_json: typeof params[4] === 'string' ? JSON.parse(params[4]) : params[4],
        ip: params[5], created_at: new Date().toISOString(),
      };
    } else {
      rec = {
        id: store.seq.audit_logs++,
        actor_id: params[0], actor_name: params[1], action: params[2],
        entity_type: params[3], entity_id: params[4],
        details_json: typeof params[5] === 'string' ? JSON.parse(params[5]) : params[5],
        ip: params[6], created_at: new Date().toISOString(),
      };
    }
    store.audit_logs.unshift(rec);
    return { rows: [], rowCount: 1 };
  }
  if (/from audit_logs order by created_at desc/i.test(sql)) {
    const limit = Number(params[0] || 200);
    return { rows: store.audit_logs.slice(0, limit), rowCount: Math.min(store.audit_logs.length, limit) };
  }
  if (/insert into import_history/i.test(sql)) {
    store.import_history.unshift({
      id: store.seq.import_history++,
      imported_by: params[0], imported_by_name: params[1], filename: params[2], month_start: params[3],
      updated_count: params[4], created_count: params[5], daily_count: params[6], skipped_count: params[7],
      supervisor_linked: params[8], supervisor_unmatched: params[9], status: 'success',
      details_json: typeof params[10] === 'string' ? JSON.parse(params[10]) : params[10],
      created_at: new Date().toISOString(),
    });
    return { rows: [], rowCount: 1 };
  }
  if (/from import_history/i.test(sql)) {
    return { rows: store.import_history.slice(0, 100), rowCount: Math.min(store.import_history.length, 100) };
  }

  // 10. Notifications
  if (/insert into notifications/i.test(sql)) {
    const [ids, type, title, body, link] = params;
    for (const uid of ids || []) {
      store.notifications.unshift({
        id: store.seq.notifications++,
        user_id: Number(uid),
        type, title, body, link,
        is_read: false,
        created_at: new Date().toISOString(),
      });
    }
    return { rows: [], rowCount: (ids || []).length };
  }
  if (/from notifications where user_id = \$1 order by/i.test(sql)) {
    const uid = Number(params[0]);
    const rows = store.notifications.filter((n) => n.user_id === uid).slice(0, 30);
    return { rows, rowCount: rows.length };
  }
  if (/select count\(\*\)::int as c from notifications where user_id = \$1 and is_read = false/i.test(sql)) {
    const uid = Number(params[0]);
    const c = store.notifications.filter((n) => n.user_id === uid && !n.is_read).length;
    return { rows: [{ c }], rowCount: 1 };
  }
  if (/update notifications set is_read = true where user_id = \$1/i.test(sql)) {
    const uid = Number(params[0]);
    let changes = 0;
    store.notifications.forEach((n) => { if (n.user_id === uid && !n.is_read) { n.is_read = true; changes++; } });
    return { rows: [], rowCount: changes };
  }
  if (/update notifications set is_read = true where id = \$1 and user_id = \$2/i.test(sql)) {
    const [id, uid] = params.map(Number);
    let changes = 0;
    store.notifications.forEach((n) => { if (n.id === id && n.user_id === uid) { n.is_read = true; changes++; } });
    return { rows: [], rowCount: changes };
  }

  // 11. Employee mutations (role, password, profile, departure, delete, manual)
  if (/update employees set password_hash = \$1, must_change_password = false where id = \$2/i.test(sql)) {
    const emp = store.employees.find((e) => e.id === Number(params[1]));
    if (emp) { emp.password_hash = params[0]; emp.must_change_password = false; return { rows: [], rowCount: 1 }; }
    return { rows: [], rowCount: 0 };
  }
  if (/update employees set role = \$1, supervisor_shifts = \$2/i.test(sql)) {
    const emp = store.employees.find((e) => e.id === Number(params[2]));
    if (emp) { emp.role = params[0]; emp.supervisor_shifts = params[1] || []; return { rows: [], rowCount: 1 }; }
    return { rows: [], rowCount: 0 };
  }
  if (/update employees set status='left',left_date=\$1,departure_reason=\$2 where id=\$3/i.test(sql)) {
    const emp = store.employees.find((e) => e.id === Number(params[2]));
    if (emp) { emp.status = 'left'; emp.left_date = params[0]; emp.departure_reason = params[1]; return { rows: [], rowCount: 1 }; }
    return { rows: [], rowCount: 0 };
  }
  if (/update employees set status='active',left_date=null,departure_reason=null where id=\$1/i.test(sql)) {
    const emp = store.employees.find((e) => e.id === Number(params[0]) && e.role === 'employee');
    if (emp) { emp.status = 'active'; emp.left_date = null; emp.departure_reason = null; return { rows: [], rowCount: 1 }; }
    return { rows: [], rowCount: 0 };
  }
  if (/delete from employees where id = \$1/i.test(sql)) {
    const id = Number(params[0]);
    const prev = store.employees.length;
    store.employees = store.employees.filter((e) => e.id !== id);
    store.employee_summary = store.employee_summary.filter((s) => s.employee_id !== id);
    store.stage_daily = store.stage_daily.filter((d) => d.employee_id !== id);
    return { rows: [], rowCount: prev - store.employees.length };
  }
  if (/update employees set .* where id = \$\d+/i.test(sql)) {
    const id = Number(params[params.length - 1]);
    const emp = store.employees.find((e) => e.id === id);
    if (!emp) return { rows: [], rowCount: 0 };
    const setPart = sql.match(/set\s+([\s\S]+?)\s+where/i)?.[1] || '';
    const assigns = setPart.split(',').map((x) => x.trim());
    assigns.forEach((a) => {
      const m = a.match(/^([a-z_]+)\s*=\s*\$(\d+)$/i);
      if (m) emp[m[1]] = params[Number(m[2]) - 1];
      const f = a.match(/^([a-z_]+)\s*=\s*(false|true)$/i);
      if (f) emp[f[1]] = f[2].toLowerCase() === 'true';
    });
    return { rows: [], rowCount: 1 };
  }
  if (/insert into employees\b/i.test(sql) && /values\s*\(/i.test(sql)) {
    // Manual employee insert
    const [id, emp_num, name, education, residence, company, shift, department, password_hash] = params;
    const isLeft = /'left'/i.test(sql);
    const rec = {
      id: Number(id), emp_num: emp_num ?? id, name, education, residence, company,
      shift: shift || null, target_shift: normalizeShift(shift), department, password_hash,
      role: 'employee', must_change_password: false, status: isLeft ? 'left' : 'active',
      created_at: new Date().toISOString(), left_date: null, departure_reason: null, supervisor_shifts: [],
    };
    store.employees.push(rec);
    return { rows: [rec], rowCount: 1 };
  }

  // 12. Manual daily & summary & supervisor_targets
  if (/insert into stage_daily \(employee_id, stage, entry_date, value_num, value_text\) values/i.test(sql)) {
    const [employee_id, stage, entry_date, value_num, value_text] = params;
    const existing = store.stage_daily.find((d) => d.employee_id === Number(employee_id) && d.stage === stage && d.entry_date === entry_date);
    if (existing) {
      existing.value_num = value_num; existing.value_text = value_text;
    } else {
      store.stage_daily.push({ id: store.seq.stage_daily++, employee_id: Number(employee_id), stage, entry_date, value_num, value_text });
    }
    return { rows: [], rowCount: 1 };
  }
  if (/insert into stage_daily \(employee_id, stage, entry_date, value_num, value_text\) select \* from unnest/i.test(sql)) {
    const [empIds, stages, dates, nums, texts] = params;
    for (let i = 0; i < empIds.length; i++) {
      const existing = store.stage_daily.find((d) => d.employee_id === Number(empIds[i]) && d.stage === stages[i] && d.entry_date === dates[i]);
      if (existing) {
        existing.value_num = nums[i]; existing.value_text = texts[i];
      } else {
        store.stage_daily.push({ id: store.seq.stage_daily++, employee_id: Number(empIds[i]), stage: stages[i], entry_date: dates[i], value_num: nums[i], value_text: texts[i] });
      }
    }
    return { rows: [], rowCount: empIds.length };
  }
  if (/insert into employee_summary\b/i.test(sql) && /values\s*\(/i.test(sql)) {
    const cols = ['employee_id', 'total_achievement', 'total_target', 'percentage', 'bonus_tier', 'unauthorized_absence', 'total_absence', 'work_nature_allowance', 'monthly_target', 'total_present_days', 'total_absence_days', 'casual_leave', 'leave_with_permission', 'leave_without_permission', 'sick_leave', 'late_days', 'late_hours', 'overtime_days', 'overtime_hours', 'special_bonus_days', 'special_deductions'];
    const rec = {};
    cols.forEach((c, i) => { rec[c] = params[i] ?? null; });
    rec.employee_id = Number(rec.employee_id);
    const idx = store.employee_summary.findIndex((s) => s.employee_id === rec.employee_id);
    if (idx >= 0) store.employee_summary[idx] = rec; else store.employee_summary.push(rec);
    return { rows: [], rowCount: 1 };
  }
  if (/insert into supervisor_targets\b/i.test(sql) && /values\s*\(/i.test(sql)) {
    const [employee_id, supervisor_name, section, entry_date, target_daily, target_monthly, metrics_json] = params;
    const existing = store.supervisor_targets.find((r) => r.section === section && r.supervisor_name === supervisor_name && r.entry_date === entry_date);
    if (existing) {
      Object.assign(existing, { employee_id, target_daily, target_monthly, metrics_json });
    } else {
      store.supervisor_targets.push({ id: store.seq.supervisor_targets++, employee_id, supervisor_name, section, entry_date, target_daily, target_monthly, metrics_json });
    }
    return { rows: [], rowCount: 1 };
  }

  // 13. Missing Data Requests
  if (/from stage_daily where employee_id = \$1 and stage = \$2 and entry_date = \$3$/i.test(sql)) {
    const row = store.stage_daily.find((d) => d.employee_id === Number(params[0]) && d.stage === params[1] && d.entry_date === params[2]);
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }
  if (/select 1 as ok from stage_daily where employee_id = \$1 and stage = \$2/i.test(sql)) {
    const ok = store.stage_daily.some((d) => d.employee_id === Number(params[0]) && d.stage === params[1]);
    return { rows: ok ? [{ ok: 1 }] : [], rowCount: ok ? 1 : 0 };
  }
  if (/select 1 as ok from employee_stage_targets where employee_id = \$1 and stage = \$2/i.test(sql)) {
    const ok = store.employee_stage_targets.some((d) => d.employee_id === Number(params[0]) && d.stage === params[1]);
    return { rows: ok ? [{ ok: 1 }] : [], rowCount: ok ? 1 : 0 };
  }
  if (/from \(\s*select distinct stage from stage_daily where employee_id = \$1/i.test(sql)) {
    const empId = Number(params[0]);
    const excluded = params[2];
    const set = new Set([
      ...store.stage_daily.filter((d) => d.employee_id === empId).map((d) => d.stage),
      ...store.employee_stage_targets.filter((d) => d.employee_id === empId).map((d) => d.stage),
    ]);
    const rows = [...set].filter((st) => st && st !== excluded).sort().map((stage) => ({ stage }));
    return { rows, rowCount: rows.length };
  }
  if (/from missing_data_requests\b/i.test(sql)) {
    if (/where employee_id = \$1 and stage = \$2 and entry_date = \$3 and status = 'pending'/i.test(sql)) {
      const row = store.missing_data_requests.find((r) => r.employee_id === Number(params[0]) && r.stage === params[1] && r.entry_date === params[2] && r.status === 'pending');
      return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
    }
    if (/where id = \$1$/i.test(sql)) {
      const row = store.missing_data_requests.find((r) => r.id === Number(params[0]));
      return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
    }
    if (/where employee_id = \$1 order by/i.test(sql)) {
      const rows = store.missing_data_requests.filter((r) => r.employee_id === Number(params[0])).slice(0, 200);
      return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
    }
    if (/group by r\.status/i.test(sql)) {
      let rows = store.missing_data_requests;
      if (/ANY\(\$1/i.test(sql)) rows = rows.filter((r) => params[0].includes(String(r.shift || '')));
      const counts = {};
      rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
      return { rows: Object.entries(counts).map(([status, c]) => ({ status, c })), rowCount: Object.keys(counts).length };
    }
    if (/count\(\*\)::int as c from missing_data_requests where status = 'pending'/i.test(sql)) {
      let rows = store.missing_data_requests.filter((r) => r.status === 'pending');
      if (/ANY\(\$1/i.test(sql)) rows = rows.filter((r) => params[0].includes(String(r.shift || '')));
      return { rows: [{ c: rows.length }], rowCount: 1 };
    }
    // /review list
    let rows = store.missing_data_requests.slice();
    let idx = 0;
    if (/ANY\(\$/i.test(sql)) { const scope = params[idx++]; rows = rows.filter((r) => scope.includes(String(r.shift || ''))); }
    if (/r\.status = \$/i.test(sql)) { const st = params[idx++]; rows = rows.filter((r) => r.status === st); }
    const out = rows.slice(0, 500).map((r) => {
      const cur = store.stage_daily.find((d) => d.employee_id === r.employee_id && d.stage === r.stage && d.entry_date === r.entry_date);
      return { ...r, current_value: cur ? cur.value_num : null };
    });
    return { rows: out, rowCount: out.length };
  }
  if (/insert into missing_data_requests/i.test(sql)) {
    const [employee_id, employee_name, shift, entry_date, stage, quantity, reason_type, notes] = params;
    const rec = {
      id: store.seq.missing_data_requests++,
      employee_id: Number(employee_id), employee_name, shift, entry_date, stage, quantity, reason_type, notes,
      status: 'pending', old_value: null, new_value: null, old_text: null,
      reviewed_by: null, reviewed_by_name: null, reviewed_at: null, reject_reason: null,
      created_at: new Date().toISOString(),
    };
    store.missing_data_requests.unshift(rec);
    return { rows: [{ id: rec.id }], rowCount: 1 };
  }
  if (/update missing_data_requests/i.test(sql)) {
    if (/set status = 'cancelled'/i.test(sql)) {
      const rec = store.missing_data_requests.find((r) => r.id === Number(params[0]) && r.employee_id === Number(params[1]) && r.status === 'pending');
      if (!rec) return { rows: [], rowCount: 0 };
      rec.status = 'cancelled';
      return { rows: [{ id: rec.id }], rowCount: 1 };
    }
    if (/set status = 'approved'/i.test(sql)) {
      const rec = store.missing_data_requests.find((r) => r.id === Number(params[2]) && r.status === 'pending');
      if (!rec) return { rows: [], rowCount: 0 };
      rec.status = 'approved'; rec.reviewed_by = params[0]; rec.reviewed_by_name = params[1]; rec.reviewed_at = new Date().toISOString();
      return { rows: [{ id: rec.id }], rowCount: 1 };
    }
    if (/set old_value = \$2, new_value = \$3, old_text = \$4 where id = \$1/i.test(sql)) {
      const rec = store.missing_data_requests.find((r) => r.id === Number(params[0]));
      if (rec) { rec.old_value = params[1]; rec.new_value = params[2]; rec.old_text = params[3]; }
      return { rows: [], rowCount: rec ? 1 : 0 };
    }
    if (/set status = 'pending'/i.test(sql)) {
      const rec = store.missing_data_requests.find((r) => r.id === Number(params[0]) && r.status === 'approved');
      if (!rec) return { rows: [], rowCount: 0 };
      rec.status = 'pending'; rec.reviewed_by = null; rec.reviewed_by_name = null; rec.reviewed_at = null; rec.reject_reason = null;
      return { rows: [{ id: rec.id }], rowCount: 1 };
    }
    if (/set old_value = null, new_value = null, old_text = null where id = \$1/i.test(sql)) {
      const rec = store.missing_data_requests.find((r) => r.id === Number(params[0]));
      if (rec) { rec.old_value = null; rec.new_value = null; rec.old_text = null; }
      return { rows: [], rowCount: rec ? 1 : 0 };
    }
    if (/set status = 'rejected'/i.test(sql)) {
      const rec = store.missing_data_requests.find((r) => r.id === Number(params[3]) && r.status === 'pending');
      if (!rec) return { rows: [], rowCount: 0 };
      rec.status = 'rejected'; rec.reject_reason = params[0]; rec.reviewed_by = params[1]; rec.reviewed_by_name = params[2]; rec.reviewed_at = new Date().toISOString();
      return { rows: [{ id: rec.id }], rowCount: 1 };
    }
  }
  if (/update stage_daily set .* where employee_id = \$1 and stage = \$2 and entry_date = \$3/i.test(sql)) {
    const rec = store.stage_daily.find((d) => d.employee_id === Number(params[0]) && d.stage === params[1] && d.entry_date === params[2]);
    if (rec) {
      if (/value_num = \$4/i.test(sql)) { rec.value_num = params[3]; rec.value_text = null; }
      else { rec.value_num = null; rec.value_text = params[3]; }
    }
    return { rows: [], rowCount: rec ? 1 : 0 };
  }
  if (/delete from stage_daily where employee_id = \$1 and stage = \$2 and entry_date = \$3/i.test(sql)) {
    const prev = store.stage_daily.length;
    store.stage_daily = store.stage_daily.filter((d) => !(d.employee_id === Number(params[0]) && d.stage === params[1] && d.entry_date === params[2]));
    return { rows: [], rowCount: prev - store.stage_daily.length };
  }

  // 14. Centralized Employee Requests, Attachments & History
  if (/from request_attachments a join employee_requests r on r\.id = a\.request_id where a\.id = \$1/i.test(sql)) {
    const att = store.request_attachments.find((a) => a.id === Number(params[0]));
    if (!att) return { rows: [], rowCount: 0 };
    const reqRow = store.employee_requests.find((r) => r.id === att.request_id);
    if (!reqRow) return { rows: [], rowCount: 0 };
    return {
      rows: [
        {
          ...att,
          employee_id: reqRow.employee_id,
          shift: reqRow.shift,
          request_number: reqRow.request_number,
        },
      ],
      rowCount: 1,
    };
  }
  if (/from request_attachments where request_id = \$1/i.test(sql)) {
    const rows = store.request_attachments
      .filter((a) => a.request_id === Number(params[0]))
      .sort((a, b) => a.id - b.id)
      .map(({ id, request_id, field_key, file_name, content_type, file_size, uploaded_at }) => ({
        id,
        request_id,
        field_key,
        file_name,
        content_type,
        file_size,
        uploaded_at,
      }));
    return { rows, rowCount: rows.length };
  }
  if (/insert into request_attachments/i.test(sql)) {
    const [request_id, field_key, file_name, content_type, file_size, data_url, uploaded_by] = params;
    const rec = {
      id: store.seq.request_attachments++,
      request_id: Number(request_id),
      field_key,
      file_name,
      content_type,
      file_size: Number(file_size || 0),
      data_url,
      uploaded_by: uploaded_by == null ? null : Number(uploaded_by),
      uploaded_at: new Date().toISOString(),
    };
    store.request_attachments.push(rec);
    return { rows: [{ id: rec.id }], rowCount: 1 };
  }
  if (/from request_history where request_id = \$1/i.test(sql)) {
    const rows = store.request_history
      .filter((h) => h.request_id === Number(params[0]))
      .sort((a, b) => a.id - b.id)
      .map((h) => ({ ...h }));
    return { rows, rowCount: rows.length };
  }
  if (/insert into request_history/i.test(sql)) {
    const [request_id, action, old_status, new_status, action_by_user_id, action_by_name_snapshot, comment] = params;
    const rec = {
      id: store.seq.request_history++,
      request_id: Number(request_id),
      action,
      old_status,
      new_status,
      action_by_user_id: action_by_user_id == null ? null : Number(action_by_user_id),
      action_by_name_snapshot,
      comment,
      created_at: new Date().toISOString(),
    };
    store.request_history.push(rec);
    return { rows: [rec], rowCount: 1 };
  }
  if (/from employee_requests\b/i.test(sql)) {
    if (/request_type = 'advance_request'/i.test(sql)) {
      const empId = Number(params[0]);
      const since = String(params[1] || '');
      const rows = store.employee_requests.filter(
        (r) =>
          r.employee_id === empId &&
          r.request_type === 'advance_request' &&
          ['submitted', 'under_review', 'approved'].includes(r.status) &&
          String(r.submitted_at || r.created_at || '').slice(0, 10) >= since
      );
      return { rows: rows.map((r) => ({ id: r.id })), rowCount: rows.length };
    }
    if (/request_type in \('special_leave','sick_leave'\)/i.test(sql)) {
      const empId = Number(params[0]);
      const rows = store.employee_requests
        .filter(
          (r) =>
            r.employee_id === empId &&
            ['special_leave', 'sick_leave'].includes(r.request_type) &&
            ['submitted', 'under_review', 'approved'].includes(r.status)
        )
        .map((r) => ({ id: r.id, form_data: r.form_data }));
      return { rows, rowCount: rows.length };
    }
    if (/where id = \$1$/i.test(sql)) {
      const r = store.employee_requests.find((x) => x.id === Number(params[0]));
      return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
    }
    if (/where employee_id = \$1 order by/i.test(sql)) {
      const rows = store.employee_requests
        .filter((r) => r.employee_id === Number(params[0]))
        .slice(0, 200);
      return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
    }
    return { rows: store.employee_requests.slice(0, 1000).map((r) => ({ ...r })), rowCount: Math.min(store.employee_requests.length, 1000) };
  }
  if (/insert into employee_requests/i.test(sql)) {
    const [
      request_number,
      employee_id,
      employee_name,
      company,
      shift,
      department,
      kind,
      category,
      request_type,
      request_title,
      selected_stage_id,
      selected_stage_name_snapshot,
      rawFormData,
      notes,
    ] = params;
    const nowIso = new Date().toISOString();
    const rec = {
      id: store.seq.employee_requests++,
      request_number,
      employee_id: Number(employee_id),
      employee_name,
      company,
      shift,
      department,
      kind,
      category,
      request_type,
      request_title,
      selected_stage_id,
      selected_stage_name_snapshot,
      form_data: typeof rawFormData === 'string' ? JSON.parse(rawFormData) : rawFormData || {},
      notes,
      status: 'submitted',
      decision: null,
      decision_maker_user_id: null,
      decision_maker_name_snapshot: null,
      decision_reason: null,
      decided_at: null,
      reviewed_by: null,
      reviewed_by_name: null,
      reviewed_at: null,
      reject_reason: null,
      submitted_at: nowIso,
      last_updated_at: nowIso,
      created_at: nowIso,
    };
    store.employee_requests.unshift(rec);
    return { rows: [{ id: rec.id, request_number: rec.request_number }], rowCount: 1 };
  }
  if (/update employee_requests/i.test(sql)) {
    if (/set request_number = \$1 where id = \$2/i.test(sql)) {
      const rec = store.employee_requests.find((r) => r.id === Number(params[1]));
      if (rec) rec.request_number = params[0];
      return { rows: [], rowCount: rec ? 1 : 0 };
    }
    if (/set status = 'cancelled'/i.test(sql)) {
      const rec = store.employee_requests.find(
        (r) => r.id === Number(params[0]) && r.employee_id === Number(params[1])
      );
      if (!rec) return { rows: [], rowCount: 0 };
      rec.status = 'cancelled';
      rec.last_updated_at = new Date().toISOString();
      return { rows: [{ ...rec }], rowCount: 1 };
    }
    if (/set status = 'under_review', last_updated_at/i.test(sql)) {
      const rec = store.employee_requests.find((r) => r.id === Number(params[0]));
      if (!rec) return { rows: [], rowCount: 0 };
      rec.status = 'under_review';
      rec.last_updated_at = new Date().toISOString();
      return { rows: [{ ...rec }], rowCount: 1 };
    }
    if (/set status = 'under_review', decision = null/i.test(sql)) {
      const rec = store.employee_requests.find(
        (r) => r.id === Number(params[0]) && ['approved', 'rejected'].includes(r.status)
      );
      if (!rec) return { rows: [], rowCount: 0 };
      rec.status = 'under_review';
      rec.decision = null;
      rec.decision_maker_user_id = null;
      rec.decision_maker_name_snapshot = null;
      rec.decision_reason = null;
      rec.decided_at = null;
      rec.last_updated_at = new Date().toISOString();
      return { rows: [{ ...rec }], rowCount: 1 };
    }
    if (/set status = \$1, decision = \$2/i.test(sql)) {
      const [status, decision, makerId, makerName, reason, revId, revName, rejReason, id] = params;
      const rec = store.employee_requests.find(
        (r) => r.id === Number(id) && ['submitted', 'under_review', 'pending'].includes(r.status)
      );
      if (!rec) return { rows: [], rowCount: 0 };
      const nowIso = new Date().toISOString();
      rec.status = status;
      rec.decision = decision;
      rec.decision_maker_user_id = makerId;
      rec.decision_maker_name_snapshot = makerName;
      rec.decision_reason = reason;
      rec.decided_at = nowIso;
      rec.last_updated_at = nowIso;
      rec.reviewed_by = revId;
      rec.reviewed_by_name = revName;
      rec.reviewed_at = nowIso;
      rec.reject_reason = rejReason;
      return { rows: [{ ...rec }], rowCount: 1 };
    }
  }

  // Fallback no-op for unhandled queries (e.g. bulk master import sub-queries if offline)
  if (!sLow.startsWith('begin') && !sLow.startsWith('commit') && !sLow.startsWith('rollback')) {
    console.warn('[IEMS Mock DB] Unhandled SQL fallback:', sql.slice(0, 120));
  }
  return { rows: [], rowCount: 0 };
}

function transaction(fn) {
  return async (...args) => fn(...args);
}

async function ensureDatabase() {
  return true;
}

module.exports = { query, transaction, ensureDatabase, store };
