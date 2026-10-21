// Acceptance tests (AT-*): complete business scenarios across roles, checked against the user requirements.
import { tcE2E, login, logout, shot, expect } from './helpers.js';
import { apiAs, newPatient, sharmaId, scheduledToday, serveQueueUntil } from './api.js';

const A = 'Acceptance';
const toast = (page, text) => page.getByTestId('toast-success').filter({ hasText: text }).first();
const shared = {}; // ids produced by AT-01 / AT-02 for the audit acceptance test (AT-05)

tcE2E({
  id: 'AT-01', level: A, fr: ['FR-12', 'FR-21', 'FR-24', 'FR-25', 'FR-26', 'FR-27', 'FR-28', 'FR-29', 'FR-32', 'FR-37', 'FR-44', 'FR-46'],
  title: 'OPD patient journey: check-in → consultation → lab → pharmacy → billing',
  input: "Today's scheduled patient of Dr. Sharma; reception marks urgent (fever 103°F); doctor prescribes Cetirizine and orders Haemoglobin; lab result 13.5 g/dL; pharmacy dispenses; billing settles in cash",
  expected: 'Each role completes its step from its own screen; patient history shows the visit COMPLETED and the invoice PAID',
}, async ({ page, note }) => {
  const appt = await scheduledToday(page);
  expect(appt, "a scheduled appointment exists for today").toBeTruthy();
  const doc = await sharmaId(page);
  shared.at01 = { patientId: appt.patient_id, patientCode: appt.patient_code };
  const steps = [];

  // 1. Reception: check in + urgent priority
  await login(page, 'reception');
  await page.goto('/appointments');
  await page.getByLabel('Doctor filter').selectOption(String(doc));
  await page.getByTestId(`checkin-${appt.id}`).click();
  await expect(toast(page, 'checked in')).toBeVisible();
  await page.goto(`/queue?doctor=${doc}`);
  await page.getByTestId(`urgent-${appt.id}`).click();
  await page.getByTestId('urgent-reason').fill('High fever (> 103°F)');
  await page.getByTestId('confirm-urgent').click();
  await expect(toast(page, 'Marked urgent')).toBeVisible();
  steps.push(`reception checked in ${appt.patient_code} and marked urgent`);
  await logout(page);

  // precondition: anyone still ahead in the queue (e.g. an earlier urgent patient) is served via the API
  const served = await serveQueueUntil(page, appt.id);

  // 2. Doctor: consultation
  await login(page, 'dr.sharma');
  await page.goto('/consultation');
  await page.getByTestId('call-next').click();
  await expect(page.getByTestId('consult-patient')).toHaveText(appt.patient_name);
  await page.locator('input[name="bp"]').fill('118/76');
  await page.locator('input[name="temperature"]').fill('103.1');
  await page.locator('textarea[name="symptoms"]').fill('High fever with sore throat since yesterday');
  await page.locator('#diagnosis').fill('Acute tonsillitis');
  await page.getByTestId('medicine-search').fill('Cetirizine');
  await page.getByRole('button', { name: /Cetirizine\s+10 mg/ }).first().click();
  await page.getByTestId('save-prescription').click();
  await expect(toast(page, 'Prescription saved')).toBeVisible();
  await page.getByTestId('order-labs').click();
  await page.getByTestId('lab-test-HB').check();
  await page.getByTestId('confirm-lab-order').click();
  await expect(toast(page, 'Lab tests ordered')).toBeVisible();
  await page.getByTestId('complete-consultation').click();
  await expect(toast(page, 'Consultation completed')).toBeVisible();
  steps.push(`doctor called next (after ${served} served ahead) and completed the visit with diagnosis, prescription and HB order`);
  await logout(page);

  // 3. Lab
  const labApi = await apiAs(page, 'lab');
  const order = (await labApi.get('/lab/orders', { patientId: appt.patient_id, status: 'ORDERED' })).find((o) => o.test_code === 'HB');
  await login(page, 'lab');
  await page.goto('/lab');
  await page.getByTestId(`collect-${order.id}`).click();
  await expect(toast(page, 'Sample collected')).toBeVisible();
  await page.getByRole('tab', { name: /Sample collected/ }).click();
  await page.getByTestId(`result-${order.id}`).click();
  await page.getByTestId('result-value').fill('13.5');
  await expect(page.getByRole('dialog').getByText('Within range')).toBeVisible();
  await page.getByTestId('save-result').click();
  await expect(toast(page, 'result saved')).toBeVisible();
  steps.push('lab recorded HB 13.5 g/dL (within range)');
  await logout(page);

  // 4. Pharmacy
  const ph = await apiAs(page, 'pharmacy');
  const rx = (await ph.get('/pharmacy/prescriptions', { status: 'PENDING', patientId: appt.patient_id }))[0];
  await login(page, 'pharmacy');
  await page.goto('/pharmacy');
  await page.getByTestId(`dispense-${rx.id}`).click();
  await expect(toast(page, 'Dispensed')).toBeVisible();
  steps.push(`pharmacist dispensed Rx #${rx.id}`);
  await logout(page);

  // 5. Billing
  await login(page, 'billing');
  await page.goto('/billing');
  await page.getByPlaceholder('Filter by patient or admission').fill(appt.patient_code);
  await page.getByRole('row').filter({ hasText: appt.patient_code }).filter({ hasText: 'Outpatient' }).getByRole('button', { name: 'Generate invoice' }).click();
  await page.getByTestId('confirm-generate').click();
  await expect(page.getByTestId('invoice-status')).toHaveText('Unpaid');
  const invNo = await page.getByTestId('invoice-no').innerText();
  const lines = await page.locator('table tbody tr').count();
  await page.getByTestId('record-payment').click();
  await page.getByTestId('submit-payment').click(); // default amount = full balance, method = cash
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('invoice-status')).toHaveText('Paid');
  shared.at01.invoiceNo = invNo;
  steps.push(`billing raised ${invNo} with ${lines} line(s) and settled it in cash`);
  await logout(page);

  // 6. Acceptance check: patient record
  await login(page, 'reception');
  await page.goto(`/patients/${appt.patient_id}`);
  const visit = page.getByRole('row').filter({ hasText: 'Dr. Arjun Sharma' }).filter({ hasText: 'Completed' }).first();
  await expect(visit).toBeVisible();
  await page.getByRole('tab', { name: /Invoices/ }).click();
  await expect(page.getByRole('row').filter({ hasText: invNo })).toContainText('Paid');
  const apptNow = await (await apiAs(page, 'reception')).get(`/appointments/${appt.id}`);
  expect(apptNow.status).toBe('COMPLETED');
  steps.push(`patient history shows the visit Completed (appointment #${appt.id} status ${apptNow.status}) and the invoice Paid`);
  note(steps.join('; '));
});

