/**
 * Simulated Laravel backend for local verification ONLY.
 *
 * Phase 1: the three verified auth endpoints (POST /api/v1/auth/login,
 * GET /api/v1/auth/me, POST /api/v1/auth/logout) with a fixed demo identity.
 * Phase 2: simulated read endpoints (GET /api/v1/departments, /employees,
 * /leave-requests, /permission-requests) with fixed demo fixtures matching
 * the verified resource shapes, so the shell and dashboard can be exercised
 * without a running Laravel instance. All data is fictional; no real
 * credentials or company data.
 *
 * Test accounts (all password "orbit-demo-password"):
 *   demo@orbit.example            owner role, populated fixtures
 *   employee@orbit.example        employee role (nav gating tests)
 *   manager@orbit.example         manager role (RBAC: reads allowed,
 *                                 mutations rejected with 403)
 *   dashfail@orbit.example        /employees, /leave-requests and
 *                                 /permission-requests return 500,
 *                                 /departments returns an empty collection
 *   forbidden@orbit.example       /leave-requests and /permission-requests
 *                                 return 403 (widget authorization tests)
 *   brokensession@orbit.example   /auth/me returns 401 while data endpoints
 *                                 return 200 (per-page guard tests)
 *   malformed@orbit.example       /auth/me returns 200 with a malformed
 *                                 body (safe unavailable, never false empty)
 *   slow@orbit.example            /employees responds after ~2.5s
 *                                 (loading-state tests)
 *   unknownrole@orbit.example     /me returns an unrecognized role
 *                                 (nav must fail closed entirely)
 *   bademp@orbit.example          /employees returns 200 with a malformed
 *                                 envelope; other endpoints normal
 *   baddept@orbit.example         /departments returns 200 missing data
 *   badleave@orbit.example        /leave-requests returns 200 with non-array
 *                                 data and a non-numeric meta.total
 *   badperm@orbit.example         /permission-requests returns 200 with a
 *                                 negative meta.total
 *                                 (per-widget malformed-envelope tests)
 *   badempfields@orbit.example    /employees 200 with a record missing
 *                                 employment_status (record-content test)
 *   baddeptfields@orbit.example   /departments 200 with is_active: "yes"
 *   badleavefields@orbit.example  /leave-requests recent page carries a
 *                                 record with a bogus status, non-numeric
 *                                 days and an object-shaped first_name
 *   badpermfields@orbit.example   /permission-requests recent page carries
 *                                 a record with numeric date + bad timestamp
 *   badidentity@orbit.example     /me 200 with non-string name/email
 *                                 (identity shape fail-closed test)
 *   badempstatus@orbit.example    /employees 200 with a well-formed record
 *                                 whose employment_status is outside the
 *                                 verified enum (must not be counted)
 *
 * Usage: node scripts/mock-backend.mjs   (listens on 127.0.0.1:4100)
 */
import { createServer } from "node:http";

const DEMO = {
  email: "demo@orbit.example",
  password: "orbit-demo-password",
  token: "mock-sanctum-token-1",
  user: {
    id: 1,
    uuid: "3f6d0f62-4d9b-4f2a-9f3a-0demo0000001",
    name: "Demo Owner",
    email: "demo@orbit.example",
    phone: null,
    role: "owner",
    is_active: true,
    email_verified_at: null,
    created_at: "2026-01-01T00:00:00.000000Z",
    updated_at: "2026-01-01T00:00:00.000000Z",
  },
  inactiveToken: "demo-inactive-token-00000000-0000-0000-0000-000000000000",
  company: {
    id: 1,
    uuid: "7c1a2b3c-4d5e-4f6a-8b9c-0demo0000002",
    name: "Demo Engineering Consultancy",
    slug: "demo-engineering-consultancy",
    is_active: true,
    created_at: "2026-01-01T00:00:00.000000Z",
    updated_at: "2026-01-01T00:00:00.000000Z",
  },
  employeeToken: "mock-sanctum-token-employee",
  employeeUser: {
    id: 2,
    uuid: "3f6d0f62-4d9b-4f2a-9f3a-0demo0000003",
    name: "Demo Employee",
    email: "employee@orbit.example",
    phone: null,
    role: "employee",
    is_active: true,
    email_verified_at: null,
    created_at: "2026-01-01T00:00:00.000000Z",
    updated_at: "2026-01-01T00:00:00.000000Z",
  },
  managerToken: "mock-sanctum-token-manager",
  managerUser: {
    id: 10,
    uuid: "3f6d0f62-4d9b-4f2a-9f3a-0demo0000011",
    name: "Demo Manager",
    email: "manager@orbit.example",
    phone: null,
    role: "manager",
    is_active: true,
    email_verified_at: null,
    created_at: "2026-01-01T00:00:00.000000Z",
    updated_at: "2026-01-01T00:00:00.000000Z",
  },
  dashfailToken: "mock-sanctum-token-dashfail",
  dashfailUser: {
    id: 3,
    uuid: "3f6d0f62-4d9b-4f2a-9f3a-0demo0000004",
    name: "Demo Failing Owner",
    email: "dashfail@orbit.example",
    phone: null,
    role: "owner",
    is_active: true,
    email_verified_at: null,
    created_at: "2026-01-01T00:00:00.000000Z",
    updated_at: "2026-01-01T00:00:00.000000Z",
  },
  forbiddenToken: "mock-sanctum-token-forbidden",
  forbiddenUser: {
    id: 4, uuid: "3f6d0f62-4d9b-4f2a-9f3a-0demo0000005",
    name: "Demo Forbidden Owner", email: "forbidden@orbit.example", phone: null,
    role: "owner", is_active: true, email_verified_at: null,
    created_at: "2026-01-01T00:00:00.000000Z", updated_at: "2026-01-01T00:00:00.000000Z",
  },
  brokensessionToken: "mock-sanctum-token-brokensession",
  brokensessionUser: {
    id: 5, uuid: "3f6d0f62-4d9b-4f2a-9f3a-0demo0000006",
    name: "Demo Broken Session", email: "brokensession@orbit.example", phone: null,
    role: "owner", is_active: true, email_verified_at: null,
    created_at: "2026-01-01T00:00:00.000000Z", updated_at: "2026-01-01T00:00:00.000000Z",
  },
  malformedToken: "mock-sanctum-token-malformed",
  malformedUser: {
    id: 6, uuid: "3f6d0f62-4d9b-4f2a-9f3a-0demo0000007",
    name: "Demo Malformed", email: "malformed@orbit.example", phone: null,
    role: "owner", is_active: true, email_verified_at: null,
    created_at: "2026-01-01T00:00:00.000000Z", updated_at: "2026-01-01T00:00:00.000000Z",
  },
  slowToken: "mock-sanctum-token-slow",
  slowUser: {
    id: 7, uuid: "3f6d0f62-4d9b-4f2a-9f3a-0demo0000008",
    name: "Demo Slow", email: "slow@orbit.example", phone: null,
    role: "owner", is_active: true, email_verified_at: null,
    created_at: "2026-01-01T00:00:00.000000Z", updated_at: "2026-01-01T00:00:00.000000Z",
  },
  unknownroleToken: "mock-sanctum-token-unknownrole",
  unknownroleUser: {
    id: 8, uuid: "3f6d0f62-4d9b-4f2a-9f3a-0demo0000009",
    name: "Demo Unknownrole", email: "unknownrole@orbit.example", phone: null,
    role: "superadmin", is_active: true, email_verified_at: null,
    created_at: "2026-01-01T00:00:00.000000Z", updated_at: "2026-01-01T00:00:00.000000Z",
  },
  badempToken: "mock-sanctum-token-bademp",
  badempUser: {
    id: 9, uuid: "3f6d0f62-4d9b-4f2a-9f3a-0demo0000010",
    name: "Demo Bademp", email: "bademp@orbit.example", phone: null,
    role: "owner", is_active: true, email_verified_at: null,
    created_at: "2026-01-01T00:00:00.000000Z", updated_at: "2026-01-01T00:00:00.000000Z",
  },
  baddeptToken: "mock-sanctum-token-baddept",
  baddeptUser: {
    id: 10, uuid: "3f6d0f62-4d9b-4f2a-9f3a-0demo0000011",
    name: "Demo Baddept", email: "baddept@orbit.example", phone: null,
    role: "owner", is_active: true, email_verified_at: null,
    created_at: "2026-01-01T00:00:00.000000Z", updated_at: "2026-01-01T00:00:00.000000Z",
  },
  badleaveToken: "mock-sanctum-token-badleave",
  badleaveUser: {
    id: 11, uuid: "3f6d0f62-4d9b-4f2a-9f3a-0demo0000012",
    name: "Demo Badleave", email: "badleave@orbit.example", phone: null,
    role: "owner", is_active: true, email_verified_at: null,
    created_at: "2026-01-01T00:00:00.000000Z", updated_at: "2026-01-01T00:00:00.000000Z",
  },
  badpermToken: "mock-sanctum-token-badperm",
  badpermUser: {
    id: 12, uuid: "3f6d0f62-4d9b-4f2a-9f3a-0demo0000013",
    name: "Demo Badperm", email: "badperm@orbit.example", phone: null,
    role: "owner", is_active: true, email_verified_at: null,
    created_at: "2026-01-01T00:00:00.000000Z", updated_at: "2026-01-01T00:00:00.000000Z",
  },
  badempfieldsToken: "mock-sanctum-token-badempfields",
  badempfieldsUser: {
    id: 13, uuid: "3f6d0f62-4d9b-4f2a-9f3a-0demo0000014",
    name: "Demo Badempfields", email: "badempfields@orbit.example", phone: null,
    role: "owner", is_active: true, email_verified_at: null,
    created_at: "2026-01-01T00:00:00.000000Z", updated_at: "2026-01-01T00:00:00.000000Z",
  },
  baddeptfieldsToken: "mock-sanctum-token-baddeptfields",
  baddeptfieldsUser: {
    id: 14, uuid: "3f6d0f62-4d9b-4f2a-9f3a-0demo0000015",
    name: "Demo Baddeptfields", email: "baddeptfields@orbit.example", phone: null,
    role: "owner", is_active: true, email_verified_at: null,
    created_at: "2026-01-01T00:00:00.000000Z", updated_at: "2026-01-01T00:00:00.000000Z",
  },
  badleavefieldsToken: "mock-sanctum-token-badleavefields",
  badleavefieldsUser: {
    id: 15, uuid: "3f6d0f62-4d9b-4f2a-9f3a-0demo0000016",
    name: "Demo Badleavefields", email: "badleavefields@orbit.example", phone: null,
    role: "owner", is_active: true, email_verified_at: null,
    created_at: "2026-01-01T00:00:00.000000Z", updated_at: "2026-01-01T00:00:00.000000Z",
  },
  badpermfieldsToken: "mock-sanctum-token-badpermfields",
  badpermfieldsUser: {
    id: 16, uuid: "3f6d0f62-4d9b-4f2a-9f3a-0demo0000017",
    name: "Demo Badpermfields", email: "badpermfields@orbit.example", phone: null,
    role: "owner", is_active: true, email_verified_at: null,
    created_at: "2026-01-01T00:00:00.000000Z", updated_at: "2026-01-01T00:00:00.000000Z",
  },
  badidentityToken: "mock-sanctum-token-badidentity",
  badidentityUser: {
    id: 17, uuid: "3f6d0f62-4d9b-4f2a-9f3a-0demo0000018",
    name: "Demo Badidentity", email: "badidentity@orbit.example", phone: null,
    role: "owner", is_active: true, email_verified_at: null,
    created_at: "2026-01-01T00:00:00.000000Z", updated_at: "2026-01-01T00:00:00.000000Z",
  },
  badempstatusToken: "mock-sanctum-token-badempstatus",
  badempstatusUser: {
    id: 18, uuid: "3f6d0f62-4d9b-4f2a-9f3a-0demo0000019",
    name: "Demo Badempstatus", email: "badempstatus@orbit.example", phone: null,
    role: "owner", is_active: true, email_verified_at: null,
    created_at: "2026-01-01T00:00:00.000000Z", updated_at: "2026-01-01T00:00:00.000000Z",
  },
};

