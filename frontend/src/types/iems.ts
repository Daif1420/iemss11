export type Role = 'system_creator' | 'admin' | 'supervisor' | 'employee';

export type EmployeeStatus = 'active' | 'left' | 'archive';

export interface AuthUser {
  id: number;
  name: string;
  role: Role;
  shift?: string | null;
  supervisorShifts?: string[];
  supervisor_shifts?: string[];
  company?: string | null;
  department?: string | null;
  must_change_password?: boolean;
}

export interface EmployeeRecord {
  id: number;
  emp_num?: number | null;
  name: string;
  education?: string | null;
  residence?: string | null;
  company?: string | null;
  shift?: string | null;
  target_shift?: string | null;
  department?: string | null;
  role?: Role;
  must_change_password?: boolean;
  status?: EmployeeStatus;
  left_date?: string | null;
  departure_reason?: string | null;
  created_at?: string | null;
  supervisor_shifts?: string[];
  is_primary_admin?: boolean;
  is_top5?: boolean;
}

export interface AdminOverview {
  total: number;
  smart: number;
  bravos: number;
  students: number;
  graduates: number;
  other: number;
  newEmployees: number;
  leftEmployees: number;
}

export interface Top5Row {
  id: number;
  name: string;
  company?: string | null;
  shift?: string | null;
  stage: string;
  achieved: number;
  rank: number;
}

export interface UnauthorizedAbsenceRow {
  id: number;
  name: string;
  company?: string | null;
  shift?: string | null;
  department?: string | null;
  unauthorized_days: number;
  first_absence?: string | null;
  last_absence?: string | null;
}

export interface DashboardPayload {
  range: { from: string | null; to: string | null };
  employee_count: number;
  attendance: {
    present_days: number;
    absent_days: number;
    attendance_entries: number;
    distinct_present_days: number;
  };
  stages: string[];
  top5ByStage?: Record<string, Top5Row[]>;
  selectedTop5?: Top5Row[] | null;
  unauthorizedAbsenceEmployees?: UnauthorizedAbsenceRow[];
  myRanks?: { stage: string; rank: number }[];
}

export interface AttendanceCompanyRow {
  name: string;
  employee_count: number;
  total: number;
  present: number;
  absent: number;
  graduate_present: number;
  graduate_absent: number;
  student_present: number;
  student_absent: number;
  casual: number;
  permission: number;
  unauthorized: number;
  medical: number;
  exam: number;
  unclassified: number;
  attendance_rate: number;
}

export interface AttendanceDailyRow {
  date: string;
  total: number;
  present: number;
  absent: number;
  casual: number;
  permission: number;
  unauthorized: number;
  medical: number;
  exam: number;
  unclassified: number;
  attendance_rate: number;
  absence_rate: number;
}

export interface AttendanceEmployeeRow {
  id: number;
  name: string;
  company?: string | null;
  shift?: string | null;
  department?: string | null;
  present: number;
  absent: number;
  casual: number;
  permission: number;
  unauthorized: number;
  medical: number;
  exam: number;
  unclassified: number;
  attendance_rate: number;
  master_present_value?: number | null;
}

export interface AttendancePayload {
  range: { from: string; to: string };
  totals: {
    employee_count: number;
    total: number;
    present: number;
    absent: number;
    casual: number;
    permission: number;
    unauthorized: number;
    medical: number;
    exam: number;
    unclassified: number;
    attendance_rate: number;
  };
  companies: AttendanceCompanyRow[];
  stages: { name: string; present: number; absent: number; attendance_rate: number }[];
  daily: AttendanceDailyRow[];
  employees: AttendanceEmployeeRow[];
}

