/**
 * Phase 3.2 REAL-STACK e2e: browser -> Next (production build) -> REAL Laravel -> REAL PostgreSQL.
 * No mock backend. Needs a disposable DB seeded by verify/seed-real-stack.php (2 tenants, synthetic
 * accounts) and `php artisan rbac:bootstrap-hr` already run for hr.a@e2e.test and hr.b@e2e.test.
 * Laravel on :8000, app on :3000 with ORBIT_API_BASE_URL=http://127.0.0.1:8000/api/v1.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const BASE = 'http://127.0.0.1:3000';
const API = 'http://127.0.0.1:8000/api/v1';
const SHOTS = process.env.SHOTS_DIR ?? 'e2e-screenshots/rbac-';
const PW = 'Str0ng!Pass#2026';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`); };

async function api(method, path, body, token) {
  const r = await fetch(API + path, { method, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const tok = {};
for (const who of ['owner', 'admin', 'manager', 'employee', 'hr']) for (const t of ['a', 'b']) {
  const r = await api('POST', '/auth/login', { email: `${who}.${t}@e2e.test`, password: PW, device_name: 'e2e' });
  if (r.status !== 200) throw new Error(`login ${who}.${t} -> ${r.status}`);
  tok[`${who}.${t}`] = r.body.token;
}
tok.platform = (await api('POST', '/auth/login', { email: 'platform@e2e.test', password: PW, device_name: 'e2e' })).body.token;

const empsA = (await api('GET', '/employees', null, tok['hr.a'])).body.data;
const empsB = (await api('GET', '/employees', null, tok['hr.b'])).body.data;
const selfA = empsA.find((e) => e.employee_number === 'a-E2');   // employee.a's own record
const otherA = empsA.find((e) => e.employee_number === 'a-E3');
const bRec = empsB[0];
check('seed: tenant A and B each have 6 employees', empsA.length === 6 && empsB.length === 6, `${empsA.length}/${empsB.length}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1250 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
const shot = (name) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true });
const rendered = () => page.evaluate(() => { const c = document.documentElement.cloneNode(true); c.querySelectorAll('script').forEach((n) => n.remove()); return c.outerHTML; });
async function login(email) {
  await ctx.clearCookies();
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  await page.getByTestId('welcome-name').waitFor({ state: 'visible' });
}
const HIDDEN_WORDS = ['Audit Logs', 'Work Schedules', 'Holidays', 'Company Settings', 'Approval Workflows', 'Roles &amp; Permissions'];

// ---- 1. every account type: navigation, dashboard, screenshots ----
for (const who of ['employee.a', 'manager.a', 'owner.a', 'admin.a', 'hr.a', 'platform']) {
  const email = who === 'platform' ? 'platform@e2e.test' : `${who}@e2e.test`;
  await login(email);
  const html = await rendered();
  const sb = page.getByTestId('sidebar');
  const adminHeading = await sb.getByText('Administration', { exact: true }).count();
  const rp = await sb.getByRole('link', { name: 'Roles & Permissions' }).count();
  const restricted = await page.locator('[data-nav-state="restricted"]').count();
  const kind = who.split('.')[0];
  if (kind === 'employee' || kind === 'manager') {
    check(`${who}: Administration absent from DOM`, adminHeading === 0 && HIDDEN_WORDS.every((w) => !html.includes(w)));
    check(`${who}: Employees/Departments/Job Titles locked`, restricted === 3);
    check(`${who}: dashboard has no employee/department counts`, (await page.getByTestId('employees-total').count()) === 0 && (await page.getByTestId('departments-total').count()) === 0);
  } else if (kind === 'hr') {
    check('hr: Administration shows ONLY Roles & Permissions', adminHeading === 1 && rp === 1 && !html.includes('Audit Logs') && !html.includes('Work Schedules') && !html.includes('Holidays') && !html.includes('Company Settings'));
    check('hr: organization modules enabled (not locked)', restricted === 0 && (await sb.getByRole('link', { name: 'Employees', exact: true }).count()) === 1);
  } else if (kind === 'owner' || kind === 'admin') {
    check(`${who}: legacy Owner/Admin has no implicit HR access (modules locked)`, restricted === 3 && rp === 0);
    check(`${who}: tenant already bootstrapped, so no legacy fallback: Audit Logs not offered`, !html.includes('Audit Logs'));
  } else {
    check('platform admin: no tenant HR modules (locked), no Roles & Permissions', restricted === 3 && rp === 0);
    check('platform admin: Administration shows platform support as Roadmap only', adminHeading === 1 && html.includes('Platform Support'));
  }
  await shot(`${who.replace('.', '-')}-dashboard-desktop`);
  // collapsed + mobile
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await shot(`${who.replace('.', '-')}-dashboard-collapsed`);
  if (kind === 'employee') { const h2 = await rendered(); check('collapsed: Administration absent from DOM', HIDDEN_WORDS.every((w) => !h2.includes(w))); }
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('welcome-name').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByTestId('mobile-drawer').waitFor({ state: 'visible' });
  if (kind === 'employee' || kind === 'manager') check(`${who}: mobile drawer has no Administration`, (await page.getByTestId('mobile-drawer').getByText('Administration', { exact: true }).count()) === 0);
  // wait for the drawer slide-in transition to finish before capturing (visual only; the DOM checks above do not depend on it)
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}${who.replace('.', '-')}-mobile-drawer.png` });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1250 });
}

// ---- 2. direct URL and API access (real Laravel decisions) ----
await login('employee.a@e2e.test');
for (const p of ['/employees', '/departments', '/job-titles', '/access']) {
  await page.goto(BASE + p, { waitUntil: 'domcontentloaded' });
  check(`employee direct URL ${p} -> restricted panel`, (await page.getByTestId('page-restricted').count()) === 1);
}
await page.goto(BASE + `/employees/${otherA.id}`, { waitUntil: 'domcontentloaded' });
const otherHtml = await rendered();
check('employee cannot open another employee record (restricted, no data)', (await page.getByTestId('page-restricted').count()) === 1 && !otherHtml.includes(otherA.first_name + ' ' + otherA.last_name) && !otherHtml.includes(otherA.employee_number));
await page.goto(BASE + `/employees/${selfA.id}`, { waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: `${selfA.first_name} ${selfA.last_name}` }).waitFor({ timeout: 10000 }).catch(() => {});
check('employee can open OWN record (self-service)', (await page.getByRole('heading', { name: `${selfA.first_name} ${selfA.last_name}` }).count()) === 1);
const own = await api('GET', `/employees/${selfA.id}`, null, tok['employee.a']);
check('API: employee own record 200', own.status === 200);
const apiChecks = [
  ['employee GET /employees -> 403', () => api('GET', '/employees', null, tok['employee.a']), 403],
  ['employee GET other record -> 403', () => api('GET', `/employees/${otherA.id}`, null, tok['employee.a']), 403],
  ['employee GET /departments -> 403', () => api('GET', '/departments', null, tok['employee.a']), 403],
  ['employee GET /access/roles -> 403', () => api('GET', '/access/roles', null, tok['employee.a']), 403],
  ['manager GET /employees -> 403', () => api('GET', '/employees', null, tok['manager.a']), 403],
  ['owner GET /employees -> 403', () => api('GET', '/employees', null, tok['owner.a']), 403],
  ['admin GET /job-titles -> 403', () => api('GET', '/job-titles', null, tok['admin.a']), 403],
  ['platform GET /employees -> 403', () => api('GET', '/employees', null, tok.platform), 403],
  ['platform GET /access/users -> 403', () => api('GET', '/access/users', null, tok.platform), 403],
  ['employee POST /employees -> 403', () => api('POST', '/employees', { employee_number: 'X', first_name: 'X', last_name: 'X', email: 'x@x.test' }, tok['employee.a']), 403],
];
for (const [n, f, st] of apiChecks) { const r = await f(); check(n, r.status === st, `status=${r.status}`); }

// ---- 3. cross-tenant isolation with authenticated accounts ----
const hrA = tok['hr.a'];
check('tenant A HR sees only tenant A employees', empsA.every((e) => e.employee_number.startsWith('a-')));
check('tenant A HR GET tenant B employee -> 404', (await api('GET', `/employees/${bRec.id}`, null, hrA)).status === 404);
check('tenant A HR PUT tenant B employee -> 404', (await api('PUT', `/employees/${bRec.id}`, { first_name: 'Hacked' }, hrA)).status === 404);
const usersA = []; // FINAL-V2: the directory is paginated; collect every page (tenant A has 305 accounts)
for (let pg = 1, last = 1; pg <= last; pg++) { const r = (await api('GET', `/access/users?per_page=100&page=${pg}`, null, hrA)).body; usersA.push(...r.data); last = r.meta.last_page; }
check('directory pagination collects every tenant A account (305)', usersA.length === 305, String(usersA.length));
check('tenant A directory lists only tenant A accounts, no platform admin', usersA.every((u) => u.email.endsWith('.a@e2e.test')) && !usersA.some((u) => u.email.startsWith('platform')), JSON.stringify(usersA.map((u) => u.email)));
const usersB = (await api('GET', '/access/users', null, tok['hr.b'])).body.data;
const bEmp = usersB.find((u) => u.email === 'employee.b@e2e.test');
const rolesB = (await api('GET', '/access/roles', null, tok['hr.b'])).body.data;
const rolesA = (await api('GET', '/access/roles', null, hrA)).body.data;
check('tenant A assign roles to tenant B account -> 404', (await api('PUT', `/access/users/${bEmp.id}/roles`, { role_ids: [rolesA[0].id] }, hrA)).status === 404);
check('tenant A cannot read tenant B user permissions', (await api('GET', `/access/users/${bEmp.id}/permissions`, null, hrA)).status === 404);
check('tenant B role id not visible to tenant A (404)', (await api('GET', `/access/roles/${rolesB[0].id}`, null, hrA)).status === 404);
check('hr.b cannot edit hr.a role (404)', (await api('PUT', `/access/roles/${rolesA[0].id}`, { name: 'x', permissions: [] }, tok['hr.b'])).status === 404);
await login('hr.b@e2e.test');
await page.goto(BASE + '/employees', { waitUntil: 'domcontentloaded' });
const bNames = (await page.locator('tbody tr td:first-child').allInnerTexts()).join('|');
const bHtml = await rendered();
check('tenant B HR browser shows tenant B records and none of tenant A', bNames.length > 0 && empsA.every((e) => !bHtml.includes(e.email)) && (await page.locator('tbody tr').count()) === 6);

// ---- 4. HR Roles & Permissions UI + escalation refusals ----
await login('hr.a@e2e.test');
await page.goto(BASE + '/access', { waitUntil: 'domcontentloaded' });
await page.getByTestId('access-roles').waitFor();
await shot('hr-access-roles');
await page.getByTestId('role-add').click();
await page.locator('#role-name').fill('Recruiter');
await page.locator('[data-perm="employees.view"]').check();
await page.locator('[data-perm="employees.create"]').check();
check('roles.assign / permissions.manage are disabled (outside HR delegation boundary)', await page.locator('[data-perm="roles.assign"]').isDisabled() && await page.locator('[data-perm="permissions.manage"]').isDisabled());
await shot('hr-access-role-editor');
await page.getByTestId('role-review').click();
check('review step lists the added permissions before confirming', (await page.getByTestId('role-review-panel').innerText()).includes('Create employees'));
await shot('hr-access-role-review');
await page.getByTestId('role-confirm').click();
await page.getByTestId('role-recruiter').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
const rolesNow = (await api('GET', '/access/roles', null, hrA)).body.data;
const recruiter = rolesNow.find((r) => r.name === 'Recruiter');
check('role created through the UI (verified in backend)', !!recruiter && recruiter.permissions.includes('employees.view') && recruiter.permissions.length === 2);
// assign through UI
const empAcc = usersA.find((u) => u.email === 'employee.a@e2e.test');
await page.getByTestId('access-tab-users').click();
await page.getByRole('searchbox').fill('employee.a@e2e.test');
await page.getByTestId(`access-assign-${empAcc.id}`).waitFor({ state: 'visible', timeout: 15000 });
await page.getByTestId(`access-assign-${empAcc.id}`).click();
await page.locator(`#assign-role-${recruiter.id}`).check();
await page.getByTestId('assign-review').click();
await shot('hr-access-assign-review');
await page.getByTestId('assign-confirm').click();
await page.waitForTimeout(1200);
const effective = (await api('GET', `/access/users/${empAcc.id}/permissions`, null, hrA)).body.data.effective_permissions;
check('assignment through the UI took effect', effective.includes('employees.view') && !effective.includes('roles.assign'), JSON.stringify(effective));
await page.goto(BASE + '/access', { waitUntil: 'domcontentloaded' });
await page.getByTestId('access-tab-permissions').click();
await shot('hr-access-permissions');
await page.getByTestId('access-tab-users').click();
await shot('hr-access-users');
// escalation refusals (real backend)
const hrRole = rolesA.find((r) => r.key === 'hr_administrator');
const hrAcc = usersA.find((u) => u.email === 'hr.a@e2e.test');
const ownerAcc = usersA.find((u) => u.email === 'owner.a@e2e.test');
const esc = [
  ['create role with roles.assign -> delegation_exceeded', () => api('POST', '/access/roles', { name: 'Evil', permissions: ['roles.assign'] }, hrA), 403, 'delegation_exceeded'],
  ['create role with audit_logs.view (protected) -> refused', () => api('POST', '/access/roles', { name: 'Evil2', permissions: ['audit_logs.view'] }, hrA), 422, null],
  ['create role with reserved payroll.view -> refused', () => api('POST', '/access/roles', { name: 'Evil3', permissions: ['payroll.view'] }, hrA), 422, null],
  ['HR assigns own roles -> self_assignment', () => api('PUT', `/access/users/${hrAcc.id}/roles`, { role_ids: [hrRole.id] }, hrA), 403, 'self_assignment'],
  ['HR edits Recruiter to add roles.assign -> delegation_exceeded', () => api('PUT', `/access/roles/${recruiter.id}`, { name: 'Recruiter', permissions: ['employees.view', 'roles.assign'] }, hrA), 403, 'delegation_exceeded'],
  ['HR edits hr_administrator role -> refused', () => api('PUT', `/access/roles/${hrRole.id}`, { name: 'HR Administrator', permissions: ['employees.view'] }, hrA), 403, null],
  ['HR deletes hr_administrator role -> refused', () => api('DELETE', `/access/roles/${hrRole.id}`, null, hrA), 403, null],
  ['HR assigns HR Administrator role to another account -> refused (outside boundary)', () => api('PUT', `/access/users/${ownerAcc.id}/roles`, { role_ids: [hrRole.id] }, hrA), 403, 'delegation_exceeded'],
  ['employee (Recruiter) cannot call role APIs -> 403', () => api('POST', '/access/roles', { name: 'x', permissions: [] }, tok['employee.a']), 403, null],
  ['employee with Recruiter cannot assign roles to self -> 403', () => api('PUT', `/access/users/${empAcc.id}/roles`, { role_ids: [recruiter.id] }, tok['employee.a']), 403, null],
];
for (const [n, f, st, code] of esc) { const r = await f(); check(n, r.status === st && (code === null || r.body?.code === code), `status=${r.status} body=${JSON.stringify(r.body)?.slice(0, 160)}`); }

// ---- 5. revocation while a protected page is open ----
const empTok = tok['employee.a'];
check('employee (Recruiter) can now read employees via API', (await api('GET', '/employees', null, empTok)).status === 200);
check('Recruiter holds employees.view but sees personal data of NO other employee (own record only)', (await api('GET', '/employees', null, empTok)).body.data.every((e) => e.id === selfA.id || !('national_id' in e || 'phone' in e || 'date_of_birth' in e)));
await login('employee.a@e2e.test');
await page.goto(BASE + '/employees', { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle');
check('employee (granted) sees the directory in the browser', (await page.locator('tbody tr').count()) === 6);
await shot('employee-granted-directory');
// HR revokes the role while the page is open
const rev = await api('PUT', `/access/users/${empAcc.id}/roles`, { role_ids: [] }, hrA);
check('HR revoked the role (200)', rev.status === 200, `status=${rev.status}`);
check('SAME token is refused immediately after revocation (API)', (await api('GET', '/employees', null, empTok)).status === 403);
await page.reload({ waitUntil: 'domcontentloaded' });
check('open page after revocation: reload shows restricted panel, no rows', (await page.getByTestId('page-restricted').count()) === 1 && (await page.locator('tbody tr').count()) === 0);
await page.goto(BASE + '/departments', { waitUntil: 'domcontentloaded' });
check('direct URL after revocation -> restricted', (await page.getByTestId('page-restricted').count()) === 1);
const bff = await page.evaluate(async () => (await fetch('/api/employees/1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"first_name":"x"}' })).status);
check('BFF mutation after revocation -> 403', bff === 403, `status=${bff}`);

// ---- 8. FINAL-V2: bootstrapped Owner and Admin (tenant B) hold exactly the HR role; 300+ account directory ----
for (const who of ['owner.b', 'admin.b']) {
  await login(`${who}@e2e.test`);
  const html = await rendered(); const sb = page.getByTestId('sidebar');
  check(`${who} (bootstrapped HR): Administration shows ONLY Roles & Permissions`, (await sb.getByText('Administration', { exact: true }).count()) === 1 && (await sb.getByRole('link', { name: 'Roles & Permissions' }).count()) === 1 && !['Audit Logs', 'Work Schedules', 'Holidays', 'Company Settings', 'Approval Workflows'].some((w) => html.includes(w)));
  await shot(`${who.replace('.', '-')}-bootstrapped-dashboard`);
  await page.getByRole('button', { name: 'User menu' }).click(); await page.getByTestId('user-menu').waitFor();
  check(`${who}: user menu shows access role HR Administrator and the account type separately`, (await page.getByTestId('user-menu-access-role').innerText()).trim() === 'HR Administrator' && /^(Owner|Admin)$/.test((await page.getByTestId('user-menu-account-type').innerText()).trim()));
  await shot(`${who.replace('.', '-')}-bootstrapped-user-menu`);
  const T = tok[who];
  for (const [label, call, want] of [
    ['GET /audit-logs -> 403 (API closed, not only hidden)', () => api('GET', '/audit-logs', null, T), 403],
    ['PUT /work-schedule -> 403', () => api('PUT', '/work-schedule', { standard_daily_hours: 8, work_start_time: '09:00', work_end_time: '17:00' }, T), 403],
    ['POST /holidays -> 403', () => api('POST', '/holidays', { name: 'X', start_date: '2031-01-01', end_date: '2031-01-01' }, T), 403],
    ['GET /holidays -> 200 (ordinary read kept)', () => api('GET', '/holidays', null, T), 200],
    ['GET /access/roles -> 200 (HR role works)', () => api('GET', '/access/roles', null, T), 200],
    ['GET /employees -> 200 (HR role works)', () => api('GET', '/employees', null, T), 200],
  ]) { const r = await call(); check(`${who} ${label}`, r.status === want, `status=${r.status}`); }
  const sch = await api('GET', '/work-schedule', null, T); check(`${who} GET /work-schedule readable (2xx)`, sch.status >= 200 && sch.status < 300, `status=${sch.status}`);
}
await login('hr.a@e2e.test');
await page.goto(BASE + '/access', { waitUntil: 'domcontentloaded' });
await page.getByTestId('access-tab-users').click();
await page.getByTestId('users-total').waitFor();
check('directory (305 accounts) page 1 shows 25 rows and the accurate total', (await page.locator('[data-testid^="access-user-"]').count()) === 25 && /30\d/.test(await page.getByTestId('users-total').innerText()), await page.getByTestId('users-total').innerText());
await shot('hr-access-users-paginated');
await page.getByRole('searchbox').fill('bulk298');
await page.waitForFunction(() => document.querySelectorAll('[data-testid^="access-user-"]').length === 1);
check('server-side search reaches an account beyond the first 200', (await page.locator('[data-testid^="access-user-"]').first().innerText()).includes('Bulk User 298'));
await shot('hr-access-users-search');
await page.getByRole('searchbox').fill('');
await page.waitForFunction(() => document.querySelectorAll('[data-testid^="access-user-"]').length === 25);
for (let i = 0; i < 12; i++) { await page.getByTestId('users-next').click(); await page.waitForFunction((n) => (document.querySelector('[data-testid="users-page"]')?.textContent ?? '').includes(String(n)), i + 2); }
await page.waitForFunction(() => document.querySelectorAll('[data-testid^="access-user-"]').length === 5, null, { timeout: 15000 });
check('last page (13 of 13) is reachable, has the remaining accounts, and Next is disabled', (await page.getByTestId('users-next').isDisabled()) && (await page.locator('[data-testid^="access-user-"]').count()) === 5, `rows=${await page.locator('[data-testid^="access-user-"]').count()}`);


// ---- 9. FINAL-V2 review follow-ups: pagination evidence from the API, and legacy fallback after role removal ----
{
  const p13 = await api('GET', '/access/users?per_page=25&page=13', null, tok['hr.a']);
  console.log('EVIDENCE API page 13:', JSON.stringify(p13.body.meta), 'rows=' + p13.body.data.length);
  check('API page 13 of 305 accounts returns meta total=305,last_page=13 and exactly 5 rows', p13.body.meta.total === 305 && p13.body.meta.last_page === 13 && p13.body.data.length === 5, JSON.stringify(p13.body.meta));
  for (const who of ['owner.b', 'admin.b']) {
    const found = (await api('GET', `/access/users?search=${encodeURIComponent(who + '@e2e.test')}`, null, tok['hr.b'])).body.data.find((u) => u.email === `${who}@e2e.test`);
    const out = execFileSync('psql', ['-h', '127.0.0.1', '-p', '5433', '-U', 'postgres', '-d', 'conure_p32rs', '-tAc', `DELETE FROM user_roles WHERE user_id=${found.id}`], { env: { ...process.env, PGPASSWORD: 'x' } }).toString().trim();
    check(`${who}: every role removed by the trusted operator procedure (disposable DB; HR API refuses, outside its delegation)`, /DELETE 1|^$/.test(out), out);
    for (const [label, call] of [
      ['GET /audit-logs', () => api('GET', '/audit-logs', null, tok[who])],
      ['PUT /work-schedule', () => api('PUT', '/work-schedule', { standard_daily_hours: 8, work_start_time: '09:00', work_end_time: '17:00' }, tok[who])],
      ['GET /access/roles', () => api('GET', '/access/roles', null, tok[who])],
    ]) { const r = await call(); check(`${who} after role removal: ${label} -> 403 (legacy fallback NOT restored)`, r.status === 403, `status=${r.status}`); }
    const me = await api('GET', '/auth/me', null, tok[who]);
    check(`${who} after role removal: /auth/me holds zero permissions`, (me.body.access?.permissions ?? []).length === 0, JSON.stringify(me.body.access?.permissions));
  }
}

console.log(`\nSUMMARY pass=${pass} fail=${fail} pageerrors=${errors.length}`);
for (const e of errors) console.log('  ' + e);
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
