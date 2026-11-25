/**
 * Phase 3.1 measurement script (real Laravel + PostgreSQL, production build, localhost).
 * Reports measured numbers only; conditions are documented in the report.
 * Run scripts/log-proxy.mjs first and point the app at it (ORBIT_API_BASE_URL=http://127.0.0.1:8001/api/v1); PROXY_LOG is the proxy log path.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const BASE = 'http://127.0.0.1:3000', API = 'http://127.0.0.1:8000/api/v1';
const LOG = process.env.PROXY_LOG ?? 'perf-proxy.log';
const PW = 'Str0ng!Pass#2026'; const email = `perf.${Date.now()}@example.test`;
const j = async (m, p, b, t) => { const r = await fetch(API + p, { method: m, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); return r.json().catch(() => null); };
await j('POST', '/auth/register-company', { company_name: 'Perf ' + email, name: 'Perf', email, password: PW });
const tok = (await j('POST', '/auth/login', { email, password: PW })).token;
const d = (await j('POST', '/departments', { name: 'D' }, tok)).data.id;
let first;
for (let i = 0; i < 60; i++) { const r = await j('POST', '/employees', { employee_number: 'P' + i, first_name: 'Emp' + i, last_name: 'X', email: `p${i}@x.test`, department_id: d }, tok); first ??= r.data.id; }
const lines = () => readFileSync(LOG, 'utf8').split('\n').filter((l) => /\/api\/v1\//.test(l) && /\[\d{3}\]/.test(l));
const calls = (from) => lines().slice(from).map((l) => l.replace(/^.*\[\d{3}\]: (GET|POST|PUT|DELETE) /, '$1 ').replace(/\?.*/, '').replace(/\d+$/, '{id}'));
const summarize = (arr) => { const m = {}; arr.forEach((x) => (m[x] = (m[x] ?? 0) + 1)); return m; };
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage();
await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
await page.getByLabel('Work email').fill(email); await page.getByLabel('Password', { exact: true }).fill(PW);
await page.getByRole('button', { name: 'Sign in' }).click(); await page.waitForURL((u) => !u.pathname.startsWith('/login')); await page.waitForLoadState('networkidle');
await page.waitForTimeout(1500); // let the post-login render finish so it is not counted
const out = [];
for (const [name, path, ready] of [['dashboard', '/', 'main'], ['employees', '/employees', 'tbody tr'], ['departments', '/departments', 'h1'], ['job-titles', '/job-titles', 'h1'], ['profile', '/employees/' + first, 'h1']]) {
  // soft (client) navigation: click the sidebar link when present, else history push via router link
  const n0 = lines().length; const t0 = Date.now();
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await page.waitForSelector(ready); await page.waitForLoadState('networkidle');
  out.push({ nav: name + ' (full load)', ms: Date.now() - t0, upstream: summarize(calls(n0)) });
}
for (const [name, text, ready] of [['dashboard -> employees', 'Employees', 'tbody tr'], ['employees -> departments', 'Departments', 'h1'], ['departments -> job-titles', 'Job Titles', 'h1'], ['job-titles -> dashboard', 'Dashboard', 'main']]) {
  const n0 = lines().length; const t0 = Date.now();
  await page.locator('aside a', { hasText: text }).first().click(); await page.waitForSelector(ready); await page.waitForLoadState('networkidle');
  out.push({ nav: name + ' (sidebar, client nav)', ms: Date.now() - t0, upstream: summarize(calls(n0)) });
}
// language + theme timings
await page.goto(BASE + '/employees', { waitUntil: 'networkidle' });
const n0 = lines().length; const t0 = Date.now();
await page.getByTestId('language-switcher').first().click(); await page.waitForFunction(() => document.documentElement.lang === 'ar'); await page.waitForFunction(() => document.querySelector('[data-testid=language-switcher]')?.getAttribute('data-pending') === 'false');
out.push({ nav: 'language switch en->ar (employees page)', ms: Date.now() - t0, upstream: summarize(calls(n0)) });
console.log(JSON.stringify(out, null, 1)); await b.close();
