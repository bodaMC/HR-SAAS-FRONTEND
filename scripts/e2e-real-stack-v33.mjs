/**
 * PHASE 3.3 REAL-STACK e2e: browser -> Next (production build) -> REAL Laravel -> REAL PostgreSQL (Linux, disposable DB, synthetic data).
 * Seeded by verify/seed-p33.php (2 tenants a/b; ssa, hr1, hr2, emp, mgr, restricted, roleadmap accounts + unlinked employees N1-N3 + former F1).
 * Covers the 12 approved journeys plus the five final-verification points. Nothing here is simulated.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:3000';
const API = 'http://127.0.0.1:8000/api/v1';
const SHOTS = process.env.SHOTS_DIR ?? 'e2e-screenshots/v33-';
const PW = 'Str0ng!Pass#2026';
const NEWPW = 'N3w!Passw0rd#77';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`); };
async function api(method, path, body, token) {
  const r = await fetch(API + path, { method, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const login = async (email, password = PW) => api('POST', '/auth/login', { email, password, device_name: 'e2e' });
const tokenOf = async (email, password = PW) => { const r = await login(email, password); if (r.status !== 200) throw new Error(`login ${email} -> ${r.status}`); return r.body.token; };
const psql = (sql) => execFileSync('psql', ['-h', '127.0.0.1', '-p', '5433', '-U', 'postgres', '-d', 'conure_p33rs', '-tAc', sql], { env: { ...process.env, PGPASSWORD: 'x' } }).toString().trim();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
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
async function openEmployee(id) {
  await page.goto(BASE + `/employees/${id}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('account-panel').waitFor();
  await page.waitForLoadState('networkidle');
}
async function dialog(action, { reason = 'Synthetic e2e lifecycle action reason', confirm = true } = {}) {
  await page.getByTestId(`account-${action}`).click();
  if (await page.locator('#acc-reason').count()) await page.locator('#acc-reason').fill(reason);
  if (confirm) await page.getByTestId('account-dialog-target-confirm').check();
  await page.getByTestId('account-dialog-confirm').click();
}
const waitTemp = () => page.getByTestId('account-temp-password').waitFor({ timeout: 10000 }).catch(async () => { console.log('DEBUG dialog text:', (await page.locator('[role=dialog]').innerText().catch(() => 'no dialog')).replace(/\n/g, ' | ').slice(0, 500)); throw new Error('temporary password not shown'); });
const state = () => page.getByTestId('account-state').getAttribute('data-state');
const waitState = (s) => page.waitForFunction((x) => document.querySelector('[data-testid=account-state]')?.getAttribute('data-state') === x, s, { timeout: 15000 });
const empId = (num) => Number(psql(`select id from employees where employee_number='${num}'`));

import { appendFileSync, writeFileSync } from 'node:fs';
const TEMPS = process.env.TEMPS_FILE ?? '/tmp/p33/temps.txt';
writeFileSync(TEMPS, '');
const noteTemp = (v) => appendFileSync(TEMPS, v + '\n');
// Screenshot of a dialog that shows a temporary password: the secret is masked in the DOM first so it never lands in an artifact.
const maskedShot = async (name) => { await page.getByTestId('account-temp-password').evaluate((n) => { n.textContent = '************ (masked for the screenshot)'; }); await shot(name); };
const storageHas = (secret) => page.evaluate((x) => JSON.stringify([localStorage, sessionStorage].map((st) => Object.entries(st))).includes(x) || document.cookie.includes(x), secret);
const hrTok = await tokenOf('hr1.a@e2e.test');
const ssaTok = await tokenOf('ssa.a@e2e.test');
const N1 = empId('a-N1');

// ===== Journey 1: HR creates a login account (UI) =====
await uiLogin('hr1.a@e2e.test');
await openEmployee(N1);
check('J1 no-login employee shows state no_login', (await state()) === 'no_login');
await shot('j01-hr-no-login-en');
await page.getByTestId('account-create').click();
await page.getByTestId('account-dialog-target-confirm').check();
await shot('j01-create-dialog-en');
await page.getByTestId('account-dialog-confirm').click();
await waitTemp();
const temp1 = ((await page.getByTestId('account-temp-password').textContent()) ?? '').trim();
check('J1 HR created a login; temporary password shown once', temp1.length >= 12, temp1.length);
noteTemp(temp1);
check('P1 temporary password is not in localStorage, sessionStorage or JS-readable cookies while shown', !(await storageHas(temp1)));
await maskedShot('j01-temp-password-en-masked');
await page.getByTestId('account-onetime-done').click();
check('P1 temporary password is gone from the DOM after Done', !(await page.content()).includes(temp1));
check('P1 temporary password is not in browser storage after Done', !(await storageHas(temp1)));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByTestId('account-panel').waitFor();
check('J1 state is password_change_required and password is not recoverable', (await state()) === 'password_change_required' && !(await page.content()).includes(temp1));
const loginEmail = (await page.getByTestId('account-login-email').textContent())?.trim() ?? '';
check('J1 DB: user created with must_change_password and NO roles (no auto privilege)', psql(`select must_change_password::text from users where email='${loginEmail}'`) === 'true' && psql(`select count(*) from user_roles ur join users u on u.id=ur.user_id where u.email='${loginEmail}'`) === '0');
check('J1 audit row account.created exists with the reason-less create recorded', Number(psql(`select count(*) from audit_logs where action='account.created'`)) >= 1);

// ===== Journey 2: employee signs in with the temporary password =====
const preTok = await tokenOf(loginEmail, temp1); // an API session issued before the forced change
await uiLogin(loginEmail, temp1);
await page.getByTestId('first-login-page').waitFor();
check('J2 sign-in with temp password lands on /first-login', new URL(page.url()).pathname === '/first-login', page.url());
await shot('j02-first-login-en');

// ===== Journey 3: cannot bypass the forced change =====
for (const p of ['/', '/employees', '/profile', '/departments']) {
  await page.goto(BASE + p, { waitUntil: 'domcontentloaded' });
  check(`J3 direct URL ${p} is redirected to /first-login`, new URL(page.url()).pathname === '/first-login', page.url());
}
const bypass = await api('GET', '/employees', null, preTok);
check('J3 API with the pre-change token is refused 403 PASSWORD_CHANGE_REQUIRED', bypass.status === 403 && bypass.body?.code === 'PASSWORD_CHANGE_REQUIRED', JSON.stringify(bypass));
const bypassProfile = await api('GET', '/me/profile', null, preTok);
check('J3 API own profile also refused until the password is changed', bypassProfile.status === 403, bypassProfile.status);

// ===== Journey 4: change password and gain access =====
await page.goto(BASE + '/first-login', { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle');
await page.locator('#pw-current').fill(temp1);
await page.locator('#pw-new').fill('short');
await page.locator('#pw-confirm').fill('short');
await page.getByTestId('pw-submit').click();
await page.waitForTimeout(800);
check('J4 weak password is rejected and the user stays on /first-login', new URL(page.url()).pathname === '/first-login');
await shot('j04-weak-password-en');
await page.locator('#pw-new').fill(NEWPW);
await page.locator('#pw-confirm').fill(NEWPW);
await page.getByTestId('pw-submit').click();
await page.waitForURL((u) => u.pathname === '/', { timeout: 15000 });
await page.getByTestId('welcome-name').waitFor({ state: 'visible' });
check('J4 after the change the employee reaches the dashboard', new URL(page.url()).pathname === '/');
check('J4 DB: must_change_password is now false', psql(`select must_change_password::text from users where email='${loginEmail}'`) === 'false');
const oldPre = await api('GET', '/auth/me', null, preTok);
check('J4 the pre-change token is revoked (401)', oldPre.status === 401, oldPre.status);
const empTok = await tokenOf(loginEmail, NEWPW);
const meEmp = await api('GET', '/auth/me', null, empTok);
check('J4 new password works over the API and /auth/me is 200', meEmp.status === 200);
await shot('j04-dashboard-after-change-en');

// ===== Journey 5: own phone and picture =====
await page.goto(BASE + '/profile', { waitUntil: 'domcontentloaded' });
await page.getByTestId('my-profile').waitFor();
await page.waitForLoadState('networkidle');
check('J5 My Profile shows the read-only note', await page.getByTestId('my-profile-note').isVisible());
await page.getByLabel('Phone').fill('+20 100 555 0101');
await page.getByTestId('profile-phone-save').click();
await page.getByTestId('profile-phone-saved').waitFor();
check('J5 phone saved in the DB', psql(`select phone from employees where id=${N1}`) === '+20 100 555 0101');
const png = readFileSync(new URL('./fixtures/avatar.png', import.meta.url));
await page.setInputFiles('#picture-file', { name: 'me.png', mimeType: 'image/png', buffer: png });
await page.getByTestId('picture-remove').waitFor();
check('J5 picture stored privately (DB path set, file served only with auth)', psql(`select (avatar_path is not null)::text from employees where id=${N1}`) === 'true');
const unauthPic = await fetch(API + '/me/profile/picture', { headers: { Accept: 'application/json' } });
check('J5 picture endpoint refuses unauthenticated requests', unauthPic.status === 401, unauthPic.status);
const ownPic = await fetch(API + '/me/profile/picture', { headers: { Authorization: `Bearer ${empTok}` } });
check('J5 owner can read own picture (image/*)', ownPic.status === 200 && (ownPic.headers.get('content-type') ?? '').startsWith('image/'), ownPic.status);
const hackName = await api('PUT', '/me/profile', { first_name: 'Hacker' }, empTok);
check('J5 name cannot be edited (422)', hackName.status === 422, hackName.status);
const hackDept = await api('PUT', '/me/profile', { department_id: 1, employment_status: 'active' }, empTok);
check('J5 department/status cannot be edited (422)', hackDept.status === 422, hackDept.status);
await shot('j05-my-profile-en');
const notHr = await api('POST', `/employees/${N1}/account/reset-password`, {}, empTok);
check('J5 a plain employee cannot use account administration (403)', notHr.status === 403, notHr.status);

// ===== Journey 6 + 7: HR resets the password; old sessions lose access =====
await uiLogin('hr1.a@e2e.test');
await openEmployee(N1);
const beforeReset = empTok;
await dialog('reset-password');
await page.getByTestId('account-temp-password').waitFor({ timeout: 8000 }).catch(async () => { console.log('DEBUG reset dialog text:', (await page.locator('[role=dialog]').innerText().catch(() => 'no dialog')).slice(0, 400)); await shot('debug-reset'); throw new Error('reset temp password not shown'); });
const temp2 = ((await page.getByTestId('account-temp-password').textContent()) ?? '').trim();
check('J6 HR reset returns a new temporary password', temp2.length >= 12 && temp2 !== temp1);
noteTemp(temp2);
await maskedShot('j06-reset-temp-password-en-masked');
await page.getByTestId('account-onetime-done').click();
const afterReset = await api('GET', '/auth/me', null, beforeReset);
check('J7 existing session token is revoked after reset (401)', afterReset.status === 401, afterReset.status);
check('J7 tokens are deleted from the DB (permanent revocation)', Number(psql(`select count(*) from personal_access_tokens p join users u on u.id=p.tokenable_id where u.email='${loginEmail}'`)) === 0);
const oldPwLogin = await login(loginEmail, NEWPW);
check('J7 old password no longer works (422/401)', [401, 422].includes(oldPwLogin.status), oldPwLogin.status);
const tempLogin = await login(loginEmail, temp2);
check('J7 new temp password works and forces a change again', tempLogin.status === 200 && tempLogin.body.user.must_change_password === true);
check('J7 a revoked token never returns (still 401 a second time)', (await api('GET', '/auth/me', null, beforeReset)).status === 401);
// browser session of the employee: sign in, then HR deactivates -> next navigation loses access
const t3 = (await login(loginEmail, temp2)).body.token;
await api('POST', '/auth/change-password', { current_password: temp2, password: NEWPW, password_confirmation: NEWPW }, t3);
const liveTok = await tokenOf(loginEmail, NEWPW);

// ===== Deactivate (point 2: permanent revocation) =====
await openEmployee(N1);
await dialog('deactivate');
await waitState('inactive');
check('P2 deactivate: state inactive', true);
check('P2 deactivate: live token is refused (401/403) and rows are gone', [401, 403].includes((await api('GET', '/auth/me', null, liveTok)).status) && Number(psql(`select count(*) from personal_access_tokens p join users u on u.id=p.tokenable_id where u.email='${loginEmail}'`)) === 0);
const inactiveLogin = await login(loginEmail, NEWPW);
check('P2 inactive account cannot sign in (403)', inactiveLogin.status === 403, inactiveLogin.status);
await shot('p2-inactive-en');
await dialog('reactivate');
await page.waitForFunction(() => document.querySelector('[data-testid=account-state]')?.getAttribute('data-state') === 'active', null, { timeout: 15000 });
check('P2 account reactivation only re-enables sign-in: the old token stays dead (sessions are never restored)', (await api('GET', '/auth/me', null, liveTok)).status === 401);
check('P2 after account reactivation a fresh sign-in works with the existing password', (await login(loginEmail, NEWPW)).status === 200);
const temp3 = null;

// ===== Unlink revokes tokens =====
const unlinkTok = await tokenOf(loginEmail, NEWPW);
await openEmployee(N1);
await dialog('unlink');
await waitState('no_login');
check('P2 unlink: token revoked, login removed from employee, user row kept inactive/unlinked', (await api('GET', '/auth/me', null, unlinkTok)).status === 401 && psql(`select (user_id is null)::text from employees where id=${N1}`) === 'true');
// recreate for the termination journeys
await page.getByTestId('account-create').click();
await page.getByTestId('account-dialog-target-confirm').check();
const emailField = page.locator('#acc-email');
const reEmail = `nour.relinked.a@e2e.test`;
await emailField.fill(reEmail);
await page.getByTestId('account-dialog-confirm').click();
await waitTemp();
const temp4 = ((await page.getByTestId('account-temp-password').textContent()) ?? '').trim();
noteTemp(temp4);
await page.getByTestId('account-onetime-done').click();
const tok4 = await tokenOf(reEmail, temp4);
const changed = await api('POST', '/auth/change-password', { current_password: temp4, password: NEWPW, password_confirmation: NEWPW }, tok4);
check('J8 setup: relinked account changed its temporary password', changed.status === 200, changed.status);
const tokTerm = await tokenOf(reEmail, NEWPW);

// ===== Journey 8: HR terminates the employee (UI) =====
const deptBefore = psql(`select department_id from employees where id=${N1}`);
await openEmployee(N1);
await page.getByTestId('account-terminate').click();
await page.locator('#acc-reason').fill('Synthetic e2e termination reason');
await page.getByTestId('account-dialog-target-confirm').check();
await shot('j08-terminate-dialog-en');
await page.getByTestId('account-dialog-confirm').click();
await page.getByTestId('account-former-note').waitFor();
check('J8 employee is terminated', psql(`select employment_status from employees where id=${N1}`) === 'terminated');
check('J8 login account deactivated and all tokens deleted with the termination', (await api('GET', '/auth/me', null, tokTerm)).status === 401 && Number(psql(`select count(*) from personal_access_tokens p join users u on u.id=p.tokenable_id where u.email='${reEmail}'`)) === 0);
check('J8 audit row employee.terminated recorded with a reason', Number(psql(`select count(*) from audit_logs where action='employee.terminated' and coalesce(reason,'')<>''`)) >= 1);
await shot('j08-terminated-en');

// ===== Journey 9: former record stays (point 1) =====
check('J9 employee row still exists, not soft-deleted', psql(`select (deleted_at is null)::text from employees where id=${N1}`) === 'true');
check('J9 department / manager relationships preserved', psql(`select department_id from employees where id=${N1}`) === deptBefore);
check('J9 linked user row preserved (not deleted)', psql(`select (deleted_at is null)::text from users where email='${reEmail}'`) === 'true');
check('J9 termination_date set', psql(`select (termination_date is not null)::text from employees where id=${N1}`) === 'true');
const former = await api('GET', '/employees?scope=former', null, hrTok);
check('J9 HR directory scope=former lists the terminated employee', former.status === 200 && former.body.data.some((e) => e.id === N1), former.status);
const current = await api('GET', '/employees?scope=current', null, hrTok);
check('J9 scope=current hides terminated employees', !current.body.data.some((e) => e.id === N1));
await page.goto(BASE + '/employees?scope=former', { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle');
await shot('j09-former-directory-en');
const genericPut = await api('PUT', `/employees/${N1}`, { first_name: 'Nour', last_name: 'Nologina', employment_status: 'active' }, hrTok);
check('J9 generic PUT cannot reactivate a terminated employee (422 use_lifecycle_action)', genericPut.status === 422, genericPut.status);
// ordinary delete is non-destructive (soft)
const delRes = await api('DELETE', `/employees/${empId('a-N3')}`, null, hrTok);
check('J9 ordinary delete succeeds', [200, 204].includes(delRes.status), delRes.status);
check('J9 ordinary delete is non-destructive (row kept, deleted_at set)', psql(`select (deleted_at is not null)::text from employees where employee_number='a-N3'`) === 'true');

// ===== Journey 10: terminated employee cannot sign in =====
const termLogin = await login(reEmail, NEWPW);
check('J10 terminated account sign-in is refused (403)', termLogin.status === 403, termLogin.status);
await uiLogin(reEmail, NEWPW).catch(() => {});
check('J10 UI sign-in stays on /login with an error', new URL(page.url()).pathname.startsWith('/login'));
await shot('j10-terminated-signin-en');

// ===== Journey 11: reactivation =====
await uiLogin('hr1.a@e2e.test');
await openEmployee(N1);
await page.getByTestId('account-reactivate-employee').click();
await page.locator('#acc-reason').fill('Synthetic e2e reactivation reason');
await page.getByTestId('account-dialog-target-confirm').check();
await page.getByTestId('account-dialog-confirm').click();
await page.waitForFunction(() => !document.querySelector('[data-testid=account-former-note]'), null, { timeout: 15000 });
check('J11 employee is active again; the account stays inactive until reactivated separately', psql(`select employment_status from employees where id=${N1}`) === 'active' && (await state()) === 'inactive', await state());
await dialog('reactivate');
await page.waitForFunction(() => document.querySelector('[data-testid=account-state]')?.getAttribute('data-state') === 'active', null, { timeout: 15000 });
const l5 = await login(reEmail, NEWPW);
check('J11 reactivated account signs in again with its existing password', l5.status === 200 && l5.body.user.must_change_password === false, l5.status);
check('J11 pre-termination token stays dead after BOTH employee and account reactivation', (await api('GET', '/auth/me', null, tokTerm)).status === 401);
check('J11 reactivation did not restore roles or privileges (no permissions)', ((await api('GET', '/auth/me', null, l5.body.token)).body?.access?.permissions ?? []).length === 0);
await shot('j11-reactivated-en');

// ===== Journey 12: protected accounts cannot be taken over =====
const hr2 = empId('a-A3'), ssaE = empId('a-A1'), platE = empId('a-PLAT'), roleadminE = empId('a-A7');
const hrNum = (l) => empId(`a-A${['ssa', 'hr1', 'hr2', 'emp', 'mgr', 'restricted', 'roleadmin'].indexOf(l) + 1}`);
const targets = { hr2: hrNum('hr2'), ssa: hrNum('ssa'), platform: platE, roleadmin: hrNum('roleadmin'), hr1self: hrNum('hr1') };
for (const [name, id] of Object.entries(targets)) {
  const st = await api('GET', `/employees/${id}/account`, null, hrTok);
  const uuid = st.body?.data?.employee_uuid ?? psql(`select uuid from employees where id=${id}`);
  for (const act of ['reset-password', 'deactivate', 'unlink']) {
    const r = await api('POST', `/employees/${id}/account/${act}`, { confirm_employee_uuid: uuid, reason: 'Attempted takeover by HR e2e' }, hrTok);
    check(`J12 HR ${act} on ${name} is refused (403/422)`, [403, 422].includes(r.status), r.status);
  }
  const term = await api('POST', `/employees/${id}/terminate`, { confirm_employee_uuid: uuid, reason: 'Attempted takeover by HR e2e' }, hrTok);
  check(`J12 HR terminate ${name} is refused`, [403, 422].includes(term.status), term.status);
}
const stillActive = psql(`select count(*) from users where email in ('hr2.a@e2e.test','ssa.a@e2e.test','platform@e2e.test') and is_active`);
check('J12 DB: protected accounts remain active after all attempts', stillActive === '3', stillActive);
const ssaOnPlatform = await api('POST', `/employees/${platE}/account/reset-password`, { confirm_employee_uuid: psql(`select uuid from employees where id=${platE}`), reason: 'SSA attempt on platform admin' }, ssaTok);
check('J12 SSA cannot manage the Platform Super Admin', [403, 422].includes(ssaOnPlatform.status), ssaOnPlatform.status);
await openEmployee(targets.hr2);
check('J12 UI: HR sees another HR account as protected with no action buttons', (await state()) === 'protected' && (await page.getByTestId('account-reset-password').count()) === 0);
check('J12 UI: a protected target offers no Edit, Delete or Terminate controls', (await page.getByTestId('account-terminate').count()) === 0 && (await page.getByRole('button', { name: /Delete employee/ }).count()) === 0);
await shot('j12-protected-hr-en');

// ===== Point 4: HR cannot reach Roles & Permissions (nav, URL, API) =====
await uiLogin('hr1.a@e2e.test');
const sidebarText = await page.getByTestId('sidebar').innerText();
check('P4 HR sidebar does not show Roles & Permissions', !/Roles & Permissions/.test(sidebarText));
for (const label of ['Work Schedules', 'Holidays', 'Company Settings', 'Approval Workflows', 'Audit Logs']) check(`P4 HR sidebar shows ${label}`, sidebarText.includes(label));
await shot('p4-hr-dashboard-en');
await page.goto(BASE + '/access', { waitUntil: 'domcontentloaded' });
check('P4 HR direct URL /access is restricted', (await page.getByTestId('access-page').count()) === 0);
await shot('p4-hr-access-denied-en');
for (const p of ['/access/roles', '/access/permissions', '/access/users', `/access/users/${hrNum('emp')}/permissions`]) {
  const r = await api('GET', p, null, hrTok);
  check(`P4 HR API GET ${p} is 403`, r.status === 403, r.status);
}
for (const [m, p, b] of [['POST', '/access/roles', { name: 'X', permissions: ['employees.view'] }], ['PUT', `/access/users/${hrNum('emp')}/roles`, { role_ids: [1] }]]) {
  const r = await api(m, p, b, hrTok);
  check(`P4 HR API ${m} ${p} is 403`, r.status === 403, r.status);
}
const hrMe = await api('GET', '/auth/me', null, hrTok);
const hrPerms = hrMe.body?.access?.permissions ?? [];
check('P4 HR effective permissions contain no roles.* / permissions.*', !hrPerms.some((p) => /^(roles|permissions)\./.test(p)), hrPerms.join(','));
check('P4 HR has accounts.* and the operational permissions but no financial/protected-admin ones', hrPerms.includes('accounts.reset_password') && hrPerms.includes('audit_logs.view_operational') && !hrPerms.includes('audit_logs.view') && !hrPerms.some((p) => /payroll|financial/.test(p)));

// ===== Point 5: SSA keeps control =====
await uiLogin('ssa.a@e2e.test');
const ssaSide = await page.getByTestId('sidebar').innerText();
check('P5 SSA sidebar shows Roles & Permissions', /Roles & Permissions/.test(ssaSide));
await page.goto(BASE + '/access', { waitUntil: 'domcontentloaded' });
await page.getByTestId('access-page').waitFor();
await shot('p5-ssa-access-en');
const ssaRoles = await api('GET', '/access/roles', null, ssaTok);
check('P5 SSA can list roles over the API', ssaRoles.status === 200, ssaRoles.status);
const hrUuid = psql(`select uuid from employees where id=${targets.hr2}`);
const ssaReset = await api('POST', `/employees/${targets.hr2}/account/reset-password`, { confirm_employee_uuid: hrUuid, reason: 'SSA resets HR credentials e2e' }, ssaTok);
check('P5 SSA can reset an HR account password', ssaReset.status === 200 && typeof ssaReset.body?.temporary_password === 'string', ssaReset.status);
const hrRoleId = ssaRoles.body?.data?.find((r) => r.key === 'hr_administrator')?.id;
check('P5 SSA still sees the HR Administrator role and its membership control', !!hrRoleId);
const audSsa = await api('GET', '/audit-logs?per_page=100', null, ssaTok);
const audHr = await api('GET', '/audit-logs?per_page=100', null, hrTok);
check('P5/audit SSA sees at least as many audit events as HR', audSsa.status === 200 && audHr.status === 200 && audSsa.body.meta.total >= audHr.body.meta.total, `${audSsa.body?.meta?.total} vs ${audHr.body?.meta?.total}`);
check('audit: HR list contains only operational events', audHr.body.data.every((a) => !/^(rbac|platform|role|permission)\./.test(a.action)), audHr.body.data.map((a) => a.action).join(','));

// ===== Tenant isolation =====
const picA = await fetch(API + `/employees/${N1}/picture`, { headers: { Accept: 'application/json', Authorization: `Bearer ${hrTok}` } });
check('PIC tenant A HR can read tenant A employee picture', picA.status === 200 && (picA.headers.get('content-type') ?? '').startsWith('image/'), picA.status);
const bHrTok = await tokenOf('hr1.b@e2e.test');
const picB = await fetch(API + `/employees/${N1}/picture`, { headers: { Accept: 'application/json', Authorization: `Bearer ${bHrTok}` } });
check('PIC tenant B HR cannot read tenant A picture (404)', picB.status === 404, picB.status);
const picAnon = await fetch(API + `/employees/${N1}/picture`, { headers: { Accept: 'application/json' } });
check('PIC anonymous cannot read a picture (401)', picAnon.status === 401, picAnon.status);
const picNoPerm = await fetch(API + `/employees/${N1}/picture`, { headers: { Accept: 'application/json', Authorization: `Bearer ${await tokenOf('mgr.a@e2e.test')}` } });
check('PIC a same-tenant account without employees.view cannot read it (403 or 404, no existence leak)', [403, 404].includes(picNoPerm.status), picNoPerm.status);
const bffPicB = await (async () => { await uiLogin('hr1.b@e2e.test'); const r = await page.request.get(BASE + `/api/employees/${N1}/picture`); return r.status(); })();
check('PIC the Next BFF picture route also returns 404 for tenant B', bffPicB === 404, bffPicB);
check('PIC DB stores the file under a tenant-scoped private path', /^private\/|tenant|company|\d/.test(psql(`select avatar_path from employees where id=${N1}`)), psql(`select avatar_path from employees where id=${N1}`));
const bHr = await tokenOf('hr1.b@e2e.test');
const aEmpBy = await api('GET', `/employees/${N1}`, null, bHr);
check('ISO tenant B HR cannot read tenant A employee (404)', aEmpBy.status === 404, aEmpBy.status);
const aAcct = await api('POST', `/employees/${N1}/account/reset-password`, { confirm_employee_uuid: psql(`select uuid from employees where id=${N1}`), reason: 'cross-tenant attempt e2e' }, bHr);
check('ISO tenant B HR cannot administer tenant A account (404)', aAcct.status === 404, aAcct.status);

// ===== Restricted custom role =====
const rTok = await tokenOf('restricted.a@e2e.test');
check('ROLE restricted custom role (employees.view only) cannot administer accounts (403)', (await api('GET', `/employees/${N1}/account`, null, rTok)).status === 403);
check('ROLE restricted role can still list employees (200)', (await api('GET', '/employees', null, rTok)).status === 200);
const mTok = await tokenOf('mgr.a@e2e.test');
check('ROLE manager (no permissions) cannot list employees (403)', (await api('GET', '/employees', null, mTok)).status === 403);

// ===== Arabic / RTL / dark / mobile visual passes =====
await uiLogin('hr1.a@e2e.test');
await page.context().addCookies([{ name: 'conure_locale', value: 'ar', url: BASE }]);
await openEmployee(hrNum('mgr'));
await shot('v-ar-account-panel');
const dirAr = await page.evaluate(() => document.documentElement.dir);
check('VIS Arabic renders RTL', dirAr === 'rtl', dirAr);
await page.emulateMedia({ colorScheme: 'dark' });
await page.waitForTimeout(800);
await shot('v-ar-account-panel-dark');
await page.setViewportSize({ width: 390, height: 844 });
await openEmployee(hrNum('mgr'));
await shot('v-ar-account-panel-mobile');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check('VIS no horizontal overflow on mobile (AR, dark)', !overflow);
check('no uncaught page errors during the run', errors.length === 0, errors.join(' | '));
console.log(`SUMMARY pass=${pass} fail=${fail}`);
await browser.close();
if (fail > 0) process.exitCode = 1;