/* Phase 3.2 personas (SIMULATED contract; real behavior is verified only against Laravel).
 * The default demo owner models an Owner who has been bootstrapped as HR Administrator,
 * so the Phase 3 management suites keep exercising the permitted paths. */
const mkUser = (id, name, email, role) => ({
  id, uuid: `3f6d0f62-4d9b-4f2a-9f3a-0demo00001${id}`, name, email, phone: null, role,
  is_active: true, email_verified_at: null,
  created_at: "2026-01-01T00:00:00.000000Z", updated_at: "2026-01-01T00:00:00.000000Z",
});
DEMO.hrToken = "mock-sanctum-token-hr";
DEMO.hrUser = mkUser(20, "Demo HR", "hr@orbit.example", "employee");
DEMO.plainownerToken = "mock-sanctum-token-plainowner";
DEMO.plainownerUser = mkUser(21, "Demo Plain Owner", "plainowner@orbit.example", "owner");
DEMO.viewonlyToken = "mock-sanctum-token-viewonly";
DEMO.viewonlyUser = mkUser(22, "Demo View Only", "viewonly@orbit.example", "employee");
DEMO.platformToken = "mock-sanctum-token-platform";
DEMO.platformUser = mkUser(23, "Demo Platform Admin", "platform@orbit.example", "owner");
DEMO.cronlyToken = "mock-sanctum-token-cronly";
DEMO.cronlyUser = mkUser(25, "Demo Create Only", "cronly@orbit.example", "employee");
DEMO.uponlyToken = "mock-sanctum-token-uponly";
DEMO.uponlyUser = mkUser(26, "Demo Update Only", "uponly@orbit.example", "employee");
DEMO.delonlyToken = "mock-sanctum-token-delonly";
DEMO.delonlyUser = mkUser(27, "Demo Delete Only", "delonly@orbit.example", "employee");
DEMO.plainadminToken = "mock-sanctum-token-plainadmin";
DEMO.plainadminUser = mkUser(28, "Demo Plain Admin", "plainadmin@orbit.example", "admin");
DEMO.sysadminToken = "mock-sanctum-token-sysadmin";
DEMO.sysadminUser = mkUser(29, "Demo System Super Admin", "sysadmin@orbit.example", "employee");
DEMO.noaccessToken = "mock-sanctum-token-noaccess";
DEMO.noaccessUser = mkUser(24, "Demo No Access Block", "noaccess@orbit.example", "owner");

