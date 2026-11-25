/**
 * FINAL-V2 UI checks (SIMULATED mock backend; real-stack counterparts are in e2e-real-stack-rbac.mjs).
 * Needs the production app on :3000 pointed at the mock on :4100 (run via verify/run-access-mock.sh with SCRIPT=scripts/e2e-access-v2.mjs).
 * Covers: human-readable EN/AR permission labels (codes unchanged), singular/plural wording EN+AR, user menu role vs account type,
 * and individually restricted create/update/delete controls for users who hold only one of the three.
 */
import { chromium } from 'playwright';
const BASE = process.env.APP_BASE_URL ?? 'http://127.0.0.1:3000';
let pass = 0, fail = 0; const check = (n, ok, d = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  -> ' + d}`); };
const browser = await chromium.launch(); const errs = [];
async function session(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000); await page.getByLabel('Work email').fill(email); await page.waitForTimeout(300); await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('orbit-demo-password');
  await page.getByRole('button', { name: 'Sign in' }).click(); await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
  return { ctx, page };
}
const btn = (page, re) => page.getByRole('button', { name: re }).count();

// ── labels, plural, user menu (HR persona, English then Arabic)
{
  const { ctx, page } = await session('hr@orbit.example');
  await page.goto(BASE + '/access', { waitUntil: 'networkidle' }); await page.getByTestId('access-page').waitFor();
  const hrCard = await page.getByTestId('role-hr_administrator').innerText();
  check('EN: role with one user reads "1 user" (not "1 users")', /\b1 user\b/.test(hrCard) && !/1 users/.test(hrCard), hrCard);
  const rec = await page.getByTestId('role-recruiter').innerText();
  check('EN: role with zero users reads "0 users", 2 permissions reads "2 permissions"', /0 users/.test(rec) && /2 permissions/.test(rec), rec);
  await page.getByTestId('role-open-recruiter').click(); await page.getByTestId('permission-matrix').waitFor();
  check('EN: permission shows human-readable label', (await page.getByTestId('perm-label-employees.view').innerText()) === 'View employees');
  check('EN: permission code is still shown and unchanged', (await page.locator('label[for="perm-employees.view"]').innerText()).includes('employees.view'));
  check('EN: checkbox keeps the internal code in data-perm', (await page.locator('input[data-perm="employees.view"]').count()) === 1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'User menu' }).click(); await page.getByTestId('user-menu').waitFor();
  check('user menu: access role is the RBAC role, account type is separate', (await page.getByTestId('user-menu-access-role').innerText()).trim() === 'HR Administrator' && (await page.getByTestId('user-menu-account-type').innerText()).trim() === 'Employee');
  await page.keyboard.press('Escape');
  await page.getByTestId('language-switcher').click(); await page.waitForFunction(() => document.documentElement.lang === 'ar');
  await page.waitForTimeout(500); await page.goto(BASE + '/access', { waitUntil: 'networkidle' }); await page.getByTestId('access-page').waitFor();
  const hrAr = await page.getByTestId('role-hr_administrator').innerText();
  check('AR: one user reads "مستخدم واحد"', hrAr.includes('مستخدم واحد'), hrAr);
  check('AR: zero users reads "لا مستخدمين"', (await page.getByTestId('role-recruiter').innerText()).includes('لا مستخدمين'));
  check('AR: role name uses Arabic name', hrAr.includes('مسؤول الموارد البشرية'));
  await page.getByTestId('role-open-recruiter').click(); await page.getByTestId('permission-matrix').waitFor();
  check('AR: permission shows Arabic label', (await page.getByTestId('perm-label-employees.view').innerText()) === 'عرض الموظفين');
  check('AR: code stays Latin and unchanged', (await page.locator('label[for="perm-employees.view"]').innerText()).includes('employees.view'));
  await page.screenshot({ path: 'e2e-screenshots/v2-permission-labels-ar.png' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'قائمة المستخدم' }).click().catch(() => {});
  const arMenu = await page.getByTestId('user-menu-access-role').innerText().catch(() => '');
  check('AR: user menu shows Arabic access role name', arMenu.includes('مسؤول الموارد البشرية'), arMenu);
  await ctx.close();
}
// ── unbootstrapped owner: no RBAC role is shown as a role
{
  const { ctx, page } = await session('plainowner@orbit.example');
  await page.getByRole('button', { name: 'User menu' }).click(); await page.getByTestId('user-menu').waitFor();
  check('unbootstrapped Owner: "No access role assigned" and account type Owner', (await page.getByTestId('user-menu-access-role').innerText()).includes('No access role assigned') && (await page.getByTestId('user-menu-account-type').innerText()).trim() === 'Owner');
  await page.screenshot({ path: 'e2e-screenshots/v2-user-menu-plain-owner.png' });
  await ctx.close();
}
// ── individually restricted actions
for (const [email, who, exp] of [
  ['cronly@orbit.example', 'create-only', { add: true, edit: false, del: false, roleAdd: true, roleEdit: false, roleDel: false, lock: false }],
  ['uponly@orbit.example', 'update-only', { add: false, edit: true, del: false, roleAdd: false, roleEdit: true, roleDel: false, lock: true }],
  ['delonly@orbit.example', 'delete-only', { add: false, edit: false, del: true, roleAdd: false, roleEdit: false, roleDel: true, lock: false }],
]) {
  const { ctx, page } = await session(email);
  await page.goto(BASE + '/departments', { waitUntil: 'networkidle' });
  const add = (await page.getByTestId('entity-add').count()) > 0, edit = (await btn(page, /^Edit$/)) > 0, del = (await btn(page, /^Delete/)) > 0;
  check(`${who}: departments controls add=${add} edit=${edit} delete=${del}`, add === exp.add && edit === exp.edit && del === exp.del, `${add}/${edit}/${del}`);
  await page.goto(BASE + '/access', { waitUntil: 'networkidle' }); await page.getByTestId('access-page').waitFor();
  const rAdd = (await page.getByTestId('role-add').count()) > 0;
  const rEdit = (await page.getByTestId('role-open-recruiter').innerText()) === 'Edit';
  const rDel = (await page.locator('[data-testid^="role-delete-"]').count()) > 0;
  check(`${who}: roles controls add=${rAdd} edit=${rEdit} delete=${rDel}`, rAdd === exp.roleAdd && rEdit === exp.roleEdit && rDel === exp.roleDel, `${rAdd}/${rEdit}/${rDel}`);
  if (exp.roleEdit) {
    await page.getByTestId('role-open-recruiter').click(); await page.getByTestId('permission-matrix').waitFor();
    check(`${who}: without permissions.manage the permission checkboxes are disabled and a note explains why`, (await page.locator('input[data-perm]:not([disabled])').count()) === 0 && (await page.getByTestId('permissions-locked-note').count()) === 1);
  }
  await ctx.close();
}