export interface EmployeeSummary {
  total_achievement?: number | null;
  total_target?: number | null;
  percentage?: number | null;
  bonus_tier?: string | number | null;
  unauthorized_absence?: number | null;
  total_absence?: number | null;
  work_nature_allowance?: number | null;
  monthly_target?: number | null;
  total_present_days?: number | null;
  total_absence_days?: number | null;
  casual_leave?: number | null;
  leave_with_permission?: number | null;
  leave_without_permission?: number | null;
  sick_leave?: number | null;
  exam_leave?: number | null;
  unclassified_absence?: number | null;
  late_days?: number | null;
  late_hours?: number | null;
  overtime_days?: number | null;
  overtime_hours?: number | null;
  special_bonus_days?: number | null;
  special_deductions?: number | null;
}

export interface SupervisorTargetEntry {
  date: string;
  targetDaily?: number | null;
  targetMonthly?: number | null;
  metrics?: Record<string, number | string | null>;
}

export interface ShiftProfileSnapshot {
  shift: string;
  stages: {
    role: string;
    monthlyTarget?: number | null;
    daily?: Record<string, number | string>;
  }[];
  summary: EmployeeSummary;
  employee: EmployeeRecord;
}

export interface EmployeeDetailPayload {
  employee: EmployeeRecord;
  summary: EmployeeSummary;
  attendance: { present_days: number; absent_days: number };
  stages: Record<string, { date: string; value: number | string }[]>;
  stageTargets: Record<string, number>;
  shiftProfiles: ShiftProfileSnapshot[];
  myRanks: { stage: string; rank: number }[];
  supervisorTargets: Record<string, SupervisorTargetEntry[]>;
}

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type RequestCategoryKey = 'leaves_attendance' | 'financial' | 'employee_affairs';

export type RequestTypeKey =
  | 'exam_leave'
  | 'special_leave'
  | 'sick_leave'
  | 'extra_working_days'
  | 'salary_entitlements'
  | 'advance_request'
  | 'employee_grant'
  | 'marriage_grant'
  | 'general_request'
  | 'shift_transfer'
  | 'resignation'
  | 'resignation_withdrawal'
  | 'smart_business_request';

export type WorkflowRequestStatus =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export interface RequestAttachmentMeta {
  id: number;
  request_id: number;
  field_key: string;
  file_name: string;
  content_type: string;
  file_size: number;
  uploaded_at: string;
}

export interface RequestHistoryEntry {
  id: number;
  request_id: number;
  action: 'submitted' | 'status_changed' | 'approved' | 'rejected' | 'cancelled' | 'reopened' | string;
  old_status?: string | null;
  new_status?: string | null;
  action_by_user_id?: number | null;
  action_by_name_snapshot?: string | null;
  comment?: string | null;
  created_at: string;
}

export interface RequestEligibilitySnapshot {
  cycleStart: string;
  cycleEnd: string;
  actualAttendanceDays: number;
  hasUnauthorizedAbsence: boolean;
  unauthorizedAbsenceDays: number;
  inApplicationWindow: boolean;
  currentDayOfMonth: number;
  windowStartDay?: number;
  windowEndDay?: number;
  enforceAdvanceWindow?: boolean;
  existingAdvanceThisMonth: boolean;
  tenureMonthsEstimate: number | null;
  meetsMinTenure2Months: boolean | null;
}

export interface RequestItem {
  id: number;
  request_number: string;
  employee_id: number;
  employee_name: string;
  company?: string | null;
  shift?: string | null;
  department?: string | null;
  category: RequestCategoryKey;
  request_type: RequestTypeKey;
  request_title: string;
  status: WorkflowRequestStatus;
  selected_stage_id?: string | null;
  selected_stage_name_snapshot?: string | null;
  form_data: Record<string, unknown>;
  decision?: 'approved' | 'rejected' | null;
  decision_maker_user_id?: number | null;
  decision_maker_name_snapshot?: string | null;
  decision_reason?: string | null;
  decided_at?: string | null;
  submitted_at: string;
  last_updated_at: string;
  attachments_count?: number;
  attachments?: RequestAttachmentMeta[];
  history?: RequestHistoryEntry[];
  eligibility?: RequestEligibilitySnapshot | null;
  employee_profile?: {
    id: number;
    emp_num?: number | null;
    name: string;
    company?: string | null;
    shift?: string | null;
    department?: string | null;
    education?: string | null;
    residence?: string | null;
    created_at?: string | null;
  } | null;
}

