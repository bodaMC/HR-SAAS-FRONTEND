/**
 * Simulated Laravel auth backend for local verification ONLY.
 *
 * Implements the three verified endpoints (POST /api/v1/auth/login,
 * GET /api/v1/auth/me, POST /api/v1/auth/logout) with a fixed demo identity
 * so the BFF flow can be exercised without a running Laravel instance.
 * Not part of the application; no real credentials or company data.
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
};

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
    if (token !== DEMO.token || revoked) {
      return send(res, 401, { message: "Unauthenticated." });
    }
    return send(res, 200, { user: DEMO.user, company: DEMO.company });
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
