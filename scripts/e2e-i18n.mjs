/**
 * Runnable end-to-end checks for Phase 2.1: Arabic/English localization,
 * true RTL, and the redesigned sidebar, against the SIMULATED backend
 * (scripts/mock-backend.mjs). Live-backend verification is reported
 * separately by the operator.
 *
 * Reproduce from a clean checkout (after `npm ci`, playwright install and
 * `npm run build`, with the app already started on :3000 - same setup as
 * scripts/e2e-auth.mjs):
 *   node scripts/e2e-i18n.mjs
 *
 * Covers: default-English first render, language switching on the login
 * page and inside the authenticated shell, persistence across reload /
 * logout / new browser context (persistent cookie), server-rendered
 * lang/dir (verified in the raw HTML, not only the hydrated DOM), no
 * hydration errors, translated authentication errors and session notices,
 * RTL sidebar and mobile drawer geometry, collapsed-sidebar widths and
 * hover/focus tooltips in both directions, theme modes in both languages,
 * mobile layouts at 320/390 with no horizontal overflow, and an Arabic
 * login/logout auth regression. Exits nonzero on any failure.
 * Screenshots are written to ./e2e-screenshots/.
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
const consoleErrors = [];
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
const EMAIL = 'demo@orbit.example';

function watchConsole(page, tag) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`${tag}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => consoleErrors.push(`${tag}: ${err.message}`));
}

async function fillLoginAr(page, email) {
  const emailEl = page.getByLabel('البريد الإلكتروني للعمل');
  await emailEl.waitFor();
  await page.waitForLoadState('networkidle');
  for (let attempt = 0; attempt < 3; attempt++) {
    await emailEl.fill(email);
    await page.getByLabel('كلمة المرور', { exact: true }).fill(PASSWORD);
    if ((await emailEl.inputValue()) !== email) { await page.waitForTimeout(250); continue; }
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    try {
      await page.waitForURL((u) => u.pathname === '/', { timeout: 10000 });
      return;
    } catch {
      if (attempt === 2) throw new Error('AR login did not reach / after retries');
    }
  }
}

let browser;
try {
  await assertPortFree(`${MOCK}/api/v1/auth/me`, 'mock backend');
  const mockChild = spawnBg([mockScript]);
  if (!(await waitForServer(`${MOCK}/api/v1/auth/me`, mockChild))) throw new Error('mock did not start');
  if (!(await waitForServer(BASE + '/login'))) throw new Error('app not running on ' + BASE);

  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  watchConsole(page, 'desktop');
  const shot = (pg, name) => pg.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true });
  const htmlAttrs = (pg) => pg.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));
  const noHScroll = (pg) => pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const alertEl = () => page.locator('div[role="alert"]:not(#__next-route-announcer__)').filter({ hasText: /\S/ }).first();

  // ---- 1. New visitor defaults to English LTR (DOM and raw HTML) ----
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Work email').waitFor();
  let attrs = await htmlAttrs(page);
  check('new visitor: html lang=en dir=ltr', attrs.lang === 'en' && attrs.dir === 'ltr', JSON.stringify(attrs));
  let raw = await (await fetch(`${BASE}/login`)).text();
  check('server HTML ships lang="en" dir="ltr" (no client flip)', /<html[^>]*lang="en"[^>]*dir="ltr"/.test(raw));
  check('login page shows CONURE HR wordmark', (await page.getByText('CONURE HR', { exact: true }).count()) >= 1);
  check('no slogan anywhere on login page', !/People\. Projects\. Performance|الأفراد\. المشاريع\. الأداء/.test((await page.textContent('body')) ?? ''));

  // ---- 2. Switch to Arabic on the login page ----
  await page.getByTestId('language-switcher').click();
  await page.waitForFunction(() => document.documentElement.lang === 'ar');
  attrs = await htmlAttrs(page);
  check('switcher: html lang=ar dir=rtl', attrs.lang === 'ar' && attrs.dir === 'rtl', JSON.stringify(attrs));
  check('login page renders Arabic', ((await page.textContent('body')) ?? '').includes('مرحبًا بعودتك'));
  check('Arabic wordmark shown', (await page.getByText('كونيور', { exact: true }).count()) >= 1);
  const localeCookies = await ctx.cookies(BASE);
  const localeCookie = localeCookies.find(c => c.name === 'conure_locale');
  check('locale cookie persisted', localeCookie?.value === 'ar');
  check('locale cookie is persistent (survives restart)', (localeCookie?.expires ?? 0) > Date.now() / 1000 + 86400 * 300);
  raw = await (await fetch(`${BASE}/login`, { headers: { Cookie: 'conure_locale=ar' } })).text();
  check('server HTML ships lang="ar" dir="rtl" with cookie', /<html[^>]*lang="ar"[^>]*dir="rtl"/.test(raw));
  raw = await (await fetch(`${BASE}/login`, { headers: { Cookie: 'conure_locale=fr' } })).text();
  check('invalid locale cookie falls back to en', /<html[^>]*lang="en"/.test(raw));
  await page.mouse.move(5, 5);
  await shot(page, '30-login-ar-light');
  await page.getByTitle('داكن', { exact: true }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await page.waitForTimeout(600);
  await page.mouse.move(5, 5);
  await shot(page, '31-login-ar-dark');
  await page.getByTitle('فاتح', { exact: true }).click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));
  await page.waitForTimeout(600);

  // ---- 3. Persistence across reload ----
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByLabel('البريد الإلكتروني للعمل').waitFor();
  attrs = await htmlAttrs(page);
  check('Arabic persists across reload', attrs.lang === 'ar' && attrs.dir === 'rtl');

  // ---- 4. Translated authentication errors ----
  const emailEl = page.getByLabel('البريد الإلكتروني للعمل');
  await emailEl.fill(EMAIL);
  await page.getByLabel('كلمة المرور', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await alertEl().waitFor();
  check('422 form error in Arabic', (await alertEl().textContent() ?? '').includes('راجع الحقول المحددة'));
  check('422 field error in Arabic, no backend text', ((await page.textContent('body')) ?? '').includes('راجع هذا الحقل')
    && !/credentials do not match/i.test((await page.textContent('body')) ?? ''));
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('البريد الإلكتروني للعمل').fill('limited@orbit.example');
  await page.getByLabel('كلمة المرور', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await alertEl().waitFor();
  check('429 rate-limit error in Arabic', (await alertEl().textContent() ?? '').includes('محاولات كثيرة جدًا'));
  await page.goto(BASE + '/login?notice=expired', { waitUntil: 'domcontentloaded' });
  await alertEl().waitFor();
  check('session-expired notice in Arabic', (await alertEl().textContent() ?? '').includes('انتهت صلاحية جلستك'));

  // ---- 4b. Locale switch WHILE messages are visible: re-translation ----
  // The form keeps client state across router.refresh(); every visible
  // message must re-translate from its key, never stay in the old language.
  await page.goto(BASE + '/login?notice=expired', { waitUntil: 'domcontentloaded' });
  await alertEl().waitFor();
  check('pre-switch notice is Arabic', (await alertEl().textContent() ?? '').includes('انتهت صلاحية جلستك'));
  await page.getByTestId('language-switcher').click();
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  check('visible notice re-translated to English', (await alertEl().textContent() ?? '').includes('Your session has expired'));

  await page.getByLabel('Work email').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await alertEl().waitFor();
  check('pre-switch 422 review message is English', (await alertEl().textContent() ?? '').includes('Please review the highlighted fields.'));
  check('pre-switch field error is English', (await page.textContent('body') ?? '').includes('Review this field.'));
  await page.getByTestId('language-switcher').click();
  await page.waitForFunction(() => document.documentElement.lang === 'ar');
  check('visible 422 review message re-translated to Arabic', (await alertEl().textContent() ?? '').includes('راجع الحقول المحددة'));
  check('visible field error re-translated to Arabic', (await page.textContent('body') ?? '').includes('راجع هذا الحقل'));
  check('no backend text after switch', !/credentials do not match/i.test((await page.textContent('body')) ?? ''));

  // ---- 5. Arabic login (auth regression) + authenticated switch ----
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await fillLoginAr(page, EMAIL);
  await page.getByTestId('welcome-name').waitFor({ state: 'visible' });
  check('AR login reaches dashboard', page.url() === BASE + '/');
  check('AR welcome renders with name', (await page.getByTestId('welcome-name').textContent()) === 'مرحبًا بعودتك، Demo Owner');
  check('AR role badge', (await page.getByTestId('role-badge').textContent()) === 'المالك');
  check('AR KPI title', await page.getByText('الموظفون', { exact: true }).first().isVisible());
  check('AR sidebar section label', await page.getByTestId('sidebar').getByText('المؤسسة', { exact: true }).isVisible());
  check('AR company name in sidebar', await page.getByTestId('sidebar').getByText('Demo Engineering Consultancy').isVisible());
  // Phase 3 visual review: updated Arabic terminology, product name preserved
  check('AR roadmap badge uses قيد التخطيط', (await page.getByTestId('sidebar').getByText('قيد التخطيط', { exact: true }).count()) === 4);
  check('AR compensatory time label updated', await page.getByTestId('sidebar').getByText('الساعات التعويضية', { exact: true }).isVisible());
  check('AR product name كونيور preserved in sidebar', (await page.getByTestId('sidebar').getByText('كونيور', { exact: true }).count()) >= 1);

  // ---- 6. Sidebar geometry in RTL ----
  const sidebarBox = await page.getByTestId('sidebar').boundingBox();
  const vw = await page.evaluate(() => window.innerWidth);
  check('RTL sidebar docked to the right', !!sidebarBox && Math.abs(sidebarBox.x + sidebarBox.width - vw) <= 1 && sidebarBox.width === 260, JSON.stringify(sidebarBox));
  await page.mouse.move(5, 5);
  await shot(page, '32-dashboard-ar-light');
  await page.getByTitle('داكن', { exact: true }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await page.waitForTimeout(600);
  await page.mouse.move(5, 5);
  await shot(page, '33-dashboard-ar-dark');
  await page.getByTitle('النظام', { exact: true }).click();
  await page.waitForTimeout(400);
  check('AR system theme follows OS (headless=light)', !(await page.evaluate(() => document.documentElement.classList.contains('dark'))));
  await page.getByTitle('فاتح', { exact: true }).click();
  await page.waitForTimeout(400);

  // ---- 7. Collapsed sidebar in RTL: width, tooltips (hover + keyboard) ----
  await page.getByRole('button', { name: 'طيّ الشريط الجانبي' }).click();
  await page.waitForTimeout(400);
  const collapsedBox = await page.getByTestId('sidebar').boundingBox();
  check('RTL collapsed width is 80px', !!collapsedBox && collapsedBox.width === 80, JSON.stringify(collapsedBox));
  check('collapse toggle state flips (AR)', (await page.getByRole('button', { name: 'توسيع الشريط الجانبي' }).getAttribute('aria-pressed')) === 'true');
  await page.mouse.move(5, 5);
  await page.getByTestId('sidebar').getByRole('link', { name: 'لوحة التحكم' }).hover();
  const tooltip = page.getByTestId('sidebar-tooltip');
  await tooltip.waitFor({ state: 'visible' });
  check('RTL collapsed hover tooltip shows Arabic label', (await tooltip.textContent()) === 'لوحة التحكم');
  const tipBox = await tooltip.boundingBox();
  check('RTL tooltip opens toward content (left of sidebar)', !!tipBox && !!collapsedBox && tipBox.x + tipBox.width <= collapsedBox.x + 1, JSON.stringify({ tip: tipBox, sb: collapsedBox }));
  await page.mouse.move(5, 5);
  await tooltip.waitFor({ state: 'hidden' });
  await page.getByTestId('sidebar').getByRole('link', { name: 'لوحة التحكم' }).focus();
  await tooltip.waitFor({ state: 'visible' });
  check('RTL collapsed tooltip appears on keyboard focus', (await tooltip.textContent()) === 'لوحة التحكم');
  check('collapsed link has accessible name', (await page.getByTestId('sidebar').getByRole('link', { name: 'لوحة التحكم' }).getAttribute('aria-label')) === 'لوحة التحكم');
  await shot(page, '34-sidebar-collapsed-rtl');
  await page.getByRole('button', { name: 'توسيع الشريط الجانبي' }).click();
  await page.waitForTimeout(400);

  // ---- 8. Switch back to English while authenticated (session intact) ----
  const sessionBefore = (await ctx.cookies(BASE)).find(c => c.name === 'orbit_session')?.value;
  await page.getByTestId('language-switcher').click();
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  await page.getByTestId('welcome-name').waitFor({ state: 'visible' });
  check('switch while authenticated keeps session', (await ctx.cookies(BASE)).find(c => c.name === 'orbit_session')?.value === sessionBefore);
  check('dashboard back to English', (await page.getByTestId('welcome-name').textContent()) === 'Welcome back, Demo Owner');
  const enSidebar = await page.getByTestId('sidebar').boundingBox();
  check('LTR sidebar docked to the left', !!enSidebar && enSidebar.x === 0 && enSidebar.width === 260, JSON.stringify(enSidebar));

  // ---- 9. Collapsed sidebar in LTR ----
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.waitForTimeout(400);
  const enCollapsed = await page.getByTestId('sidebar').boundingBox();
  check('LTR collapsed width is 80px', !!enCollapsed && enCollapsed.width === 80);
  await page.mouse.move(5, 5);
  await page.getByTestId('sidebar').getByRole('link', { name: 'Dashboard' }).hover();
  await tooltip.waitFor({ state: 'visible' });
  check('LTR collapsed tooltip shows English label', (await tooltip.textContent()) === 'Dashboard');
  const enTipBox = await tooltip.boundingBox();
  check('LTR tooltip opens toward content (right of sidebar)', !!enTipBox && !!enCollapsed && enTipBox.x >= enCollapsed.x + enCollapsed.width - 1, JSON.stringify({ tip: enTipBox, sb: enCollapsed }));
  await shot(page, '35-sidebar-collapsed-en');
  await page.mouse.move(5, 5);
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await page.waitForTimeout(400);

  // ---- 10. Arabic logout (auth regression) + persistence across logout ----
  await page.getByTestId('language-switcher').click();
  await page.waitForFunction(() => document.documentElement.lang === 'ar');
  await page.getByTestId('welcome-name').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'قائمة المستخدم' }).click();
  await page.getByTestId('user-menu').waitFor({ state: 'visible' });
  check('AR user menu shows identity', (await page.getByTestId('user-menu').getByText('Demo Owner', { exact: true }).count()) === 1
    && (await page.getByTestId('user-menu').getByText('demo@orbit.example', { exact: true }).count()) === 1
    && (await page.getByTestId('user-menu').getByText('المالك', { exact: true }).count()) === 1);
  await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 10000 });
  check('AR logout returns to login', page.url().startsWith(BASE + '/login'), page.url());
  attrs = await htmlAttrs(page);
  check('Arabic persists across logout', attrs.lang === 'ar' && attrs.dir === 'rtl');
  check('session cookie cleared after AR logout', !(await ctx.cookies(BASE)).find(c => c.name === 'orbit_session' && c.value));

  // ---- 11. Persistence in a fresh context (browser-restart equivalent) ----
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx2.addCookies([{ name: 'conure_locale', value: 'ar', domain: '127.0.0.1', path: '/' }]);
  const page2 = await ctx2.newPage();
  await page2.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page2.getByLabel('البريد الإلكتروني للعمل').waitFor();
  const attrs2 = await htmlAttrs(page2);
  check('fresh context with cookie boots Arabic RTL', attrs2.lang === 'ar' && attrs2.dir === 'rtl');
  await ctx2.close();

  // ---- 12. Mobile Arabic: 390 + 320, drawer from the right ----
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await mctx.addCookies([{ name: 'conure_locale', value: 'ar', domain: '127.0.0.1', path: '/' }]);
  const mp = await mctx.newPage();
  watchConsole(mp, 'mobile-ar');
  await mp.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await mp.getByLabel('البريد الإلكتروني للعمل').waitFor();
  await mp.mouse.move(5, 5);
  await shot(mp, '36-mobile-ar-login');
  await fillLoginAr(mp, EMAIL);
  await mp.getByTestId('welcome-name').waitFor({ state: 'visible' });
  check('mobile AR: no horizontal overflow at 390 (closed)', await noHScroll(mp));
  await mp.mouse.move(5, 5);
  await mp.screenshot({ path: `${SHOTS}37-mobile-ar-dashboard.png` });
  await mp.getByRole('button', { name: 'فتح قائمة التنقل' }).click();
  await mp.getByTestId('mobile-drawer').waitFor({ state: 'visible' });
  // Let the 200ms entrance animation settle before measuring geometry.
  await mp.waitForTimeout(450);
  const drawerBox = await mp.getByTestId('mobile-drawer').boundingBox();
  const mvw = await mp.evaluate(() => window.innerWidth);
  check('AR drawer opens from the right', !!drawerBox && Math.abs(drawerBox.x + drawerBox.width - mvw) <= 1, JSON.stringify(drawerBox));
  check('AR drawer shows Arabic sections', await mp.getByTestId('mobile-drawer').getByText('إدارة الموارد البشرية', { exact: true }).isVisible());
  check('mobile AR: no horizontal overflow at 390 (drawer open)', await noHScroll(mp));
  await mp.mouse.move(5, 5);
  await mp.screenshot({ path: `${SHOTS}38-mobile-ar-drawer.png` });
  await mp.keyboard.press('Escape');
  await mp.setViewportSize({ width: 320, height: 700 });
  await mp.reload({ waitUntil: 'domcontentloaded' });
  await mp.getByTestId('welcome-name').waitFor({ state: 'visible' });
  check('mobile AR: no horizontal overflow at 320 (closed)', await noHScroll(mp));
  await mp.getByRole('button', { name: 'فتح قائمة التنقل' }).click();
  await mp.getByTestId('mobile-drawer').waitFor({ state: 'visible' });
  check('mobile AR: no horizontal overflow at 320 (drawer open)', await noHScroll(mp));
  check('AR drawer close button labelled in Arabic', await mp.getByRole('button', { name: 'إغلاق قائمة التنقل' }).isVisible());
  await mp.keyboard.press('Escape');
  await mctx.close();

  // ---- 13. Mobile English: drawer from the left ----
  const ectx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const ep = await ectx.newPage();
  watchConsole(ep, 'mobile-en');
  await ep.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  const enEmail = ep.getByLabel('Work email');
  await enEmail.waitFor();
  await ep.waitForLoadState('networkidle');
  await enEmail.fill(EMAIL);
  await ep.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await ep.getByRole('button', { name: 'Sign in' }).click();
  await ep.waitForURL((u) => u.pathname === '/');
  await ep.getByTestId('welcome-name').waitFor({ state: 'visible' });
  await ep.getByRole('button', { name: 'Open navigation' }).click();
  await ep.getByTestId('mobile-drawer').waitFor({ state: 'visible' });
  await ep.waitForTimeout(450);
  const enDrawer = await ep.getByTestId('mobile-drawer').boundingBox();
  check('EN drawer opens from the left', !!enDrawer && enDrawer.x === 0, JSON.stringify(enDrawer));
  check('mobile EN: no horizontal overflow (drawer open)', await noHScroll(ep));
  await ep.mouse.move(5, 5);
  await ep.screenshot({ path: `${SHOTS}39-mobile-en-drawer.png` });
  await ep.keyboard.press('Escape');
  await ectx.close();

  // ---- 13b. Layout-level unavailable in Arabic (backend down) ----
  // English coverage lives in e2e-auth ('backend-down workspace shows
  // unavailable'); here the same path must render the Arabic string.
  // The main page is on the Arabic login screen after section 10's logout;
  // sign back in, then cut the backend and reload.
  await fillLoginAr(page, EMAIL);
  await page.getByTestId('welcome-name').waitFor({ state: 'visible' });
  mockChild.kill();
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('div[role="alert"]:not(#__next-route-announcer__)').first().waitFor({ timeout: 25000 });
  check('layout unavailable renders in Arabic when backend down', ((await page.textContent('body')) ?? '').includes('الخدمة غير متاحة'));
  const mockChild2 = spawnBg([mockScript]);
  await waitForServer(`${MOCK}/api/v1/auth/me`, mockChild2);

  // ---- 14. No hydration errors anywhere ----
  const hydration = consoleErrors.filter((e) => /hydrat|did not match|#418|#423/i.test(e));
  check('no hydration errors during any switch or navigation', hydration.length === 0, hydration.join(' | ').slice(0, 300));

  console.log(results.join('\n'));
  const failed = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (failed > 0) process.exitCode = 1;
} catch (err) {
  console.log(results.join('\n'));
  console.error('E2E harness error:', err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  for (const c of children) { try { c.kill(); } catch { /* already gone */ } }
}
