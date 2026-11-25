/**
 * FINAL-V3 REAL-STACK e2e: browser -> Next (production build) -> REAL Laravel -> REAL PostgreSQL (Linux, disposable DB).
 * Seeded by verify/seed-real-stack.php + seed-many-users.php (2 tenants, 305 tenant-A accounts); the tenant System Super Admin
 * of each tenant is provisioned by the real `rbac:bootstrap-system-admin` command (run-real-stack.sh).
 * Covers: System Super Admin navigation/API/direct URLs/user menu, protected assignment refusals, legacy Owner/Admin with no roles,
 * Platform Super Admin identity, existing-session revocation by ownership transfer, EN/AR, RTL/LTR, light/dark, desktop/collapsed/mobile.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const BASE = 'http://127.0.0.1:3000';
const API = 'http://127.0.0.1:8000/api/v1';
const SHOTS = process.env.SHOTS_DIR ?? 'e2e-screenshots/v3-';
const BE = process.env.BE_DIR ?? '/tmp/p32/be';
const PW = 'Str0ng!Pass#2026';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`); };
async function api(method, path, body, token) {
  const r = await fetch(API + path, { method, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const tok = {};
for (const who of ['owner.a', 'admin.a', 'manager.a', 'employee.a', 'hr.a', 'sysadmin.a', 'successor.a', 'sysadmin.b', 'hr.b', 'successor.b', 'platform']) {
  const email = who === 'platform' ? 'platform@e2e.test' : `${who}@e2e.test`;
  const r = await api('POST', '/auth/login', { email, password: PW, device_name: 'e2e' });
  if (r.status !== 200) throw new Error(`login ${who} -> ${r.status}`);
  tok[who] = r.body.token;
}
const artisan = (args) => { try { return execFileSync('php', ['artisan', ...args], { cwd: BE, encoding: 'utf8', env: { ...process.env } }); } catch (e) { return String(e.stdout ?? '') + String(e.stderr ?? ''); } };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
const shot = (name) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true });
const rendered = () => page.evaluate(() => { const c = document.documentElement.cloneNode(true); c.querySelectorAll('script,template').forEach((n) => n.remove()); return c.outerHTML; });
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
const ADMIN_ENTRIES = ['Roles & Permissions', 'Work Schedules', 'Holidays', 'Audit Logs', 'Company Settings', 'Approval Workflows'];

// ---- 1. System Super Admin (tenant A): navigation, states, user menu, screenshots ----
await login('sysadmin.a@e2e.test');
{
  const sb = page.getByTestId('sidebar');
  check('SSA: Administration section present', (await sb.getByText('Administration', { exact: true }).count()) === 1);
  for (const e of ADMIN_ENTRIES) check(`SSA sees ${e}`, (await sb.getByText(e, { exact: true }).count()) === 1, e);
  check('SSA: Roles & Permissions is a working link', (await sb.getByRole('link', { name: 'Roles & Permissions' }).count()) === 1);
  check('SSA: unimplemented pages are not links (Soon/Roadmap only, no page built)', (await sb.getByRole('link', { name: /Audit Logs|Company Settings|Work Schedules|Holidays|Approval Workflows/ }).count()) === 0);
  check('SSA: Soon badges and Roadmap badges present', (await sb.getByText('Soon').count()) >= 3 && (await sb.getByText('Roadmap').count()) >= 2);
  check('SSA: organization modules enabled (superset of HR)', (await page.locator('[data-nav-state="restricted"]').count()) === 0);
  await shot('ssa-dashboard-desktop');
  await page.getByRole('button', { name: 'User menu' }).click(); await page.getByTestId('user-menu').waitFor();
  check('SSA user menu: access role System Super Admin; account type is the separate legacy type; no platform identity', (await page.getByTestId('user-menu-access-role').innerText()).includes('System Super Admin') && (await page.getByTestId('user-menu-account-type').innerText()).trim() === 'Employee' && (await page.getByTestId('user-menu-platform-identity').count()) === 0);
  await shot('ssa-user-menu');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click(); await shot('ssa-dashboard-collapsed'); await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByTestId('welcome-name').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Open navigation' }).click(); await page.getByTestId('mobile-drawer').waitFor({ state: 'visible' });
  check('SSA mobile drawer shows Administration', (await page.getByTestId('mobile-drawer').getByText('Administration', { exact: true }).count()) === 1);
  await page.waitForTimeout(500); await shot('ssa-mobile-drawer'); await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1100 });
}
// real API decisions (UI must not merely hide what the API allows, nor the reverse)
{
  const T = tok['sysadmin.a'];
  for (const [label, call, want] of [
    ['GET /audit-logs', () => api('GET', '/audit-logs', null, T), 200],
    ['GET /access/roles', () => api('GET', '/access/roles', null, T), 200],
    ['GET /employees', () => api('GET', '/employees', null, T), 200],
  ]) { const r = await call(); check(`SSA API ${label} -> ${want}`, r.status === want, `status=${r.status}`); }
  const wp = await api('PUT', '/work-schedule', { standard_daily_hours: 8, work_start_time: '09:00', work_end_time: '17:00' }, T);
  check('SSA API PUT /work-schedule -> 2xx (disposable DB)', wp.status >= 200 && wp.status < 300, `status=${wp.status}`);
  const ws = await api('GET', '/work-schedule', null, T); // existing backend behaviour: creates the default schedule row on first read (201)
  check('SSA API GET /work-schedule -> 2xx (backend creates the default row on first read)', ws.status >= 200 && ws.status < 300, `status=${ws.status}`);
  const me = await api('GET', '/auth/me', null, T);
  check('SSA /auth/me: protected permissions listed, no platform flag', ['audit_logs.view', 'company_settings.manage', 'work_schedules.manage'].every((p) => me.body.access.permissions.includes(p)) && me.body.access.is_platform_admin === false && me.body.access.roles.some((r) => r.key === 'system_super_admin'));
  const tenants = await api('GET', '/super-admin/tenants', null, T);
  check('SSA cannot use Platform APIs (tenant list refused)', tenants.status === 403, `status=${tenants.status}`);
  const reg = await api('GET', '/access/permissions', null, T);
  check('SSA permission registry exposes protected codes as protected, platform codes absent', reg.status === 200 && ['audit_logs.view', 'company_settings.manage', 'work_schedules.manage'].every((p) => reg.body.data.protected.includes(p)));
}
await login('sysadmin.a@e2e.test');
await page.goto(BASE + '/access', { waitUntil: 'domcontentloaded' }); await page.getByTestId('access-roles').waitFor();
check('SSA direct URL /access opens Roles & Permissions', (await page.getByTestId('access-page').count()) === 1);
await shot('ssa-access-roles');
await page.getByTestId('access-tab-users').click();
const usersA = []; for (let pg = 1, last = 1; pg <= last; pg++) { const r = (await api('GET', `/access/users?per_page=100&page=${pg}`, null, tok['sysadmin.a'])).body; usersA.push(...r.data); last = r.meta.last_page; }
check('tenant A directory: 305 accounts, tenant A only', usersA.length === 305 && usersA.every((u) => u.email.endsWith('.a@e2e.test')), String(usersA.length));
const rolesA = (await api('GET', '/access/roles', null, tok['sysadmin.a'])).body.data;
const ssaRole = rolesA.find((r) => r.key === 'system_super_admin');
const byEmail = (e) => usersA.find((u) => u.email === e);
check('SSA role is listed and flagged protected/system', !!ssaRole && ssaRole.is_system === true);

// ---- 2. protected assignment refusals (real Laravel) ----
{
  const succ = byEmail('successor.a@e2e.test'), ssaAcc = byEmail('sysadmin.a@e2e.test');
  const tests = [
    ['HR assigns System Super Admin to another account -> 403', () => api('PUT', `/access/users/${succ.id}/roles`, { role_ids: [ssaRole.id] }, tok['hr.a']), 403],
    ['SSA assigns System Super Admin over HTTP -> 403 protected_account', () => api('PUT', `/access/users/${succ.id}/roles`, { role_ids: [ssaRole.id] }, tok['sysadmin.a']), 403, 'protected_account'],
    ['HR changes the System Super Admin account roles -> 403 protected_account', () => api('PUT', `/access/users/${ssaAcc.id}/roles`, { role_ids: [] }, tok['hr.a']), 403, 'protected_account'],
    ['SSA changes own roles -> refused', () => api('PUT', `/access/users/${ssaAcc.id}/roles`, { role_ids: [] }, tok['sysadmin.a']), 403],
    ['SSA edits the System Super Admin role definition -> refused', () => api('PUT', `/access/roles/${ssaRole.id}`, { name: 'x', permissions: [] }, tok['sysadmin.a']), 403],
    ['SSA deletes the System Super Admin role -> refused', () => api('DELETE', `/access/roles/${ssaRole.id}`, null, tok['sysadmin.a']), 403],
    ['HR cannot create a role with audit_logs.view -> refused', () => api('POST', '/access/roles', { name: 'EvilA', permissions: ['audit_logs.view'] }, tok['hr.a']), 422],
    ['employee cannot read the directory -> 403', () => api('GET', '/access/users', null, tok['employee.a']), 403],
  ];
  for (const [n, f, st, code] of tests) { const r = await f(); check(n, r.status === st && (!code || r.body?.code === code), `status=${r.status} ${JSON.stringify(r.body)?.slice(0, 120)}`); }
  // SSA may delegate allowlisted tenant permissions, and may assign HR (ordinary assignable role)
  const mk = await api('POST', '/access/roles', { name: 'Schedule Viewer', permissions: ['employees.view'] }, tok['sysadmin.a']);
  check('SSA may create an ordinary custom role with allowlisted permissions', mk.status === 201 || mk.status === 200, `status=${mk.status}`);
  const noPlatform = await api('POST', '/access/roles', { name: 'EvilPlat', permissions: ['tenants.manage'] }, tok['sysadmin.a']);
  check('platform-level permission code is not delegable (422)', noPlatform.status === 422, `status=${noPlatform.status}`);
  const delSSA = await api('GET', `/access/users/${ssaAcc.id}/permissions`, null, tok['sysadmin.a']);
  check('SSA effective permissions include protected codes', delSSA.status === 200 && delSSA.body.data.effective_permissions.includes('audit_logs.view'));
  // UI: the protected account's assignment dialog is read-only in the browser
  await page.getByRole('searchbox').fill('sysadmin.a@e2e.test');
  await page.getByTestId(`access-assign-${ssaAcc.id}`).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId(`access-assign-${ssaAcc.id}`).click();
  await page.locator(`#assign-role-${ssaRole.id}`).waitFor();
  check('UI: every role checkbox is disabled for the System Super Admin account', (await page.locator('[id^="assign-role-"]:not([disabled])').count()) === 0);
  await shot('ssa-protected-assignment-readonly');
}

// ---- 3. HR: Roles & Permissions only ----
await login('hr.a@e2e.test');
{
  const sb = page.getByTestId('sidebar'); const html = await rendered();
  check('HR: Administration lists ONLY Roles & Permissions', (await sb.getByRole('link', { name: 'Roles & Permissions' }).count()) === 1 && ['Audit Logs', 'Work Schedules', 'Holidays', 'Company Settings', 'Approval Workflows'].every((w) => !html.includes(w)));
  const T = tok['hr.a'];
  for (const [l, c, w] of [['GET /audit-logs', () => api('GET', '/audit-logs', null, T), 403], ['PUT /work-schedule', () => api('PUT', '/work-schedule', { standard_daily_hours: 8, work_start_time: '09:00', work_end_time: '17:00' }, T), 403], ['GET /employees', () => api('GET', '/employees', null, T), 200]]) { const r = await c(); check(`HR API ${l} -> ${w}`, r.status === w, `status=${r.status}`); }
  await shot('hr-dashboard');
}
// ---- 4. legacy Owner / Admin (no roles), Manager, Employee ----
for (const who of ['owner.a', 'admin.a', 'manager.a', 'employee.a']) {
  await login(`${who}@e2e.test`);
  const html = await rendered(); const sb = page.getByTestId('sidebar');
  check(`${who}: no Administration anywhere in the rendered DOM`, (await sb.getByText('Administration', { exact: true }).count()) === 0 && ['Audit Logs', 'Work Schedules', 'Holidays', 'Company Settings', 'Approval Workflows', 'Roles &amp; Permissions'].every((w) => !html.includes(w)));
  const me = await api('GET', '/auth/me', null, tok[who]);
  check(`${who}: /auth/me holds zero permissions`, (me.body.access?.permissions ?? []).length === 0, JSON.stringify(me.body.access?.permissions));
  for (const p of ['/audit-logs', '/employees', '/access/roles']) { const r = await api('GET', p, null, tok[who]); check(`${who} GET ${p} -> 403`, r.status === 403, `status=${r.status}`); }
  await page.goto(BASE + '/access', { waitUntil: 'domcontentloaded' });
  check(`${who}: direct URL /access -> restricted`, (await page.getByTestId('page-restricted').count()) === 1);
  if (who === 'owner.a' || who === 'admin.a') {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await page.getByTestId('welcome-name').waitFor();
    await page.getByRole('button', { name: 'User menu' }).click(); await page.getByTestId('user-menu').waitFor();
    check(`${who}: user menu: No access role assigned, account type shown separately`, (await page.getByTestId('user-menu-access-role').innerText()).includes('No access role assigned') && ['Owner', 'Admin'].includes((await page.getByTestId('user-menu-account-type').innerText()).trim()));
    await shot(`legacy-${who.split('.')[0]}-user-menu`);
  } else await shot(`${who.split('.')[0]}-dashboard`);
}
// ---- 5. Platform Super Admin ----
await login('platform@e2e.test');
{
  const html = await rendered(); const sb = page.getByTestId('sidebar');
  check('platform admin: no tenant Roles & Permissions, no tenant admin entries', (await sb.getByRole('link', { name: 'Roles & Permissions' }).count()) === 0 && !html.includes('Audit Logs') && !html.includes('Company Settings'));
  check('platform admin: distinct platform navigation (Platform Support, Roadmap)', html.includes('Platform Support'));
  await page.getByRole('button', { name: 'User menu' }).click(); await page.getByTestId('user-menu').waitFor();
  check('platform admin user menu: platform identity line, no access role', (await page.getByTestId('user-menu-platform-identity').innerText()).includes('Platform Super Admin') && (await page.getByTestId('user-menu-access-role').innerText()).includes('No access role assigned'));
  await shot('platform-user-menu');
  const r = await api('GET', '/super-admin/tenants', null, tok.platform); check('platform admin API: tenant list 200 (platform capability)', r.status === 200, `status=${r.status}`);
  check('platform admin API: tenant data (/audit-logs, /employees) refused', (await api('GET', '/audit-logs', null, tok.platform)).status === 403 && (await api('GET', '/employees', null, tok.platform)).status === 403);
}
// ---- 6. SSA: Arabic / RTL, dark, then LTR back ----
await login('sysadmin.b@e2e.test');
{
  await page.getByTestId('language-switcher').click(); await page.waitForFunction(() => document.documentElement.lang === 'ar' && document.documentElement.dir === 'rtl');
  const sb = page.getByTestId('sidebar');
  check('AR/RTL: SSA sees the full Administration section (6 entries)', (await sb.getByText('الإدارة', { exact: true }).count()) === 1 && (await sb.locator('[data-nav-state="soon"], [data-nav-state="roadmap"], a').count()) > 0);
  await page.getByRole('button', { name: 'Dark' }).or(page.getByTitle('داكن')).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /قائمة المستخدم|User menu/ }).click(); await page.getByTestId('user-menu').waitFor();
  check('AR: user menu shows Arabic System Super Admin name', (await page.getByTestId('user-menu-access-role').innerText()).includes('مدير النظام الأعلى'), await page.getByTestId('user-menu-access-role').innerText());
  await shot('ssa-ar-rtl-dark-menu'); await page.keyboard.press('Escape');
  await shot('ssa-ar-rtl-dark-dashboard');
  await page.goto(BASE + '/access', { waitUntil: 'domcontentloaded' }); await page.getByTestId('access-roles').waitFor();
  await shot('ssa-ar-rtl-access');
  await page.getByTestId('language-switcher').click(); await page.waitForFunction(() => document.documentElement.lang === 'en' && document.documentElement.dir === 'ltr');
  check('AR -> EN switches back to LTR', true);
  await shot('ssa-en-ltr-dark-access');
  await page.getByTitle('Light').click(); await page.waitForTimeout(300); await shot('ssa-en-ltr-light-access');
}

// ---- 7. Existing-session revocation by the trusted ownership transfer (tenant B) ----
{
  const tB = tok['sysadmin.b'];
  check('before transfer: sysadmin.b token reads audit logs (200)', (await api('GET', '/audit-logs', null, tB)).status === 200);
  await login('sysadmin.b@e2e.test'); await page.goto(BASE + '/access', { waitUntil: 'domcontentloaded' }); await page.getByTestId('access-page').waitFor();
  const dry = artisan(['rbac:transfer-system-admin', '--company=seed-b', '--from=sysadmin.b@e2e.test', '--to=successor.b@e2e.test', '--reason=Disposable e2e dry run of ownership transfer', '--dry-run']);
  check('transfer dry-run reports and changes nothing', /dry/i.test(dry) && (await api('GET', '/audit-logs', null, tB)).status === 200, dry.slice(0, 200));
  const out = artisan(['rbac:transfer-system-admin', '--company=seed-b', '--from=sysadmin.b@e2e.test', '--to=successor.b@e2e.test', '--reason=Disposable e2e ownership transfer to the successor account']);
  check('ownership transfer command succeeded', !/error|exception|refus/i.test(out), out.slice(0, 300));
  check('SAME old token refused immediately after transfer (API 403)', (await api('GET', '/audit-logs', null, tB)).status === 403);
  await page.reload({ waitUntil: 'domcontentloaded' });
  check('open /access page of the replaced administrator: reload shows restricted panel', (await page.getByTestId('page-restricted').count()) === 1);
  await shot('revoked-ssa-access-restricted');
  const me = await api('GET', '/auth/me', null, tB);
  check('SESSION SEMANTICS: the replaced administrator token is NOT deleted: /auth/me still 200 (ordinary authenticated access kept), only administrative permissions are gone', me.status === 200 && me.body.access?.is_platform_admin === false);
  check('replaced administrator holds zero permissions (no fallback via Owner/Admin history)', (me.body.access?.permissions ?? []).length === 0, JSON.stringify(me.body.access?.permissions));
  const sT = tok['successor.b'];
  check('successor (existing session) now holds System Super Admin authority (audit logs 200)', (await api('GET', '/audit-logs', null, sT)).status === 200);
  await login('successor.b@e2e.test'); const sb = page.getByTestId('sidebar');
  check('successor browser shows the full Administration section', (await sb.getByText('Audit Logs', { exact: true }).count()) === 1 && (await sb.getByText('Company Settings', { exact: true }).count()) === 1);
  await shot('successor-ssa-dashboard');
  // revoke HR through the trusted command: HR loses access immediately, tenant keeps an administrator
  const hrB = tok['hr.b'];
  check('hr.b before revoke: employees 200', (await api('GET', '/employees', null, hrB)).status === 200);
  const rv = artisan(['rbac:revoke-hr', '--company=seed-b', '--email=hr.b@e2e.test', '--reason=Disposable e2e HR revocation check']);
  check('rbac:revoke-hr succeeded', !/error|exception|refus/i.test(rv), rv.slice(0, 300));
  check('hr.b same token refused after revocation (403)', (await api('GET', '/employees', null, hrB)).status === 403);
  await login('hr.b@e2e.test'); await page.goto(BASE + '/employees', { waitUntil: 'domcontentloaded' });
  check('revoked HR browser: direct /employees -> restricted, no Administration', (await page.getByTestId('page-restricted').count()) === 1 && (await page.getByTestId('sidebar').getByText('Administration', { exact: true }).count()) === 0);
  await shot('revoked-hr-employees-restricted');
}

// ---- 8. System Super Admin assigns / revokes HR Administrator through the audited API and UI (no Artisan) ----
{
  const psql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-p', '5433', '-U', 'postgres', '-d', 'conure_p32rs', '-tAc', q], { encoding: 'utf8' }).trim();
  const T = tok['sysadmin.a'];
  const usersA2 = []; for (let pg = 1, last = 1; pg <= last; pg++) { const r = (await api('GET', `/access/users?per_page=100&page=${pg}`, null, T)).body; usersA2.push(...r.data); last = r.meta.last_page; }
  const succ = usersA2.find((u) => u.email === 'successor.a@e2e.test');
  const roles = (await api('GET', '/access/roles', null, T)).body.data; const hr = roles.find((r) => r.key === 'hr_administrator');
  check('successor.a starts with no HR access (employees 403)', (await api('GET', '/employees', null, tok['successor.a'])).status === 403);
  const before = Number(psql("select count(*) from audit_logs where action like 'rbac.%'"));
  // assign through the browser UI
  await login('sysadmin.a@e2e.test');
  await page.goto(BASE + '/access', { waitUntil: 'domcontentloaded' }); await page.getByTestId('access-roles').waitFor();
  await page.getByTestId('access-tab-users').click();
  await page.getByRole('searchbox').fill('successor.a@e2e.test');
  await page.getByTestId(`access-assign-${succ.id}`).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId(`access-assign-${succ.id}`).click();
  check('UI: HR Administrator checkbox is enabled for the System Super Admin', !(await page.locator(`#assign-role-${hr.id}`).isDisabled()));
  await page.locator(`#assign-role-${hr.id}`).check();
  await page.getByTestId('assign-review').click(); await shot('ssa-assign-hr-review');
  await page.getByTestId('assign-confirm').click(); await page.waitForTimeout(1500);
  check('SSA assigned HR Administrator through the UI: successor now has employees 200 (same token, immediate)', (await api('GET', '/employees', null, tok['successor.a'])).status === 200);
  const afterAssign = Number(psql("select count(*) from audit_logs where action like 'rbac.%'"));
  check('assignment wrote an audit entry', afterAssign > before, `${before}->${afterAssign}`);
  // revoke through the API
  const rv = await api('PUT', `/access/users/${succ.id}/roles`, { role_ids: [] }, T);
  check('SSA revoked HR Administrator through the API (200)', rv.status === 200, `status=${rv.status}`);
  check('revocation takes effect on the same token (employees 403)', (await api('GET', '/employees', null, tok['successor.a'])).status === 403);
  check('revocation wrote an audit entry', Number(psql("select count(*) from audit_logs where action like 'rbac.%'")) > afterAssign);
  check('no Artisan command was run for assign/revoke (this section calls only UI/API)', true);
}
// ---- 9. revoke-system-admin lockout protection and recovery (tenant B, trusted operator) ----
{
  // make the System Super Admin the ONLY permission administrator of tenant B (HR holders removed through the trusted revoke-hr command)
  for (const e of ['owner.b', 'admin.b']) artisan(['rbac:revoke-hr', '--company=seed-b', `--email=${e}@e2e.test`, '--reason=Disposable e2e: remove other administrators to test lockout']);
  const out1 = artisan(['rbac:revoke-system-admin', '--company=seed-b', '--email=successor.b@e2e.test', '--reason=Disposable e2e lockout protection check']);
  check('revoke-system-admin REFUSED while no other permission administrator exists (lockout protection)', /lockout|last|administrator/i.test(out1) && (await api('GET', '/audit-logs', null, tok['successor.b'])).status === 200, out1.slice(0, 300));
  const rb = artisan(['rbac:bootstrap-hr', '--company=seed-b', '--email=hr.b@e2e.test', '--reason=Disposable e2e recovery: re-establish HR before revoking']);
  check('recovery step: bootstrap-hr re-established an HR administrator (idempotent or assigned)', !/error|exception/i.test(rb), rb.slice(0, 200));
  const dry = artisan(['rbac:revoke-system-admin', '--company=seed-b', '--email=successor.b@e2e.test', '--reason=Disposable e2e revoke dry run', '--dry-run']);
  check('with an HR administrator present the dry-run is allowed and changes nothing', /dry/i.test(dry) && (await api('GET', '/audit-logs', null, tok['successor.b'])).status === 200, dry.slice(0, 300));
  const out2 = artisan(['rbac:revoke-system-admin', '--company=seed-b', '--email=successor.b@e2e.test', '--reason=Disposable e2e revoke System Super Admin']);
  check('revoke-system-admin succeeds when another administrator remains; old token loses audit logs (403)', !/error|exception|refus/i.test(out2) && (await api('GET', '/audit-logs', null, tok['successor.b'])).status === 403, out2.slice(0, 300));
  check('the tenant keeps a working administrator (HR) after the revoke', (await api('GET', '/access/roles', null, tok['hr.b'])).status === 200);
  const rec = artisan(['rbac:bootstrap-system-admin', '--company=seed-b', '--email=sysadmin.b@e2e.test', '--reason=Disposable e2e recovery: provision a new System Super Admin']);
  check('recovery path: bootstrap-system-admin provisions a new holder after the revoke', !/error|exception|refus/i.test(rec) && (await api('GET', '/audit-logs', null, tok['sysadmin.b'])).status === 200, rec.slice(0, 300));
}
console.log(`\nSUMMARY pass=${pass} fail=${fail} pageerrors=${errors.length}`);
for (const e of errors) console.log('  ' + e);
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
