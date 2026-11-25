/**
 * Phase 3.2 Roles & Permissions usability/performance with a LARGE registry (SIMULATED backend, MOCK_LARGE_REGISTRY=120 -> 4 groups x 120 extra
 * permissions + 300 users + 60 roles). Needs the production app on :3000 pointed at the mock on :4100. Persona: hr@orbit.example.
 * Measures wall time (ms) for render/search/open-editor; asserts the page stays responsive and usable (search narrows, editor scrolls inside the viewport, no horizontal overflow).
 */
import { chromium } from 'playwright';
const BASE = process.env.APP_BASE_URL ?? 'http://127.0.0.1:3000';
let pass = 0, fail = 0; const check = (n, ok, d = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  -> ' + d}`); };
const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000); await page.getByLabel('Work email').fill('hr@orbit.example'); await page.waitForTimeout(300); await page.getByLabel('Work email').fill('hr@orbit.example'); await page.getByLabel('Password', { exact: true }).fill('orbit-demo-password');
await page.getByRole('button', { name: 'Sign in' }).click(); await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 }).catch(async () => { console.log('LOGIN STUCK:', (await page.locator('body').innerText()).slice(0, 300)); process.exit(2); });
let t = Date.now(); await page.goto(BASE + '/access', { waitUntil: 'networkidle' }); await page.getByTestId('access-page').waitFor();
const loadMs = Date.now() - t; check(`Roles tab loads with 62 roles in ${loadMs} ms (<3000)`, loadMs < 3000 && (await page.locator('[data-testid^="role-open-"]').count()) >= 60);
await page.getByTestId('access-tab-permissions').click(); t = Date.now(); await page.getByTestId('permission-matrix').waitFor();
const n = await page.locator('input[data-perm]').count(); const renderMs = Date.now() - t;
check(`Permissions tab renders the large registry (${n} permissions) in ${renderMs} ms (<2000)`, n >= 480 && renderMs < 2000, `${n}/${renderMs}`);
t = Date.now(); await page.getByRole('searchbox').fill('bulk_042'); await page.waitForFunction(() => document.querySelectorAll('input[data-perm]').length <= 8); const searchMs = Date.now() - t;
check(`search narrows ${n} -> ${await page.locator('input[data-perm]').count()} in ${searchMs} ms (<1000)`, searchMs < 1000);
await page.getByRole('searchbox').fill('employees.view'); check('search by exact code finds employees.view', (await page.locator('input[data-perm="employees.view"]').count()) === 1);
await page.getByRole('searchbox').fill('');
await page.getByTestId('access-tab-roles').click(); await page.getByTestId('role-add').click();
t = Date.now(); await page.getByTestId('permission-matrix').waitFor(); const editMs = Date.now() - t;
check(`role editor opens with the full matrix in ${editMs} ms (<2000)`, editMs < 2000 && (await page.locator('[role=dialog] input[data-perm], dialog input[data-perm]').count()) >= 400);
const vp = page.viewportSize();
const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
check('no horizontal page overflow with the large matrix', !overflowX);
const dlg = page.locator('[role=dialog]').first(); const dbox = await dlg.boundingBox();
check('editor dialog stays inside the viewport (scrolls internally)', !!dbox && dbox.height <= vp.height + 1 && dbox.y >= -1, JSON.stringify(dbox));
await page.getByLabel(/name/i).first().fill('Large Role');
t = Date.now(); await page.locator('input[data-perm="employees.bulk_001"]').check(); const toggleMs = Date.now() - t;
check(`toggling a permission responds in ${toggleMs} ms (<500)`, toggleMs < 500);
await page.getByTestId('role-review').click(); await page.getByTestId('role-review-panel').waitFor();
check('review step lists the added permission', (await page.getByTestId('role-review-panel').innerText()).includes('employees.bulk_001'));
await page.screenshot({ path: 'e2e-screenshots/access-large-review.png' });
await page.keyboard.press('Escape');
await page.getByTestId('access-tab-users').click(); const users = await page.locator('[data-testid^="access-user-"]').count();
check(`user directory is paginated server-side: ${users} rows on page 1 (25 per page)`, users === 25);
check('accurate total shown for the whole tenant directory (303 accounts)', /303/.test(await page.getByTestId('users-total').innerText()));
await page.getByTestId('users-next').click(); await page.waitForFunction(() => /2/.test(document.querySelector('[data-testid="users-page"]')?.textContent ?? ''));
const p2first = await page.locator('[data-testid^="access-user-"]').first().innerText();
check('next page shows different accounts', users === 25 && !p2first.includes('Demo HR'));
await page.getByTestId('users-prev').click(); await page.waitForFunction(() => /1/.test(document.querySelector('[data-testid="users-page"]')?.textContent ?? ''));
t = Date.now(); await page.getByRole('searchbox').fill('bulk299'); await page.waitForFunction(() => document.querySelectorAll('[data-testid^="access-user-"]').length === 1); const uMs = Date.now() - t;
check(`server-side search finds an account far beyond the first page in ${uMs} ms (<1500)`, uMs < 1500);
check('search count reflects the filtered total', /^1\b|\b1\b/.test(await page.getByTestId('users-total').innerText()));
await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('searchbox').fill('');
await page.waitForFunction(() => document.documentElement.clientWidth <= 390);
await page.waitForFunction(() => document.querySelectorAll('[data-testid^="access-user-"]').length === 25);
const ov = await page.evaluate(() => { const w = document.documentElement.clientWidth; return { sw: document.documentElement.scrollWidth, w, offenders: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > w + 1 && !e.closest('[aria-hidden=true]')).slice(0, 40).filter((e) => !e.closest('header')).slice(0, 8).map((e) => `${e.tagName}.${String(e.className).slice(0, 60)}[${e.dataset.testid ?? ''}] right=${Math.round(e.getBoundingClientRect().right)}`) }; });
await page.screenshot({ path: 'e2e-screenshots/access-390.png' });
check('no horizontal overflow at 390 px with 300 users', ov.sw <= ov.w, JSON.stringify(ov));
check('no page errors', errs.length === 0, errs.join('|'));
console.log(`SUMMARY pass=${pass} fail=${fail}`); await browser.close(); process.exit(fail ? 1 : 0);