tcE2E({
  id: 'AT-02', level: A, fr: ['FR-38', 'FR-39', 'FR-41', 'FR-42', 'FR-43', 'FR-44', 'FR-46'],
  title: 'IPD journey: admission → discharge request → billing clearance → discharge → bed turnaround',
  input: 'New patient admitted by reception; Dr. Sharma requests discharge; reception tries to discharge; billing invoices and settles; reception discharges; housekeeping marks bed cleaned',
  expected: 'Discharge blocked until billing is cleared; then DISCHARGED; bed goes OCCUPIED → CLEANING → AVAILABLE',
}, async ({ page, note }) => {
  const p = await newPatient(page, { first_name: 'Nirmala', gender: 'FEMALE', dob: '1961-11-02' });
  const doc = await sharmaId(page);
  const steps = [];

  await login(page, 'reception');
  await page.goto('/beds');
  const tile = page.locator('[data-testid^="bed-"][data-status="AVAILABLE"]').first();
  const bedNo = (await tile.getAttribute('data-testid')).replace('bed-', '');
  await tile.click();
  await page.getByTestId('bed-admit').click();
  const dlg = page.getByRole('dialog', { name: `Admit patient to ${bedNo}` });
  await dlg.getByTestId('patient-picker').fill(p.patient_code);
  await dlg.getByRole('button', { name: new RegExp(p.full_name) }).click();
  await dlg.getByTestId('admit-doctor').selectOption(String(doc));
  await dlg.getByTestId('admit-reason').fill('Uncontrolled diabetes with dehydration');
  await dlg.getByTestId('admit-submit').click();
  await expect(page).toHaveURL(/\/admissions\/\d+$/);
  const admId = Number(page.url().split('/').pop());
  const admNo = await page.locator('span.font-mono').filter({ hasText: /^ADM-/ }).first().innerText();
  shared.at02 = { admId, admNo, bedNo };
  steps.push(`reception admitted ${p.patient_code} to ${bedNo} (${admNo})`);
  await logout(page);

  await login(page, 'dr.sharma');
  await page.goto(`/admissions/${admId}`);
  await page.getByTestId('request-discharge-btn').click();
  await page.getByTestId('discharge-summary').fill('Sugars controlled on oral agents; hydration restored. Continue metformin; review in OPD after 1 week.');
  await page.getByTestId('request-discharge-submit').click();
  await expect(toast(page, 'Discharge requested')).toBeVisible();
  await expect(page.getByText('Discharge pending').first()).toBeVisible();
  steps.push('doctor requested discharge with summary');
  await logout(page);

  await login(page, 'reception');
  await page.goto(`/admissions/${admId}`);
  await page.getByTestId('discharge-btn').click();
  await page.getByTestId('discharge-confirm').click();
  const blocked = page.getByRole('dialog').getByRole('alert').filter({ hasText: 'Discharge blocked' });
  await expect(blocked).toBeVisible();
  steps.push(`reception discharge blocked: "${(await blocked.innerText()).replace(/\s+/g, ' ').trim()}"`);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await logout(page);

  await login(page, 'billing');
  await page.goto(`/admissions/${admId}`);
  await page.getByRole('button', { name: 'Generate invoice' }).click();
  await expect(page).toHaveURL(/\/billing\/invoices\/\d+$/);
  const invNo = await page.getByTestId('invoice-no').innerText();
  await page.getByTestId('record-payment').click();
  await page.getByRole('dialog').getByRole('radio', { name: 'Card' }).click();
  await page.getByRole('dialog').locator('input[name="reference"]').fill('TXN882134');
  await page.getByTestId('submit-payment').click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('invoice-status')).toHaveText('Paid');
  shared.at02.invoiceNo = invNo;
  steps.push(`billing raised ${invNo} (bed charges) and settled it by card`);
  await logout(page);

  await login(page, 'reception');
  await page.goto(`/admissions/${admId}`);
  await expect(page.getByText('Billing cleared')).toBeVisible();
  await page.getByTestId('discharge-btn').click();
  await page.getByTestId('discharge-confirm').click();
  await expect(toast(page, 'Discharge complete')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Discharged on' })).toBeVisible();
  steps.push('reception completed the discharge');
  await page.goto('/beds');
  await expect(page.getByTestId(`bed-${bedNo}`)).toHaveAttribute('data-status', 'CLEANING');
  await page.getByTestId(`bed-${bedNo}`).click();
  await page.getByTestId('bed-cleaned').click();
  await expect(page.getByTestId(`bed-${bedNo}`)).toHaveAttribute('data-status', 'AVAILABLE');
  steps.push(`bed ${bedNo}: CLEANING → AVAILABLE after "Mark cleaned"`);
  note(steps.join('; '));
});

