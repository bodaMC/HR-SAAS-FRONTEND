/**
 * PHASE 3.3 FINAL-V2 REAL-STACK e2e: browser -> Next (production build) -> REAL Laravel -> REAL PostgreSQL (disposable DB, synthetic data).
 * Part A: the independent-review findings (unlink deactivation, minimal link UI, HR self-edit, My Profile fields, per-account rate limits).
 * Part B: the Phase 3.2 real-stack security coverage that was tied to the removed register-company route, ported to the 3.3 provisioning seed
 *         (tenant isolation, own-record-only employee, role grant -> effect -> revoke with the SAME token refused, platform admin lock-out, direct URLs).
 * Seeded by verify/seed-p33.php. Nothing here is simulated.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const BASE = 'http://127.0.0.1:3000';
const API = 'http://127.0.0.1:8000/api/v1';
const SHOTS = process.env.SHOTS_DIR ?? 'e2e-screenshots/v33-';
const PW = 'Str0ng!Pass#2026';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`); };
async function api(method, path, body, token) {
  const r = await fetch(API + path, { method, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const tokenOf = async (email, password = PW) => { const r = await api('POST', '/auth/login', { email, password, device_name: 'e2e' }); if (r.status !== 200) throw new Error(`login ${email} -> ${r.status}`); return r.body.token; };
const psql = (sql) => execFileSync('psql', ['-h', '127.0.0.1', '-p', '5433', '-U', 'postgres', '-d', 'conure_p33rs', '-tAc', sql], { env: { ...process.env, PGPASSWORD: 'x' } }).toString().trim();
const empId = (num) => Number(psql(`select id from employees where employee_number='${num}'`));
const empUuid = (id) => psql(`select uuid from employees where id=${id}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const shot = (name) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true });
async function uiLogin(email, password = PW) {
  await ctx.clearCookies();
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
}
const body = (id) => ({ confirm_employee_uuid: empUuid(id), reason: 'Synthetic review verification reason' });

const hr = await tokenOf('hr1.a@e2e.test'), ssa = await tokenOf('ssa.a@e2e.test'), ssaB = await tokenOf('ssa.b@e2e.test');
const A_HR = empId('a-A2'), A_EMP = empId('a-A4'), A_OTHER = empId('a-A5'), B_EMP = empId('b-A4');

// ================= Part A: review findings =================
// A1 HR cannot edit its own official record (UI hidden, direct URL blocked, API refuses); self-service stays open.
await uiLogin('hr1.a@e2e.test');
await page.goto(BASE + `/employees/${A_HR}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('account-panel').waitFor(); await page.waitForLoadState('networkidle');
check('A1 own record: Edit, Delete and Terminate are not offered in the UI', (await page.getByRole('link', { name: 'Edit' }).count()) === 0 && (await page.getByRole('button', { name: /Delete employee/ }).count()) === 0 && (await page.getByTestId('account-terminate').count()) === 0);
check('A1 own record: no account-admin buttons either (reset, deactivate, unlink)', (await page.getByTestId('account-reset-password').count()) === 0 && (await page.getByTestId('account-deactivate').count()) === 0 && (await page.getByTestId('account-unlink').count()) === 0);
await shot('v2-a1-own-record-hr');
await page.goto(BASE + `/employees/${A_HR}/edit`, { waitUntil: 'domcontentloaded' });
check('A1 direct edit URL for the own record shows the blocked notice, no form', (await page.getByTestId('edit-self-blocked').count()) === 1);
const before = psql(`select first_name||'|'||coalesce(employment_type,'')||'|'||employment_status from employees where id=${A_HR}`);
check('A1 API PUT own record -> 403', (await api('PUT', `/employees/${A_HR}`, { first_name: 'Hacked' }, hr)).status === 403);
check('A1 API PUT own employment_type -> 403', (await api('PUT', `/employees/${A_HR}`, { employment_type: 'contract' }, hr)).status === 403);
check('A1 API DELETE own record -> 403', (await api('DELETE', `/employees/${A_HR}`, null, hr)).status === 403);
check('A1 API terminate own record -> 403', (await api('POST', `/employees/${A_HR}/terminate`, body(A_HR), hr)).status === 403);
check('A1 own record unchanged in the database', psql(`select first_name||'|'||coalesce(employment_type,'')||'|'||employment_status from employees where id=${A_HR}`) === before);
check('A1 HR can still edit another employee', (await api('PUT', `/employees/${A_OTHER}`, { first_name: 'Manager' }, hr)).status === 200);
check('A1 self-service phone still works for HR', (await api('PUT', '/me/profile', { phone: '+20 100 777 0001' }, hr)).status === 200 && psql(`select phone from employees where id=${A_HR}`) === '+20 100 777 0001');

// A2 My Profile shows employment type, hire date, trainee read-only (EN and AR).
psql(`update employees set employment_type='part_time', hire_date='2024-02-10', is_trainee=true where id=${A_EMP}`);
await uiLogin('emp.a@e2e.test');
await page.goto(BASE + '/profile', { waitUntil: 'domcontentloaded' });
await page.getByTestId('my-profile').waitFor(); await page.waitForLoadState('networkidle');
const txt = (await page.getByTestId('my-profile').innerText());
check('A2 My Profile shows Employment type, Hire date and Trainee with the stored values', /Employment type\s*Part time/.test(txt.replace(/\n/g, ' ')) && /Hire date\s*2024-02-10/.test(txt.replace(/\n/g, ' ')) && /Trainee\s*Yes/.test(txt.replace(/\n/g, ' ')), txt.slice(0, 300));
check('A2 those fields are read-only (no inputs for them; only phone and picture are editable)', (await page.locator('input[name=employment_type], input[name=hire_date], input[name=is_trainee], #employment_type, #hire_date').count()) === 0);
await shot('v2-a2-my-profile-fields-en');
await ctx.addCookies([{ name: 'conure_locale', value: 'ar', url: BASE }]);
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForLoadState('networkidle');
const arTxt = (await page.getByTestId('my-profile').innerText()).replace(/\n/g, ' ');
check('A2 Arabic labels render (نوع التوظيف, تاريخ التعيين, متدرب)', /نوع التوظيف/.test(arTxt) && /تاريخ التعيين/.test(arTxt) && /متدرب/.test(arTxt), arTxt.slice(0, 200));
await shot('v2-a2-my-profile-fields-ar');
await ctx.addCookies([{ name: 'conure_locale', value: 'en', url: BASE }]);

// A3 unlink deactivates atomically; the account is not an uncontrolled active login; roles untouched; link is explicit and audited.
const empUser = Number(psql(`select user_id from employees where id=${A_EMP}`));
const rolesBefore = psql(`select coalesce(string_agg(role_id::text, ',' order by role_id),'') from user_roles where user_id=${empUser}`);
const oldTok = await tokenOf('emp.a@e2e.test'), oldTok2 = await tokenOf('emp.a@e2e.test');
await uiLogin('hr1.a@e2e.test');
await page.goto(BASE + `/employees/${A_EMP}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('account-panel').waitFor(); await page.waitForLoadState('networkidle');
await page.getByTestId('account-unlink').click();
await page.locator('#acc-reason').fill('Moving the employee to a new login identity');
await page.getByTestId('account-dialog-target-confirm').check();
await shot('v2-a3-unlink-dialog');
await page.getByTestId('account-dialog-confirm').click();
await page.waitForFunction(() => document.querySelector('[data-testid=account-state]')?.getAttribute('data-state') === 'no_login', null, { timeout: 15000 });
check('A3 UI unlink returns the employee to no_login', true);
check('A3 DB: employee unlinked, account INACTIVE, zero tokens, roles unchanged', psql(`select coalesce(user_id::text,'null') from employees where id=${A_EMP}`) === 'null' && psql(`select is_active::text from users where id=${empUser}`) === 'false' && psql(`select count(*) from personal_access_tokens where tokenable_id=${empUser}`) === '0' && psql(`select coalesce(string_agg(role_id::text, ',' order by role_id),'') from user_roles where user_id=${empUser}`) === rolesBefore);
check('A3 both earlier sessions are refused', (await api('GET', '/auth/me', null, oldTok)).status === 401 && (await api('GET', '/auth/me', null, oldTok2)).status === 401);
const lg = await api('POST', '/auth/login', { email: 'emp.a@e2e.test', password: PW });
check('A3 the unlinked account cannot sign in (403 USER_INACTIVE)', lg.status === 403 && lg.body?.code === 'USER_INACTIVE');
check('A3 audit: account.unlinked recorded with account_deactivated', Number(psql(`select count(*) from audit_logs where action='account.unlinked' and new_values::text like '%account_deactivated%'`)) >= 1);

// A4 minimal Link UI: only eligible accounts; protected, linked, cross-tenant and self accounts never listed; HR gets no RBAC directory.
psql(`insert into users(uuid,company_id,name,email,password,role,is_active,created_at,updated_at) select gen_random_uuid(),company_id,'Free Candidate','free.candidate@e2e.test',password,'employee',false,now(),now() from users where email='hr1.a@e2e.test'`);
const cand = await api('GET', `/employees/${A_EMP}/account/link-candidates`, null, hr);
const emails = (cand.body?.data ?? []).map((c) => c.email);
check('A4 candidates include the unlinked account and the free one', emails.includes('emp.a@e2e.test') && emails.includes('free.candidate@e2e.test'), JSON.stringify(emails));
check('A4 candidates exclude SSA, both HR accounts, linked accounts, the platform admin and the other tenant', !emails.some((e) => /^(ssa|hr1|hr2|mgr|restricted|roleadmin)\./.test(e) || /platform|\.b@/.test(e)), JSON.stringify(emails));
check('A4 candidate rows expose only id, name, email, is_active', (cand.body?.data ?? []).every((c) => Object.keys(c).sort().join() === 'email,id,is_active,name'));
check('A4 HR still cannot read the RBAC directory (/access/users 403)', (await api('GET', '/access/users', null, hr)).status === 403);
check('A4 employee without accounts.link cannot list candidates (403)', (await api('GET', `/employees/${A_EMP}/account/link-candidates`, null, await tokenOf('mgr.a@e2e.test'))).status === 403);
check('A4 cross-tenant employee id is not reachable for candidates (404)', (await api('GET', `/employees/${B_EMP}/account/link-candidates`, null, hr)).status === 404);
await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByTestId('account-panel').waitFor(); await page.waitForLoadState('networkidle');
await page.getByTestId('account-link').click();
await page.getByTestId('account-link-picker').waitFor();
await page.locator('[data-testid^=account-link-candidate-]').first().waitFor();
const listed = (await page.getByTestId('account-link-list').innerText());
check('A4 UI picker lists only eligible accounts (no SSA, HR, other tenant)', /free\.candidate@e2e\.test/.test(listed) && !/ssa\.|hr1\.|hr2\.|platform|\.b@e2e/.test(listed), listed.slice(0, 200));
await shot('v2-a4-link-picker');
await page.locator('#acc-link-search').fill('emp.a@');
await page.waitForFunction(() => document.querySelectorAll('[data-testid^=account-link-candidate-]').length === 1, null, { timeout: 10000 });
await page.locator('[data-testid^=account-link-candidate-]').first().check();
await page.locator('#acc-reason').fill('Re-linking the verified original login');
await page.getByTestId('account-dialog-target-confirm').check();
await page.getByTestId('account-dialog-confirm').click();
await page.waitForFunction(() => document.querySelector('[data-testid=account-state]')?.getAttribute('data-state') === 'inactive', null, { timeout: 15000 });
check('A4 UI link re-attaches the account and it STAYS inactive', psql(`select user_id from employees where id=${A_EMP}`) === String(empUser) && psql(`select is_active::text from users where id=${empUser}`) === 'false');
check('A4 audit: account.linked recorded', Number(psql(`select count(*) from audit_logs where action='account.linked'`)) >= 1);
await dialogReactivate();
async function dialogReactivate() {
  await page.getByTestId('account-reactivate').click();
  await page.locator('#acc-reason').fill('Explicit reactivation after re-linking');
  await page.getByTestId('account-dialog-target-confirm').check();
  await page.getByTestId('account-dialog-confirm').click();
  await page.waitForFunction(() => document.querySelector('[data-testid=account-state]')?.getAttribute('data-state') === 'active' || document.querySelector('[data-testid=account-state]')?.getAttribute('data-state') === 'password_change_required', null, { timeout: 15000 });
}
check('A4 explicit activation works and the revoked sessions stay invalid', psql(`select is_active::text from users where id=${empUser}`) === 'true' && (await api('GET', '/auth/me', null, oldTok)).status === 401 && psql(`select coalesce(string_agg(role_id::text, ',' order by role_id),'') from user_roles where user_id=${empUser}`) === rolesBefore);
await shot('v2-a4-relinked-active');

// A5 rate limits are per account, not per token.
const mtoks = [await tokenOf('mgr.a@e2e.test'), await tokenOf('mgr.a@e2e.test'), await tokenOf('mgr.a@e2e.test')];
const codes = [];
for (let i = 0; i < 12; i++) codes.push((await api('POST', '/auth/change-password', { current_password: 'wrong', password: 'N3w!Passw0rd#77', password_confirmation: 'N3w!Passw0rd#77' }, mtoks[i % 3])).status);
check('A5 three tokens of one account share one password allowance (429 from attempt 11)', codes.slice(0, 10).every((c) => c === 422) && codes[10] === 429 && codes[11] === 429, codes.join());

// ================= Part B: ported Phase 3.2 security coverage =================
// B1 role-gated endpoints for non-privileged and platform accounts.
const empT = await tokenOf('emp.a@e2e.test'), mgrT = await tokenOf('mgr.a@e2e.test'), platT = await tokenOf('platform@e2e.test');
const restrictedT = await tokenOf('mgr.a@e2e.test');
psql(`update users set must_change_password=false where email in ('emp.a@e2e.test')`);
for (const [n, f, st] of [
  ['B1 ordinary employee GET /employees -> 403', () => api('GET', '/employees', null, empT), 403],
  ['B1 ordinary employee GET another record -> 403', () => api('GET', `/employees/${A_OTHER}`, null, empT), 403],
  ['B1 ordinary employee GET own record -> 200', () => api('GET', `/employees/${A_EMP}`, null, empT), 200],
  ['B1 ordinary employee GET /departments -> 403', () => api('GET', '/departments', null, empT), 403],
  ['B1 ordinary employee GET /access/roles -> 403', () => api('GET', '/access/roles', null, empT), 403],
  ['B1 manager-type account GET /employees -> 403 (no implicit privilege)', () => api('GET', '/employees', null, mgrT), 403],
  ['B1 platform admin GET /employees -> 403', () => api('GET', '/employees', null, platT), 403],
  ['B1 platform admin GET /access/users -> 403', () => api('GET', '/access/users', null, platT), 403],
  ['B1 ordinary employee POST /employees -> 403', () => api('POST', '/employees', { employee_number: 'X1', first_name: 'X', last_name: 'X', email: 'x@x.test' }, empT), 403],
  ['B1 HR GET /access/roles -> 403 (HR holds no RBAC)', () => api('GET', '/access/roles', null, hr), 403],
  ['B1 HR POST /access/roles -> 403', () => api('POST', '/access/roles', { name: 'Evil', permissions: ['employees.view'] }, hr), 403],
]) { const r = await f(); check(n, r.status === st, `status=${r.status}`); }

// B2 tenant isolation both directions.
const listA = (await api('GET', '/employees', null, hr)).body?.data ?? [];
check('B2 tenant A HR sees only tenant A employees', listA.length > 0 && listA.every((e) => /^a-/.test(e.employee_number)), listA.map((e) => e.employee_number).slice(0, 5).join());
check('B2 tenant A HR GET tenant B employee -> 404', (await api('GET', `/employees/${B_EMP}`, null, hr)).status === 404);
check('B2 tenant A HR PUT tenant B employee -> 404', (await api('PUT', `/employees/${B_EMP}`, { first_name: 'X' }, hr)).status === 404);
check('B2 tenant A HR account ops on tenant B employee -> 404', (await api('POST', `/employees/${B_EMP}/account/reset-password`, { reason: 'Synthetic cross tenant', confirm_employee_uuid: empUuid(B_EMP) }, hr)).status === 404);
const rolesA = (await api('GET', '/access/roles', null, ssa)).body?.data ?? [], rolesB = (await api('GET', '/access/roles', null, ssaB)).body?.data ?? [];
const bUser = Number(psql(`select id from users where email='emp.b@e2e.test'`));
check('B2 each tenant SSA lists roles of its own tenant only', rolesA.length > 0 && rolesB.length > 0 && !rolesA.some((r) => rolesB.some((x) => x.id === r.id)));
check('B2 tenant A SSA assign roles to a tenant B account -> 404', (await api('PUT', `/access/users/${bUser}/roles`, { role_ids: [rolesA[0].id] }, ssa)).status === 404);
check('B2 tenant A SSA reads tenant B user permissions -> 404', (await api('GET', `/access/users/${bUser}/permissions`, null, ssa)).status === 404);
check('B2 tenant B role id invisible to tenant A (404)', (await api('GET', `/access/roles/${rolesB[0].id}`, null, ssa)).status === 404);
check('B2 tenant B SSA cannot edit a tenant A role (404)', (await api('PUT', `/access/roles/${rolesA[0].id}`, { name: 'x', permissions: [] }, ssaB)).status === 404);
const usersA = []; for (let pg = 1, last = 1; pg <= last; pg++) { const r = (await api('GET', `/access/users?per_page=100&page=${pg}`, null, ssa)).body; usersA.push(...(r?.data ?? [])); last = r?.meta?.last_page ?? 1; }
check('B2 tenant A directory lists only tenant A accounts, no platform admin', usersA.length > 0 && usersA.every((u) => !/\.b@e2e\.test|platform@/.test(u.email)), usersA.map((u) => u.email).join());

// B3 grant -> effect -> revoke; the SAME token is refused immediately.
const created = await api('POST', '/access/roles', { name: 'Recruiter Review', permissions: ['employees.view'] }, ssa);
check('B3 SSA creates a delegated role (201)', created.status === 201 || created.status === 200, `status=${created.status}`);
const recruiterId = created.body?.data?.id ?? Number(psql(`select id from roles where name='Recruiter Review'`));
const restrictedUser = Number(psql(`select id from users where email='mgr.a@e2e.test'`));
const assignedBefore = psql(`select coalesce(string_agg(role_id::text, ',' order by role_id),'') from user_roles where user_id=${restrictedUser}`).split(',').filter(Boolean).map(Number);
check('B3 before the grant the account has no employee access (403)', (await api('GET', '/employees', null, restrictedT)).status === 403);
const asg = await api('PUT', `/access/users/${restrictedUser}/roles`, { role_ids: [...assignedBefore, recruiterId] }, ssa);
check('B3 SSA assigns the role to an account', asg.status === 200, `status=${asg.status}`);
check('B3 effect: the account can read employees with its existing token', (await api('GET', '/employees', null, restrictedT)).status === 200);
const rev = await api('PUT', `/access/users/${restrictedUser}/roles`, { role_ids: assignedBefore.filter((x) => x !== recruiterId) }, ssa);
check('B3 SSA revokes the role', rev.status === 200, `status=${rev.status}`);
const after = await api('GET', '/employees', null, restrictedT);
check('B3 the SAME token is refused immediately after revocation (API)', [401, 403].includes(after.status), `status=${after.status} roles=${psql(`select string_agg(r.name,',') from user_roles ur join roles r on r.id=ur.role_id where ur.user_id=${restrictedUser}`)}`);
check('B3 HR cannot assign roles to anyone (403)', (await api('PUT', `/access/users/${restrictedUser}/roles`, { role_ids: [recruiterId] }, hr)).status === 403);
check('B3 SSA cannot assign roles to itself (self-assignment refused)', (await api('PUT', `/access/users/${psql(`select id from users where email='ssa.a@e2e.test'`)}/roles`, { role_ids: [recruiterId] }, ssa)).status >= 400);


// B5 directory pagination at scale on real PostgreSQL (ported from the removed 305-account check): accurate total, last page reachable, server search beyond the first 200.
psql(`insert into users(uuid,company_id,name,email,password,role,is_active,created_at,updated_at) select gen_random_uuid(),(select id from companies where slug='seed-a'),'Bulk '||g,'bulk'||lpad(g::text,4,'0')||'@e2e.test',(select password from users where email='hr1.a@e2e.test'),'employee',true,now(),now() from generate_series(1,300) g`);
const totalA = Number(psql(`select count(*) from users where company_id=(select id from companies where slug='seed-a') and is_super_admin=false and deleted_at is null`));
const pg1 = (await api('GET', '/access/users?per_page=25&page=1', null, ssa)).body;
check('B5 directory page 1 returns 25 rows and the accurate total', pg1?.data?.length === 25 && pg1?.meta?.total === totalA, `rows=${pg1?.data?.length} total=${pg1?.meta?.total} db=${totalA}`);
const lastPage = Math.ceil(totalA / 25);
const pgL = (await api('GET', `/access/users?per_page=25&page=${lastPage}`, null, ssa)).body;
check('B5 last page is reachable with exactly the remaining rows', pgL?.meta?.last_page === lastPage && pgL?.data?.length === totalA - 25 * (lastPage - 1), `last=${pgL?.meta?.last_page} rows=${pgL?.data?.length}`);
const srch = (await api('GET', '/access/users?search=bulk0299%40', null, ssa)).body;
check('B5 server-side search reaches an account beyond the first 200', (srch?.data ?? []).some((u) => u.email === 'bulk0299@e2e.test'), JSON.stringify(srch?.meta ?? {}));
check('B5 tenant B directory is unaffected by the bulk accounts of tenant A', ((await api('GET', '/access/users?per_page=100', null, ssaB)).body?.meta?.total ?? 0) < 40);

// B4 direct URLs in the browser.
await uiLogin('emp.a@e2e.test');
for (const p of ['/employees', '/departments', '/job-titles', '/access']) {
  await page.goto(BASE + p, { waitUntil: 'domcontentloaded' });
  check(`B4 ordinary employee direct URL ${p} -> restricted panel`, (await page.getByTestId('page-restricted').count()) === 1);
}
await page.goto(BASE + `/employees/${A_OTHER}`, { waitUntil: 'domcontentloaded' });
const html = await page.content();
check('B4 ordinary employee cannot open another employee record (restricted, no data)', (await page.getByTestId('page-restricted').count()) === 1 && !html.includes('a-A5'));
await shot('v2-b4-employee-restricted');
await uiLogin('hr1.a@e2e.test');
await page.goto(BASE + '/access', { waitUntil: 'domcontentloaded' });
check('B4 HR direct URL /access -> restricted panel (UI)', (await page.getByTestId('page-restricted').count()) === 1);

console.log(`SUMMARY pass=${pass} fail=${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