export interface RequestMetaPayload {
  profile: {
    id: number;
    emp_num?: number | null;
    name: string;
    company?: string | null;
    shift?: string | null;
    department?: string | null;
    education?: string | null;
    residence?: string | null;
    created_at?: string | null;
  } | null;
  stages: {
    id: string;
    name: string;
    source: 'iems' | 'fallback';
  }[];
  stageSource: 'iems' | 'fallback';
  fallbackStages: string[];
  eligibility: RequestEligibilitySnapshot;
  externalUrls?: Partial<Record<RequestTypeKey, string>>;
  permissions: {
    canSubmit: boolean;
    canViewAdmin: boolean;
    canDecide: boolean;
    canManageSettings: boolean;
    decisionRoles: string[];
    supervisorAllowedTypes?: RequestTypeKey[];
    supervisorShifts?: string[];
    requireDecisionReason: boolean;
    allowEmployeeCancellation: boolean;
    allowReopenDecision: boolean;
    preventDuplicatePending: boolean;
    enforceAdvanceWindow: boolean;
    advanceWindowStartDay: number;
    advanceWindowEndDay: number;
    maxAttachmentSizeMb: number;
    canExport?: boolean;
  };
}

export interface MissingRequestRow {
  id: number;
  employee_id: number;
  employee_name: string;
  shift?: string | null;
  entry_date: string;
  stage: string;
  quantity: number;
  reason_type: 'missing' | 'incomplete' | 'wrong' | string;
  notes?: string | null;
  status: RequestStatus;
  old_value?: number | null;
  new_value?: number | null;
  current_value?: number | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  reject_reason?: string | null;
  created_at: string;
}

export interface EmployeeRequestRow {
  id: number;
  employee_id: number;
  employee_name: string;
  shift?: string | null;
  kind: 'leave' | 'advance';
  leave_type?: 'annual' | 'casual' | 'sick' | 'unpaid' | string | null;
  start_date?: string | null;
  end_date?: string | null;
  days?: number | null;
  amount?: number | null;
  notes?: string | null;
  status: RequestStatus;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  reject_reason?: string | null;
  created_at: string;
}

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ImportHistoryRow {
  id: number;
  imported_by: number;
  imported_by_name?: string | null;
  filename: string;
  month_start?: string | null;
  updated_count: number;
  created_count: number;
  daily_count: number;
  skipped_count: number;
  supervisor_linked: number;
  supervisor_unmatched: number;
  status: string;
  created_at: string;
}

export interface AuditLogRow {
  id: number;
  actor_id?: number | null;
  actor_name?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
  created_at: string;
}

export interface ReportStageTotal {
  stage: string;
  total: number;
  employee_count: number;
  top_employee_id?: number | null;
  top_employee_name?: string | null;
  top_value?: number;
}

export interface ReportShiftTotal {
  shift: string;
  total: number;
  target_total?: number;
  employee_count: number;
}

export interface ReportResult {
  employees: {
    id: number;
    name: string;
    company?: string | null;
    shift?: string | null;
    stage_target: number;
    sheet_target?: number | null;
    achievement_pct?: number | null;
  }[];
  total: number;
  from: string;
  to: string;
  stage: string;
  shift_totals?: ReportShiftTotal[];
}

export interface PurgeCategories {
  daily: boolean;
  requests: boolean;
  logs: boolean;
}

export type SeasonalThemeId = 'default' | 'new_year' | 'ramadan' | 'emerald';