const EXPECTED_MENUS = {
  admin: ['Dashboard', 'Patients', 'Appointments', 'Queue Board', 'Laboratory', 'Pharmacy', 'Beds & Admissions', 'Billing', 'Reports', 'Doctors', 'Users & Roles', 'Audit Trail'],
  reception: ['Dashboard', 'Patients', 'Appointments', 'Queue Board', 'Beds & Admissions'],
  'dr.sharma': ['Dashboard', 'Patients', 'Appointments', 'Queue Board', 'Consultation', 'Laboratory', 'Pharmacy', 'Beds & Admissions'],
  lab: ['Dashboard', 'Patients', 'Laboratory'],
  pharmacy: ['Dashboard', 'Patients', 'Pharmacy'],
  billing: ['Dashboard', 'Patients', 'Beds & Admissions', 'Billing'],
};

tcE2E({
  id: 'AT-03', level: A, fr: ['FR-03', 'NFR-03'],
  title: 'Each role sees exactly the menus it is entitled to',
  input: 'Log in as admin, reception, dr.sharma, lab, pharmacy and billing',
  expected: 'Sidebar menus match the role-permission matrix for all 6 roles',
}, async ({ page, note }) => {
  const out = [];
  for (const [user, expected] of Object.entries(EXPECTED_MENUS)) {
    await login(page, user);
    const menu = await page.locator('nav[aria-label="Main navigation"] a').allInnerTexts();
    expect(menu.map((m) => m.trim()), `menu for ${user}`).toEqual(expected);
    out.push(`${user}: ${menu.length} items`);
    await logout(page);
  }
  note(out.join('; '));
});

