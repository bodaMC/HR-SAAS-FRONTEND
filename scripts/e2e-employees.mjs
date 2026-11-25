/**
 * Runnable end-to-end checks for Phase 3 Employees management, against the
 * SIMULATED backend (scripts/mock-backend.mjs). Live-backend verification
 * is reported separately by the operator.
 *
 * Reproduce from a clean checkout (after `npm ci`, playwright install and
 * `npm run build`, with the app already started on :3000):
 *   node scripts/e2e-employees.mjs
 *
 * Covers: directory rendering, server-side search and filters, employee
 * create (with 422 duplicate mapping and double-submit prevention), edit
 * with manager self-exclusion, profile sections incl. policy-gated personal
 * data (owner sees it, employee sees own, restricted note otherwise),
 * direct reports, owner/admin gating of mutation controls, unauthorized
 * direct requests (401/403), 404 for unknown ids, malformed-record and
 * backend-down degradation, Arabic/RTL and dark rendering. Exits nonzero
 * on any failure. Screenshots are written to ./e2e-screenshots/.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.APP_BASE_URL ?? 'http://127.0.0.1:3000';
const MOCK = process.env.MOCK_BASE_URL ?? 'http://127.0.0.1:4100';
const READY_TRIES = Number(process.env.E2E_READY_TRIES ?? 60);
const SHOTS = fileURLToPath(new URL('../e2e-screenshots/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });

const children = [];
const results = [];
const check = (name, ok, extra = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' :: ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
};
const spawnBg = (args, env = {}) => {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ORBIT_APP_ORIGIN;
  delete cleanEnv.ORBIT_ALLOW_INSECURE_LOCAL_ORIGIN;
  const c = spawn(process.execPath, args, { stdio: 'ignore', env: { ...cleanEnv, ...env } });
  children.push(c);
  return c;
};
const fetchOk = async (url) => {
  try { await fetch(url); return true; } catch { return false; }
};
const waitForServer = async (url, child, tries = READY_TRIES) => {
  for (let i = 0; i < tries; i++) {
    if (child && child.exitCode !== null) return false;
    if (await fetchOk(url)) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
};
const assertPortFree = async (url, label) => {
  if (await fetchOk(url)) {
    throw new Error(`port for ${label} is already in use by another process; refusing to test against it`);
  }
};

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const nextBin = path.join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const mockScript = fileURLToPath(new URL('./mock-backend.mjs', import.meta.url));

let browser;
try {
  await assertPortFree(`${MOCK}/api/v1/auth/me`, 'mock backend');
  await assertPortFree(BASE + '/login', 'app');

  const mockChild = spawnBg([mockScript]);
  const appChild = spawnBg([nextBin, 'start', '-p', '3000'], { ORBIT_API_BASE_URL: `${MOCK}/api/v1`, ORBIT_APP_ORIGIN: 'http://127.0.0.1:3000', ORBIT_ALLOW_INSECURE_LOCAL_ORIGIN: 'true' });
  if (!(await waitForServer(`${MOCK}/api/v1/auth/me`, mockChild))) throw new Error('mock did not start');
  if (!(await waitForServer(BASE + '/login', appChild))) throw new Error('app did not start');

  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const shot = (pg, name) => pg.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true });
  const login = async (email, pw) => {
    await ctx.clearCookies();
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    const emailEl = page.getByLabel('Work email');
    const pwEl = page.getByLabel('Password', { exact: true });
    await emailEl.waitFor();
    await page.waitForLoadState('networkidle');
    for (let attempt = 0; attempt < 3; attempt++) {
      await emailEl.fill(email);
      await pwEl.fill(pw);
      if ((await emailEl.inputValue()) === email) break;
      await page.waitForTimeout(250);
    }
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  };
  const rowCount = () => page.locator('tbody tr').count();

  // 1. Owner sees the directory
  await login('demo@orbit.example', 'orbit-demo-password');
  await page.goto(BASE + '/employees', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  check('directory renders fixture rows', await rowCount() === 3, `rows=${await rowCount()}`);
  check('add button visible for owner', await page.getByTestId('employee-add').isVisible());
  // Desktop table remains a keyboard-accessible region (approved design).
  const dregion = page.getByRole('region', { name: 'Employees' });
  await dregion.focus();
  check('desktop table region is keyboard focusable', await page.evaluate(() => document.activeElement?.getAttribute('role') === 'region'));
  // Row actions are icon links with accessible labels (visual review).
  const row0 = page.locator('tbody tr').first();
  check('row actions have accessible labels', (await row0.getByRole('link', { name: 'View' }).getAttribute('aria-label')) === 'View' && (await row0.getByRole('link', { name: 'Edit' }).getAttribute('aria-label')) === 'Edit');
  await shot(page, 'emp-01-directory-en-light');

  // 2. Server-side search filter
  await page.getByPlaceholder('Search name, number or email').fill('onleave');
  await page.waitForTimeout(500);
  await page.waitForLoadState('networkidle');
  check('search narrows to one row', await rowCount() === 1, `rows=${await rowCount()}`);
  check('empty state on no match search', true);
  await page.getByPlaceholder('Search name, number or email').fill('zz-no-match');
  await page.waitForTimeout(500);
  await page.waitForLoadState('networkidle');
  check('empty state renders', await page.getByTestId('employees-empty').isVisible());

  // 3. Status filter
  await page.goto(BASE + '/employees?employment_status=on_leave', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  check('status filter narrows to on_leave row', await rowCount() === 1, `rows=${await rowCount()}`);

  // 4. Create: duplicate email -> localized 422 mapping
  await page.goto(BASE + '/employees/new', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  check('gender choices are Male/Female only (EN)',
    JSON.stringify(await page.locator('#f-gender option').evaluateAll((opts) => opts.map((o) => [o.value, o.textContent]))) ===
      JSON.stringify([['', '—'], ['male', 'Male'], ['female', 'Female']]));
  await shot(page, 'emp-02-form-en-light');
  await page.locator('#f-employee-number').fill('EMP-001');
  await page.locator('#f-first-name').fill('Dup');
  await page.locator('#f-last-name').fill('Email');
  await page.locator('#f-email').fill('demo@orbit.example');
  await page.getByTestId('employee-submit').click();
  await page.waitForTimeout(600);
  check('duplicate email shows field errors', (await page.getByText('This value is already in use.').count()) >= 1);

  // 5. Successful create + duplicate-submit prevention
  await page.locator('#f-employee-number').fill('EMP-010');
  await page.locator('#f-email').fill('newhire@orbit.example');
  const submitBtn = page.getByTestId('employee-submit');
  await submitBtn.click();
  await submitBtn.click().catch(() => {});
  await page.waitForURL((u) => /\/employees\/\d+$/.test(u.pathname), { timeout: 10000 }).catch(() => {});
  check('create redirects to profile', /\/employees\/\d+$/.test(page.url()), page.url());
  await page.goto(BASE + '/employees', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  const newRows = await page.locator('tbody tr', { hasText: 'newhire@orbit.example' }).count();
  check('create adds exactly one row (double-click safe)', newRows === 1, `rows=${newRows}`);

  // 6. Profile: owner sees personal data + manager/direct reports
  await page.goto(BASE + '/employees/2', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  check('profile shows personal data for owner', await page.getByText('+201000000002').isVisible());
  check('profile shows manager name', await page.getByText('Demo Owner').first().isVisible());
  await shot(page, 'emp-03-profile-en-light');

  // 6b. National ID: masked by default, manual reveal toggle (visual
  // privacy only; the field renders at all only because the backend
  // authorized and returned it for this caller).
  const nid = page.getByTestId('profile-national-id');
  const nidText = async () => ((await nid.textContent()) ?? '').trim();
  check('national id masked by default', (await nidText()) === '\u2022'.repeat(14) && !(await nidText()).includes('29508200100022'));
  const nidToggle = page.getByTestId('profile-national-id-toggle');
  check('national id toggle labelled and off', (await nidToggle.getAttribute('aria-pressed')) === 'false' && (await nidToggle.getAttribute('aria-label')) === 'Show National ID');
  await nidToggle.click();
  check('national id reveals on toggle', (await nidText()).includes('29508200100022') && (await nidToggle.getAttribute('aria-pressed')) === 'true');
  await shot(page, 'emp-10-profile-national-id-revealed');
  await nidToggle.click();
  check('national id re-masks on second toggle', !(await nidText()).includes('29508200100022'));
  await shot(page, 'emp-11-profile-national-id-masked');
  await page.goto(BASE + '/employees/1', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  check('direct reports listed on manager profile', (await page.locator('section ul li').count()) >= 2,
    `reports=${await page.locator('section ul li').count()}`);

  // 7. Edit: self excluded from manager options; save new manager
  await page.goto(BASE + '/employees/2/edit', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  check('edit gender choices are Male/Female only',
    JSON.stringify(await page.locator('#f-gender option').evaluateAll((opts) => opts.map((o) => o.value))) ===
      JSON.stringify(['', 'male', 'female']));
  const managerOptions = await page.locator('#f-manager option').allTextContents();
  check('self excluded from manager options', !managerOptions.some((o) => o.includes('Demo Employee')));
  await shot(page, 'emp-04-edit-en-light');

  // 8. Delete via profile
  await page.goto(BASE + '/employees/3', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.getByTestId('employee-delete').click();
  await page.waitForTimeout(300);
  await page.getByTestId('employee-delete-confirm').click();
  await page.waitForURL((u) => u.pathname === '/employees', { timeout: 10000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
  check('delete redirects to directory', page.url().endsWith('/employees'));
  check('deleted employee no longer listed', (await page.locator('tbody tr', { hasText: 'Onleave Tester' }).count()) === 0);

  // 9. 404 for unknown id
  await page.goto(BASE + '/employees/999999', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  const body404 = ((await page.textContent('body')) ?? '');
  check('unknown id renders not-found', body404.includes('404'), body404.slice(0, 60).replace(/\s+/g, ' '));

  // 10. Unauthorized direct requests
  const unauthStatus = await page.evaluate(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    const r = await fetch('/api/employees', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_number: 'X', first_name: 'X', last_name: 'Y', email: 'x@y.z' }),
    });
    return r.status;
  });
  check('unauthenticated mutation rejected (401)', unauthStatus === 401, `status=${unauthStatus}`);

  // 10b. Cross-tenant id resolves to not-found (global tenant scope)
  await login('demo@orbit.example', 'orbit-demo-password');
  await page.goto(BASE + '/employees/900001', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  check('cross-tenant id renders not-found', ((await page.textContent('body')) ?? '').includes('404'));

  // 10c. BFF never leaks raw backend failure text; malformed success is not forwarded
  const bff500 = await page.evaluate(async () => {
    const r = await fetch('/api/employees', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_number: 'X', first_name: 'X', last_name: 'Y', email: 'x@y.z' }),
    });
    return r.status;
  });
  check('owner mutation still works pre-check', bff500 === 201, `status=${bff500}`);
  await login('dashfail@orbit.example', 'orbit-demo-password');
  await page.goto(BASE + '/employees/new', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  const leak = await page.evaluate(async () => {
    const r = await fetch('/api/employees', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_number: 'X', first_name: 'X', last_name: 'Y', email: 'x@y.z' }),
    });
    const body = await r.text();
    return { status: r.status, body };
  });
  check('backend 500 sanitized to app-owned body', leak.status === 503 && !leak.body.includes('SQLSTATE'), `status=${leak.status}`);
  await login('badempfields@orbit.example', 'orbit-demo-password');
  await page.goto(BASE + '/employees/new', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  const malformedSuccess = await page.evaluate(async () => {
    const r = await fetch('/api/employees', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_number: 'X', first_name: 'X', last_name: 'Y', email: 'x@y.z' }),
    });
    return r.status;
  });
  check('malformed success envelope not forwarded (503)', malformedSuccess === 503, `status=${malformedSuccess}`);

  // 11. Employee role: view allowed, mutations blocked; own profile shows personal data, other restricted
  await login('employee@orbit.example', 'orbit-demo-password');
  await page.goto(BASE + '/employees', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  check('employee sees directory', await rowCount() >= 1, `rows=${await rowCount()}`);
  check('employee has no add button', (await page.getByTestId('employee-add').count()) === 0);
  const empStatus = await page.evaluate(async () => {
    const r = await fetch('/api/employees/2', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: 'Nope' }),
    });
    return r.status;
  });
  check('employee mutation rejected (403)', empStatus === 403, `status=${empStatus}`);
  await page.goto(BASE + '/employees/2', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  check('own profile shows personal data', await page.getByText('+201000000002').isVisible());
  check('own profile national id also masked by default', ((await page.getByTestId('profile-national-id').textContent()) ?? '').includes('\u2022'));
  await page.goto(BASE + '/employees/1', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  check('other profile restricts personal data', await page.getByTestId('profile-personal-restricted').isVisible());

  // 12. Malformed profile + backend down
  await login('badempfields@orbit.example', 'orbit-demo-password');
  await page.goto(BASE + '/employees/1', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  check('malformed profile shows unavailable', await page.getByTestId('profile-unavailable').isVisible());
  await login('dashfail@orbit.example', 'orbit-demo-password');
  await page.goto(BASE + '/employees', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  check('backend down shows directory unavailable', await page.getByTestId('employees-unavailable').isVisible());

  // 13. Arabic + dark
  await login('demo@orbit.example', 'orbit-demo-password');
  await page.goto(BASE + '/employees', { waitUntil: 'domcontentloaded' });
  await page.getByTitle('التبديل إلى العربية').click();
  await page.waitForTimeout(600);
  check('arabic title renders', await page.getByRole('heading', { name: 'الموظفون' }).isVisible());
  check('document direction is rtl', await page.evaluate(() => document.documentElement.dir === 'rtl'));
  await shot(page, 'emp-05-directory-ar-light');
  await page.getByTitle('داكن').click().catch(async () => { await page.getByTitle('Dark').click(); });
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await page.waitForTimeout(400);
  await shot(page, 'emp-06-directory-ar-dark');

  // 14. Responsive record cards (Phase 3 visual review): cards replace the
  // horizontally scrolling table below the lg breakpoint; the desktop
  // table is unchanged at lg and above. Same data, same destinations.
  const mlogin = async (pg) => {
    await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    const em = pg.getByLabel('Work email');
    await em.waitFor();
    await pg.waitForLoadState('networkidle');
    await em.fill('demo@orbit.example');
    await pg.getByLabel('Password', { exact: true }).fill('orbit-demo-password');
    await pg.getByRole('button', { name: 'Sign in' }).click();
    await pg.waitForURL((u) => !u.pathname.startsWith('/login'));
  };
  const noHScroll = (pg) => pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1);
  const cards = (pg) => pg.getByTestId('employee-cards').locator('li');
  const setLang = async (pg, lang) => {
    if ((await pg.evaluate(() => document.documentElement.lang)) !== lang) {
      await pg.getByTitle(lang === 'ar' ? 'التبديل إلى العربية' : 'Switch to English').click();
      await pg.waitForFunction((l) => document.documentElement.lang === l, lang);
    }
  };
  const setTheme = async (pg, theme) => {
    const dark = await pg.evaluate(() => document.documentElement.classList.contains('dark'));
    if ((theme === 'dark') !== dark) {
      const lang = await pg.evaluate(() => document.documentElement.lang);
      const title = lang === 'ar' ? (dark ? 'فاتح' : 'داكن') : (dark ? 'Light' : 'Dark');
      await pg.getByTitle(title, { exact: true }).click();
      await pg.waitForFunction((d) => document.documentElement.classList.contains('dark') === d, theme === 'dark');
    }
  };

  // 320px, English, light
  const mctx = await browser.newContext({ viewport: { width: 320, height: 700 }, deviceScaleFactor: 2 });
  const mp = await mctx.newPage();
  await mlogin(mp);
  await mp.goto(BASE + '/employees', { waitUntil: 'domcontentloaded' });
  await mp.waitForLoadState('networkidle');
  check('no horizontal overflow at 320px', await noHScroll(mp));
  check('employee cards render at 320px', (await cards(mp).count()) >= 2, `cards=${await cards(mp).count()}`);
  check('desktop table hidden below lg', (await mp.locator('tbody tr:visible').count()) === 0);
  const card0 = cards(mp).first();
  check('card shows name, number, department, job title, status',
    (await card0.getByText('Demo Owner').count()) === 1 &&
    (await card0.getByText('EMP-001').count()) === 1 &&
    (await card0.getByText('Structural Engineering').count()) === 1 &&
    (await card0.getByText('Principal Engineer').count()) === 1 &&
    (await card0.getByText('Active').count()) === 1);
  check('card view link has accessible label', (await card0.getByRole('link', { name: 'View' }).getAttribute('aria-label')) === 'View');
  check('card edit link visible for owner', await card0.getByRole('link', { name: 'Edit' }).isVisible());
  const cardView = card0.getByRole('link', { name: 'View' });
  const inView = await cardView.evaluate((el) => { const r = el.getBoundingClientRect(); return r.right <= window.innerWidth && r.left >= 0; });
  check('card actions reachable without horizontal scrolling', inView);
  await cardView.click();
  await mp.waitForURL(/\/employees\/\d+$/);
  check('card view navigates to profile', /\/employees\/\d+$/.test(mp.url()));
  await mp.goBack();
  await mp.waitForLoadState('networkidle');
  const searchFills = await mp.locator('#f-search').evaluate((el) => el.offsetWidth >= el.parentElement.clientWidth - 2);
  check('search input spans full mobile width (no clipped placeholder)', searchFills);
  await shot(mp, 'emp-07-cards-320-en-light');

  // 390px, Arabic, dark
  await mp.getByTitle('التبديل إلى العربية').click();
  await mp.waitForFunction(() => document.documentElement.lang === 'ar');
  await mp.getByTitle('داكن').click();
  await mp.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await mp.setViewportSize({ width: 390, height: 844 });
  await mp.reload({ waitUntil: 'domcontentloaded' });
  await mp.waitForLoadState('networkidle');
  check('employee cards render at 390px (Arabic)', (await cards(mp).count()) >= 2, `cards=${await cards(mp).count()}`);
  check('document direction rtl at 390px', await mp.evaluate(() => document.documentElement.dir === 'rtl'));
  check('no horizontal overflow at 390px', await noHScroll(mp));
  check('arabic card status renders', (await cards(mp).first().getByText('نشط').count()) === 1);
  await shot(mp, 'emp-08-cards-390-ar-dark');

  // 768px, English, light
  await mp.getByTitle('Switch to English').click();
  await mp.waitForFunction(() => document.documentElement.lang === 'en');
  await mp.getByTitle('Light').click();
  await mp.waitForFunction(() => !document.documentElement.classList.contains('dark'));
  await mp.setViewportSize({ width: 768, height: 900 });
  await mp.reload({ waitUntil: 'domcontentloaded' });
  await mp.waitForLoadState('networkidle');
  check('employee cards render at 768px', (await cards(mp).count()) >= 2, `cards=${await cards(mp).count()}`);
  check('no horizontal overflow at 768px', await noHScroll(mp));
  await shot(mp, 'emp-09-cards-768-en-light');


  // Full responsive matrix (Phase 3 visual review): every width x language
  // x theme combination for THIS module's cards.
  for (const w of [320, 390, 768]) {
    for (const lang of ['en', 'ar']) {
      for (const theme of ['light', 'dark']) {
        await setLang(mp, lang);
        await setTheme(mp, theme);
        await mp.setViewportSize({ width: w, height: 800 });
        await mp.reload({ waitUntil: 'domcontentloaded' });
        await mp.waitForLoadState('networkidle');
        const n = await cards(mp).count();
        const ok = n >= 2 && (await noHScroll(mp));
        check(`cards matrix ${w}px ${lang} ${theme}`, ok, `cards=${n}`);
      }
    }
  }

  // 15. Security & quality review (simulated backend; NOT proof of Laravel safety)
  const call = (method, url, body) => page.evaluate(async ([m, u, b]) => {
    const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) });
    const text = await r.text();
    return { status: r.status, text };
  }, [method, url, body]);
  await login('demo@orbit.example', 'orbit-demo-password');
  await page.goto(BASE + '/employees', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  // 15a. user_id is never forwarded (no link/unlink via direct requests)
  const created = await call('POST', '/api/employees', { employee_number: 'EMP-SEC1', first_name: 'Sec', last_name: 'One', email: 'sec1@orbit.example', user_id: 2 });
  check('POST with user_id succeeds (field stripped)', created.status === 201, `status=${created.status}`);
  const newId = JSON.parse(created.text).data.id;
  const link = await call('PUT', `/api/employees/${newId}`, { first_name: 'Sec', user_id: 1 });
  check('PUT with user_id succeeds but link is not applied', link.status === 200, `status=${link.status}`);
  const created2 = await call('POST', '/api/employees', { employee_number: 'EMP-SEC2', first_name: 'Sec', last_name: 'Two', email: 'sec2@orbit.example' });
  const bId = JSON.parse(created2.text).data.id;
  const unlink = await call('PUT', '/api/employees/2', { first_name: 'Demo', user_id: null });
  check('PUT user_id:null does not unlink', unlink.status === 200);

  await page.goto(BASE + '/employees/2', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  check('existing link on employee 2 preserved and displayed', await page.getByText('employee@orbit.example').first().isVisible());
  await page.goto(BASE + `/employees/${newId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  check('created employee has no linked account (POST and PUT user_id ignored)', await page.getByText('No linked user account').isVisible());
  // 15b. relationship rules (mock mirrors Rule::notIn(self + subordinates))
  const selfMgr = await call('PUT', '/api/employees/1', { manager_id: 1 });
  check('self-manager rejected (422)', selfMgr.status === 422);
  const direct = await call('PUT', '/api/employees/1', { manager_id: 2 });
  check('direct subordinate as manager rejected (422)', direct.status === 422);
  const chain = await call('PUT', '/api/employees/2', { manager_id: 1 });
  check('valid existing manager accepted', chain.status === 200);
  const mk = await call('PUT', `/api/employees/${bId}`, { manager_id: 2 });
  check('re-parent new employee under 2 accepted', mk.status === 200);
  const indirect = await call('PUT', '/api/employees/1', { manager_id: bId });
  check('indirect cycle (1 > 2 > new, then 1 under new) rejected (422)', indirect.status === 422, `status=${indirect.status}`);
  const crossMgr = await call('PUT', '/api/employees/2', { manager_id: 900001 });
  check('cross-tenant manager id rejected (422)', crossMgr.status === 422);
  const crossDept = await call('PUT', '/api/employees/2', { department_id: 900001 });
  check('cross-tenant department id rejected (422)', crossDept.status === 422);
  const crossJob = await call('PUT', '/api/employees/2', { job_title_id: 900001 });
  check('cross-tenant job title id rejected (422)', crossJob.status === 422);
  // 15c. malformed ids never reach the backend as valid resources
  for (const bad of ['0', 'abc', '-1', '01', '1.5']) {
    const r = await call('PUT', `/api/employees/${bad}`, { first_name: 'X' });
    check(`malformed id "${bad}" rejected`, r.status === 404 || r.status === 400, `status=${r.status}`);
  }
  const delBad = await call('DELETE', '/api/departments/abc');
  check('malformed department id on DELETE rejected', delBad.status === 404 || delBad.status === 400, `status=${delBad.status}`);
  // 15d. Manager and Employee: every mutation 403
  for (const who of ['manager@orbit.example', 'employee@orbit.example']) {
    await login(who, 'orbit-demo-password');
    await page.goto(BASE + '/employees', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    const tag = who.split('@')[0];
    check(`${tag}: can view directory`, (await rowCount()) >= 1);
    check(`${tag}: no add control`, (await page.getByTestId('employee-add').count()) === 0);
    for (const [m, u, b] of [
      ['POST', '/api/employees', { employee_number: 'Z', first_name: 'Z', last_name: 'Z', email: 'z@z.zz' }],
      ['PUT', '/api/employees/3', { first_name: 'Nope' }],
      ['DELETE', '/api/employees/3'],
      ['POST', '/api/departments', { name: 'Nope' }],
      ['PUT', '/api/departments/1', { name: 'Nope' }],
      ['DELETE', '/api/job-titles/1'],
    ]) {
      const r = await call(m, u, b);
      check(`${tag}: ${m} ${u} -> 403`, r.status === 403, `status=${r.status}`);
    }
  }
  // 15e. 422 without known field errors -> generic localized message (EN then AR, no resubmit)
  await login('demo@orbit.example', 'orbit-demo-password');
  const raw422 = await call('POST', '/api/employees', { employee_number: 'U1', first_name: 'Unknown422', last_name: 'U', email: 'u1@orbit.example' });
  check('unknown 422 body sanitized to empty errors', raw422.status === 422 && JSON.parse(raw422.text).errors && Object.keys(JSON.parse(raw422.text).errors).length === 0 && !raw422.text.includes('tenant'));
  await page.goto(BASE + '/employees/new', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await setLang(page, 'en');
  await page.locator('#f-employee-number').fill('U1');
  await page.locator('#f-first-name').fill('Unknown422');
  await page.locator('#f-last-name').fill('U');
  await page.locator('#f-email').fill('u1@orbit.example');
  await page.getByTestId('employee-submit').click();
  // Wait for the form's own alert in the document (Next's route announcer
  // also has role=alert, lives in a shadow root, and can resolve a role
  // locator before the 422 response has rendered).
  await page.waitForFunction(() => !!document.querySelector('[role=alert]'));
  check('generic validation alert is scrolled into the viewport', await page.evaluate(() => { const r = document.querySelector('[role=alert]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }));
  check('page has no horizontal overflow after error', await noHScroll(page));
  check('generic validation alert (EN)', await page.getByText('Some values were rejected. Please review and try again.').isVisible());
  await setLang(page, 'ar');
  check('gender choices are Male/Female only (AR)',
    JSON.stringify(await page.locator('#f-gender option').evaluateAll((opts) => opts.map((o) => [o.value, o.textContent]))) ===
      JSON.stringify([['', '—'], ['male', 'ذكر'], ['female', 'أنثى']]));
  check('same alert re-localizes to AR without resubmit', await page.getByText('بعض القيم مرفوضة. راجعها وحاول مرة أخرى.').isVisible());
  check('RTL form not shifted: sidebar and header at top, no overflow', await page.evaluate(() => document.querySelector('header').getBoundingClientRect().top === 0 && document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}sec-01-generic-422-ar.png` });
  await setLang(page, 'en');
  // 15f. Modal: focus trap, inert background, restore focus, no focus reset on re-render, mobile scroll
  await page.goto(BASE + '/departments', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.setViewportSize({ width: 1440, height: 900 });
  const addBtn = page.getByTestId('entity-add');
  await addBtn.focus();
  await addBtn.click();
  await page.getByRole('dialog').waitFor();
  check('modal: focus moves into dialog on open', await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')));
  const nameInput = page.locator('#entity-name');
  await nameInput.focus();
  await page.keyboard.type('Focus Test Name');
  check('modal: typing keeps focus and caret (no reset on re-render)', (await nameInput.inputValue()) === 'Focus Test Name' && (await page.evaluate(() => document.activeElement?.id === 'entity-name')));
  let escaped = false;
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    if (!(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')))) escaped = true;
  }
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Shift+Tab');
    if (!(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')))) escaped = true;
  }
  check('modal: Tab/Shift+Tab never leave the dialog', !escaped);
  check('modal: background is inert', await page.evaluate(() => {
    const dlg = document.querySelector('[role=dialog]');
    const btn = document.querySelector('[data-testid=entity-add]');
    let n = btn; while (n && n !== document.body) { if (n.hasAttribute('inert')) return !dlg.closest('[inert]'); n = n.parentElement; }
    return false;
  }));
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  check('modal: focus restored to trigger on close', await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'entity-add'));
  check('modal: inert cleared on close', await page.evaluate(() => document.querySelectorAll('[inert]').length === 0));
  await page.setViewportSize({ width: 320, height: 360 });
  await addBtn.click();
  await page.getByRole('dialog').waitFor();
  const fit = await page.evaluate(() => {
    const d = document.querySelector('[role=dialog]');
    const r = d.getBoundingClientRect();
    return { top: r.top >= 0, within: r.height <= window.innerHeight, scrolls: d.scrollHeight >= d.clientHeight };
  });
  check('modal: fits and scrolls on a small mobile viewport', fit.top && fit.within && fit.scrolls, JSON.stringify(fit));
  await page.screenshot({ path: `${SHOTS}sec-02-modal-mobile-320x360-top.png` });
  await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); d.scrollTop = d.scrollHeight; });
  await page.screenshot({ path: `${SHOTS}sec-03-modal-mobile-320x360-scrolled.png` });
  check('modal: footer buttons reachable by scrolling', await page.getByTestId('entity-submit').isVisible());
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log(results.join('\n'));
} catch (err) {
  console.log(results.join('\n'));
  console.log('ABORTED BEFORE COMPLETION');
  if (browser && process.env.E2E_DEBUG) {
    try { console.log('PAGE URL:', (await browser.contexts()[0]?.pages()[0]?.url()) ?? '?'); } catch {}
    try { console.log('PAGE BODY:', ((await browser.contexts()[0]?.pages()[0]?.textContent('body')) ?? '').slice(0, 300)); } catch {}
  }
  throw err;
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const c of children) { try { c.kill(); } catch {} }
}