export interface ReportsAndSheetsConfig {
  reportSize: 'compact' | 'normal' | 'large';
  reportOrientation: 'auto' | 'portrait' | 'landscape';
  tableAlignH: 'center' | 'right' | 'left';
  tableAlignV: 'middle' | 'top' | 'bottom';
  pageVerticalAlign: 'top' | 'center';
  sheetStageBlockRows: number;
  pdfMaxDatesPerBlock: number;
  monthDaysCount: 'auto' | '30' | '31';
  targetPercentageColumn?: string;
}

export interface SystemSettingsConfig {
  general: {
    systemName: string;
    systemSubtitle: string;
    defaultPassword: string;
    requirePasswordChangeOnFirstLogin: boolean;
    allowForgotPassword: boolean;
    supportWhatsappNumber: string;
    sessionExpiryHours: number;
    maxLoginAttempts: number;
  };
  payroll: {
    cycleStartDay: number;
    cycleEndDay: number;
    unauthorizedAbsenceThreshold: number;
    maxAttachmentSizeMb: number;
  };
  displayAndFeatures: {
    showTop5ToEmployees: boolean;
    showBonusAndDeductionsToEmployee: boolean;
    allowEmployeeExport: boolean;
    allowSupervisorExport: boolean;
    systemNoticeEnabled: boolean;
    systemNoticeText: string;
    seasonalTheme?: SeasonalThemeId;
    seasonalDecorEnabled?: boolean;
  };
  departmentsAndLists: {
    companies: string[];
    shifts: string[];
    stages: string[];
    departureReasons: string[];
  };
  financialFormLinks: {
    enabled: boolean;
    salaryEntitlementsUrl: string;
    advanceRequestUrl: string;
    payrollPortalUrl: string;
    workRegulationsUrl: string;
  };
  autoPurge: {
    enabled: boolean;
    retentionMonths: number;
    categories: PurgeCategories;
    lastRunAt: string | null;
    lastDeletedSummary: {
      ranAt: string;
      retentionMonths: number;
      deletedTotal: number;
      skipped: boolean;
      reason?: string | null;
    } | null;
  };
  reportsAndSheets: ReportsAndSheetsConfig;
}

export interface PublicSystemConfigPayload {
  general: {
    systemName: string;
    systemSubtitle: string;
  };
  payroll: {
    cycleStartDay: number;
    cycleEndDay: number;
    unauthorizedAbsenceThreshold: number;
    maxAttachmentSizeMb: number;
  };
  displayAndFeatures: {
    showTop5ToEmployees: boolean;
    showBonusAndDeductionsToEmployee: boolean;
    allowEmployeeExport: boolean;
    allowSupervisorExport: boolean;
    systemNoticeEnabled: boolean;
    systemNoticeText: string;
    seasonalTheme?: SeasonalThemeId;
    seasonalDecorEnabled?: boolean;
  };
  departmentsAndLists: {
    companies: string[];
    shifts: string[];
    stages: string[];
    departureReasons: string[];
  };
  financialFormLinks: {
    enabled: boolean;
    salaryEntitlementsUrl: string;
    advanceRequestUrl: string;
    payrollPortalUrl: string;
    workRegulationsUrl: string;
  };
  reportsAndSheets?: ReportsAndSheetsConfig;
}

export interface DatabaseMonthSummary {
  month: string;
  dailyRows: number;
  supervisorRows: number;
  monthlySummaryRows: number;
  requestRows: number;
  logRows: number;
}

export interface DatabaseInventoryPayload {
  minDate: string | null;
  maxDate: string | null;
  totalMonths: number;
  availableMonths: DatabaseMonthSummary[];
  counts: {
    employees: number;
    stageDaily: number;
    supervisorTargets: number;
    employeeMonthlySummary: number;
    employeeStageTargets: number;
    importHistory: number;
    employeeRequests: number;
    requestAttachments: number;
    auditLogs: number;
    loginAudit: number;
    notifications: number;
  };
}