// ── FINAL-V3 personas (SIMULATED): System Super Admin, legacy Owner/Admin with no role, platform admin, employee, manager
{
  const adminEntries = ['Roles & Permissions', 'Work Schedules', 'Holidays', 'Audit Logs', 'Company Settings', 'Approval Workflows'];
  const side = async (page) => { await page.goto(BASE + '/', { waitUntil: 'networkidle' }); const sb = page.getByTestId('sidebar'); await sb.waitFor(); return sb; };
  {
    const { ctx, page } = await session('sysadmin@orbit.example'); const sb = await side(page);
    check('V3 SSA: Administration section present', await sb.getByText('Administration', { exact: true }).count() === 1);
    for (const e of adminEntries) check(`V3 SSA sees ${e}`, (await sb.getByText(e, { exact: true }).count()) + (await sb.getByRole('link', { name: new RegExp(e.replace('&', '&')) }).count()) > 0, e);
    check('V3 SSA: Roles & Permissions is a link', (await sb.getByRole('link', { name: /Roles & Permissions/ }).count()) === 1);
    check('V3 SSA: Audit Logs/Settings/Schedules are NOT links (no page built)', (await sb.getByRole('link', { name: /Audit Logs|Company Settings|Work Schedules|Holidays|Approval Workflows/ }).count()) === 0);
    await page.getByRole('button', { name: 'User menu' }).click(); await page.getByTestId('user-menu').waitFor();
    check('V3 SSA user menu: access role System Super Admin, account type separate, no platform identity', (await page.getByTestId('user-menu-access-role').innerText()).includes('System Super Admin') && (await page.getByTestId('user-menu-platform-identity').count()) === 0);
    await page.keyboard.press('Escape');
    await page.screenshot({ path: 'e2e-screenshots/v3-mock-ssa-dashboard.png' });
    await page.goto(BASE + '/access', { waitUntil: 'networkidle' }); await page.getByTestId('access-page').waitFor();
    check('V3 SSA: access page opens', true);
    await ctx.close();
  }
  for (const [email, who] of [['plainowner@orbit.example', 'legacy Owner without roles'], ['plainadmin@orbit.example', 'legacy Admin without roles'], ['employee@orbit.example', 'Employee'], ['manager@orbit.example', 'Manager']]) {
    const { ctx, page } = await session(email); const sb = await side(page);
    // Rendered DOM only: script payloads (framework data, static dictionary) are excluded.
    const html = await page.evaluate(() => { const c = document.body.cloneNode(true); c.querySelectorAll('script,template').forEach((n) => n.remove()); return c.innerHTML; });
    check(`V3 ${who}: no Administration anywhere in the DOM`, (await sb.getByText('Administration', { exact: true }).count()) === 0 && !html.includes('Audit Logs') && !html.includes('Roles &amp; Permissions') && !html.includes('Company Settings'), who);
    await page.goto(BASE + '/access', { waitUntil: 'networkidle' });
    check(`V3 ${who}: direct /access shows restricted page`, (await page.getByTestId('access-page').count()) === 0, who);
    await page.screenshot({ path: `e2e-screenshots/v3-mock-${email.split('@')[0]}.png` });
    await ctx.close();
  }
  {
    const { ctx, page } = await session('hr@orbit.example'); const sb = await side(page);
    check('V3 HR sees Roles & Permissions only in Administration', (await sb.getByRole('link', { name: /Roles & Permissions/ }).count()) === 1 && (await sb.getByText('Audit Logs', { exact: true }).count()) === 0 && (await sb.getByText('Company Settings', { exact: true }).count()) === 0);
    await ctx.close();
  }
  {
    const { ctx, page } = await session('platform@orbit.example');
    await page.getByRole('button', { name: 'User menu' }).click(); await page.getByTestId('user-menu').waitFor();
    check('V3 platform admin: user menu shows platform identity line', (await page.getByTestId('user-menu-platform-identity').innerText()).includes('Platform Super Admin'));
    await page.screenshot({ path: 'e2e-screenshots/v3-mock-platform-menu.png' });
    await ctx.close();
  }
}
check('no page errors', errs.length === 0, errs.join('|'));
console.log(`SUMMARY pass=${pass} fail=${fail}`); await browser.close(); process.exit(fail ? 1 : 0);
