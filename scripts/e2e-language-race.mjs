/**
 * Phase 3.2 language-switch race: root-cause repro + regression test. REAL stack (Next production build + real Laravel/PG).
 * No retries, no extended timeouts, no weakened assertions.
 * Clicks are dispatched with element.click() inside the page (RTL/LTR flips MIRROR the layout and move the button, so
 * coordinate-based Playwright clicks during a burst can miss; that was the harness-side cause of "wrong final locale").
 * Invariants checked every round (n rapid clicks, then settle):
 *  I1  every moment the control reports data-pending="false", document.lang equals the latest requested locale (cookie)
 *  I2  after the control reports idle, the rendered locale equals the cookie, and the cookie equals the parity of the clicks the page received
 *  I3  the rendered locale is still equal to the cookie 900 ms later (no late stale response)
 */
import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:3000', PW = 'Str0ng!Pass#2026', ROUNDS = Number(process.env.ROUNDS ?? 5), COOKIE = 'conure_locale';
const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }); await page.waitForLoadState('networkidle');
await page.getByLabel('Work email').fill('hr1.a@e2e.test'); await page.getByLabel('Password', { exact: true }).fill(PW);
await page.getByRole('button', { name: 'Sign in' }).click(); await page.waitForURL((u) => !u.pathname.startsWith('/login'));
await page.getByTestId('welcome-name').waitFor({ state: 'visible' });
const cookie = async () => (await ctx.cookies()).find((c) => c.name === COOKIE)?.value ?? null;
let i1 = 0, i2 = 0, i3 = 0, total = 0;
await page.evaluate(() => {
  window.__bad = 0; window.__idle = 0;
  const cur = () => (document.cookie.match(/(?:^|; )conure_locale=(ar|en)/) || [])[1] ?? null;
  window.__cur = cur;
  const watch = () => { const el = document.querySelector('[data-testid=language-switcher]'); if (!el) return;
    new MutationObserver(() => { if (el.getAttribute('data-pending') === 'false') { window.__idle++; if (cur() && document.documentElement.lang !== cur()) window.__bad++; } })
      .observe(el, { attributes: true, attributeFilter: ['data-pending'] }); };
  window.__watch = watch; watch();
});
for (let r = 0; r < ROUNDS; r++) for (const n of [2, 3, 4, 5]) {
  await page.waitForFunction(() => document.querySelector('[data-testid=language-switcher]')?.getAttribute('data-pending') === 'false');
  await page.waitForTimeout(400);
  const startReq = (await cookie()) ?? (await page.evaluate(() => document.documentElement.lang));
  await page.evaluate(() => { window.__bad = 0; window.__clicks = 0; });
  for (let i = 0; i < n; i++) await page.evaluate(() => { window.__clicks++; document.querySelector('[data-testid=language-switcher]').click(); });
  await page.waitForFunction(() => document.querySelector('[data-testid=language-switcher]')?.getAttribute('data-pending') === 'false', null, { timeout: 8000 });
  const lang = await page.evaluate(() => document.documentElement.lang), ck = await cookie(), clicks = await page.evaluate(() => window.__clicks);
  const expected = clicks % 2 === 0 ? startReq : startReq === 'ar' ? 'en' : 'ar';
  const bad = await page.evaluate(() => window.__bad);
  await page.waitForTimeout(900);
  const late = await page.evaluate(() => document.documentElement.lang);
  total++; if (bad > 0) i1++; if (lang !== ck || ck !== expected) i2++; if (late !== ck) i3++;
  console.log(`n=${n} clicks=${clicks} start=${startReq} expected=${expected} cookie=${ck} lang@idle=${lang} lang+900ms=${late} idleWhileStale=${bad}`);
}
console.log(`rounds=${total} I1-violations=${i1} I2-violations=${i2} I3-violations=${i3}`);

// ---- Phase 2: REAL pointer interactions. Before every click the switcher's CURRENT rendered box is re-read (after waiting for the box to
// stop moving, because LTR<->RTL mirrors the layout), then a real mouse click is made at its centre. A page-side counter proves each click landed.
let r1 = 0, r2 = 0, r3 = 0, rt = 0, missed = 0;
await page.evaluate(() => { window.__rc = 0; document.addEventListener('click', (e) => { if (e.target.closest?.('[data-testid=language-switcher]')) window.__rc++; }, true); });
const stableBox = async () => page.evaluate(() => new Promise((res) => { const el = document.querySelector('[data-testid=language-switcher]'); let last = '', same = 0;
  const tick = () => { const b = el.getBoundingClientRect(), k = [b.x, b.y, b.width, b.height].map((v) => Math.round(v)).join(); same = k === last ? same + 1 : 0; last = k; if (same >= 3) res({ x: b.x, y: b.y, width: b.width, height: b.height }); else requestAnimationFrame(tick); }; tick(); }));
for (let r = 0; r < Number(process.env.ROUNDS2 ?? 3); r++) for (const n of [2, 3, 4]) {
  await page.waitForFunction(() => document.querySelector('[data-testid=language-switcher]')?.getAttribute('data-pending') === 'false');
  await page.waitForTimeout(400);
  const start = (await cookie()) ?? (await page.evaluate(() => document.documentElement.lang));
  await page.evaluate(() => { window.__rc = 0; window.__bad = 0; });
  const boxes = [];
  for (let i = 0; i < n; i++) { const b = await stableBox(); boxes.push(Math.round(b.x)); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
  await page.waitForFunction(() => document.querySelector('[data-testid=language-switcher]')?.getAttribute('data-pending') === 'false', null, { timeout: 8000 });
  const lang = await page.evaluate(() => document.documentElement.lang), ck = await cookie(), rc = await page.evaluate(() => window.__rc), bad = await page.evaluate(() => window.__bad);
  const expected = rc % 2 === 0 ? start : start === 'ar' ? 'en' : 'ar';
  await page.waitForTimeout(900); const late = await page.evaluate(() => document.documentElement.lang);
  rt++; if (rc !== n) missed++; if (bad) r1++; if (lang !== ck || ck !== expected) r2++; if (late !== ck) r3++;
  console.log(`[real mouse] n=${n} clicksReceived=${rc} buttonX=${JSON.stringify(boxes)} start=${start} expected=${expected} cookie=${ck} lang@idle=${lang} lang+900ms=${late}`);
}
console.log(`real-mouse rounds=${rt} missed-clicks=${missed} I1=${r1} I2=${r2} I3=${r3}`);
const ok2 = !(missed || r1 || r2 || r3);
const ok = !(i1 || i2 || i3) && ok2; console.log(ok ? 'PASS language race regression' : 'FAIL language race regression');
await browser.close(); process.exit(ok ? 0 : 1);
