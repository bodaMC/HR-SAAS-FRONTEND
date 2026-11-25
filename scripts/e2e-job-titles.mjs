/**
 * Runnable end-to-end checks for Phase 3 Job Titles management, against
 * the SIMULATED backend (scripts/mock-backend.mjs). Live-backend
 * verification is reported separately by the operator.
 *
 * Reproduce from a clean checkout (after `npm ci`, playwright install and
 * `npm run build`, with the app already started on :3000):
 *   node scripts/e2e-job-titles.mjs
 *
 * Covers: directory rendering, client-side search and status filter,
 * create/edit/activate-deactivate/delete through the same-origin BFF,
 * owner/admin gating of mutation controls, unauthorized direct requests
 * (401 without session, 403 cross-origin, 403 employee role), 422 duplicate
 * name mapping, duplicate-submission prevention, malformed-record and
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

  // 1. Owner sees the directory with fixture rows
  await login('demo@orbit.example', 'orbit-demo-password');
  await page.goto(BASE + '/job-titles', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  check('job titles list renders fixture rows', await rowCount() === 2, `rows=${await rowCount()}`);
  check('add button visible for owner', await page.getByTestId('entity-add').isVisible());
  // Desktop table remains a keyboard-accessible region (approved design).
  const dregion = page.getByRole('region', { name: 'Job Titles' });
  await dregion.focus();
  check('desktop table region is keyboard focusable', await page.evaluate(() => document.activeElement?.getAttribute('role') === 'region'));

  // 2. Client-side search filter
  await page.getByPlaceholder('Search job titles').fill('Senior');
  await page.waitForTimeout(300);
  check('search narrows to one row', await rowCount() === 1, `rows=${await rowCount()}`);
  await page.getByPlaceholder('Search job titles').fill('zz-no-match');
  await page.waitForTimeout(300);
  check('empty state on no match', await page.getByTestId('entity-empty').isVisible());
  await page.getByPlaceholder('Search job titles').fill('');

  // 3. Status filter
  await page.getByLabel('Status').selectOption('inactive');
  await page.waitForTimeout(300);
  check('status filter narrows to zero inactive rows', await rowCount() === 0, `rows=${await rowCount()}`);
  await page.getByLabel('Status').selectOption('all');
  await page.waitForTimeout(300);

  // 4. Duplicate name -> localized field error (422 mapping)
  await page.getByTestId('entity-add').click();
  await page.locator('#entity-name').fill('Principal Engineer');
  await page.getByTestId('entity-submit').click();
  await page.waitForTimeout(500);
  check('duplicate name shows field error', await page.getByText('This value is already in use.').isVisible());
  await page.getByRole('button', { name: 'Cancel' }).click();

  // 5. Successful create + duplicate-submit prevention
  await page.getByTestId('entity-add').click();
  await page.locator('#entity-name').fill('Site Engineer');
    await shot(page, 'jt-03-form-en-light');
  const submitBtn = page.getByTestId('entity-submit');
  await submitBtn.click();
  await submitBtn.click().catch(() => {}); // second click while pending must be a no-op
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  const qaRows = await page.locator('tbody tr', { hasText: 'Site Engineer' }).count();
  check('create adds exactly one row (double-click safe)', qaRows === 1, `rows=${qaRows}`);
  await shot(page, 'jt-01-list-en-light');
  await page.getByTitle('Dark').click();
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await page.waitForTimeout(400);
  await shot(page, 'jt-02-list-en-dark');
  await page.getByTitle('Light').click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));

  // 6. Edit: deactivate
  await page.locator('tbody tr', { hasText: 'Site Engineer' }).getByRole('button', { name: 'Edit' }).click();
  await page.waitForTimeout(300);
  await page.locator('#entity-active').uncheck();
  await page.getByTestId('entity-submit').click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  const qaRow = page.locator('tbody tr', { hasText: 'Site Engineer' });
  check('edit deactivates department', await qaRow.getByText('Inactive').isVisible());

  // 7. Delete
  await qaRow.getByRole('button', { name: 'Delete job title' }).click();
  await page.waitForTimeout(300);
  await page.getByTestId('entity-delete-confirm').click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  check('delete removes row', (await page.locator('tbody tr', { hasText: 'Site Engineer' }).count()) === 0);

  // 8. Unauthorized direct requests
  const unauthStatus = await page.evaluate(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    const r = await fetch('/api/job-titles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    });
    return r.status;
  });
  check('unauthenticated mutation rejected (401)', unauthStatus === 401, `status=${unauthStatus}`);
  const crossOrigin = await fetch(BASE + '/api/job-titles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: JSON.stringify({ name: 'X' }),
  });
  check('cross-origin mutation rejected (403)', crossOrigin.status === 403, `status=${crossOrigin.status}`);

  // 9. Employee role: no mutation controls, direct call 403
  await login('employee@orbit.example', 'orbit-demo-password');
  await page.goto(BASE + '/job-titles', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  // Phase 3.2 (intentional change): without the view permission the module is restricted, never listed.
  check('employee sees the restricted panel, not the list (Phase 3.2)', (await page.getByTestId('page-restricted').count()) === 1 && (await rowCount()) === 0, `rows=${await rowCount()}`);
  check('employee has no add button', (await page.getByTestId('entity-add').count()) === 0);
  check('employee has no edit buttons', (await page.getByRole('button', { name: 'Edit' }).count()) === 0);
  const empStatus = await page.evaluate(async () => {
    const r = await fetch('/api/job-titles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Forbidden Title' }),
    });
    return r.status;
  });
  check('employee mutation rejected (403)', empStatus === 403, `status=${empStatus}`);

  // 10. Malformed record degrades the page (is_active: "yes")
  await login('baddeptfields@orbit.example', 'orbit-demo-password');
  await page.goto(BASE + '/job-titles', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  check('malformed records show unavailable', await page.getByTestId('entity-unavailable').isVisible());

  // (job titles share the departments malformed-record guard via is_active)

  // 11. Backend down: mutation failure shows generic error
  await login('dashfail@orbit.example', 'orbit-demo-password');
  await page.goto(BASE + '/job-titles', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.getByTestId('entity-add').click();
  await page.locator('#entity-name').fill('Will Fail');
  await page.getByTestId('entity-submit').click();
  await page.waitForTimeout(600);
  check('backend-down mutation shows the localized "service unavailable" message (Phase 3.1 error taxonomy)', await page.getByText('The service is unavailable. Please try again later.').isVisible());

  // 12. Arabic RTL rendering
  await login('demo@orbit.example', 'orbit-demo-password');
  await page.goto(BASE + '/job-titles', { waitUntil: 'domcontentloaded' });
  await page.getByTitle('التبديل إلى العربية').click();
  await page.waitForTimeout(600);
  check('arabic title renders', await page.getByRole('heading', { name: 'المسميات الوظيفية' }).isVisible());
  check('document direction is rtl', await page.evaluate(() => document.documentElement.dir === 'rtl'));
  await shot(page, 'jt-04-list-ar-light');

  // 13. Responsive record cards (Phase 3 visual review): cards replace the
  // horizontally scrolling table below the lg breakpoint; the desktop
  // table is unchanged at lg and above. Same data, same handlers.
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
  const cards = (pg) => pg.getByTestId('entity-cards').locator('li');
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

  // 320px, English, dark
  const mctx = await browser.newContext({ viewport: { width: 320, height: 700 }, deviceScaleFactor: 2 });
  const mp = await mctx.newPage();
  await mlogin(mp);
  await mp.goto(BASE + '/job-titles', { waitUntil: 'domcontentloaded' });
  await mp.waitForLoadState('networkidle');
  await mp.getByTitle('Dark').click();
  await mp.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await mp.reload({ waitUntil: 'domcontentloaded' });
  await mp.waitForLoadState('networkidle');
  check('no horizontal overflow at 320px', await noHScroll(mp));
  check('record cards render at 320px', (await cards(mp).count()) >= 2, `cards=${await cards(mp).count()}`);
  check('desktop table hidden below lg', (await mp.locator('tbody tr:visible').count()) === 0);
  const card0 = cards(mp).first();
  check('card shows record name and status', (await card0.getByText('Principal Engineer').count()) === 1 && (await card0.getByText('Active').count()) === 1);
  check('card action has accessible label', (await card0.getByRole('button', { name: 'View' }).getAttribute('aria-label')) === 'View');
  check('card manage actions visible for owner', await card0.getByRole('button', { name: 'Edit' }).isVisible() && await card0.getByRole('button', { name: 'Delete job title' }).isVisible());
  await card0.getByRole('button', { name: 'View' }).click();
  await mp.waitForTimeout(300);
  check('card view action opens details dialog', await mp.getByTestId('entity-view').isVisible());
  await mp.getByRole('button', { name: 'Close' }).click();
  await mp.waitForTimeout(200);
  const editBtn = card0.getByRole('button', { name: 'Edit' });
  const inView = await editBtn.evaluate((el) => { const r = el.getBoundingClientRect(); return r.right <= window.innerWidth && r.left >= 0; });
  check('card actions reachable without horizontal scrolling', inView);
  await shot(mp, 'jt-05-cards-320-en-dark');

  // 390px, Arabic, light
  await mp.getByTitle('Light').click();
  await mp.waitForFunction(() => !document.documentElement.classList.contains('dark'));
  await mp.getByTitle('التبديل إلى العربية').click();
  await mp.waitForFunction(() => document.documentElement.lang === 'ar');
  await mp.setViewportSize({ width: 390, height: 844 });
  await mp.reload({ waitUntil: 'domcontentloaded' });
  await mp.waitForLoadState('networkidle');
  check('record cards render at 390px (Arabic)', (await cards(mp).count()) >= 2, `cards=${await cards(mp).count()}`);
  check('document direction rtl at 390px', await mp.evaluate(() => document.documentElement.dir === 'rtl'));
  check('no horizontal overflow at 390px', await noHScroll(mp));
  const searchFills = await mp.getByPlaceholder('ابحث في المسميات الوظيفية').evaluate((el) => el.offsetWidth >= el.parentElement.clientWidth - 2);
  check('search input spans full mobile width (no clipped placeholder)', searchFills);
  check('arabic card status renders', (await cards(mp).first().getByText('نشط').count()) === 1);
  await shot(mp, 'jt-06-cards-390-ar-light');

  // 768px, Arabic, dark
  await mp.getByTitle('داكن').click();
  await mp.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await mp.setViewportSize({ width: 768, height: 900 });
  await mp.reload({ waitUntil: 'domcontentloaded' });
  await mp.waitForLoadState('networkidle');
  check('record cards render at 768px', (await cards(mp).count()) >= 2, `cards=${await cards(mp).count()}`);
  check('no horizontal overflow at 768px', await noHScroll(mp));
  await shot(mp, 'jt-07-cards-768-ar-dark');


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
