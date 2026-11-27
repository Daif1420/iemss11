import type { RequestCategoryKey, RequestTypeKey, WorkflowRequestStatus } from '@/types/iems';

export interface RequestCatalogEntry {
  key: RequestTypeKey;
  category: RequestCategoryKey;
  title: string;
  arabicTitle: string;
  description: string;
  requiredDocsNote?: string;
  conditions: string[];
}

export const REQUEST_ALLOWED_FIELDS: Record<RequestTypeKey, string[]> = {
  exam_leave: ['studyYear', 'examDaysCount', 'examDates', 'otherDates', 'notes'],
  special_leave: [
    'education',
    'currentStage',
    'militaryEducationDuringYear',
    'startDate',
    'endDate',
    'leaveDaysCount',
    'phone',
    'reason',
    'notes',
  ],
  sick_leave: ['startDate', 'endDate', 'absenceDaysCount', 'notes'],
  extra_working_days: ['extraWorkingDate', 'shiftWorked', 'stage', 'notes'],
  salary_entitlements: [
    'entitlementType',
    'details',
    'paymentMethod',
    'accountOrPhoneNumber',
    'accountHolderName',
    'whatsappNumber',
  ],
  advance_request: [
    'requestedAmount',
    'paymentMethod',
    'walletOrInstaPayNumber',
    'accountOwnerName',
  ],
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

export const REQUEST_CATEGORIES: {
  key: RequestCategoryKey;
  title: string;
  subtitle: string;
}[] = [
  {
    key: 'leaves_attendance',
    title: 'الإجازات والحضور',
    subtitle: 'إجازة الاختبارات، الإجازات الخاصة، الإجازة المرضية، والأيام الإضافية.',
  },
  {
    key: 'financial',
    title: 'الطلبات المالية والمزايا',
    subtitle: 'مستحقات الموظفين، طلب السلفة المالية، منحة الزواج، ومنحة وفاة الأب.',
  },
  {
    key: 'employee_affairs',
    title: 'شؤون الموظفين',
    subtitle: 'الطلبات العامة، نقل الشيفت، نماذج الاستقالة، والتراجع عن الاستقالة.',
  },
  {
    key: 'smart_business_services',
    title: 'خدمات Smart Business',
    subtitle: 'الطلبات الإدارية والخدمات الطبية المخصصة لموظفي شركة Smart Business.',
  },
];

export const REQUEST_CATALOG: RequestCatalogEntry[] = [
  {
    key: 'exam_leave',
    category: 'leaves_attendance',
    title: 'إجازة الاختبارات',
    arabicTitle: 'تسجيل الإجازة الخاصة بالاختبارات',
    description: 'تقديم مواعيد الامتحانات الدراسية مع إرفاق الكارنيه وجدول الاختبارات المعتمد.',
    requiredDocsNote: 'مرفق: الكارنيه + جدول الامتحانات',
    conditions: [
      'عدم وجود غيابات خلال الشهر باستثناء الإجازات العارضة وأيام الاختبارات.',
      'إرفاق صورة الكارنيه أو إيصال المصروفات مع جدول الامتحانات الرسمي.',
    ],
  },
  {
    key: 'special_leave',
    category: 'leaves_attendance',
    title: 'إجازة خاصة',
    arabicTitle: 'نموذج طلب إجازة خاصة',
    description: 'طلب إجازة استثنائية أو شخصية ليوم واحد أو أكثر مع توضيح السبب.',
    requiredDocsNote: 'مستندات اختيارية',
    conditions: [
      'طلبات الإجازة لأكثر من يومين تُقدّم قبل موعد البدء بـ 7 أيام عمل على الأقل.',
      'تُستبعد الإجازات الأسبوعية والرسمية من احتساب المدة.',
    ],
  },
  {
    key: 'sick_leave',
    category: 'leaves_attendance',
    title: 'إجازة مرضية',
    arabicTitle: 'تسجيل إجازة مرضية',
    description: 'تسجيل الغياب المرضي مع إرفاق الروشتة الطبية والتقرير الطبي المعتمد.',
    requiredDocsNote: 'مرفق: الروشتة + التقرير الطبي',
    conditions: [
      'يُقدّم الطلب خلال 24 ساعة من الكشف الطبي مع إرفاق الروشتة والتقرير الطبي.',
    ],
  },
  {
    key: 'extra_working_days',
    category: 'leaves_attendance',
    title: 'الأيام الإضافية',
    arabicTitle: 'تسجيل الأيام الإضافية',
    description: 'توثيق يوم العمل الإضافي مع تحديد الشيفت والمرحلة التي تم العمل بها.',
    conditions: [
      'يُحدد التاريخ والشيفت والمرحلة الفعلية التي تم العمل بها في اليوم الإضافي.',
    ],
  },
  {
    key: 'salary_entitlements',
    category: 'financial',
    title: 'مستحقات الموظفين',
    arabicTitle: 'مستحقات الموظفين',
    description: 'متابعة أو طلب مستحقات مالية أو أيام إضافية أو تارجت شهري.',
    conditions: [
      'يرجى مراجعة بيانات المحفظة الإلكترونية أو InstaPay ورقم الواتساب قبل الإرسال.',
    ],
  },
  {
    key: 'advance_request',
    category: 'financial',
    title: 'طلب سلفة',
    arabicTitle: 'طلب سلفة',
    description: 'طلب سلفة شهرية مع التحقق التلقائي من أيام الحضور وسجل الانضباط.',
    conditions: [
      'مضي شهرين على الأقل من التعيين، وبحد أقصى 50% من الراتب الأساسي حسب الحضور الفعلي.',
      'فترة التقديم من يوم 10 إلى 20 من كل شهر · الصرف أيام السبت والثلاثاء · طلب واحد شهرياً.',
    ],
  },
  {
    key: 'employee_grant',
    category: 'financial',
    title: 'منحة وفاة الأب',
    arabicTitle: 'منحة الموظفين المسؤولين بعد وفاة الأب',
    description: 'التقديم على المنحة الخاصة بالموظفين المسؤولين بعد وفاة الأب.',
    requiredDocsNote: 'مرفق: شهادة الوفاة',
    conditions: [
      'مرور 3 أشهر على الأقل بالمشروع، وتُصرف المنحة مع راتب الشهر الرابع بعد اعتماد المستندات.',
    ],
  },
  {
    key: 'marriage_grant',
    category: 'financial',
    title: 'منحة الزواج',
    arabicTitle: 'منحة الزواج',
    description: 'طلب الحصول على منحة الزواج المقدمة من إدارة الشركة للموظفين وفقاً للشروط المعتمدة.',
    requiredDocsNote: 'مرفق: شهادة الزواج أو ظهر بطاقة الزوجة',
    conditions: [
      'مرور ثلاث شهور للموظف بالمشروع.',
      'نزول المنحة في مرتب الشهر الرابع للموظف.',
      'يتم احتساب الشهر حتى تاريخ 10 من الشهر الميلادي من تاريخ التعيين للموظف.',
      'تستهدف المنحة الموظفين الذكور المتزوجين فقط.',
      'تستهدف المنحة الموظفات المتزوجات أو الأرامل أو المطلقات التي لديهن أطفال.',
    ],
  },
  {
    key: 'general_request',
    category: 'employee_affairs',
    title: 'طلب موظف',
    arabicTitle: 'طلب موظف',
    description: 'تقديم طلب أو استفسار إداري أو تشغيلي مباشر للإدارة.',
    requiredDocsNote: 'مستندات اختيارية',
    conditions: [
      'يرجى توضيح تفاصيل الطلب بدقة ووضع رقم هاتف متاح للتواصل.',
    ],
  },
  {
    key: 'shift_transfer',
    category: 'employee_affairs',
    title: 'طلب نقل شيفت',
    arabicTitle: 'طلب نقل شيفت',
    description: 'طلب التحويل بين الفترات (صباحي، بيني، ليلي) وتحديد المراحل المتقنة.',
    conditions: [
      'يبدأ تنفيذ النقل في يوم 21 من الشهر التالي وتُقبل الطلبات حتى يوم 15 من كل شهر.',
      'يتطلب النقل الأول استمرار 6 أشهر متصلة، وأي نقل لاحق 3 أشهر.',
    ],
  },
  {
    key: 'resignation',
    category: 'employee_affairs',
    title: 'نموذج استقالة',
    arabicTitle: 'نموذج استقالة',
    description: 'تقديم إخطار الاستقالة وتحديد آخر يوم عمل وسبب الاستقالة.',
    conditions: [
      'مدة الإخطار المعتمدة 7 أيام عمل بخلاف الإجازات الأسبوعية والرسمية.',
    ],
  },
  {
    key: 'resignation_withdrawal',
    category: 'employee_affairs',
    title: 'التراجع عن الاستقالة',
    arabicTitle: 'طلب التراجع عن الاستقالة',
    description: 'تقديم طلب العدول عن استقالة مقدمة مسبقاً وتوضيح السبب.',
    conditions: [
      'يرجى تحديد منطقة السكن وكتابة سبب التراجع عن الاستقالة بوضوح.',
    ],
  },
  {
    key: 'smart_business_request',
    category: 'smart_business_services',
    title: 'خدمات سمارت بيزنس',
    arabicTitle: 'تقديم طلب شركة سمارت بيزنس',
    description: 'طلب مفردات مرتب، كارنيه عمل، شهادة خبرة، أو استرداد مسوغات التعيين.',
    conditions: [
      'متاح لموظفي شركة Smart Business المسجلين في النظام فقط.',
    ],
  },
  {
    key: 'medical_services',
    category: 'smart_business_services',
    title: 'خدمات طبية',
    arabicTitle: 'خدمات طبية',
    description:
      'يرجى ملء هذه الاستمارة بالبيانات الصحيحة، وذلك لإصدار خطاب رسمي موجه إلى معمل التحاليل للاستفادة من الخصم الطبي المخصص لموظفي Smart Business.',
    conditions: [
      'متاح لموظفي شركة Smart Business المسجلين في النظام فقط.',
      'برجاء التأكد من صحة جميع البيانات قبل إرسال الاستمارة لإصدار الخطاب الرسمي بدقة.',
    ],
  },
];

export const REQUEST_CATALOG_MAP: Record<RequestTypeKey, RequestCatalogEntry> =
  REQUEST_CATALOG.reduce(
    (acc, item) => {
      acc[item.key] = item;
      return acc;
    },
    {} as Record<RequestTypeKey, RequestCatalogEntry>
  );

export const STATUS_DISPLAY: Record<
  WorkflowRequestStatus,
  { label: string; dotClass: string; textClass: string }
> = {
  submitted: {
    label: 'تم الإرسال',
    dotClass: 'bg-sky-500',
    textClass: 'text-sky-700 dark:text-sky-300',
  },
  under_review: {
    label: 'قيد المراجعة',
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-700 dark:text-amber-300',
  },
  approved: {
    label: 'تمت الموافقة',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-700 dark:text-emerald-300',
  },
  rejected: {
    label: 'مرفوض',
    dotClass: 'bg-rose-500',
    textClass: 'text-rose-700 dark:text-rose-300',
  },
  cancelled: {
    label: 'ملغي',
    dotClass: 'bg-slate-400',
    textClass: 'text-muted-foreground',
  },
};

export const HISTORY_ACTION_LABELS: Record<string, string> = {
  submitted: 'تم تقديم الطلب',
  status_changed: 'تحديث الحالة',
  under_review: 'نُقل إلى قيد المراجعة',
  approved: 'تمت الموافقة على الطلب',
  rejected: 'تم رفض الطلب',
  reopened: 'إعادة فتح الطلب للمراجعة',
  cancelled: 'تم إلغاء الطلب',
};

export const FORM_FIELD_LABELS: Record<string, string> = {
  studyYear: 'الفرقة الدراسية',
  examDaysCount: 'عدد أيام الاختبارات',
  examDates: 'تواريخ الاختبارات',
  otherDates: 'تواريخ إضافية',
  education: 'الموقف التعليمي',
  currentStage: 'المرحلة الحالية',
  stage: 'المرحلة',
  militaryEducationDuringYear: 'التربية العسكرية خلال العام',
  phone: 'رقم الهاتف',
  reason: 'السبب',
  startDate: 'تاريخ البداية',
  endDate: 'تاريخ النهاية',
  leaveDaysCount: 'عدد أيام الإجازة',
  absenceDaysCount: 'عدد أيام الغياب',
  extraWorkingDate: 'تاريخ اليوم الإضافي',
  shiftWorked: 'الشيفت الذي تم العمل به',
  entitlementType: 'نوع المستحق',
  details: 'التفاصيل',
  paymentMethod: 'وسيلة الصرف',
  accountOrPhoneNumber: 'رقم الحساب / المحفظة',
  accountHolderName: 'اسم صاحب الحساب',
  whatsappNumber: 'رقم الواتساب',
  requestedAmount: 'مبلغ السلفة المطلوب (جنيه)',
  walletOrInstaPayNumber: 'رقم المحفظة / InstaPay',
  accountOwnerName: 'اسم صاحب الحساب',
  tenureInProject: 'مدة العمل بالمشروع',
  termsAccepted: 'الإقرار والموافقة على الشروط',
  gender: 'النوع',
  tenureCategory: 'مدة الخدمة',
  requestDetails: 'تفاصيل الطلب',
  contactNumber: 'رقم التواصل',
  currentShift: 'الشيفت الحالي',
  requestedShift: 'الشيفت المطلوب الانتقال إليه',
  currentPeriodShift: 'الفترة الحالية',
  requestedPeriodShift: 'الفترة المطلوبة',
  performableStages: 'المراحل التي يمكن العمل بها',
  lastWorkingDay: 'آخر يوم عمل',
  suggestions: 'مقترحات التحسين',
  residence: 'منطقة السكن',
  reasonForWithdrawal: 'سبب التراجع عن الاستقالة',
  smartRequestType: 'نوع طلب سمارت بيزنس',
  labName: 'المعمل المطلوب',
  recipientType: 'الخطاب موجّه لمن؟',
  familyRelation: 'صلة القرابة',
  labVisitDate: 'تاريخ التوجه للمعمل',
  notes: 'ملاحظات',
};

export const ATTACHMENT_FIELD_LABELS: Record<string, string> = {
  studentCardAttachment: 'الكارنيه / إيصال المصروفات',
  examScheduleAttachment: 'جدول الامتحانات',
  prescriptionAttachment: 'الروشتة الطبية',
  medicalReportAttachment: 'التقرير الطبي',
  deathCertificateAttachment: 'شهادة الوفاة',
  marriageProofAttachment: 'شهادة الزواج أو ظهر بطاقة الزوجة',
  attachments: 'مرفق داعم',
};