const HR_PERMS = [
  "employees.view", "employees.create", "employees.update", "employees.delete", "employees.view_personal_data",
  "departments.view", "departments.create", "departments.update", "departments.delete",
  "job_titles.view", "job_titles.create", "job_titles.update", "job_titles.delete",
  "roles.view", "roles.create", "roles.update", "roles.delete", "roles.assign", "permissions.view", "permissions.manage",
];
// FINAL-V3: the legacy Owner/Admin account types hold NO implicit permission (no fallback).
const PROTECTED_PERMS = ["audit_logs.view", "company_settings.manage", "work_schedules.manage"];
const HR_DELEGATES = HR_PERMS.filter((p) => !["roles.create", "roles.update", "roles.delete", "roles.assign", "permissions.manage"].includes(p));
function permsFor(token) {
  if (token === DEMO.employeeToken || token === DEMO.managerToken || token === DEMO.unknownroleToken) return [];
  if (token === DEMO.plainownerToken || token === DEMO.plainadminToken) return [];
  if (token === DEMO.sysadminToken) return [...HR_PERMS, ...PROTECTED_PERMS].sort();
  if (token === DEMO.viewonlyToken) return ["employees.view", "departments.view", "job_titles.view"];
  if (token === DEMO.platformToken) return [];
  if (token === DEMO.hrToken) return HR_PERMS;
  if (token === DEMO.cronlyToken) return ["departments.view", "departments.create", "roles.view", "roles.create", "permissions.view"];
  if (token === DEMO.uponlyToken) return ["departments.view", "departments.update", "roles.view", "roles.update", "permissions.view"];
  if (token === DEMO.delonlyToken) return ["departments.view", "departments.delete", "roles.view", "roles.delete", "permissions.view"];
  // The default demo owner models an Owner bootstrapped as HR Administrator: exactly the role's permissions (no implicit protected administration).
  return HR_PERMS;
}
const can = (token, p) => permsFor(token).includes(p);
const SSA_ROLE = { id: 3, key: "system_super_admin", name: "System Super Admin", name_ar: "مدير النظام الأعلى", is_system: true };
const HR_ROLE = { id: 1, key: "hr_administrator", name: "HR Administrator", name_ar: "مسؤول الموارد البشرية", is_system: true };
// SIMULATED: which RBAC roles /auth/me reports. HR-bootstrapped personas hold the HR role; custom-role personas hold a custom role; unbootstrapped owners and employees none.
function meRoles(token) {
  if (token === DEMO.hrToken || token === DEMO.token) return [HR_ROLE];
  if (token === DEMO.sysadminToken) return [SSA_ROLE];
  if ([DEMO.viewonlyToken, DEMO.cronlyToken, DEMO.uponlyToken, DEMO.delonlyToken].includes(token)) return [{ id: 2, key: "recruiter", name: "Recruiter", name_ar: null, is_system: false }];
  return [];
}

const EXTRA_TOKENS = {
  [DEMO.hrToken]: DEMO.hrUser,
  [DEMO.plainownerToken]: DEMO.plainownerUser,
  [DEMO.plainadminToken]: DEMO.plainadminUser,
  [DEMO.sysadminToken]: DEMO.sysadminUser,
  [DEMO.viewonlyToken]: DEMO.viewonlyUser,
  [DEMO.platformToken]: DEMO.platformUser,
  [DEMO.noaccessToken]: DEMO.noaccessUser,
  [DEMO.cronlyToken]: DEMO.cronlyUser,
  [DEMO.uponlyToken]: DEMO.uponlyUser,
  [DEMO.delonlyToken]: DEMO.delonlyUser,
  [DEMO.managerToken]: DEMO.managerUser,
  [DEMO.forbiddenToken]: DEMO.forbiddenUser,
  [DEMO.brokensessionToken]: DEMO.brokensessionUser,
  [DEMO.malformedToken]: DEMO.malformedUser,
  [DEMO.slowToken]: DEMO.slowUser,
  [DEMO.unknownroleToken]: DEMO.unknownroleUser,
  [DEMO.badempToken]: DEMO.badempUser,
  [DEMO.baddeptToken]: DEMO.baddeptUser,
  [DEMO.badleaveToken]: DEMO.badleaveUser,
  [DEMO.badpermToken]: DEMO.badpermUser,
  [DEMO.badempfieldsToken]: DEMO.badempfieldsUser,
  [DEMO.baddeptfieldsToken]: DEMO.baddeptfieldsUser,
  [DEMO.badleavefieldsToken]: DEMO.badleavefieldsUser,
  [DEMO.badpermfieldsToken]: DEMO.badpermfieldsUser,
  [DEMO.badidentityToken]: DEMO.badidentityUser,
  [DEMO.badempstatusToken]: DEMO.badempstatusUser,
};

/* Phase 2 fixtures: fictional demo data matching the verified resource
 * shapes. Dates are fixed so tests are deterministic. */
const FIXTURES = {
  departments: [
    { id: 1, uuid: "dep-uuid-0001", name: "Structural Engineering", description: "Structural design and review", is_active: true },
    { id: 2, uuid: "dep-uuid-0002", name: "MEP Engineering", description: "Mechanical, electrical and plumbing", is_active: true },
    { id: 3, uuid: "dep-uuid-0003", name: "Project Management", description: "Delivery and supervision", is_active: false },
  ],
  jobTitles: [
    { id: 1, uuid: "job-uuid-0001", name: "Principal Engineer", description: null, is_active: true },
    { id: 2, uuid: "job-uuid-0002", name: "Senior Engineer", description: null, is_active: true },
  ],
  users: [
    { id: 1, uuid: "user-uuid-0001", name: "Demo Owner", email: "demo@orbit.example" },
    { id: 2, uuid: "user-uuid-0002", name: "Demo Employee", email: "employee@orbit.example" },
  ],
  employees: [
    {
      id: 1, uuid: "emp-uuid-0001", employee_number: "EMP-001",
      first_name: "Demo", last_name: "Owner", email: "demo@orbit.example",
      employment_status: "active", department_id: 1, job_title_id: 1, manager_id: null, user_id: 1,
      hire_date: "2020-01-15", termination_date: null,
      phone: "+201000000001", date_of_birth: "1990-05-10", gender: "male", national_id: "29005100100011",
      department: { id: 1, uuid: "dep-uuid-0001", name: "Structural Engineering", description: "Structural design and review", is_active: true },
      job_title: { id: 1, uuid: "job-uuid-0001", name: "Principal Engineer", description: null, is_active: true },
      manager: null,
      user: { id: 1, uuid: "user-uuid-0001", name: "Demo Owner", email: "demo@orbit.example" },
    },
    {
      id: 2, uuid: "emp-uuid-0002", employee_number: "EMP-002",
      first_name: "Demo", last_name: "Employee", email: "employee@orbit.example",
      employment_status: "active", department_id: 2, job_title_id: 2, manager_id: 1, user_id: 2,
      hire_date: "2021-03-01", termination_date: null,
      phone: "+201000000002", date_of_birth: "1995-08-20", gender: "female", national_id: "29508200100022",
      department: { id: 2, uuid: "dep-uuid-0002", name: "MEP Engineering", description: "Mechanical, electrical and plumbing", is_active: true },
      job_title: { id: 2, uuid: "job-uuid-0002", name: "Senior Engineer", description: null, is_active: true },
      manager: { id: 1, uuid: "emp-uuid-0001", employee_number: "EMP-001", first_name: "Demo", last_name: "Owner", email: "demo@orbit.example" },
      user: { id: 2, uuid: "user-uuid-0002", name: "Demo Employee", email: "employee@orbit.example" },
    },
    {
      id: 3, uuid: "emp-uuid-0003", employee_number: "EMP-003",
      first_name: "Onleave", last_name: "Tester", email: "onleave@orbit.example",
      employment_status: "on_leave", department_id: 1, job_title_id: 2, manager_id: 1, user_id: null,
      hire_date: "2022-06-01", termination_date: null,
      phone: null, date_of_birth: "1998-01-01", gender: "other", national_id: null,
      department: { id: 1, uuid: "dep-uuid-0001", name: "Structural Engineering", description: "Structural design and review", is_active: true },
      job_title: { id: 2, uuid: "job-uuid-0002", name: "Senior Engineer", description: null, is_active: true },
      manager: { id: 1, uuid: "emp-uuid-0001", employee_number: "EMP-001", first_name: "Demo", last_name: "Owner", email: "demo@orbit.example" },
      user: null,
    },
  ],
  leaveTypes: [
    { id: 1, uuid: "lt-uuid-0001", name: "Annual Leave" },
    { id: 2, uuid: "lt-uuid-0002", name: "Sick Leave" },
  ],
};

