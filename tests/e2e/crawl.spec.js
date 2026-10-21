// UI robustness tests: every role × every screen at desktop and phone width, bad deep links, double submission.
import { tcE2E, login, expect, test } from './helpers.js';
import { apiAs } from './api.js';

const ROLES = ['admin', 'reception', 'dr.sharma', 'lab', 'pharmacy', 'billing'];
const ROUTES = ['/', '/patients', '/patients/1', '/appointments', '/queue', '/consultation', '/lab', '/pharmacy', '/pharmacy?tab=alerts', '/beds',
  '/admissions/1', '/billing', '/billing?tab=invoices', '/billing/invoices/1', '/reports', '/doctors', '/users', '/audit', '/print/invoice/1', '/print/receipt/1'];
const BAD_LINKS = ['/patients/99999', '/patients/abc', '/admissions/abc', '/admissions/99999', '/billing/invoices/0', '/billing/invoices/99999', '/print/receipt/xyz', '/print/invoice/99999', '/no-such-page'];

// Noise that is not an application error: blocked web-font requests in the sandbox and expected 4xx responses (403/404 pages are tested on purpose)
const IGNORE = /fonts\.(googleapis|gstatic)|ERR_TUNNEL|ERR_INTERNET|status of 4\d\d/;

function watch(page, sink) {
  const where = { route: '' };
  page.on('pageerror', (e) => sink.push(`${where.route}: page error ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) sink.push(`${where.route}: console ${m.text().slice(0, 160)}`); });
  return where;
}

async function visit(page, where, route) {
  where.route = route;
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  // let data requests settle: wait until no loading spinner is visible (max 5 s)
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(200);
}

tcE2E({
  id: 'ST-UI-01', level: 'System', fr: ['FR-03', 'FR-48', 'NFR-05'],
  title: 'Every screen renders for every role at desktop width without errors',
  input: `6 roles × ${ROUTES.length} routes at 1440 px (allowed pages and access-denied pages)`,
  expected: 'No uncaught exception or console error; each page shows content, an access-denied message or a not-found message (never a blank screen)',
}, async ({ page, note }) => {
  test.setTimeout(600_000);
  const problems = [];
  const where = watch(page, problems);
  let visits = 0;
  let denied = 0;
  for (const role of ROLES) {
    await login(page, role);
    for (const route of ROUTES) {
      await visit(page, where, route);
      visits += 1;
      const text = (await page.locator('body').innerText()).trim();
      if (text.length < 20) problems.push(`${role} ${route}: blank page`);
      if (/Access denied/.test(text)) denied += 1;
    }
  }
  note(`${visits} page visits (${denied} access-denied pages shown as designed); problems: ${problems.length ? problems.join(' | ') : 'none'}`);
  expect(problems).toEqual([]);
});

tcE2E({
  id: 'ST-UI-02', level: 'System', fr: ['NFR-05'],
  title: 'All screens fit a 390 px phone without horizontal page scrolling',
  input: `6 roles × ${ROUTES.length} routes at 390 × 844 px`,
  expected: 'document scroll width ≤ viewport width on every page (wide tables scroll inside their card)',
}, async ({ page, note }) => {
  test.setTimeout(600_000);
  const problems = [];
  const where = watch(page, problems);
  let visits = 0;
  let widest = 0;
  for (const role of ROLES) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, role);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ROUTES) {
      await visit(page, where, route);
      visits += 1;
      const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      widest = Math.max(widest, sw);
      if (sw > iw + 1) problems.push(`${role} ${route}: page is ${sw}px wide`);
    }
  }
  note(`${visits} page visits at 390 px; widest document ${widest}px; problems: ${problems.length ? problems.join(' | ') : 'none'}`);
  expect(problems).toEqual([]);
});

tcE2E({
  id: 'ST-UI-03', level: 'System', fr: ['FR-03', 'FR-12'],
  title: 'Broken or unauthorised deep links show a clear message instead of crashing',
  input: `Administrator opens ${BAD_LINKS.join(', ')}; receptionist opens /billing/invoices/1 and /users`,
  expected: '“Record not found” / “Page not found” / “Access denied” message with a way back; no page errors',
}, async ({ page, note }) => {
  const problems = [];
  const where = watch(page, problems);
  const seen = [];
  await login(page, 'admin');
  for (const route of BAD_LINKS) {
    await visit(page, where, route);
    const msg = await page.getByText(/Record not found|Page not found|not found/i).first().textContent().catch(() => null);
    if (!msg) problems.push(`${route}: no not-found message`);
    seen.push(`${route} → ${msg ? msg.trim().slice(0, 40) : 'NONE'}`);
  }
  await login(page, 'reception');
  for (const route of ['/billing/invoices/1', '/users']) {
    await visit(page, where, route);
    const denied = await page.getByText('Access denied').count();
    if (!denied) problems.push(`${route}: no access-denied message for receptionist`);
    seen.push(`reception ${route} → ${denied ? 'Access denied' : 'NONE'}`);
  }
  note(`${seen.join('; ')}; problems: ${problems.length ? problems.join(' | ') : 'none'}`);
  expect(problems).toEqual([]);
});

tcE2E({
  id: 'ST-UI-04', level: 'System', fr: ['FR-46', 'NFR-04'],
  title: 'Double-clicking “Record payment” records only one payment',
  input: 'Billing staff generates an OPD invoice, enters ₹1 in Record payment and double-clicks the submit button',
  expected: 'Exactly one payment of ₹1 and one receipt; the button is disabled while the request is in progress',
}, async ({ page, note }) => {
  const billing = await apiAs(page, 'billing');
  const pending = (await billing.get('/billing/pending')).find((x) => !x.admission_id);
  const inv = await billing.post('/billing/invoices', { patient_id: pending.patient_id });
  await login(page, 'billing');
  await page.goto(`/billing/invoices/${inv.id}`);
  await page.getByRole('button', { name: /Record payment/ }).first().click();
  await page.locator('input[name=amount]').fill('1');
  await page.getByTestId('submit-payment').dblclick();
  await expect(page.getByTestId('receipt-no')).toBeVisible();
  await page.waitForTimeout(800);
  const after = await billing.get(`/billing/invoices/${inv.id}`);
  note(`${inv.invoice_no}: ${after.payments.length} payment(s), paid ₹${after.paid_amount}, receipt ${after.payments.map((p) => p.receipt_no).join(', ')}`);
  expect(after.payments).toHaveLength(1);
  expect(after.paid_amount).toBe(1);
});
