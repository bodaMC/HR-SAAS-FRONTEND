/**
 * Runnable end-to-end checks for the Phase 2 application shell and
 * dashboard, against the SIMULATED backend (scripts/mock-backend.mjs).
 * Live-backend verification is reported separately by the operator.
 *
 * Reproduce from a clean checkout (after `npm ci`, playwright install and
 * `npm run build`, with the app already started on :3000 - same setup as
 * scripts/e2e-auth.mjs):
 *   node scripts/e2e-shell.mjs
 *
 * Covers: protected nav rendering, planned (non-link, badged) items,
 * per-item role gating, fail-closed nav for unknown roles, sidebar
 * collapse + persistence, mobile drawer (dialog semantics, focus trap,
 * inert background, no horizontal overflow at 320/390), theme persistence,
 * dashboard KPIs from complete collections and backend meta.total only,
 * runtime envelope validation (malformed success bodies degrade the
 * affected widget independently), per-widget failure and empty states, and
 * a login/logout regression. Exits nonzero on any failure. Screenshots are
 * written to ./e2e-screenshots/.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
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

const mockScript = fileURLToPath(new URL('./mock-backend.mjs', import.meta.url));
const PASSWORD = 'orbit-demo-password';

let browser;
try {
  await assertPortFree(`${MOCK}/api/v1/auth/me`, 'mock backend');
  const mockChild = spawnBg([mockScript]);
  if (!(await waitForServer(`${MOCK}/api/v1/auth/me`, mockChild))) throw new Error('mock did not start');
  if (!(await waitForServer(BASE + '/login'))) throw new Error('app not running on ' + BASE);

  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const shot = (pg, name) => pg.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true });
  const settle = (ms = 600) => page.waitForTimeout(ms);

  async function login(email) {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    const emailEl = page.getByLabel(/email/i);
    await emailEl.waitFor();
    await page.waitForLoadState('networkidle');
    for (let attempt = 0; attempt < 3; attempt++) {
      await emailEl.fill(email);
      await page.getByLabel(/password/i).fill(PASSWORD);
      if ((await emailEl.inputValue()) !== email) { await page.waitForTimeout(250); continue; }
      await page.getByRole('button', { name: 'Sign in' }).click();
      try {
        await page.waitForURL((u) => u.pathname === '/', { timeout: 10000 });
        break;
      } catch {
        if (attempt === 2) throw new Error('login did not reach / after retries');
      }
    }
    await page.getByTestId('welcome-name').waitFor({ state: 'visible' });
  }

  async function signOut() {
    const menuBtn = page.getByRole('button', { name: 'User menu' });
    if ((await menuBtn.getAttribute('aria-expanded')) !== 'true') await menuBtn.click();
    await page.getByTestId('user-menu').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: 'Sign out' }).click();
  }

  // ---- 1. Owner dashboard ----
  await login('demo@orbit.example');
  check('owner dashboard welcome renders', await page.getByTestId('welcome-name').textContent() === 'Welcome back, Demo Owner');
  check('owner role badge', await page.getByTestId('role-badge').textContent() === 'Owner');
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByTestId('user-menu').waitFor({ state: 'visible' });
  check('user menu opens with name/email/role',
    (await page.getByTestId('user-menu').getByText('Demo Owner', { exact: true }).count()) === 1 &&
    (await page.getByTestId('user-menu').getByText('demo@orbit.example', { exact: true }).count()) === 1 &&
    (await page.getByTestId('user-menu').getByText('Owner', { exact: true }).count()) === 1);
  await page.keyboard.press('Escape');
  await page.getByTestId('user-menu').waitFor({ state: 'hidden' });
  check('employees KPI from complete collection', await page.getByTestId('employees-total').textContent() === '3');
  check('departments KPI from complete collection', await page.getByTestId('departments-total').textContent() === '3');
  const pendingCounts = await page.getByTestId('pending-count').allTextContents();
  check('pending leave KPI from backend meta.total', pendingCounts[0] === '2', pendingCounts.join(','));
  check('pending permission KPI from backend meta.total', pendingCounts[1] === '2', pendingCounts.join(','));
  const recentLeaves = await page.locator('section', { hasText: 'Recent leave requests' }).locator('li').count();
  check('recent leave list shows first 5', recentLeaves === 5, `count=${recentLeaves}`);
  const recentPerms = await page.locator('section', { hasText: 'Recent permission requests' }).locator('li').count();
  check('recent permission list shows first 5', recentPerms === 4, `count=${recentPerms}`);

  // ---- 2. Shell nav: owner sees all sections, planned items badged + non-link ----
  const sidebar = page.getByTestId('sidebar');
  check('Administration section visible for owner', await sidebar.getByText('Administration', { exact: true }).isVisible());
  check('Organization section visible', await sidebar.getByText('Organization', { exact: true }).isVisible());
  check('Dashboard link is active', (await sidebar.getByRole('link', { name: /Dashboard/ }).getAttribute('aria-current')) === 'page');
  const plannedBadges = await sidebar.getByText('Soon').count();
  check('endpoint-backed modules carry Soon badge', plannedBadges === 11, `badges=${plannedBadges}`);
  const roadmapBadges = await sidebar.getByText('Roadmap').count();
  check('no-endpoint modules carry Roadmap badge', roadmapBadges === 4, `badges=${roadmapBadges}`);
  const plannedLinkCount = await sidebar.getByRole('link').count();
  check('only active items are links', plannedLinkCount === 1, `links=${plannedLinkCount}`);
  check('no Super Admin entry', await sidebar.getByText(/super\s*admin/i).count() === 0);
  await page.mouse.move(5, 5);
  await shot(page, '10-dashboard-desktop-light-owner');

  // ---- 3. Sidebar collapse + persistence ----
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  check('collapse button state flips', (await page.getByRole('button', { name: 'Expand sidebar' }).getAttribute('aria-pressed')) === 'true');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('welcome-name').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Expand sidebar' }).waitFor({ state: 'visible' });
  check('collapse persists across reload', await page.getByRole('button', { name: 'Expand sidebar' }).isVisible());
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await page.getByTestId('welcome-name').waitFor({ state: 'visible' });

  // ---- 4. Theme persistence on the shell ----
  await page.getByTitle('Dark').click();
  await settle();
  check('dark class applied', await page.evaluate(() => document.documentElement.classList.contains('dark')));
  await page.mouse.move(5, 5);
  await shot(page, '11-dashboard-desktop-dark-owner');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('welcome-name').waitFor({ state: 'visible' });
  check('theme persists across reload', await page.evaluate(() => document.documentElement.classList.contains('dark')));
  await page.getByTitle('Light').click();
  await settle();

  // ---- 5. Mobile drawer ----
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('welcome-name').waitFor({ state: 'visible' });
  check('desktop sidebar hidden on mobile', !(await page.getByTestId('sidebar').isVisible()));
  check('no horizontal overflow at 390px (drawer closed)', await noHScroll());
  await page.mouse.move(5, 5);
  await page.screenshot({ path: `${SHOTS}20-mobile-dashboard-light-closed.png` });
  await page.getByTitle('Dark').click();
  await settle();
  check('mobile dark theme applies', await page.evaluate(() => document.documentElement.classList.contains('dark')));
  check('no horizontal overflow at 390px dark (drawer closed)', await noHScroll());
  await page.mouse.move(5, 5);
  await page.screenshot({ path: `${SHOTS}21-mobile-dashboard-dark-closed.png` });
  await page.getByTitle('Light').click();
  await settle();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByTestId('mobile-drawer').waitFor({ state: 'visible' });
  check('mobile drawer opens', await page.getByTestId('mobile-drawer').isVisible());
  check('mobile drawer shows sections', await page.getByTestId('mobile-drawer').getByText('HR Management', { exact: true }).isVisible());
  check('drawer has dialog semantics', (await page.getByTestId('mobile-drawer').getAttribute('aria-modal')) === 'true');
  check('background inert while drawer open', await page.evaluate(() => {
    const main = document.querySelector('[data-testid="app-main-column"]');
    return !!main && main.hasAttribute('inert') && main.getAttribute('aria-hidden') === 'true';
  }));
  let focusTrapped = true;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const d = document.querySelector('[data-testid="mobile-drawer"]');
      return !!d && d.contains(document.activeElement);
    });
    if (!inside) { focusTrapped = false; break; }
  }
  check('focus trapped inside drawer while open', focusTrapped);
  check('no horizontal overflow at 390px (drawer open)', await noHScroll());
  await page.mouse.move(5, 5);
  await page.screenshot({ path: `${SHOTS}22-mobile-drawer-open.png` });
  await page.keyboard.press('Escape');
  check('mobile drawer closes on Escape', !(await page.getByTestId('mobile-drawer').isVisible().catch(() => false)));
  check('body scroll restored', (await page.evaluate(() => document.body.style.overflow)) === '');
  check('background no longer inert after close', await page.evaluate(() => {
    const main = document.querySelector('[data-testid="app-main-column"]');
    return !!main && !main.hasAttribute('inert');
  }));
  await page.setViewportSize({ width: 320, height: 700 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('welcome-name').waitFor({ state: 'visible' });
  check('no horizontal overflow at 320px (drawer closed)', await noHScroll());
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByTestId('mobile-drawer').waitFor({ state: 'visible' });
  check('no horizontal overflow at 320px (drawer open)', await noHScroll());
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });

  // ---- 6. Logout regression ----
  await signOut();
  await page.waitForURL((u) => u.pathname.startsWith('/login'));
  check('logout returns to login', page.url().startsWith(BASE + '/login'));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForURL((u) => u.pathname.startsWith('/login'));
  check('root protected again after logout', page.url().startsWith(BASE + '/login'));

  // ---- 7. Employee role: Administration hidden ----
  await login('employee@orbit.example');
  check('employee role badge', await page.getByTestId('role-badge').textContent() === 'Employee');
  // Administration stays visible: work schedules/holidays read access is
  // verified for all roles; only Audit Logs is policy-gated owner/admin.
  check('Administration visible for employee', await page.getByTestId('sidebar').getByText('Administration', { exact: true }).isVisible());
  check('Audit Logs hidden for employee', (await page.getByTestId('sidebar').getByText('Audit Logs', { exact: true }).count()) === 0);
  check('Work Schedules visible for employee', await page.getByTestId('sidebar').getByText('Work Schedules', { exact: true }).isVisible());
  check('employee still sees HR Management', await page.getByTestId('sidebar').getByText('HR Management', { exact: true }).isVisible());
  await page.mouse.move(5, 5);
  await shot(page, '13-dashboard-desktop-light-employee');
  await signOut();
  await page.waitForURL((u) => u.pathname.startsWith('/login'));

  // ---- 7b. Unknown role: navigation fails closed entirely ----
  await login('unknownrole@orbit.example');
  check('unknown role badge label', await page.getByTestId('role-badge').textContent() === 'Unknown role');
  check('unknown role sees no nav links', (await page.getByTestId('sidebar').getByRole('link').count()) === 0);
  check('unknown role sees no nav entries at all', (await page.getByTestId('sidebar').getByRole('listitem').count()) === 0);
  check('no badges leak for unknown role', (await page.getByTestId('sidebar').getByText(/^(Soon|Roadmap)$/).count()) === 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('welcome-name').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByTestId('mobile-drawer').waitFor({ state: 'visible' });
  check('unknown role drawer has no entries', (await page.getByTestId('mobile-drawer').getByRole('listitem').count()) === 0);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });
  await signOut();
  await page.waitForURL((u) => u.pathname.startsWith('/login'));

  // ---- 8. Failure + empty states ----
  await login('dashfail@orbit.example');
  check('unavailable KPIs shown for failed reads', (await page.getByTestId('kpi-unavailable').count()) === 3);
  check('departments empty state shown', await page.getByText('No departments yet.').isVisible());
  check('recent lists unavailable', (await page.getByTestId('recent-unavailable').count()) === 2);
  check('zero never shown for failed reads', (await page.getByTestId('pending-count').count()) === 0);
  await page.mouse.move(5, 5);
  await shot(page, '14-dashboard-failure-empty-states');
  await signOut();
  await page.waitForURL((u) => u.pathname.startsWith('/login'));

  // ---- 9. 403 on data endpoints -> widgets unavailable, not zero ----
  await login('forbidden@orbit.example');
  check('403 leave/permission KPIs unavailable', (await page.getByTestId('kpi-unavailable').count()) === 2);
  check('403 recent lists unavailable', (await page.getByTestId('recent-unavailable').count()) === 2);
  check('employees KPI still from complete collection', await page.getByTestId('employees-total').textContent() === '3');
  await signOut();
  await page.waitForURL((u) => u.pathname.startsWith('/login'));

  // ---- 9b. Malformed success envelopes: each widget degrades independently ----
  await login('bademp@orbit.example');
  check('malformed employees envelope -> its KPI unavailable', (await page.getByTestId('kpi-unavailable').count()) === 1);
  check('other KPIs intact (bademp)', (await page.getByTestId('departments-total').textContent()) === '3' && (await page.getByTestId('pending-count').count()) === 2);
  check('recent lists intact (bademp)', (await page.getByTestId('recent-unavailable').count()) === 0);
  await signOut();
  await page.waitForURL((u) => u.pathname.startsWith('/login'));

  await login('baddept@orbit.example');
  check('malformed departments envelope -> its KPI unavailable', (await page.getByTestId('kpi-unavailable').count()) === 1);
  check('other KPIs intact (baddept)', (await page.getByTestId('employees-total').textContent()) === '3' && (await page.getByTestId('pending-count').count()) === 2);
  await signOut();
  await page.waitForURL((u) => u.pathname.startsWith('/login'));

  await login('badleave@orbit.example');
  check('malformed leave envelope -> pending KPI unavailable', (await page.getByTestId('kpi-unavailable').count()) === 1);
  check('malformed leave envelope -> its recent list unavailable, no crash', (await page.getByTestId('recent-unavailable').count()) === 1);
  check('other widgets intact (badleave)', (await page.getByTestId('employees-total').textContent()) === '3' && (await page.getByTestId('pending-count').count()) === 1);
  await signOut();
  await page.waitForURL((u) => u.pathname.startsWith('/login'));

  await login('badperm@orbit.example');
  check('negative meta.total -> pending KPI unavailable', (await page.getByTestId('kpi-unavailable').count()) === 1);
  check('other pending KPI intact (badperm)', (await page.getByTestId('pending-count').count()) === 1);
  check('empty valid page still shows empty state (badperm)', (await page.getByTestId('recent-empty').count()) === 1);
  await signOut();
  await page.waitForURL((u) => u.pathname.startsWith('/login'));

  // ---- 10. /me 401 while data endpoints return 200: no private widgets ----
  // Login itself succeeds, but the per-page session validation rejects the
  // token, so the session is cleared and no dashboard content may render.
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel(/email/i).waitFor();
  await page.waitForLoadState('networkidle');
  await page.getByLabel(/email/i).fill('brokensession@orbit.example');
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/login') && u.search.includes('notice=expired'), { timeout: 25000 });
  check('invalid session cleared despite 200 data endpoints', page.url().includes('notice=expired'));
  check('no private widgets rendered', (await page.getByTestId('employees-total').count()) === 0 && (await page.getByTestId('welcome-name').count()) === 0);

  // ---- 11. malformed /me success -> safe unavailable, no false empty ----
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel(/email/i).waitFor();
  await page.waitForLoadState('networkidle');
  await page.getByLabel(/email/i).fill('malformed@orbit.example');
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  const unavailAlert = page.locator('div[role="alert"]:not(#__next-route-announcer__)').filter({ hasText: /unavailable/i }).first();
  await unavailAlert.waitFor({ timeout: 25000 });
  check('malformed /me shows unavailable', await unavailAlert.isVisible());
  check('no KPI widgets on malformed session', (await page.getByTestId('employees-total').count()) === 0);
  await page.mouse.move(5, 5);
  await shot(page, '15-malformed-session-unavailable');

  // ---- 12. delayed backend -> loading skeleton appears ----
  const slowPage = await ctx.newPage();
  await slowPage.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await slowPage.getByLabel(/email/i).waitFor();
  await slowPage.waitForLoadState('networkidle');
  await slowPage.getByLabel(/email/i).fill('slow@orbit.example');
  await slowPage.getByLabel(/password/i).fill(PASSWORD);
  await slowPage.getByRole('button', { name: 'Sign in' }).click();
  const skeleton = slowPage.getByTestId('dashboard-loading');
  let skeletonSeen = true;
  try {
    await skeleton.waitFor({ state: 'visible', timeout: 10000 });
  } catch {
    skeletonSeen = false;
  }
  check('loading skeleton shown while backend responds', skeletonSeen);
  await slowPage.getByTestId('welcome-name').waitFor({ state: 'visible', timeout: 20000 });
  check('dashboard renders after delayed backend', (await slowPage.getByTestId('welcome-name').textContent()) === 'Welcome back, Demo Slow');
  await slowPage.close();

  console.log(results.join('\n'));
  const failed = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (failed > 0) process.exitCode = 1;
} catch (err) {
  console.error('E2E harness error:', err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  for (const c of children) { try { c.kill(); } catch { /* already gone */ } }
}