const LEAVE_REQUESTS = [
  { id: 5, uuid: "lr-uuid-0005", employee: { id: 2, first_name: "Demo", last_name: "Employee" }, leave_type: FIXTURES.leaveTypes[0], start_date: "2026-07-01", end_date: "2026-07-03", deducted_leave_days: 3, status: "pending", created_at: "2026-06-20T09:00:00.000000Z" },
  { id: 4, uuid: "lr-uuid-0004", employee: { id: 3, first_name: "Onleave", last_name: "Tester" }, leave_type: FIXTURES.leaveTypes[1], start_date: "2026-06-15", end_date: "2026-06-16", deducted_leave_days: 2, status: "pending", created_at: "2026-06-10T09:00:00.000000Z" },
  { id: 3, uuid: "lr-uuid-0003", employee: { id: 2, first_name: "Demo", last_name: "Employee" }, leave_type: FIXTURES.leaveTypes[0], start_date: "2026-05-05", end_date: "2026-05-06", deducted_leave_days: 2, status: "approved", created_at: "2026-05-01T09:00:00.000000Z" },
  { id: 2, uuid: "lr-uuid-0002", employee: { id: 2, first_name: "Demo", last_name: "Employee" }, leave_type: FIXTURES.leaveTypes[1], start_date: "2026-04-10", end_date: "2026-04-10", deducted_leave_days: 1, status: "rejected", created_at: "2026-04-05T09:00:00.000000Z" },
  { id: 1, uuid: "lr-uuid-0001", employee: { id: 3, first_name: "Onleave", last_name: "Tester" }, leave_type: FIXTURES.leaveTypes[0], start_date: "2026-03-01", end_date: "2026-03-05", deducted_leave_days: 5, status: "approved", created_at: "2026-02-20T09:00:00.000000Z" },
];

const PERMISSION_REQUESTS = [
  { id: 4, uuid: "pr-uuid-0004", employee: { id: 2, first_name: "Demo", last_name: "Employee" }, date: "2026-06-18", status: "pending", created_at: "2026-06-17T08:00:00.000000Z" },
  { id: 3, uuid: "pr-uuid-0003", employee: { id: 3, first_name: "Onleave", last_name: "Tester" }, date: "2026-06-12", status: "pending", created_at: "2026-06-11T08:00:00.000000Z" },
  { id: 2, uuid: "pr-uuid-0002", employee: { id: 2, first_name: "Demo", last_name: "Employee" }, date: "2026-05-20", status: "approved", created_at: "2026-05-19T08:00:00.000000Z" },
  { id: 1, uuid: "pr-uuid-0001", employee: { id: 2, first_name: "Demo", last_name: "Employee" }, date: "2026-04-22", status: "rejected", created_at: "2026-04-21T08:00:00.000000Z" },
];

/* Phase 3: mutable stores for departments / job-titles / employees.
 * Deletions are SOFT (deleted flag) mirroring the backend's SoftDeletes:
 * deleted rows vanish from lists and embedded relations resolve to null,
 * but FK ids stay on the record. All data is fictional. */
const MOCK_HITS = [];
const store = {
  departments: structuredClone(FIXTURES.departments),
  jobTitles: structuredClone(FIXTURES.jobTitles),
  employees: structuredClone(FIXTURES.employees),
  roles: [
    { id: 1, uuid: "role-uuid-1", key: "hr_administrator", name: "HR Administrator", name_ar: "مسؤول الموارد البشرية", description: "Manages employees, departments, job titles and tenant roles.", is_system: true, is_protected: false, permissions: HR_PERMS, users_count: 1 },
    { id: 2, uuid: "role-uuid-2", key: "recruiter", name: "Recruiter", name_ar: null, description: "Views and creates employees.", is_system: false, is_protected: false, permissions: ["employees.view", "employees.create"], users_count: 0 },
  ],
  accessUsers: [
    { id: 20, name: "Demo HR", email: "hr@orbit.example", is_active: true, legacy_role: "employee", roles: [{ id: 1, key: "hr_administrator", name: "HR Administrator", is_system: true }] },
    { id: 2, name: "Demo Employee", email: "employee@orbit.example", is_active: true, legacy_role: "employee", roles: [] },
    { id: 10, name: "Demo Manager", email: "manager@orbit.example", is_active: true, legacy_role: "manager", roles: [] },
  ],
  deleted: { departments: new Set(), jobTitles: new Set(), employees: new Set() },
};
if (process.env.MOCK_LARGE_REGISTRY) { // SIMULATED stress data for Roles & Permissions usability/perf
  for (let i = 0; i < 300; i++) store.accessUsers.push({ id: 1000 + i, name: `Bulk User ${i}`, email: `bulk${i}@orbit.example`, is_active: true, legacy_role: "employee", roles: [] });
  for (let i = 0; i < 60; i++) store.roles.push({ id: 100 + i, uuid: `role-uuid-${100 + i}`, key: `custom_bulk_${i}`, name: `Bulk Role ${i}`, name_ar: null, description: null, is_system: false, is_protected: false, permissions: ["employees.view"], users_count: 0 });
}

function embedEmployee(emp, token) {
  const dep = store.departments.find((d) => d.id === emp.department_id && !store.deleted.departments.has(d.id));
  const job = store.jobTitles.find((j) => j.id === emp.job_title_id && !store.deleted.jobTitles.has(j.id));
  const mgr = store.employees.find((m) => m.id === emp.manager_id && !store.deleted.employees.has(m.id));
  const usr = FIXTURES.users.find((u) => u.id === emp.user_id);
  const out = {
    ...emp,
    department: dep ?? null,
    job_title: job ?? null,
    manager: mgr
      ? { id: mgr.id, uuid: mgr.uuid, employee_number: mgr.employee_number, first_name: mgr.first_name, last_name: mgr.last_name, email: mgr.email }
      : null,
    user: usr ?? null,
  };
  /* viewPersonalData policy (verified): owner/admin see personal data on
   * every record; an employee sees only their own record's; a manager
   * sees only records in their management hierarchy (the demo manager
   * manages nobody, so nothing extra). */
  const isPrivileged = can(token, "employees.view_personal_data");
  const isSelf = emp.user_id === 2 && token === DEMO.employeeToken;
  if (!isPrivileged && !isSelf) {
    delete out.phone;
    delete out.date_of_birth;
    delete out.gender;
    delete out.national_id;
  }
  return out;
}

function isKnownToken(token) {
  return token === DEMO.token || token === DEMO.employeeToken || token === DEMO.dashfailToken || token in EXTRA_TOKENS;
}

function laravel422(errors) {
  const count = Object.values(errors).reduce((n, arr) => n + arr.length - 1, 0);
  const first = Object.values(errors)[0]?.[0] ?? "Invalid value.";
  return {
    message: count > 0 ? `${first} (and ${count} more error${count > 1 ? "s" : ""})` : first,
    errors,
  };
}

function validateOrgEntity(body, items, selfId) {
  const errors = {};
  if (typeof body.name !== "string" || body.name.trim() === "") {
    errors.name = ["The name field is required."];
  } else if (body.name.length > 255) {
    errors.name = ["The name field must not be greater than 255 characters."];
  } else if (items.some((d) => d.id !== selfId && d.name === body.name)) {
    errors.name = ["The name has already been taken."];
  }
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== "string" || body.description.length > 1000) {
      errors.description = ["The description field must not be greater than 1000 characters."];
    }
  }
  if (body.is_active !== undefined && body.is_active !== null && typeof body.is_active !== "boolean") {
    errors.is_active = ["The is active field must be true or false."];
  }
  return errors;
}

