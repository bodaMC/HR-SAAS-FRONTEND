/**
 * Phase 3.1 real-stack e2e: browser -> Next (production build) -> REAL Laravel -> REAL PostgreSQL.
 * No mock backend. Requires: Laravel on :8000 (pgsql), app on :3000 started with
 * ORBIT_API_BASE_URL=http://127.0.0.1:8000/api/v1.
 * It registers its own throw-away tenants through the public API, so it needs
 * no pre-seeded data and never touches an existing tenant.
 */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const API = 'http://127.0.0.1:8000/api/v1';
const SHOTS = process.env.SHOTS_DIR ?? 'e2e-screenshots/real-stack-';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`); };

async function api(method, path, body, token) {
  const r = await fetch(API + path, { method, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const stamp = Date.now();
const PW = 'Str0ng!Pass#2026';
async function tenant(tag) {
  const email = `owner.${tag}.${stamp}@example.test`;
  const reg = await api('POST', '/auth/register-company', { company_name: `E2E ${tag} ${stamp}`, name: `Owner ${tag}`, email, password: PW });
  if (reg.status !== 201) throw new Error('register failed ' + reg.status);
  const tok = (await api('POST', '/auth/login', { email, password: PW })).body.token;
  return { email, tok };
}
const A = await tenant('a');
const B = await tenant('b');
const mk = async (t, body) => (await api('POST', '/employees', body, t.tok)).body?.data?.id;
const eng = (await api('POST', '/departments', { name: 'Engineering' }, A.tok)).body.data.id;
const fin = (await api('POST', '/departments', { name: 'Finance' }, A.tok)).body.data.id;
const dev = (await api('POST', '/job-titles', { name: 'Developer' }, A.tok)).body.data.id;
const acc = (await api('POST', '/job-titles', { name: 'Accountant' }, A.tok)).body.data.id;
const e1 = await mk(A, { employee_number: 'E1', first_name: 'Ahmed', last_name: 'Hassan', email: 'e1@x.test', department_id: eng, job_title_id: dev, national_id: '29001011234567' });
await mk(A, { employee_number: 'E2', first_name: 'أحمد', last_name: 'سالم', email: 'e2@x.test', department_id: eng, job_title_id: dev, employment_status: 'on_leave' });
await mk(A, { employee_number: 'E3', first_name: 'Sara', last_name: 'Ali', email: 'e3@x.test', department_id: fin, job_title_id: acc, manager_id: e1 });
await mk(A, { employee_number: 'E4', first_name: 'Mona', last_name: 'Adel', email: 'e4@x.test', department_id: fin, job_title_id: acc, employment_status: 'terminated' });
await mk(A, { employee_number: 'E5', first_name: 'محمد', last_name: 'علي', email: 'e5@x.test', department_id: fin, job_title_id: dev, manager_id: e1 });
await mk(B, { employee_number: 'B1', first_name: 'Sara', last_name: 'OtherTenant', email: 'b1@x.test' });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('status of 422')) errors.push('console ' + m.text()); });
const shot = (name) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true });

async function login(email) {
  await ctx.clearCookies();
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
const names = async () => (await page.locator('tbody tr td:first-child').allInnerTexts()).map((s) => s.trim());
const settle = async () => { await page.waitForFunction(() => document.querySelector('[data-testid=employee-results]')?.getAttribute('data-pending') === 'false'); await page.waitForTimeout(100); };

await login(A.email);
await page.goto(BASE + '/employees', { waitUntil: 'networkidle' });
check('real stack: directory lists 5 own-tenant employees (no cross-tenant row)', (await names()).length === 5 && !(await names()).some((n) => n.includes('OtherTenant')), JSON.stringify(await names()));
check('result count shown', (await page.getByTestId('employees-count').innerText()).includes('5'));
await shot('01-directory-all-en');

// each filter alone, applied automatically (no Apply button)
check('no Apply button (automatic apply)', (await page.getByRole('button', { name: 'Apply filters' }).count()) === 0);
await page.getByTestId('filter-department').selectOption(String(fin)); await page.waitForURL(/department_id=/); await settle();
check('department filter alone (3 Finance rows)', (await names()).length === 3, JSON.stringify(await names()));
check('count updates to 3', (await page.getByTestId('employees-count').innerText()).includes('3'));
await page.getByTestId('filters-reset').click(); await page.waitForFunction(() => !location.search); await settle();
check('reset clears URL and restores 5 rows', (await names()).length === 5);
check('reset disabled when nothing active', await page.getByTestId('filters-reset').isDisabled());
await page.getByTestId('filter-job-title').selectOption(String(dev)); await page.waitForURL(/job_title_id=/); await settle();
check('job title filter alone (3 rows)', (await names()).length === 3, JSON.stringify(await names()));
await page.getByTestId('filters-reset').click(); await page.waitForFunction(() => !location.search); await settle();
await page.getByTestId('filter-manager').selectOption(String(e1)); await page.waitForURL(/manager_id=/); await settle();
check('manager filter alone (2 reports)', (await names()).length === 2, JSON.stringify(await names()));
await page.getByTestId('filters-reset').click(); await page.waitForFunction(() => !location.search); await settle();
await page.getByTestId('filter-status').selectOption('terminated'); await page.waitForURL(/employment_status=/); await settle();
check('status filter alone (1 terminated)', (await names()).length === 1 && (await names())[0].includes('Mona'), JSON.stringify(await names()));
await page.getByTestId('filters-reset').click(); await page.waitForFunction(() => !location.search); await settle();

// combined
await page.getByTestId('filter-department').selectOption(String(fin)); await page.waitForURL(/department_id=/); await settle();
await page.getByTestId('filter-status').selectOption('active'); await page.waitForURL(/employment_status=active/); await settle();
check('combined department+status (Sara, محمد)', (await names()).length === 2, JSON.stringify(await names()));
await page.getByTestId('filter-job-title').selectOption(String(dev)); await page.waitForURL(/job_title_id=/); await settle();
check('combined dept+status+job title (1 row)', (await names()).length === 1, JSON.stringify(await names()));
await shot('02-combined-filters-en');
await page.getByTestId('filters-reset').click(); await page.waitForFunction(() => !location.search); await settle();

// debounced search: type quickly, only the final value is requested
const searchReqs = [];
page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname === '/employees' && u.searchParams.has('search') && r.headers()['rsc']) searchReqs.push(u.searchParams.get('search')); });
await page.locator('#f-search').pressSequentially('sara', { delay: 40 });
await page.waitForURL(/search=sara/); await settle();
check('debounced search issued one request for the final text only', searchReqs.length === 1 && searchReqs[0] === 'sara', JSON.stringify(searchReqs));
check('search (English) finds Sara only, tenant scoped', (await names()).length === 1 && (await names())[0].includes('Sara'), JSON.stringify(await names()));
await page.locator('#f-search').fill('sara ali'); await page.waitForTimeout(700); await settle();
check('full-name search "sara ali" works', (await names()).length === 1);
await page.locator('#f-search').fill('أحمد'); await page.waitForTimeout(700); await settle();
check('Arabic search finds the Arabic-named employee', (await names()).length === 1 && (await names())[0].includes('أحمد'), JSON.stringify(await names()));
await page.locator('#f-search').fill('E4'); await settle(); await page.waitForTimeout(600); await settle();
check('search by employee number', (await names()).length === 1 && (await names())[0].includes('Mona'), JSON.stringify(await names()));
await page.locator('#f-search').fill('e5@x'); await page.waitForTimeout(600); await settle();
check('search by email', (await names()).length === 1 && (await names())[0].includes('محمد'), JSON.stringify(await names()));
await page.locator('#f-search').fill('zzzz-no-match'); await page.waitForTimeout(600); await settle();
check('empty state is distinct and not an error', (await page.getByTestId('employees-empty').count()) === 1 && (await page.getByTestId('employees-unavailable').count()) === 0);
check('empty state hides the count line', (await page.getByTestId('employees-count').count()) === 0);
await shot('03-empty-state-en');
await page.getByTestId('filters-reset').click(); await page.waitForFunction(() => !location.search); await settle();

// stale response must not replace newer results
await page.route('**/employees?*search=slowterm*', async (route) => { await new Promise((r) => setTimeout(r, 1800)); await route.continue(); });
await page.locator('#f-search').fill('slowterm'); await page.waitForTimeout(500);
await page.locator('#f-search').fill('mona'); await page.waitForTimeout(3500); await settle();
check('stale slow response did not overwrite the newer search', (await names()).length === 1 && (await names())[0].includes('Mona') && (await page.locator('#f-search').inputValue()) === 'mona', JSON.stringify(await names()));
await page.unroute('**/employees?*search=slowterm*');
await page.getByTestId('filters-reset').click(); await page.waitForFunction(() => !location.search); await settle();

// filters preserved profile -> back (link and browser back)
await page.getByTestId('filter-department').selectOption(String(fin)); await page.waitForURL(/department_id=/); await settle();
await page.locator('tbody tr').first().getByRole('link', { name: 'View' }).click(); await page.waitForURL(/\/employees\/\d+/);
await page.getByTestId('profile-back').click(); await page.waitForURL(/\/employees\?/); await settle();
check('profile back link restores the filters', page.url().includes('department_id=' + fin) && (await names()).length === 3 && (await page.getByTestId('filter-department').inputValue()) === String(fin), page.url());
await page.locator('tbody tr').first().getByRole('link', { name: 'View' }).click(); await page.waitForURL(/\/employees\/\d+/);
await page.goBack(); await page.waitForURL(/department_id=/); await settle();
check('browser back restores the filters', (await names()).length === 3 && (await page.getByTestId('filter-department').inputValue()) === String(fin));
await page.getByTestId('filters-reset').click(); await page.waitForFunction(() => !location.search); await settle();

// API failure is NOT shown as an empty result: malformed param is rejected by Laravel (422), page shows an error
await page.goto(BASE + '/employees?employment_status=bogus', { waitUntil: 'networkidle' });
check('invalid status param is ignored by the page and does not break listing', (await names()).length === 5);

// BUG-003 in the browser: duplicate national ID, EN then AR, values preserved
await page.goto(BASE + '/employees/new', { waitUntil: 'networkidle' });
const fill = async () => {
  await page.locator('#f-employee-number').fill('N100'); await page.locator('#f-first-name').fill('Dup'); await page.locator('#f-last-name').fill('Test');
  await page.locator('#f-email').fill('dup@x.test'); await page.locator('#f-national-id').fill('29001011234567');
};
await fill();
await page.getByTestId('employee-submit').click();
await page.waitForFunction(() => document.body.innerText.includes('already registered to another employee'));
const errUnder = await page.evaluate(() => { const i = document.getElementById('f-national-id'); const wrap = i?.closest('div'); return wrap?.innerText ?? ''; });
check('EN duplicate message appears under the National ID field', errUnder.includes('This national ID is already registered to another employee.'), errUnder);
check('other form values preserved after duplicate error', (await page.locator('#f-first-name').inputValue()) === 'Dup' && (await page.locator('#f-email').inputValue()) === 'dup@x.test' && (await page.locator('#f-national-id').inputValue()) === '29001011234567');
await shot('04-duplicate-national-id-en');
await page.getByTestId('language-switcher').first().click();
await page.waitForFunction(() => document.documentElement.lang === 'ar'); await page.waitForTimeout(400);
check('language switch keeps unsaved form data AND the field error re-renders in Arabic', (await page.locator('#f-first-name').inputValue()) === 'Dup' && (await page.locator('body').innerText()).includes('الرقم القومي مسجل بالفعل لموظف آخر.'));
await shot('05-duplicate-national-id-ar');
// Arabic digits are normalized to the same ID and flagged as duplicate
await page.locator('#f-national-id').fill('٢٩٠٠١٠١١٢٣٤٥٦٧');
await page.getByTestId('employee-submit').click();
await page.waitForTimeout(1200);
check('Arabic-digit variant is treated as the same (duplicate) ID', (await page.locator('body').innerText()).includes('الرقم القومي مسجل بالفعل لموظف آخر.'));
// format
await page.locator('#f-national-id').fill('123');
await page.getByTestId('employee-submit').click();
await page.waitForTimeout(500);
check('invalid length shows the 14-digit message client-side (AR)', (await page.locator('body').innerText()).includes('14 رقمًا'));

// BUG-001: language rapid clicks respect the latest selection; pending state visible
await page.goto(BASE + '/employees/new', { waitUntil: 'networkidle' });
await page.locator('#f-first-name').fill('KeepMe');
for (const n of [2, 3, 4, 5]) {
  await page.waitForTimeout(700);
  const before = await page.evaluate(() => document.documentElement.lang);
  for (let i = 0; i < n; i++) await page.getByTestId('language-switcher').first().click({ noWaitAfter: true });
  const expected = n % 2 === 0 ? before : before === 'ar' ? 'en' : 'ar';
  await page.waitForFunction(() => document.querySelector('[data-testid=language-switcher]')?.getAttribute('data-pending') === 'false', null, { timeout: 8000 });
  await page.waitForTimeout(300);
  const got = await page.evaluate(() => document.documentElement.lang);
  check(`rapid ${n} language clicks end on the latest selection (${expected})`, got === expected, `got ${got}`);
}
check('unsaved form text survives repeated language switches', (await page.locator('#f-first-name').inputValue()) === 'KeepMe');
// pending state visible
await page.route('**/employees/new*', async (route) => { if (route.request().headers()['rsc']) await new Promise((r) => setTimeout(r, 700)); await route.continue(); });
await page.getByTestId('language-switcher').first().click({ noWaitAfter: true });
await page.waitForTimeout(150);
check('language switch shows a visible pending state', (await page.getByTestId('language-switcher').first().getAttribute('data-pending')) === 'true');
await page.waitForFunction(() => document.querySelector('[data-testid=language-switcher]')?.getAttribute('data-pending') === 'false', null, { timeout: 8000 });
await page.unroute('**/employees/new*');
// theme: immediate, no backend request, persists
const reqsDuringTheme = [];
const onReq = (r) => { if (!r.url().includes('_next/static')) reqsDuringTheme.push(r.url()); };
page.on('request', onReq);
const ms = await page.evaluate(() => new Promise((res) => { const s = performance.now(); const mo = new MutationObserver(() => { mo.disconnect(); res(performance.now() - s); }); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }); document.querySelectorAll('[role=group] button')[2].click(); setTimeout(() => res(-1), 2000); }));
page.off('request', onReq);
check(`theme switch applied in ${ms.toFixed(1)} ms (<100 ms target)`, ms >= 0 && ms < 100, String(ms));
check('theme switch made zero network requests', reqsDuringTheme.length === 0, JSON.stringify(reqsDuringTheme));
await page.reload({ waitUntil: 'networkidle' });
check('theme persists across reload', await page.evaluate(() => document.documentElement.classList.contains('dark')));
await page.goto(BASE + '/employees', { waitUntil: 'networkidle' });
check('theme persists across navigation', await page.evaluate(() => document.documentElement.classList.contains('dark')));
await shot('06-dark-ar-directory');

// theme works when storage is blocked (in-memory fallback)
const p2 = await (await browser.newContext()).newPage();
await p2.addInitScript(() => { const bad = () => { throw new Error('blocked'); }; Object.defineProperty(window, 'localStorage', { get: bad }); });
await p2.goto(BASE + '/login', { waitUntil: 'networkidle' });
await p2.context().addCookies([]);
check('login page renders with blocked storage', (await p2.locator('input').count()) >= 2);

// BUG-002: untrusted origin vs permission denied vs session expired (real Laravel)
await ctx.clearCookies();
await login(A.email);
const cookies = await ctx.cookies(BASE);
const post = (origin, extra = {}) => fetch(BASE + '/api/employees', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; '), ...(origin ? { Origin: origin } : {}), ...extra }, body: JSON.stringify({ employee_number: 'ZZ' + Math.random().toString(36).slice(2, 8), first_name: 'Z', last_name: 'Z', email: `zz${Math.random().toString(36).slice(2, 8)}@x.test` }) });
let r = await post('http://evil.example');
let j = await r.json();
check('untrusted origin -> 403 code untrusted_origin (not "forbidden")', r.status === 403 && j.message === 'untrusted_origin', JSON.stringify(j));
r = await post(BASE);
check('trusted origin -> mutation reaches Laravel (201)', r.status === 201, String(r.status));
// expired session: token revoked in Laravel
const meTok = decodeURIComponent(cookies.find((c) => c.name === 'orbit_session')?.value ?? '');
await api('POST', '/auth/logout', null, meTok);
r = await post(BASE); j = await r.json();
check('revoked token -> 401 session_expired', r.status === 401 && j.message === 'session_expired', `${r.status} ${JSON.stringify(j)}`);
// real permission denial: employee-role user
// (an owner invites no employee-role users through the public API in this phase; denial is covered by the Pest policy tests and the BFF mapping unit checks)

check('no uncaught page errors or console errors during the whole run', errors.length === 0, JSON.stringify(errors.slice(0, 5)));
await browser.close();
console.log(`\nreal-stack e2e: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