tcE2E({
  id: 'AT-04', level: A, fr: ['NFR-05'],
  title: 'Usability: booking in at most 4 steps and no horizontal scrolling on a 390 px phone',
  input: 'Receptionist opens the booking wizard; then views Dashboard, Queue and Patients at 390×844',
  expected: 'Wizard has ≤ 4 steps; page scrollWidth ≤ viewport width on all three pages',
}, async ({ page, note }) => {
  await login(page, 'reception');
  await page.goto('/appointments?book=1');
  const steps = await page.locator('ol[aria-label="Booking steps"] li').count();
  expect(steps).toBeLessThanOrEqual(4);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  const res = [];
  for (const path of ['/', '/queue', '/patients']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    res.push(`${path} ${m.sw}/${m.iw}px`);
    expect(m.sw, `no horizontal overflow on ${path}`).toBeLessThanOrEqual(m.iw + 1);
    if (path === '/') await shot(page, 'mobile-dashboard', { fullPage: false });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  note(`booking wizard steps = ${steps}; scrollWidth/innerWidth at 390 px: ${res.join(', ')}`);
});

tcE2E({
  id: 'AT-05', level: A, fr: ['FR-50', 'NFR-08'],
  title: 'Administrator can trace the journeys in the audit trail',
  input: 'Admin filters the audit trail by entity Admission and by the invoice numbers from AT-01/AT-02',
  expected: 'Admission, discharge, payment and dispensing actions are listed with user and role',
}, async ({ page, note }) => {
  await login(page, 'admin');
  await page.goto('/audit');
  const found = [];
  await page.locator('select').first().selectOption('Admission');
  const admNo = shared.at02?.admNo;
  const admRow = admNo
    ? page.getByRole('row').filter({ hasText: admNo }).filter({ hasText: 'DISCHARGED' }).first()
    : page.getByRole('row').filter({ hasText: 'DISCHARGED' }).first();
  await expect(admRow).toBeVisible();
  await expect(admRow).toContainText('reception');
  found.push(`Admission: "${(await admRow.innerText()).replace(/\s+/g, ' ').slice(0, 110)}"`);

  await page.getByRole('button', { name: 'Clear filters' }).click();
  for (const inv of [shared.at01?.invoiceNo, shared.at02?.invoiceNo].filter(Boolean)) {
    await page.getByLabel('Search audit log').fill(inv);
    const row = page.getByRole('row').filter({ hasText: 'PAYMENT' }).filter({ hasText: inv }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('Billing Staff');
    found.push(`${inv}: PAYMENT by billing`);
  }
  await page.getByLabel('Search audit log').fill('');
  await page.locator('select').nth(1).selectOption('DISPENSE');
  await expect(page.getByRole('row').filter({ hasText: 'DISPENSE' }).first()).toContainText('pharmacy');
  found.push('DISPENSE entries by pharmacy');
  note(found.join('; '));
});
