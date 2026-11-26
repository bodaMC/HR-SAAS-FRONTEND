/**
 * Phase 3.3 account-lifecycle browser checks against the SIMULATED backend (scripts/mock-backend.mjs).
 * The mock only proves UI wiring and contract handling. Real behaviour is proven by scripts/e2e-real-stack-v33.mjs.
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

  const PW = 'orbit-demo-password';
  await login('hr@orbit.example', PW);
  await page.goto(BASE + '/employees/3', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('account-panel').waitFor();
  check('HR sees account panel in no_login state', (await page.getByTestId('account-state').getAttribute('data-state')) === 'no_login');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('account-create').click();
  check('create: confirm disabled until the target is confirmed', await page.getByTestId('account-dialog-confirm').isDisabled());
  await page.getByTestId('account-dialog-target-confirm').check();
  await page.getByTestId('account-dialog-confirm').click();
  await page.getByTestId('account-temp-password').waitFor();
  const temp = (await page.getByTestId('account-temp-password').textContent()) ?? '';
  check('temporary password shown once after create', temp.length >= 8);
  await shot(page, 'acc-01-temp-password-en');
  await page.getByTestId('account-onetime-done').click();
  check('temporary password gone after Done', (await page.getByTestId('account-temp-password').count()) === 0 && !(await page.content()).includes(temp));
  await page.reload({ waitUntil: 'domcontentloaded' });
  check('state is password_change_required after reload', (await page.getByTestId('account-state').getAttribute('data-state')) === 'password_change_required');
  check('temporary password not present after reload', !(await page.content()).includes(temp));
  await page.getByTestId('account-deactivate').click();
  await page.locator('#acc-reason').fill('short');
  await page.getByTestId('account-dialog-target-confirm').check();
  check('deactivate: confirm disabled while the reason is under 10 characters', await page.getByTestId('account-dialog-confirm').isDisabled());
  await page.locator('#acc-reason').fill('Account paused during investigation');
  await page.getByTestId('account-dialog-confirm').click();
  await page.waitForFunction(() => document.querySelector('[data-testid=account-state]')?.getAttribute('data-state') === 'inactive');
  check('deactivate moves state to inactive', true);
  await shot(page, 'acc-02-inactive-en');
  // FINAL-V2: unlink switches the account off, then the minimal Link picker re-links it (stays inactive until activated).
  await page.getByTestId('account-unlink').click();
  check('unlink dialog explains the account is switched off and roles are not restored', /switched off/.test((await page.getByTestId('account-dialog-body').textContent()) ?? ''));
  await page.locator('#acc-reason').fill('Employee moved to a contractor agreement');
  await page.getByTestId('account-dialog-target-confirm').check();
  await page.getByTestId('account-dialog-confirm').click();
  await page.waitForFunction(() => document.querySelector('[data-testid=account-state]')?.getAttribute('data-state') === 'no_login');
  check('unlink returns the employee to no_login', true);
  await page.getByTestId('account-link').click();
  await page.getByTestId('account-link-picker').waitFor();
  await page.locator('[data-testid^=account-link-candidate-]').first().waitFor();
  check('link picker lists only the minimal candidates (name and email)', (await page.locator('[data-testid^=account-link-candidate-]').count()) >= 2);
  check('link: confirm disabled until a candidate is picked', await page.getByTestId('account-dialog-confirm').isDisabled());
  await page.locator('#acc-link-search').fill('free.one');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^=account-link-candidate-]').length === 1);
  check('link picker search narrows the list', (await page.getByTestId('account-link-list').textContent())?.includes('free.one@mock.test') === true);
  await page.getByTestId('account-link-picker').locator('input[type=radio]').first().check();
  await page.locator('#acc-reason').fill('Re-linking the verified contractor login');
  await page.getByTestId('account-dialog-target-confirm').check();
  await shot(page, 'acc-05-link-picker-en');
  await page.getByTestId('account-dialog-confirm').click();
  await page.waitForFunction(() => document.querySelector('[data-testid=account-state]')?.getAttribute('data-state') === 'inactive');
  check('linking keeps the account inactive (activation is a separate step)', true);
  // HR own record: no Edit / Delete / Terminate in the UI, and the edit URL is blocked
  // HR must not see roles
  await page.goto(BASE + '/employees', { waitUntil: 'domcontentloaded' });
  const nav = await page.locator('nav').allTextContents();
  check('HR nav hides Roles & Permissions', !nav.join(' ').includes('Roles & Permissions') && !nav.join(' ').includes('Roles and Permissions'), nav.join(' ').slice(0, 200));
  await page.goto(BASE + '/access', { waitUntil: 'domcontentloaded' });
  check('HR /access is restricted in the UI', (await page.getByTestId('access-page').count()) === 0);
  // employee profile
  await login('demo@orbit.example', PW);
  await page.goto(BASE + '/employees/1', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('account-panel').waitFor();
  check('own record: Edit, Delete and Terminate are not offered', (await page.getByRole('link', { name: 'Edit' }).count()) === 0 && (await page.getByRole('button', { name: /Delete employee/ }).count()) === 0 && (await page.getByTestId('account-terminate').count()) === 0);
  check('own record: self note is shown', (await page.getByTestId('account-self-note').count()) === 1);
  await shot(page, 'acc-07-own-record-en');
  await page.goto(BASE + '/employees/1/edit', { waitUntil: 'domcontentloaded' });
  check('own record: direct edit URL is blocked in the UI', (await page.getByTestId('edit-self-blocked').count()) === 1);
  await login('employee@orbit.example', PW);
  await page.goto(BASE + '/profile', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('my-profile').waitFor();
  await page.getByLabel('Phone').fill('+20 100 000 1234');
  await page.getByTestId('profile-phone-save').click();
  await page.getByTestId('profile-phone-saved').waitFor();
  check('employee saves own phone', true);
  await page.setInputFiles('#picture-file', { name: 'p.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
  await page.getByTestId('picture-remove').waitFor();
  check('picture uploaded and remove offered', true);
  await shot(page, 'acc-03-my-profile-en');
  await page.getByTestId('picture-remove').click();
  await page.getByTestId('picture-remove').waitFor({ state: 'detached' });
  check('picture removed', (await page.getByTestId('picture-remove').count()) === 0);
  const profileText = (await page.getByTestId('my-profile').textContent()) ?? '';
  check('My Profile shows employment type, hire date and trainee read-only', /Employment type/.test(profileText) && /Hire date/.test(profileText) && /Trainee/.test(profileText) && (await page.locator('#employment_type, [name=employment_type], [name=hire_date]').count()) === 0, profileText.slice(0, 160));
  await shot(page, 'acc-06-my-profile-fields-en');
  await page.goto(BASE + '/employees/3', { waitUntil: 'domcontentloaded' });
  check('plain employee has no account panel', (await page.getByTestId('account-panel').count()) === 0);
  await page.goto(BASE + '/profile/password', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('change-password-page').waitFor();
  check('change password page renders', true);
  await shot(page, 'acc-04-change-password-en');
  // Arabic
  await page.goto(BASE + '/profile', { waitUntil: 'domcontentloaded' });
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
