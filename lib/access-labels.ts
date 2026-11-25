/**
 * Human-readable permission labels (Phase 3.2 FINAL-V2). The permission CODE
 * is the stable internal identifier and is never changed or translated; these
 * labels are display text only. An unknown code falls back to the code itself.
 */
type Loc = "en" | "ar";

const LABELS: Record<string, { en: string; ar: string }> = {
  "employees.view": { en: "View employees", ar: "عرض الموظفين" },
  "employees.create": { en: "Create employees", ar: "إنشاء موظفين" },
  "employees.update": { en: "Edit employees", ar: "تعديل الموظفين" },
  "employees.delete": { en: "Delete employees", ar: "حذف الموظفين" },
  "employees.view_personal_data": { en: "View employee personal data", ar: "عرض البيانات الشخصية للموظفين" },
  "departments.view": { en: "View departments", ar: "عرض الأقسام" },
  "departments.create": { en: "Create departments", ar: "إنشاء أقسام" },
  "departments.update": { en: "Edit departments", ar: "تعديل الأقسام" },
  "departments.delete": { en: "Delete departments", ar: "حذف الأقسام" },
  "job_titles.view": { en: "View job titles", ar: "عرض المسميات الوظيفية" },
  "job_titles.create": { en: "Create job titles", ar: "إنشاء مسميات وظيفية" },
  "job_titles.update": { en: "Edit job titles", ar: "تعديل المسميات الوظيفية" },
  "job_titles.delete": { en: "Delete job titles", ar: "حذف المسميات الوظيفية" },
  "roles.view": { en: "View roles", ar: "عرض الأدوار" },
  "roles.create": { en: "Create roles", ar: "إنشاء أدوار" },
  "roles.update": { en: "Edit roles", ar: "تعديل الأدوار" },
  "roles.delete": { en: "Delete roles", ar: "حذف الأدوار" },
  "roles.assign": { en: "Assign roles to accounts", ar: "تعيين الأدوار للحسابات" },
  "permissions.view": { en: "View permissions", ar: "عرض الصلاحيات" },
  "permissions.manage": { en: "Change role permissions", ar: "تغيير صلاحيات الأدوار" },
  "audit_logs.view": { en: "View audit logs", ar: "عرض سجلات التدقيق" },
  "company_settings.manage": { en: "Manage company settings", ar: "إدارة إعدادات الشركة" },
  "work_schedules.manage": { en: "Manage work schedules and holidays", ar: "إدارة جداول العمل والعطلات" },
};

export function permissionLabel(code: string, locale: string): string {
  const l = LABELS[code];
  if (!l) return code;
  return (locale as Loc) === "ar" ? l.ar : l.en;
}

/** Dictionary key for a count using the active locale's plural rules, e.g. pluralKey("ar","access.roles.usersCount",2) -> access.roles.usersCountTwo. */
export function pluralKey(locale: string, base: string, count: number): string {
  const cat = new Intl.PluralRules(locale).select(count);
  return `${base}${cat.charAt(0).toUpperCase()}${cat.slice(1)}`;
}