function validateEmployee(body, selfId) {
  const errors = {};
  const emps = store.employees.filter((e) => !store.deleted.employees.has(e.id));
  /* Simulated tenant-scope failure keyed by a field the frontend BFF does
   * NOT allow: proves a 422 without known field errors still surfaces a
   * generic localized message instead of failing silently. */
  if (body.first_name === "Unknown422") {
    errors.tenant_scope = ["The tenant scope check failed."];
    return errors;
  }
  for (const f of ["employee_number", "first_name", "last_name", "email"]) {
    if (body[f] === undefined && selfId != null) continue; // sometimes rules on update
    if (typeof body[f] !== "string" || body[f].trim() === "") {
      errors[f] = [`The ${f.replaceAll("_", " ")} field is required.`];
    }
  }
  if (typeof body.employee_number === "string" && body.employee_number.length > 50) {
    errors.employee_number = ["The employee number field must not be greater than 50 characters."];
  }
  if (typeof body.employee_number === "string" && emps.some((e) => e.id !== selfId && e.employee_number === body.employee_number)) {
    errors.employee_number = ["The employee number has already been taken."];
  }
  if (typeof body.email === "string" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) {
    errors.email = ["The email field must be a valid email address."];
  } else if (typeof body.email === "string" && emps.some((e) => e.id !== selfId && e.email === body.email)) {
    errors.email = ["The email has already been taken."];
  }
  if (body.gender !== undefined && body.gender !== null && !["male", "female", "other", "prefer_not_to_say"].includes(body.gender)) {
    errors.gender = ["The selected gender is invalid."];
  }
  if (body.employment_status !== undefined && body.employment_status !== null && !["active", "on_leave", "suspended", "terminated"].includes(body.employment_status)) {
    errors.employment_status = ["The selected employment status is invalid."];
  }
  const dateOk = (v) => typeof v === "string" && !Number.isNaN(new Date(v).getTime());
  if (body.date_of_birth !== undefined && body.date_of_birth !== null) {
    if (!dateOk(body.date_of_birth)) errors.date_of_birth = ["The date of birth field must be a valid date."];
    else if (new Date(body.date_of_birth) >= new Date(new Date().toDateString())) {
      errors.date_of_birth = ["The date of birth field must be a date before today."];
    }
  }
  for (const f of ["hire_date", "termination_date"]) {
    if (body[f] !== undefined && body[f] !== null && !dateOk(body[f])) {
      errors[f] = [`The ${f.replaceAll("_", " ")} field must be a valid date.`];
    }
  }
  const hire = body.hire_date !== undefined ? body.hire_date : null;
  const term = body.termination_date !== undefined ? body.termination_date : null;
  if (term && hire && dateOk(term) && dateOk(hire) && new Date(term) < new Date(hire)) {
    errors.termination_date = ["The termination date field must be a date after or equal to hire date."];
  }
  if (body.department_id !== undefined && body.department_id !== null &&
      !store.departments.some((d) => d.id === body.department_id && !store.deleted.departments.has(d.id))) {
    errors.department_id = ["The selected department id is invalid."];
  }
  if (body.job_title_id !== undefined && body.job_title_id !== null &&
      !store.jobTitles.some((j) => j.id === body.job_title_id && !store.deleted.jobTitles.has(j.id))) {
    errors.job_title_id = ["The selected job title id is invalid."];
  }
  if (body.manager_id !== undefined && body.manager_id !== null) {
    if (!emps.some((e) => e.id === body.manager_id)) {
      errors.manager_id = ["The selected manager id is invalid."];
    } else if (selfId != null) {
      /* Backend mirrors Rule::notIn(self + all direct/indirect
       * subordinates): assigning self or anyone below self in the
       * reporting chain is rejected to prevent cycles. */
      const invalid = new Set([selfId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const e of emps) {
          if (e.manager_id != null && invalid.has(e.manager_id) && !invalid.has(e.id)) {
            invalid.add(e.id);
            changed = true;
          }
        }
      }
      if (invalid.has(body.manager_id)) {
        errors.manager_id = ["The selected manager id is invalid."];
      }
    }
  }
  return errors;
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { resolve(JSON.parse(raw)); } catch { resolve(null); }
    });
  });
}

function paginated(data, url) {
  const status = url.searchParams.get("status");
  const filtered = status ? data.filter((r) => r.status === status) : data;
  return {
    data: filtered,
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: 1,
      from: filtered.length ? 1 : null,
      last_page: 1,
      path: url.pathname,
      per_page: 20,
      to: filtered.length ? filtered.length : null,
      total: filtered.length,
    },
  };
}

