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
};

const EXTRA_TOKENS = {
  [DEMO.forbiddenToken]: DEMO.forbiddenUser,
  [DEMO.brokensessionToken]: DEMO.brokensessionUser,
  [DEMO.malformedToken]: DEMO.malformedUser,
  [DEMO.slowToken]: DEMO.slowUser,
  [DEMO.unknownroleToken]: DEMO.unknownroleUser,
  [DEMO.badempToken]: DEMO.badempUser,
  [DEMO.baddeptToken]: DEMO.baddeptUser,
  [DEMO.badleaveToken]: DEMO.badleaveUser,
  [DEMO.badpermToken]: DEMO.badpermUser,
};

/* Phase 2 fixtures: fictional demo data matching the verified resource
 * shapes. Dates are fixed so tests are deterministic. */
const FIXTURES = {
  departments: [
    { id: 1, uuid: "dep-uuid-0001", name: "Structural Engineering", description: "Structural design and review", is_active: true },
    { id: 2, uuid: "dep-uuid-0002", name: "MEP Engineering", description: "Mechanical, electrical and plumbing", is_active: true },
    { id: 3, uuid: "dep-uuid-0003", name: "Project Management", description: "Delivery and supervision", is_active: false },
  ],
  employees: [
    {
      id: 1, uuid: "emp-uuid-0001", employee_number: "EMP-001",
      first_name: "Demo", last_name: "Owner", email: "demo@orbit.example",
      employment_status: "active", department_id: 1, job_title_id: 1, manager_id: null, user_id: 1,
      department: { id: 1, uuid: "dep-uuid-0001", name: "Structural Engineering", description: "Structural design and review", is_active: true },
      job_title: { id: 1, uuid: "job-uuid-0001", name: "Principal Engineer", description: null, is_active: true },
    },
    {
      id: 2, uuid: "emp-uuid-0002", employee_number: "EMP-002",
      first_name: "Demo", last_name: "Employee", email: "employee@orbit.example",
      employment_status: "active", department_id: 2, job_title_id: 2, manager_id: 1, user_id: 2,
      department: { id: 2, uuid: "dep-uuid-0002", name: "MEP Engineering", description: "Mechanical, electrical and plumbing", is_active: true },
      job_title: { id: 2, uuid: "job-uuid-0002", name: "Senior Engineer", description: null, is_active: true },
    },
    {
      id: 3, uuid: "emp-uuid-0003", employee_number: "EMP-003",
      first_name: "Onleave", last_name: "Tester", email: "onleave@orbit.example",
      employment_status: "on_leave", department_id: 1, job_title_id: 2, manager_id: 1, user_id: null,
      department: { id: 1, uuid: "dep-uuid-0001", name: "Structural Engineering", description: "Structural design and review", is_active: true },
      job_title: { id: 2, uuid: "job-uuid-0002", name: "Senior Engineer", description: null, is_active: true },
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
        "employee@orbit.example": [DEMO.employeeToken, DEMO.employeeUser],
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
    const user = token === DEMO.token ? DEMO.user : token === DEMO.employeeToken ? DEMO.employeeUser : token === DEMO.dashfailToken ? DEMO.dashfailUser : EXTRA_TOKENS[token];
    return send(res, 200, { user, company: DEMO.company });
  }
  if (req.method === "GET" && ["/api/v1/departments", "/api/v1/employees", "/api/v1/leave-requests", "/api/v1/permission-requests"].includes(url.pathname)) {
    const knownToken = token === DEMO.token || token === DEMO.employeeToken || token === DEMO.dashfailToken || token in EXTRA_TOKENS;
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
    if (token === DEMO.dashfailToken) {
      // Simulated per-widget failure: three reads fail, departments is empty.
      if (url.pathname === "/api/v1/employees" || url.pathname === "/api/v1/leave-requests" || url.pathname === "/api/v1/permission-requests") {
        return send(res, 500, { message: "SQLSTATE[42S02]: simulated internal error" });
      }
      return send(res, 200, { data: [] });
    }
    if (url.pathname === "/api/v1/departments") {
      return send(res, 200, { data: FIXTURES.departments });
    }
    if (url.pathname === "/api/v1/employees") {
      return send(res, 200, { data: FIXTURES.employees });
    }
    if (url.pathname === "/api/v1/leave-requests") {
      return send(res, 200, paginated(LEAVE_REQUESTS, url));
    }
    return send(res, 200, paginated(PERMISSION_REQUESTS, url));
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
