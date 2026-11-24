/**
 * Runnable end-to-end checks for the Phase 1 + 1.1 authentication flow.
 *
 * Reproduce from a clean checkout (chromium download only needed once):
 *   npm ci
 *   npx playwright install --only-shell chromium
 *   npm run build
 *   ORBIT_API_BASE_URL=http://127.0.0.1:4100/api/v1 \
 *   ORBIT_APP_ORIGIN=http://127.0.0.1:3000 \
 *   ORBIT_ALLOW_INSECURE_LOCAL_ORIGIN=true \
 *     npx next start -p 3000 &
 *   node scripts/e2e-auth.mjs
 *
 * (ORBIT_ALLOW_INSECURE_LOCAL_ORIGIN=true is a LOCAL TEST HARNESS flag so a
 * production build can trust a loopback http origin; never set it in a real
 * deployment.)
 *
 * The script verifies each port is free before spawning, then spawns and
 * cleans up its own mock Laravel auth server (4100) and extra app instances:
 *   3101 production, ORBIT_APP_ORIGIN explicitly UNSET (must fail closed)
 *   3102 production, ORBIT_APP_ORIGIN=https://orbit.example.com
 *   3103 production, ORBIT_APP_ORIGIN=http://127.0.0.1:3103 (http non-https
 *        in production without the local override: must fail closed)
 *   3104 production, ORBIT_APP_ORIGIN=https://orbit.example.com/admin
 *        (origin with a path: invalid, must fail closed)
 * It never kills processes it did not start. Screenshots are written to
 * ./e2e-screenshots/. Exits nonzero on any failure (verified: a dead main
 * app makes the run exit nonzero - see TestResults).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
  // Explicitly control the child environment: drop origin-trust variables
  // unless the caller passes its own value for them.
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
    if (child && child.exitCode !== null) return false; // spawned process died
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

// Portable paths and the portable Next CLI entry: works on Windows too
// (.bin shims and URL.pathname forms do not).
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const nextBin = path.join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const mockScript = fileURLToPath(new URL('./mock-backend.mjs', import.meta.url));

let browser;
try {
  // Ownership: refuse to run against ports already served by something else.
  await assertPortFree(`${MOCK}/api/v1/auth/me`, 'mock backend');
  for (const port of [3101, 3102, 3103, 3104]) {
    await assertPortFree(`http://127.0.0.1:${port}/login`, `app instance :${port}`);
  }

  const mockChild = spawnBg([mockScript]);
  const mockEnv = { ORBIT_API_BASE_URL: `${MOCK}/api/v1` };
  const instB = spawnBg([nextBin, 'start', '-p', '3101'], { ...mockEnv });
  const instC = spawnBg([nextBin, 'start', '-p', '3102'], { ...mockEnv, ORBIT_APP_ORIGIN: 'https://orbit.example.com' });
  const instD = spawnBg([nextBin, 'start', '-p', '3103'], { ...mockEnv, ORBIT_APP_ORIGIN: 'http://127.0.0.1:3103' });
  const instE = spawnBg([nextBin, 'start', '-p', '3104'], { ...mockEnv, ORBIT_APP_ORIGIN: 'https://orbit.example.com/admin' });

  if (!(await waitForServer(`${MOCK}/api/v1/auth/me`, mockChild))) throw new Error('mock did not start');
  if (!(await waitForServer(BASE + '/login'))) throw new Error('app not running on ' + BASE);
  for (const [port, child] of [[3101, instB], [3102, instC], [3103, instD], [3104, instE]]) {
    if (!(await waitForServer(`http://127.0.0.1:${port}/login`, child))) throw new Error(`instance :${port} did not start`);
  }

  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const shot = (pg, name) => pg.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true });
  // Exclude Next.js' visually-hidden route announcer (role=alert with page title).
  const alertEl = () => page.locator('div[role="alert"]:not(#__next-route-announcer__)').filter({ hasText: /\S/ }).first();
  const alertText = () => alertEl().textContent().catch(() => '');
  // Fills and submits the login form, then returns: callers assert the
  // outcome (navigation on success, error alert on rejection). Hydration
  // right after load can swallow the fill, so values are verified and the
  // submit is retried only when the fields lost their content.
  const login = async (email, pw) => {
    await ctx.clearCookies();
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    const emailEl = page.getByLabel('Work email');
    const pwEl = page.getByLabel('Password', { exact: true });
    const submit = page.getByRole('button', { name: 'Sign in' });
    await emailEl.waitFor();
    await page.waitForLoadState('networkidle');
    for (let attempt = 0; attempt < 3; attempt++) {
      await emailEl.fill(email);
      await pwEl.fill(pw);
      if ((await emailEl.inputValue()) === email) break;
      await page.waitForTimeout(250);
    }
    await submit.click();
  };

  // 1. Protected root redirects when unauthenticated
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForURL((u) => u.pathname.startsWith('/login'));
  check('protected root redirects to /login', page.url().startsWith(BASE + '/login'));
  await page.mouse.move(5, 5);
  await shot(page, '01-login-desktop-light');
  await page.getByTitle('Dark').click();
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await page.waitForTimeout(600); // let the theme transition settle
  await page.mouse.move(5, 5);
  await shot(page, '02-login-desktop-dark');
  await page.getByTitle('Light').click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));
  await page.waitForTimeout(600);

  // 2. 422 validation surfaced, internal detail stripped
  await login('demo@orbit.example', 'wrong-password');
  await alertEl().waitFor();
  check('422 shows app-owned form message', /review the highlighted fields/i.test(await alertText() ?? ''));
  check('422 shows generic localized field error', /review this field/i.test((await page.textContent('body')) ?? ''));
  check('422 never renders backend error text', !/credentials do not match/i.test((await page.textContent('body')) ?? ''));

  // 3. 429 rate limit surfaced
  await login('limited@orbit.example', 'orbit-demo-password');
  await alertEl().waitFor();
  check('429 rate-limit message shown', /too many attempts/i.test(await alertText() ?? ''));

  // 4. 403 inactive account surfaced with app-owned message
  await login('inactive@orbit.example', 'orbit-demo-password');
  await alertEl().waitFor();
  const t403 = (await alertText()) ?? '';
  check('403 inactive account message shown', /inactive/i.test(t403), t403);
  check('403 message is app-owned (no internal detail)', !/SQLSTATE/i.test(t403), t403);

  // 5. Backend 5xx: safe generic message, nothing internal leaked
  await login('error@orbit.example', 'orbit-demo-password');
  await alertEl().waitFor();
  const t500 = (await alertText()) ?? '';
  check('5xx shows safe message', /unavailable/i.test(t500), t500);
  check('5xx does not leak internal details', !/SQLSTATE/i.test(t500), t500);

  // 6. Login API contract and adversarial whitelisting
  const apiLogin = (origin, body, base = BASE, extraHeaders = {}) => fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}), ...extraHeaders },
    body: JSON.stringify(body),
  });
  let res = await apiLogin(BASE, { email: 'demo@orbit.example', password: 'orbit-demo-password' });
  let j = await res.json();
  check('login API returns user, no token in body', res.ok && j.user && !('token' in j));

  res = await apiLogin(BASE, { email: 'demo@orbit.example', password: 'wrong-password' });
  j = await res.json();
  check('422 status on bad credentials', res.status === 422, `got ${res.status}`);
  check('422 top-level message is app-owned', j.message === 'Please review the highlighted fields.', JSON.stringify(j));
  check('422 keeps known validation message verbatim', Array.isArray(j.errors?.email) && j.errors.email[0] === 'These credentials do not match our records.', JSON.stringify(j.errors));
  check('422 maps unknown strings to generic field error', j.errors?.email?.filter(m => m === 'Invalid value.').length === 1, JSON.stringify(j.errors));
  check('422 drops internal error text incl plain words', !(j.errors?.email ?? []).some(m => /SQLSTATE|select from users/i.test(m)), JSON.stringify(j.errors));
  check('422 drops unknown error fields', !('internal_table' in (j.errors ?? {})), JSON.stringify(j.errors));
  check('422 has no extra top-level fields', !('trace' in j) && Object.keys(j).sort().join(',') === 'errors,message', JSON.stringify(j));

  res = await apiLogin(BASE, { email: 'inactive@orbit.example', password: 'orbit-demo-password' });
  j = await res.json();
  check('403 known code mapped to app-owned message', res.status === 403 && j.code === 'USER_INACTIVE' && j.message === 'Your user account is inactive.', JSON.stringify(j));
  check('403 response has no internal fields', !('debug' in j) && !/SQLSTATE/i.test(JSON.stringify(j)), JSON.stringify(j));

  res = await apiLogin(BASE, { email: 'denied@orbit.example', password: 'orbit-demo-password' });
  j = await res.json();
  check('403 unknown code becomes generic, code not forwarded', res.status === 403 && j.message === 'Access denied. Please contact your administrator.' && !('code' in j), JSON.stringify(j));
  res = await apiLogin(BASE, { email: 'weirdcode@orbit.example', password: 'orbit-demo-password' });
  j = await res.json();
  check('403 prototype-key code not treated as known', res.status === 403 && j.message === 'Access denied. Please contact your administrator.' && !('code' in j), JSON.stringify(j));

  // 7. Origin policy on main instance (trusted origin = BASE, local override set)
  res = await apiLogin('http://evil.example', {});
  check('cross-origin host POST rejected (403)', res.status === 403, `got ${res.status}`);
  res = await apiLogin('https://127.0.0.1:3000', {});
  check('cross-origin protocol mismatch rejected (403)', res.status === 403, `got ${res.status}`);
  res = await apiLogin('null', {});
  check('null Origin rejected (403)', res.status === 403, `got ${res.status}`);
  res = await apiLogin('not-a-url', {});
  check('malformed Origin rejected (403)', res.status === 403, `got ${res.status}`);
  res = await apiLogin(BASE + '/admin', {});
  check('Origin with path rejected (403)', res.status === 403, `got ${res.status}`);
  res = await apiLogin(null, {});
  check('missing Origin rejected when trusted origin configured (403)', res.status === 403, `got ${res.status}`);
  res = await apiLogin(BASE, { email: 'x@y.z', password: 'x' });
  check('same-origin POST allowed through', res.status !== 403, `got ${res.status}`);
  res = await apiLogin(BASE, { email: 'x@y.z', password: 'x' }, BASE, { 'X-Forwarded-Host': 'evil.example' });
  check('spoofed X-Forwarded-Host does not bypass and does not break match', res.status !== 403, `got ${res.status}`);
  res = await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { Origin: 'http://evil.example' } });
  check('cross-origin logout rejected (403)', res.status === 403, `got ${res.status}`);
  check('rejected logout does not clear cookie', !(res.headers.get('set-cookie') ?? '').includes('orbit_session=;'));

  // 8. Production fail-closed: no trusted origin configured (env explicitly unset)
  res = await fetch('http://127.0.0.1:3101/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:3101' }, body: '{}' });
  check('production without trusted origin fails closed (403)', res.status === 403, `got ${res.status}`);
  // 9. Production: http origin without explicit local override fails closed
  res = await fetch('http://127.0.0.1:3103/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:3103' }, body: '{}' });
  check('production http origin without override fails closed (403)', res.status === 403, `got ${res.status}`);
  // 10. Production: origin with path is invalid config, fails closed
  res = await fetch('http://127.0.0.1:3104/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:3104' }, body: '{}' });
  check('production malformed origin config fails closed (403)', res.status === 403, `got ${res.status}`);

  // 11. Trusted https origin: accepted, Secure cookie, X-Forwarded-Host ignored
  res = await apiLogin('https://orbit.example.com', { email: 'demo@orbit.example', password: 'orbit-demo-password' }, 'http://127.0.0.1:3102', { 'X-Forwarded-Host': 'evil.example' });
  check('trusted https origin accepted even with spoofed X-Forwarded-Host', res.ok, `got ${res.status}`);
  check('cookie Secure under trusted https origin', /orbit_session=[^;]+/.test(res.headers.get('set-cookie') ?? '') && /Secure/i.test(res.headers.get('set-cookie') ?? ''), res.headers.get('set-cookie') ?? '');
  res = await apiLogin('https://evil.example', {}, 'http://127.0.0.1:3102', { 'X-Forwarded-Host': 'orbit.example.com' });
  check('evil Origin with spoofed X-Forwarded-Host rejected (403)', res.status === 403, `got ${res.status}`);

  // 12. Full login flow + workspace
  await login('demo@orbit.example', 'orbit-demo-password');
  await page.waitForURL((u) => u.pathname === '/');
  await page.getByText('Demo Owner').first().waitFor();
  const bodyText = await page.textContent('body');
  check('login redirects to workspace', page.url() === BASE + '/');
  check('workspace shows user name (fixture)', bodyText.includes('Demo Owner'));
  check('workspace shows company (fixture)', bodyText.includes('Demo Engineering Consultancy'));
  check('workspace shows role (fixture)', bodyText.includes('Owner'));
  await page.mouse.move(5, 5);
  await shot(page, '03-workspace-desktop-light');
  await page.getByTitle('Dark').click();
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await page.waitForTimeout(600);
  await page.mouse.move(5, 5);
  await shot(page, '04-workspace-desktop-dark');
  await page.getByTitle('Light').click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));
  await page.waitForTimeout(600);

  // 13. Cookie attributes
  const cookies = await ctx.cookies(BASE);
  const session = cookies.find(c => c.name === 'orbit_session');
  check('session cookie set', !!session);
  check('session cookie HttpOnly', session?.httpOnly === true);
  check('session cookie SameSite=Lax', session?.sameSite === 'Lax');

  // 14. LogoutButton UI: intercepted BFF failures stay stable, then succeed
  const logoutRoute = async (handler) => {
    await page.unroute('**/api/auth/logout').catch(() => {});
    await page.route('**/api/auth/logout', handler);
  };
  const clickSignOut = async () => {
    const menuBtn = page.getByRole('button', { name: 'User menu' });
    // The menu may still be open from a previous failed attempt: only open
    // it when closed, never toggle blindly.
    if ((await menuBtn.getAttribute('aria-expanded')) !== 'true') await menuBtn.click();
    await page.getByTestId('user-menu').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: 'Sign out' }).click();
  };
  const expectSignOutError = async (label) => {
    await clickSignOut();
    await alertEl().waitFor();
    const t = (await alertText()) ?? '';
    if (process.env.E2E_DEBUG) console.log('DBG', label, JSON.stringify(await page.getByRole('alert').first().evaluate(el => el.outerHTML).catch(() => 'NONE')), page.url());
    check(`${label}: error shown, stays on workspace`, /could not be completed/i.test(t) && page.url() === BASE + '/', `${t} @ ${page.url()}`);
  };
  await logoutRoute((r) => r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'Invalid request origin.' }) }));
  await expectSignOutError('logout BFF 403');
  await logoutRoute((r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) }));
  await expectSignOutError('logout BFF 500');
  await logoutRoute((r) => r.abort());
  await expectSignOutError('logout network failure');
  await logoutRoute((r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Logged out successfully.' }) }));
  await expectSignOutError('logout malformed 200 (no localCleared)');
  await logoutRoute((r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'x', localCleared: true, revoked: false }) }));
  await clickSignOut();
  await page.waitForURL((u) => u.href.includes('/login'), { timeout: 10000 });
  check('logout revoked=false shows unconfirmed notice', page.url().includes('logout-unconfirmed'), page.url());
  // invalid revoked value (string) after explicit local clear: unconfirmed
  await logoutRoute((r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'x', localCleared: true, revoked: 'yes' }) }));
  await clickSignOut();
  await page.waitForURL((u) => u.href.includes('/login'), { timeout: 10000 });
  check('logout revoked=invalid-string treated as unconfirmed', page.url().includes('logout-unconfirmed'), page.url());
  // missing revoked after explicit local clear: unconfirmed
  await login('demo@orbit.example', 'orbit-demo-password');
  await page.waitForURL((u) => u.pathname === '/');
  await logoutRoute((r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'x', localCleared: true }) }));
  await clickSignOut();
  await page.waitForURL((u) => u.href.includes('/login'), { timeout: 10000 });
  check('logout revoked=missing treated as unconfirmed', page.url().includes('logout-unconfirmed'), page.url());
  // no-token result (revoked: null) is a normal confirmed sign-out
  await login('demo@orbit.example', 'orbit-demo-password');
  await page.waitForURL((u) => u.pathname === '/');
  await logoutRoute((r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'x', localCleared: true, revoked: null }) }));
  await clickSignOut();
  await page.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 10000 });
  check('logout revoked=null treated as confirmed', page.url() === BASE + '/login', page.url());
  await page.unroute('**/api/auth/logout').catch(() => {});

  // 15. Real confirmed logout against mock
  await login('demo@orbit.example', 'orbit-demo-password');
  await page.waitForURL((u) => u.pathname === '/');
  await clickSignOut();
  await page.waitForURL((u) => u.pathname.startsWith('/login'));
  check('logout redirects to /login (confirmed)', !page.url().includes('logout-unconfirmed'), page.url());
  check('session cookie cleared after logout', !(await ctx.cookies(BASE)).find(c => c.name === 'orbit_session' && c.value));

  // 16. Invalid token: expired notice via ClearSession
  await ctx.addCookies([{ name: 'orbit_session', value: 'bogus-token', domain: '127.0.0.1', path: '/', httpOnly: true }]);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForURL((u) => u.href.includes('/login'), { timeout: 10000 });
  await alertEl().waitFor();
  check('invalid token redirects with expired notice', page.url().includes('notice=expired'), page.url());
  check('expired notice visible', /expired/i.test(await alertText() ?? ''));

  // 17. /me inactive session: distinct inactive notice (not a login 403)
  await ctx.addCookies([{ name: 'orbit_session', value: 'demo-inactive-token-00000000-0000-0000-0000-000000000000', domain: '127.0.0.1', path: '/', httpOnly: true }]);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForURL((u) => u.href.includes('/login'), { timeout: 10000 });
  await alertEl().waitFor();
  check('/me inactive redirects with inactive notice', page.url().includes('notice=inactive'), page.url());
  check('inactive notice visible', /inactive/i.test(await alertText() ?? ''));

  // 18. ClearSession resilience: two failures then successful manual retry
  await logoutRoute((r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
  await ctx.addCookies([{ name: 'orbit_session', value: 'bogus-token', domain: '127.0.0.1', path: '/', httpOnly: true }]);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500); // auto attempt + one auto retry
  const retryBtn = page.getByRole('button', { name: 'Try again' }).first();
  await retryBtn.waitFor();
  check('clear-session stops with manual retry after failures', page.url() === BASE + '/', page.url());
  const clearHeader = { 'Set-Cookie': 'orbit_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' };
  await logoutRoute((r) => r.fulfill({ status: 200, contentType: 'application/json', headers: clearHeader, body: JSON.stringify({ message: 'x', localCleared: true, revoked: null }) }));
  await retryBtn.click();
  await page.waitForURL((u) => u.href.includes('/login'), { timeout: 10000 });
  check('manual retry clears session and redirects', page.url().includes('notice=expired'), page.url());
  await page.unroute('**/api/auth/logout').catch(() => {});
  await page.getByLabel('Work email').waitFor(); // settled on the login form, no pending ClearSession
  // malformed 200 also counts as failure
  await logoutRoute((r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'x' }) }));
  await ctx.addCookies([{ name: 'orbit_session', value: 'bogus-token', domain: '127.0.0.1', path: '/', httpOnly: true }]);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Try again' }).first().waitFor();
  check('clear-session malformed 200 treated as failure', page.url() === BASE + '/', page.url());
  await page.unroute('**/api/auth/logout').catch(() => {});

  // 19. Logout BFF with backend down: honest outcomes
  let res2 = await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { Origin: BASE, Cookie: 'orbit_session=bogus-token' } });
  let j2 = await res2.json();
  check('logout with rejected revocation reports revoked=false, localCleared=true', res2.ok && j2.localCleared === true && j2.revoked === false, JSON.stringify(j2));
  check('logout still clears local cookie', (res2.headers.get('set-cookie') ?? '').includes('orbit_session=;'));
  res2 = await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { Origin: BASE } });
  j2 = await res2.json();
  check('logout without token reports revoked=null, localCleared=true', res2.ok && j2.localCleared === true && j2.revoked === null, JSON.stringify(j2));

  // 20. Backend down at login: safe unavailable message
  mockChild.kill();
  await new Promise(r => setTimeout(r, 500));
  await login('demo@orbit.example', 'orbit-demo-password');
  await alertEl().waitFor();
  check('backend-down login shows unavailable', /unavailable|network/i.test(await alertText() ?? ''));

  // 21. Backend down on workspace: unavailable card, no redirect loop
  await ctx.addCookies([{ name: 'orbit_session', value: 'bogus-token', domain: '127.0.0.1', path: '/', httpOnly: true }]);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  check('backend-down workspace shows unavailable, no loop', page.url() === BASE + '/' && /unavailable/i.test((await page.textContent('body')) ?? ''), page.url());

  // 22. Real logout with backend down via UI: unconfirmed notice, no loop
  const mockChild2 = spawnBg([mockScript]);
  await waitForServer(`${MOCK}/api/v1/auth/me`, mockChild2);
  await login('demo@orbit.example', 'orbit-demo-password');
  await page.waitForURL((u) => u.pathname === '/');
  mockChild2.kill();
  await new Promise(r => setTimeout(r, 500));
  await clickSignOut();
  await page.waitForURL((u) => u.href.includes('/login'), { timeout: 10000 });
  check('logout with backend down shows unconfirmed notice', page.url().includes('logout-unconfirmed'), page.url());
  await alertEl().waitFor();
  check('unconfirmed logout notice visible', /could not confirm/i.test(await alertText() ?? ''));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForURL((u) => u.pathname.startsWith('/login'));
  check('no redirect loop after unconfirmed logout', page.url().startsWith(BASE + '/login'), page.url());

  // 23. Mobile screenshots
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mp = await mctx.newPage();
  await mp.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await mp.getByLabel('Work email').waitFor();
  await mp.mouse.move(5, 5);
  await shot(mp, '05-login-mobile-light');
  await mp.getByTitle('Dark').click();
  await mp.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await mp.waitForTimeout(600);
  await mp.mouse.move(5, 5);
  await shot(mp, '06-login-mobile-dark');

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