let revoked = false;

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method === "POST" && url.pathname === "/api/v1/auth/login") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let body = {};
      try { body = JSON.parse(raw); } catch { /* handled below */ }
      if (body.email === "error@orbit.example") {
        return send(res, 500, { message: "SQLSTATE[42S02]: Base table or view not found (simulated internal error)" });
      }
      if (body.email === "inactive@orbit.example") {
        // Known safe code, but message carries simulated internal detail
        // that must never be forwarded.
        return send(res, 403, {
          message: "SQLSTATE[42S02]: users.deleted_at is null (simulated internal detail)",
          code: "USER_INACTIVE",
          debug: { sql: "SELECT * FROM users WHERE id=1 (simulated internal detail)" },
        });
      }
      if (body.email === "denied@orbit.example") {
        // Unknown 403 code with internal-looking text: must become generic.
        return send(res, 403, {
          message: "Stack trace: PolicyException in /app/Policies/LoginPolicy.php:42 (simulated internal detail)",
          code: "INTERNAL_POLICY_FAILURE",
        });
      }
      if (body.email === "inactive-session@orbit.example") {
        // Login succeeds, but the session is later rejected by /me as inactive.
        revoked = false;
        return send(res, 200, {
          message: "Authenticated successfully.",
          token: DEMO.inactiveToken,
          token_type: "Bearer",
          user: { ...DEMO.user, email: body.email },
          company: DEMO.company,
        });
      }
      if (body.email === "weirdcode@orbit.example") {
        // Prototype-key code: must not count as a known safe code.
        return send(res, 403, { message: "internal detail", code: "toString" });
      }
      if (body.email === "limited@orbit.example") {
        return send(res, 429, { message: "Too many login attempts." }, { "Retry-After": "60" });
      }
      const extraByEmail = {
        "hr@orbit.example": [DEMO.hrToken, DEMO.hrUser],
        "plainowner@orbit.example": [DEMO.plainownerToken, DEMO.plainownerUser],
        "plainadmin@orbit.example": [DEMO.plainadminToken, DEMO.plainadminUser],
        "sysadmin@orbit.example": [DEMO.sysadminToken, DEMO.sysadminUser],
        "viewonly@orbit.example": [DEMO.viewonlyToken, DEMO.viewonlyUser],
        "platform@orbit.example": [DEMO.platformToken, DEMO.platformUser],
        "noaccess@orbit.example": [DEMO.noaccessToken, DEMO.noaccessUser],
        "cronly@orbit.example": [DEMO.cronlyToken, DEMO.cronlyUser],
        "uponly@orbit.example": [DEMO.uponlyToken, DEMO.uponlyUser],
        "delonly@orbit.example": [DEMO.delonlyToken, DEMO.delonlyUser],
        "employee@orbit.example": [DEMO.employeeToken, DEMO.employeeUser],
        "manager@orbit.example": [DEMO.managerToken, DEMO.managerUser],
        "dashfail@orbit.example": [DEMO.dashfailToken, DEMO.dashfailUser],
        "forbidden@orbit.example": [DEMO.forbiddenToken, DEMO.forbiddenUser],
        "brokensession@orbit.example": [DEMO.brokensessionToken, DEMO.brokensessionUser],
        "malformed@orbit.example": [DEMO.malformedToken, DEMO.malformedUser],
        "slow@orbit.example": [DEMO.slowToken, DEMO.slowUser],
        "unknownrole@orbit.example": [DEMO.unknownroleToken, DEMO.unknownroleUser],
        "bademp@orbit.example": [DEMO.badempToken, DEMO.badempUser],
        "baddept@orbit.example": [DEMO.baddeptToken, DEMO.baddeptUser],
        "badleave@orbit.example": [DEMO.badleaveToken, DEMO.badleaveUser],
        "badperm@orbit.example": [DEMO.badpermToken, DEMO.badpermUser],
        "badempfields@orbit.example": [DEMO.badempfieldsToken, DEMO.badempfieldsUser],
        "baddeptfields@orbit.example": [DEMO.baddeptfieldsToken, DEMO.baddeptfieldsUser],
        "badleavefields@orbit.example": [DEMO.badleavefieldsToken, DEMO.badleavefieldsUser],
        "badpermfields@orbit.example": [DEMO.badpermfieldsToken, DEMO.badpermfieldsUser],
        "badidentity@orbit.example": [DEMO.badidentityToken, DEMO.badidentityUser],
        "badempstatus@orbit.example": [DEMO.badempstatusToken, DEMO.badempstatusUser],
      };
      if (body.email in extraByEmail && body.password === DEMO.password) {
        revoked = false;
        const [tok, user] = extraByEmail[body.email];
        return send(res, 200, {
          message: "Authenticated successfully.",
          token: tok,
          token_type: "Bearer",
          user,
          company: DEMO.company,
        });
      }
      if (body.email !== DEMO.email || body.password !== DEMO.password) {
        return send(res, 422, {
          message: "SQLSTATE[42S02]: Base table or view not found (simulated internal detail)",
          errors: {
            email: [
              "These credentials do not match our records.",
              "SQLSTATE[42S02] stack trace (simulated internal detail)",
              "select from users where email equals admin at internal dot local",
            ],
            internal_table: ["select * from users (simulated internal detail)"],
          },
          trace: "SQLSTATE[42S02] stack trace (simulated internal detail)",
        });
      }
      revoked = false;
      return send(res, 200, {
        message: "Authenticated successfully.",
        token: DEMO.token,
        token_type: "Bearer",
        user: DEMO.user,
        company: DEMO.company,
      });
    });
    return;
  }
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (url.pathname === "/api/v1/auth/me" && req.method === "GET") {
    if (token === DEMO.inactiveToken) {
      return send(res, 403, { message: "Your user account is inactive.", code: "USER_INACTIVE" });
    }
    const knownToken = token === DEMO.token || token === DEMO.employeeToken || token === DEMO.dashfailToken || token in EXTRA_TOKENS;
    if (!knownToken || revoked) {
      return send(res, 401, { message: "Unauthenticated." });
    }
    if (token === DEMO.brokensessionToken) {
      // Session rejected while data endpoints still answer: pages must not
      // render private content on a failed session validation.
      return send(res, 401, { message: "Unauthenticated." });
    }
    if (token === DEMO.malformedToken) {
      return send(res, 200, { message: "ok", unexpected: true });
    }
    if (token === DEMO.badidentityToken) {
      // Envelope is well-formed but identity fields have wrong types:
      // the guard must fail closed instead of letting this reach React.
      return send(res, 200, {
        user: { ...DEMO.badidentityUser, name: { broken: true }, email: ["not-a-string"] },
        company: DEMO.company,
      });
    }
    const user = token === DEMO.token ? DEMO.user : token === DEMO.employeeToken ? DEMO.employeeUser : token === DEMO.dashfailToken ? DEMO.dashfailUser : EXTRA_TOKENS[token];
    if (token === DEMO.noaccessToken) {
      // Older/malformed backend: no access block at all. The app must fail closed (zero permissions).
      return send(res, 200, { user, company: DEMO.company });
    }
    return send(res, 200, {
      user,
      company: DEMO.company,
      access: { permissions: permsFor(token), roles: meRoles(token), is_platform_admin: token === DEMO.platformToken },
    });
  }
  /* Phase 3.2 access administration (simulated). */
  if (url.pathname.startsWith("/api/v1/access/")) {
    if (!isKnownToken(token) || revoked) return send(res, 401, { message: "Unauthenticated." });
    const route = url.pathname.slice("/api/v1/access".length);
    const deny = (status, code) => send(res, status, { message: code, code });
    if (route === "/permissions" && req.method === "GET") {
      if (!can(token, "permissions.view") && !can(token, "roles.view")) return deny(403, "forbidden");
      const LARGE = process.env.MOCK_LARGE_REGISTRY ? Number(process.env.MOCK_LARGE_REGISTRY) : 0; // SIMULATED stress registry (usability/perf only)
      const groups = { employees: HR_PERMS.filter((x) => x.startsWith("employees.")), departments: HR_PERMS.filter((x) => x.startsWith("departments.")), job_titles: HR_PERMS.filter((x) => x.startsWith("job_titles.")), roles: HR_PERMS.filter((x) => x.startsWith("roles.") || x.startsWith("permissions.")) };
      if (LARGE) for (const key of Object.keys(groups)) for (let i = 0; i < LARGE; i++) groups[key] = [...groups[key], `${key}.bulk_${String(i).padStart(3, "0")}`];
      return send(res, 200, { data: {
        groups: Object.entries(groups).map(([key, perms]) => ({ key, permissions: perms.map((code) => ({ code, grantable_by_you: HR_DELEGATES.includes(code) || /\.bulk_/.test(code) })) })),
        protected: PROTECTED_PERMS, reserved: ["payroll.view"], your_permissions: permsFor(token),
      } });
    }
    if (route === "/roles" && req.method === "GET") {
      if (!can(token, "roles.view")) return deny(403, "forbidden");
      return send(res, 200, { data: store.roles });
    }
    if (route === "/users" && req.method === "GET") {
      if (!can(token, "roles.view") && !can(token, "roles.assign")) return deny(403, "forbidden");
      const q = (url.searchParams.get("search") ?? "").trim().toLowerCase();
      const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("per_page") ?? 25)));
      const all = store.accessUsers.filter((u) => !q || `${u.name} ${u.email}`.toLowerCase().includes(q));
      const last = Math.max(1, Math.ceil(all.length / perPage));
      const page = Math.min(Math.max(1, Number(url.searchParams.get("page") ?? 1)), last);
      return send(res, 200, { data: all.slice((page - 1) * perPage, page * perPage), meta: { total: all.length, per_page: perPage, current_page: page, last_page: last } });
    }
    let m;
    if ((m = route.match(/^\/users\/(\d+)\/permissions$/)) && req.method === "GET") {
      const u = store.accessUsers.find((x) => x.id === Number(m[1]));
      if (!u) return deny(404, "not_found");
      return send(res, 200, { data: { ...u, effective_permissions: u.roles.some((r) => r.key === "hr_administrator") ? HR_PERMS : [] } });
    }
    return readBody(req).then((body) => {
      if (!can(token, "roles.assign") && !can(token, "roles.create") && !can(token, "roles.update") && !can(token, "roles.delete")) return deny(403, "forbidden");
      if ((m = route.match(/^\/users\/(\d+)\/roles$/)) && req.method === "PUT") {
        const u = store.accessUsers.find((x) => x.id === Number(m[1]));
        if (!u) return deny(404, "not_found");
        if (u.id === 20 && token === DEMO.hrToken) return deny(403, "self_assignment");
        const ids = Array.isArray(body?.role_ids) ? body.role_ids : [];
        if (ids.some((id) => !store.roles.find((r) => r.id === id) || store.roles.find((r) => r.id === id).is_protected)) return deny(422, "invalid_role");
        u.roles = store.roles.filter((r) => ids.includes(r.id)).map((r) => ({ id: r.id, key: r.key, name: r.name, is_system: r.is_system }));
        return send(res, 200, { data: { id: u.id } });
      }
      if (route === "/roles" && req.method === "POST") {
        if (!can(token, "roles.create")) return deny(403, "forbidden");
        const perms = Array.isArray(body?.permissions) ? body.permissions : [];
        if (perms.some((x) => !HR_DELEGATES.includes(x))) return deny(403, "delegation_exceeded");
        if (typeof body?.name !== "string" || body.name.trim() === "") return send(res, 422, { message: "invalid", errors: { name: ["The name field is required."] } });
        if (store.roles.some((r) => r.name.toLowerCase() === body.name.trim().toLowerCase())) return send(res, 422, { message: "invalid", errors: { name: ["The name has already been taken."] } });
        const id = Math.max(0, ...store.roles.map((r) => r.id)) + 1;
        store.roles.push({ id, uuid: `role-uuid-${id}`, key: `custom_${id}`, name: body.name.trim(), name_ar: body.name_ar ?? null, description: body.description ?? null, is_system: false, is_protected: false, permissions: perms, users_count: 0 });
        return send(res, 201, { data: { id } });
      }
      if ((m = route.match(/^\/roles\/(\d+)$/))) {
        const r = store.roles.find((x) => x.id === Number(m[1]));
        if (!r) return deny(404, "not_found");
        if (r.is_protected) return deny(403, "role_protected");
        if (req.method === "DELETE") {
          if (!can(token, "roles.delete")) return deny(403, "forbidden");
          if (r.users_count > 0 || store.accessUsers.some((u) => u.roles.some((x) => x.id === r.id))) return deny(409, "role_in_use");
          store.roles = store.roles.filter((x) => x.id !== r.id);
          return send(res, 200, { message: "Role deleted." });
        }
        if (req.method === "PUT") {
          if (!can(token, "roles.update")) return deny(403, "forbidden");
          const perms = Array.isArray(body?.permissions) ? body.permissions : r.permissions;
          if (perms.some((x) => !HR_DELEGATES.includes(x))) return deny(403, "delegation_exceeded");
          Object.assign(r, { name: body.name ?? r.name, name_ar: body.name_ar ?? null, description: body.description ?? null, permissions: perms });
          return send(res, 200, { data: { id: r.id } });
        }
      }
      return send(res, 404, { message: "Not found." });
    });
  }
  /* Phase 3: single-GET + mutations for departments / job-titles / employees. */
  const resMatch = url.pathname.match(/^\/api\/v1\/(departments|job-titles|employees)\/(\d+)$/);
  const collMatch = url.pathname.match(/^\/api\/v1\/(departments|job-titles|employees)$/);
  if (resMatch || (collMatch && req.method !== "GET")) {
    if (!isKnownToken(token) || revoked) {
      return send(res, 401, { message: "Unauthenticated." });
    }
    {
      // Phase 3.2: explicit per-action permissions (SIMULATED contract).
      const mod = ((resMatch ?? collMatch)[1]).replace("-", "_");
      const need = req.method === "GET" ? "view" : req.method === "POST" ? "create" : req.method === "PUT" ? "update" : "delete";
      // Self-service (mirrors EmployeePolicy::view): a user may read ONLY their own linked record.
      const selfRead = mod === "employees" && need === "view" && resMatch && token === DEMO.employeeToken && store.employees.find((e) => e.id === Number(resMatch[2]))?.user_id === 2;
      if (!selfRead && !can(token, `${mod}.${need}`)) return send(res, 403, { message: "This action is unauthorized." });
    }
    if (token === DEMO.dashfailToken) {
      return send(res, 500, { message: "SQLSTATE[42S02]: simulated internal error" });
    }
    const kind = (resMatch ?? collMatch)[1];
    const idParam = resMatch ? Number(resMatch[2]) : null;
    const items = kind === "departments" ? store.departments : kind === "job-titles" ? store.jobTitles : store.employees;
    const deletedSet = kind === "departments" ? store.deleted.departments : kind === "job-titles" ? store.deleted.jobTitles : store.deleted.employees;

    if (req.method === "GET" && idParam != null) {
      // Simulated cross-tenant id: exists in another tenant's data, so the
      // global tenant scope resolves it to 404 (verified backend behavior).
      if (idParam >= 900000) {
        return send(res, 404, { message: "No query results for model [cross-tenant]" });
      }
      if (token === DEMO.badempfieldsToken && kind === "employees") {
        return send(res, 200, { data: { id: idParam, uuid: "emp-bad-0001", last_name: "Record" } });
      }
      const found = items.find((d) => d.id === idParam);
      if (!found || deletedSet.has(found.id)) {
        return send(res, 404, { message: `No query results for model [App\\Models\\${kind === "employees" ? "Employee" : kind === "departments" ? "Department" : "JobTitle"}] ${idParam}` });
      }
      return send(res, 200, { data: kind === "employees" ? embedEmployee(found, token) : found });
    }

    if (req.method === "DELETE" && idParam != null) {
      const found = items.find((d) => d.id === idParam);
      if (!found || deletedSet.has(found.id)) {
        return send(res, 404, { message: "Not found." });
      }
      deletedSet.add(found.id);
      return send(res, 200, { message: "." });
    }

    return readBody(req).then((body) => {
      if (body === null || typeof body !== "object") {
        return send(res, 400, { message: "Invalid JSON." });
      }
      if (token === DEMO.badempfieldsToken) {
        // 200 with a malformed success envelope: the BFF must not forward it.
        return send(res, 200, { unexpected: true });
      }
      if (kind === "employees") {
        const errors = validateEmployee(body, req.method === "PUT" ? idParam : null);
        if (Object.keys(errors).length > 0) return send(res, 422, laravel422(errors));
        if (req.method === "POST") {
          const id = Math.max(0, ...store.employees.map((e) => e.id)) + 1;
          const rec = {
            id, uuid: `emp-uuid-${String(id).padStart(4, "0")}`,
            employee_number: body.employee_number, first_name: body.first_name, last_name: body.last_name,
            email: body.email, phone: body.phone ?? null, date_of_birth: body.date_of_birth ?? null,
            gender: body.gender ?? null, national_id: body.national_id ?? null,
            hire_date: body.hire_date ?? null, termination_date: body.termination_date ?? null,
            employment_status: body.employment_status ?? "active",
            department_id: body.department_id ?? null, job_title_id: body.job_title_id ?? null,
            manager_id: body.manager_id ?? null, user_id: body.user_id ?? null,
          };
          store.employees.push(rec);
          return send(res, 201, { data: embedEmployee(rec, token) });
        }
        const found = store.employees.find((e) => e.id === idParam);
        if (!found || store.deleted.employees.has(found.id)) return send(res, 404, { message: "Not found." });
        Object.assign(found, body);
        return send(res, 200, { data: embedEmployee(found, token) });
      }
      const errors = validateOrgEntity(body, items.filter((d) => !deletedSet.has(d.id)), req.method === "PUT" ? idParam : null);
      if (Object.keys(errors).length > 0) return send(res, 422, laravel422(errors));
      if (req.method === "POST") {
        const id = Math.max(0, ...items.map((d) => d.id)) + 1;
        const rec = {
          id, uuid: `${kind === "departments" ? "dep" : "job"}-uuid-${String(id).padStart(4, "0")}`,
          name: body.name, description: body.description ?? null, is_active: body.is_active ?? true,
        };
        items.push(rec);
        return send(res, 201, { data: rec });
      }
      const found = items.find((d) => d.id === idParam);
      if (!found || deletedSet.has(found.id)) return send(res, 404, { message: "Not found." });
      if (req.method === "PUT") {
        Object.assign(found, body);
        return send(res, 200, { data: found });
      }
      return send(res, 405, { message: "Method not allowed." });
    });
  }
  if (req.method === "GET" && ["/api/v1/departments", "/api/v1/job-titles", "/api/v1/employees", "/api/v1/leave-requests", "/api/v1/permission-requests"].includes(url.pathname)) {
    {
      const mod = { "/api/v1/departments": "departments", "/api/v1/job-titles": "job_titles", "/api/v1/employees": "employees" }[url.pathname];
      if (mod && isKnownToken(token) && !revoked) {
        MOCK_HITS.push(`${token}:${url.pathname}`);
        if (!can(token, `${mod}.view`)) return send(res, 403, { message: "This action is unauthorized." });
      }
    }
    const knownToken = isKnownToken(token);
    if (!knownToken || revoked) {
      return send(res, 401, { message: "Unauthenticated." });
    }
    if (token === DEMO.forbiddenToken && (url.pathname === "/api/v1/leave-requests" || url.pathname === "/api/v1/permission-requests")) {
      return send(res, 403, { message: "This action is unauthorized." });
    }
    if (token === DEMO.slowToken && url.pathname === "/api/v1/employees") {
      setTimeout(() => send(res, 200, { data: FIXTURES.employees }), 2500);
      return;
    }
    // Per-endpoint malformed 200 envelopes: each token breaks exactly one
    // endpoint so tests can prove per-widget degradation independently.
    if (token === DEMO.badempToken && url.pathname === "/api/v1/employees") {
      return send(res, 200, { unexpected: true });
    }
    if (token === DEMO.baddeptToken && url.pathname === "/api/v1/departments") {
      return send(res, 200, { data: { not: "an-array" } });
    }
    if (token === DEMO.badleaveToken && url.pathname === "/api/v1/leave-requests") {
      return send(res, 200, { data: "not-an-array", meta: { total: "2" } });
    }
    if (token === DEMO.badpermToken && url.pathname === "/api/v1/permission-requests") {
      return send(res, 200, { data: [], meta: { total: -3 } });
    }
    // Object-shaped but field-invalid records: the envelope is a proper
    // array, yet record contents violate the verified contract.
    if (token === DEMO.badempfieldsToken && url.pathname === "/api/v1/employees") {
      return send(res, 200, {
        data: [{ id: 91, uuid: "emp-bad-0001", first_name: "Bad", last_name: "Record" }],
      });
    }
    if (token === DEMO.badempstatusToken && url.pathname === "/api/v1/employees") {
      // Well-formed record except an employment_status outside the verified
      // enum: it must not be counted in any total or bucket.
      return send(res, 200, {
        data: [
          ...FIXTURES.employees,
          {
            id: 92, uuid: "emp-bad-0002", employee_number: "EMP-902",
            first_name: "Bad", last_name: "Status", email: "badstatus@orbit.example",
            employment_status: "astronaut", department_id: 1, job_title_id: 1, manager_id: null, user_id: null,
          },
        ],
      });
    }
    if (token === DEMO.baddeptfieldsToken && (url.pathname === "/api/v1/departments" || url.pathname === "/api/v1/job-titles")) {
      return send(res, 200, {
        data: [{ id: 91, uuid: "dep-bad-0001", name: "Bad Dept", description: null, is_active: "yes" }],
      });
    }
    if (token === DEMO.badleavefieldsToken && url.pathname === "/api/v1/leave-requests") {
      const badLeave = {
        id: 91, uuid: "lr-bad-0001",
        employee: { id: 2, first_name: { oops: 1 }, last_name: "Bad" },
        leave_type: FIXTURES.leaveTypes[0],
        start_date: "2026-06-01", end_date: "2026-06-02",
        deducted_leave_days: "three", status: "bogus-status",
        created_at: "2026-05-30T09:00:00.000000Z",
      };
      const missingDateLeave = {
        id: 92, uuid: "lr-bad-0002",
        employee: { id: 2, first_name: "Demo", last_name: "Employee" },
        leave_type: FIXTURES.leaveTypes[0],
        end_date: "2026-06-02",
        deducted_leave_days: 1, status: "approved",
        created_at: "2026-05-30T09:00:00.000000Z",
      };
      return send(res, 200, paginated([...LEAVE_REQUESTS, badLeave, missingDateLeave], url));
    }
    if (token === DEMO.badpermfieldsToken && url.pathname === "/api/v1/permission-requests") {
      const badPerm = {
        id: 91, uuid: "pr-bad-0001",
        employee: { id: 2, first_name: "Demo", last_name: "Employee" },
        date: 20260618, status: "approved", created_at: "not-a-date",
      };
      return send(res, 200, paginated([...PERMISSION_REQUESTS, badPerm], url));
    }
    if (token === DEMO.dashfailToken) {
      // Simulated per-widget failure: three reads fail, departments is empty.
      if (url.pathname === "/api/v1/employees" || url.pathname === "/api/v1/leave-requests" || url.pathname === "/api/v1/permission-requests") {
        return send(res, 500, { message: "SQLSTATE[42S02]: simulated internal error" });
      }
      return send(res, 200, { data: [] });
    }
    if (url.pathname === "/api/v1/departments") {
      let rows = store.departments.filter((d) => !store.deleted.departments.has(d.id));
      const act = url.searchParams.get("is_active");
      if (act === "1" || act === "0") rows = rows.filter((d) => d.is_active === (act === "1"));
      return send(res, 200, { data: rows });
    }
    if (url.pathname === "/api/v1/job-titles") {
      let rows = store.jobTitles.filter((j) => !store.deleted.jobTitles.has(j.id));
      const act = url.searchParams.get("is_active");
      if (act === "1" || act === "0") rows = rows.filter((j) => j.is_active === (act === "1"));
      return send(res, 200, { data: rows });
    }
    if (url.pathname === "/api/v1/employees") {
      let rows = store.employees.filter((e) => !store.deleted.employees.has(e.id));
      const q = (url.searchParams.get("search") ?? "").toLowerCase();
      if (q) {
        rows = rows.filter((e) =>
          [e.first_name, e.last_name, e.employee_number, e.email].some((v) =>
            typeof v === "string" && v.toLowerCase().includes(q)));
      }
      for (const f of ["department_id", "job_title_id", "manager_id", "employment_status"]) {
        const v = url.searchParams.get(f);
        if (v !== null && v !== "") {
          rows = rows.filter((e) => String(e[f]) === v);
        }
      }
      return send(res, 200, { data: rows.map((e) => embedEmployee(e, token)) });
    }
    if (url.pathname === "/api/v1/leave-requests") {
      return send(res, 200, paginated(LEAVE_REQUESTS, url));
    }
    return send(res, 200, paginated(PERMISSION_REQUESTS, url));
  }
  if (url.pathname === "/__hits") {
    if (req.method === "DELETE") MOCK_HITS.length = 0;
    return send(res, 200, { hits: [...MOCK_HITS] });
  }
  if (url.pathname === "/api/v1/auth/logout" && req.method === "POST") {
    if (token === DEMO.inactiveToken) {
      return send(res, 200, { message: "Logged out successfully." });
    }
    if (token !== DEMO.token || revoked) {
      return send(res, 401, { message: "Unauthenticated." });
    }
    revoked = true;
    return send(res, 200, { message: "Logged out successfully." });
  }
  send(res, 404, { message: "Not found." });
});

server.listen(4100, "127.0.0.1", () => {
  console.log("mock backend on http://127.0.0.1:4100/api/v1");
});
