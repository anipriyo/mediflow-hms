// System tests (ST-*): each module exercised end-to-end through the real UI, server and database.
import { tcE2E, login, logout, shot, expect } from './helpers.js';
import { apiAs, newPatient, sharmaId, scheduledToday, closeOpenConsultation, tomorrow, uniq, mobile } from './api.js';

const S = 'System';
const toast = (page, text) => page.getByTestId('toast-success').filter({ hasText: text }).first();
const nav = (page) => page.locator('nav[aria-label="Main navigation"] a');

tcE2E({
  id: 'ST-AUTH-01', level: S, fr: ['FR-01', 'FR-03', 'FR-04'],
  title: 'Login per role, role-based menus and blocked direct URLs',
  input: 'Wrong password for reception; reception and billing log in; reception opens /users directly',
  expected: 'Error on wrong password; receptionist menu has no Billing/Reports/Users; billing menu has no Queue Board; /users shows "Access denied"',
}, async ({ page, note }) => {
  await page.goto('/login');
  await shot(page, 'login');
  await page.getByLabel('Username').fill('reception');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Invalid username or password' })).toBeVisible();
  note('wrong password → "Invalid username or password"');

  await login(page, 'reception');
  const recMenu = await nav(page).allInnerTexts();
  note(`receptionist menu: ${recMenu.join(', ')}`);
  for (const forbidden of ['Billing', 'Reports', 'Users & Roles', 'Audit Trail']) expect(recMenu).not.toContain(forbidden);
  await expect(page.getByTestId('role-badge')).toHaveText('Receptionist');
  await shot(page, 'dashboard-reception');
  await page.goto('/users');
  await expect(page.getByText('Access denied')).toBeVisible();
  note('receptionist → /users shows "Access denied"');
  await logout(page);

  await login(page, 'billing');
  const billMenu = await nav(page).allInnerTexts();
  note(`billing menu: ${billMenu.join(', ')}`);
  expect(billMenu).toContain('Billing');
  expect(billMenu).not.toContain('Queue Board');
  await logout(page);
  note('logout returns to /login');
});

tcE2E({
  id: 'ST-PAT-01', level: S, fr: ['FR-07', 'FR-08', 'FR-12'],
  title: 'Register a patient through the form with validation feedback',
  input: 'Register dialog: first with mobile "12345", then with a valid 10-digit mobile',
  expected: 'Inline error "Enter a valid 10-digit mobile number"; then patient detail page with a new P-code',
}, async ({ page, note }) => {
  await login(page, 'reception');
  await page.goto('/patients');
  await expect(page.getByRole('heading', { name: 'Patients' })).toBeVisible();
  await shot(page, 'patients');
  await page.getByTestId('new-patient').click();
  const dlg = page.getByRole('dialog', { name: 'Register new patient' });
  const last = `Sen${uniq()}`;
  await dlg.locator('input[name="first_name"]').fill('Moumita');
  await dlg.locator('input[name="last_name"]').fill(last);
  await dlg.locator('select[name="gender"]').selectOption('FEMALE');
  await dlg.locator('input[name="dob"]').fill('1994-02-11');
  await dlg.locator('input[name="phone"]').fill('12345');
  await dlg.locator('select[name="blood_group"]').selectOption('B+');
  await dlg.locator('input[name="allergies"]').fill('Penicillin');
  await dlg.getByTestId('register-submit').click();
  await expect(dlg.getByText('Enter a valid 10-digit mobile number')).toBeVisible();
  note('invalid mobile → inline error "Enter a valid 10-digit mobile number"');
  await shot(page, 'register-patient');
  await dlg.locator('input[name="phone"]').fill(mobile());
  await dlg.getByTestId('register-submit').click();
  await expect(page).toHaveURL(/\/patients\/\d+$/);
  await expect(page.getByRole('heading', { name: `Moumita ${last}` })).toBeVisible();
  const code = await page.locator('span.font-mono').filter({ hasText: /^P\d{5}$/ }).first().innerText();
  expect(code).toMatch(/^P\d{5}$/);
  await expect(page.getByText('Allergy:')).toBeVisible();
  note(`registered Moumita ${last} → ${code}; detail page shows allergy alert`);
  await shot(page, 'patient-detail');
});

tcE2E({
  id: 'ST-APT-01', level: S, fr: ['FR-15', 'FR-16', 'FR-20'],
  title: 'Book an appointment for tomorrow with the 4-step wizard',
  input: 'New patient; Dr. Arjun Sharma; tomorrow; first free slot; reason "Persistent cough"',
  expected: 'Toast "Appointment booked"; appointment listed for tomorrow as Scheduled',
}, async ({ page, note }) => {
  const p = await newPatient(page);
  const doc = await sharmaId(page);
  await login(page, 'reception');
  await page.goto('/appointments');
  await expect(page.getByRole('heading', { name: 'Appointments' })).toBeVisible();
  await shot(page, 'appointments');
  await page.getByTestId('book-appointment').click();
  const dlg = page.getByRole('dialog', { name: 'Book appointment' });
  await dlg.getByTestId('patient-picker').fill(p.patient_code);
  await dlg.getByRole('button', { name: new RegExp(p.full_name) }).click();
  await expect(dlg.getByTestId('selected-patient')).toContainText(p.patient_code);
  await dlg.getByTestId('wizard-next').click();
  await dlg.getByTestId(`doctor-${doc}`).click();
  await dlg.getByTestId('wizard-next').click();
  await dlg.getByTestId('booking-date').fill(tomorrow());
  const free = dlg.locator('[data-testid="slot-grid"] button:not([disabled])').first();
  await expect(free).toBeVisible();
  const slot = await free.getAttribute('data-slot');
  await free.click();
  await shot(page, 'booking-wizard');
  await dlg.getByTestId('wizard-next').click();
  await dlg.getByTestId('booking-reason').fill('Persistent cough');
  await dlg.getByTestId('confirm-booking').click();
  await expect(toast(page, 'Appointment booked')).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: p.full_name });
  await expect(row).toContainText('Scheduled');
  await expect(row).toContainText('Dr. Arjun Sharma');
  note(`booked ${p.patient_code} with Dr. Arjun Sharma on ${tomorrow()} at ${slot}; list shows Scheduled`);
});

tcE2E({
  id: 'ST-QUE-01', level: S, fr: ['FR-21', 'FR-22', 'FR-23'],
  title: "Check in today's appointment and see the token on the queue board",
  input: "A SCHEDULED appointment of Dr. Sharma for today; Check in from the Appointments list",
  expected: 'Toast with token number; patient appears in Dr. Sharma\'s waiting list with token and ETA',
}, async ({ page, note }) => {
  const appt = await scheduledToday(page);
  expect(appt, 'seed has a SCHEDULED appointment for Dr. Sharma today').toBeTruthy();
  const doc = await sharmaId(page);
  await login(page, 'reception');
  await page.goto('/appointments');
  await page.getByLabel('Doctor filter').selectOption(String(doc));
  await page.getByRole('tab', { name: /Scheduled/ }).click();
  await page.getByTestId(`checkin-${appt.id}`).click();
  const t = toast(page, 'checked in');
  await expect(t).toBeVisible();
  const msg = await t.innerText();
  const token = msg.match(/#(\d+)/)[1];
  note(`checked in ${appt.patient_code} → "${msg.replace(/\s+/g, ' ').trim()}"`);

  await page.goto('/queue');
  await expect(page.getByTestId('queue-overview')).toBeVisible();
  await shot(page, 'queue-overview');
  await page.getByTestId(`queue-card-${doc}`).click();
  const item = page.getByTestId('waiting-list').locator('li').filter({ hasText: appt.patient_name });
  await expect(item).toContainText(`#${token}`);
  const etaText = (await item.locator('p.tabular-nums').first().innerText()).trim();
  expect(etaText).toMatch(/^(Next|~\d+ min)$/);
  note(`queue board: token #${token}, ETA "${etaText}", ${await item.locator('text=/\\d+ ahead/').innerText()}`);
  await shot(page, 'queue-board');
});

tcE2E({
  id: 'ST-CON-01', level: S, fr: ['FR-25', 'FR-26', 'FR-27', 'FR-28', 'FR-29'],
  title: 'Doctor calls the next patient, records the consultation and completes it',
  input: 'Dr. Sharma: Call next → vitals 130/85, pulse 92, temp 100.2 → diagnosis "Acute viral fever" → Paracetamol → FBS test → Complete',
  expected: 'Workspace opens for the called token; prescription saved; lab order shown; visit completed and queue screen returns',
}, async ({ page, note }) => {
  await closeOpenConsultation(page);
  const dr = await apiAs(page, 'dr.sharma');
  const board = await dr.get(`/queue/${dr.user.doctorId}`);
  if (!board.waiting.length) {
    const appt = await scheduledToday(page);
    await (await apiAs(page, 'reception')).post(`/appointments/${appt.id}/check-in`);
  }
  await login(page, 'dr.sharma');
  await page.goto('/consultation');
  await page.getByTestId('call-next').click();
  await expect(page.getByTestId('consult-patient')).toBeVisible();
  const patient = await page.getByTestId('consult-patient').innerText();
  await page.locator('input[name="bp"]').fill('130/85');
  await page.locator('input[name="pulse"]').fill('92');
  await page.locator('input[name="temperature"]').fill('100.2');
  await page.locator('input[name="spo2"]').fill('97');
  await page.locator('textarea[name="symptoms"]').fill('Fever with body ache for 3 days');
  await page.locator('#diagnosis').fill('Acute viral fever');
  await page.locator('textarea[name="notes"]').fill('Plenty of fluids; review if fever persists beyond 3 days.');
  await page.getByTestId('save-notes').click();
  await expect(toast(page, 'Consultation notes saved')).toBeVisible();

  await page.getByTestId('medicine-search').fill('Paracetamol');
  await page.getByRole('button', { name: /Paracetamol\s+500 mg/ }).first().click();
  await expect(page.getByTestId('rx-items')).toContainText('Paracetamol');
  await page.getByTestId('save-prescription').click();
  await expect(toast(page, 'Prescription saved')).toBeVisible();

  await page.getByTestId('order-labs').click();
  await page.getByTestId('lab-test-FBS').check();
  await page.getByTestId('confirm-lab-order').click();
  await expect(toast(page, 'Lab tests ordered')).toBeVisible();
  await expect(page.getByText('Fasting Blood Sugar').first()).toBeVisible();
  await shot(page, 'consultation', { fullPage: true });

  await page.getByTestId('complete-consultation').click();
  await expect(toast(page, 'Consultation completed')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Consultation' })).toBeVisible();
  note(`called and treated ${patient}; notes, prescription (Paracetamol) and FBS order saved; consultation completed`);
});

tcE2E({
  id: 'ST-LAB-01', level: S, fr: ['FR-31', 'FR-32', 'FR-33'],
  title: 'Lab technician collects a sample and records an out-of-range result',
  input: 'FBS order for an inpatient; collect sample; result 162 mg/dL (reference 70–100)',
  expected: 'Status moves ORDERED → SAMPLE_COLLECTED → COMPLETED; live preview and saved result show ABNORMAL',
}, async ({ page, note }) => {
  const rec = await apiAs(page, 'reception');
  const dr = await apiAs(page, 'dr.sharma');
  const adm = (await rec.get('/admissions', { status: 'ADMITTED' }))[0];
  const fbs = (await dr.get('/lab/tests')).find((t) => t.code === 'FBS');
  const [order] = await dr.post('/lab/orders', { patient_id: adm.patient_id, admission_id: adm.id, test_ids: [fbs.id] });

  await login(page, 'lab');
  await page.goto('/lab');
  await expect(page.getByRole('heading', { name: 'Laboratory' })).toBeVisible();
  await shot(page, 'lab');
  await page.getByTestId(`collect-${order.id}`).click();
  await expect(toast(page, 'Sample collected')).toBeVisible();
  await page.getByRole('tab', { name: /Sample collected/ }).click();
  await page.getByTestId(`result-${order.id}`).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByTestId('result-value').fill('162');
  await expect(dlg.getByText('Abnormal (high)')).toBeVisible();
  await shot(page, 'lab-result');
  await dlg.getByTestId('save-result').click();
  await expect(toast(page, 'ABNORMAL')).toBeVisible();
  await page.getByRole('tab', { name: /Completed/ }).click();
  const row = page.getByRole('row').filter({ hasText: adm.patient_code }).filter({ hasText: 'Fasting Blood Sugar' }).first();
  await expect(row).toContainText('162');
  await expect(row).toContainText('Abnormal');
  const saved = (await rec.get('/admissions/' + adm.id)).labOrders.find((o) => o.id === order.id);
  note(`order #${order.id} for ${adm.patient_code}: collected → result 162 mg/dL; preview "Abnormal (high)"; saved status ${saved.status}, is_abnormal=${saved.is_abnormal}`);
});

tcE2E({
  id: 'ST-PHA-01', level: S, fr: ['FR-36', 'FR-37'],
  title: 'Pharmacist cannot dispense an out-of-stock prescription but dispenses a valid one',
  input: 'Pending prescriptions: one includes Insulin Glargine ×5 (3 in stock); another fully in stock',
  expected: 'Insulin prescription shows the stock problem and a disabled Dispense button; the other is dispensed and stock decreases',
}, async ({ page, note }) => {
  const ph = await apiAs(page, 'pharmacy');
  const pending = await ph.get('/pharmacy/prescriptions', { status: 'PENDING' });
  const blocked = pending.find((p) => !p.dispensable);
  const ok = pending.find((p) => p.dispensable);
  expect(blocked, 'an undispensable prescription exists').toBeTruthy();
  expect(ok, 'a dispensable prescription exists').toBeTruthy();
  const medId = ok.items[0].medicine_id;
  const stockOf = async () => (await ph.get('/pharmacy/medicines')).find((m) => m.id === medId).stock_qty;
  const before = await stockOf();

  await login(page, 'pharmacy');
  await page.goto('/pharmacy');
  await expect(page.getByTestId(`rx-${blocked.id}`)).toContainText('Insufficient stock');
  await expect(page.getByTestId(`dispense-${blocked.id}`)).toBeDisabled();
  await page.getByTestId(`rx-${ok.id}`).scrollIntoViewIfNeeded();
  await shot(page, 'pharmacy');
  await page.getByTestId(`dispense-${ok.id}`).click();
  await expect(toast(page, 'Dispensed')).toBeVisible();
  await expect(page.getByTestId(`rx-${ok.id}`)).toHaveCount(0);
  const after = await stockOf();
  const status = (await ph.get(`/pharmacy/prescriptions/${ok.id}`)).status;
  note(`Rx #${blocked.id} blocked ("${blocked.items.find((i) => i.problem).problem}"); Rx #${ok.id} → ${status}; ${ok.items[0].medicine_name} stock ${before} → ${after}`);
  expect(after).toBe(before - ok.items[0].quantity);

  await page.getByRole('tab', { name: 'Inventory' }).click();
  await expect(page.getByText('Medicine inventory')).toBeVisible();
  await shot(page, 'pharmacy-inventory');
});

tcE2E({
  id: 'ST-IPD-01', level: S, fr: ['FR-38', 'FR-39', 'FR-40', 'FR-41'],
  title: 'Admit a patient from the bed board and transfer to another bed',
  input: 'New patient; first AVAILABLE bed; attending Dr. Sharma; then Transfer bed to the first bed offered',
  expected: 'Admission detail opens with status Admitted; after transfer the new bed is Occupied and the old bed is Cleaning',
}, async ({ page, note }) => {
  const p = await newPatient(page, { first_name: 'Ratan', gender: 'MALE' });
  const doc = await sharmaId(page);
  await login(page, 'reception');
  await page.goto('/beds');
  await expect(page.getByTestId('bed-summary')).toBeVisible();
  await shot(page, 'beds');
  const tile = page.locator('[data-testid^="bed-"][data-status="AVAILABLE"]').first();
  const bedNo = (await tile.getAttribute('data-testid')).replace('bed-', '');
  await tile.click();
  await page.getByTestId('bed-admit').click();
  const dlg = page.getByRole('dialog', { name: `Admit patient to ${bedNo}` });
  await dlg.getByTestId('patient-picker').fill(p.patient_code);
  await dlg.getByRole('button', { name: new RegExp(p.full_name) }).click();
  await dlg.getByTestId('admit-doctor').selectOption(String(doc));
  await dlg.getByTestId('admit-reason').fill('Community-acquired pneumonia, needs IV antibiotics');
  await dlg.getByTestId('admit-submit').click();
  await expect(page).toHaveURL(/\/admissions\/\d+$/);
  await expect(page.getByRole('heading', { name: p.full_name })).toBeVisible();
  const admNo = await page.locator('span.font-mono').filter({ hasText: /^ADM-/ }).first().innerText();

  await page.getByTestId('transfer-btn').click();
  const sel = page.getByTestId('transfer-bed');
  await expect(sel.locator('option').nth(1)).toBeAttached();
  const newBedLabel = await sel.locator('option').nth(1).innerText();
  await sel.selectOption({ index: 1 });
  await page.getByTestId('transfer-submit').click();
  await expect(toast(page, 'Transferred to')).toBeVisible();
  await shot(page, 'admission-detail', { fullPage: true });

  await page.goto('/beds');
  await expect(page.getByTestId(`bed-${bedNo}`)).toHaveAttribute('data-status', 'CLEANING');
  const newBedNo = newBedLabel.replace(' (reserved)', '').trim();
  await expect(page.getByTestId(`bed-${newBedNo}`)).toHaveAttribute('data-status', 'OCCUPIED');
  const admRec = (await (await apiAs(page, 'reception')).get('/admissions', { q: admNo }))[0];
  expect(admRec.status).toBe('ADMITTED');
  note(`${p.patient_code} admitted to ${bedNo} (${admNo}, status ${admRec.status}); transferred to ${newBedNo}; ${bedNo} → CLEANING, ${newBedNo} → OCCUPIED`);
});

tcE2E({
  id: 'ST-BIL-01', level: S, fr: ['FR-44', 'FR-46', 'FR-47'],
  title: 'Generate an invoice, take a partial UPI payment, reject an overpayment, settle and print the receipt',
  input: 'First OPD patient in "To bill"; pay ~50% by UPI with reference; then balance + ₹100 in cash; then the exact balance',
  expected: 'Invoice UNPAID → PARTIALLY_PAID; overpayment rejected with the outstanding balance; → PAID; receipt page shows "Payment Receipt"',
}, async ({ page, context, note }) => {
  const bill = await apiAs(page, 'billing');
  const group = (await bill.get('/billing/pending')).find((g) => !g.admission_id);
  expect(group, 'an OPD billing group exists').toBeTruthy();

  await login(page, 'billing');
  await page.goto('/billing');
  await expect(page.getByRole('heading', { name: 'Billing & Payments' })).toBeVisible();
  await shot(page, 'billing');
  await page.getByPlaceholder('Filter by patient or admission').fill(group.patient_code);
  await page.getByRole('row').filter({ hasText: group.patient_code }).filter({ hasText: 'Outpatient' }).getByRole('button', { name: 'Generate invoice' }).click();
  await page.getByTestId('confirm-generate').click();
  await expect(page).toHaveURL(/\/billing\/invoices\/\d+$/);
  await expect(page.getByTestId('invoice-status')).toHaveText('Unpaid');
  const invId = Number(page.url().split('/').pop());
  const inv = await bill.get(`/billing/invoices/${invId}`);
  const part = Math.floor(inv.total / 2);
  const balance = Math.round((inv.total - part) * 100) / 100;

  // partial UPI payment
  await page.getByTestId('record-payment').click();
  let dlg = page.getByRole('dialog', { name: 'Record payment' });
  await dlg.locator('input[name="amount"]').fill(String(part));
  await dlg.getByRole('radio', { name: 'UPI' }).click();
  await dlg.locator('input[name="reference"]').fill('UPI4321876511');
  await dlg.getByTestId('submit-payment').click();
  const r1 = await page.getByTestId('receipt-no').innerText();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('invoice-status')).toHaveText('Partially paid');
  await shot(page, 'invoice');

  // overpayment
  await page.getByTestId('record-payment').click();
  dlg = page.getByRole('dialog', { name: 'Record payment' });
  await dlg.locator('input[name="amount"]').fill(String(balance + 100));
  await dlg.getByTestId('submit-payment').click();
  const err = dlg.getByRole('alert').filter({ hasText: 'exceeds the outstanding balance' });
  await expect(err).toBeVisible();
  const errText = (await err.innerText()).replace(/\s+/g, ' ').trim();

  // settle
  await dlg.locator('input[name="amount"]').fill(balance.toFixed(2));
  await dlg.getByTestId('submit-payment').click();
  const r2 = await page.getByTestId('receipt-no').innerText();
  const [receiptPage] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: 'Print receipt' }).click()]);
  await receiptPage.waitForLoadState();
  await expect(receiptPage.getByText('Payment Receipt')).toBeVisible();
  await expect(receiptPage.getByText(r2).first()).toBeVisible();
  await shot(receiptPage, 'receipt-print', { fullPage: true });
  await receiptPage.close();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('invoice-status')).toHaveText('Paid');
  note(`${inv.invoice_no} ₹${inv.total} for ${group.patient_code}: paid ₹${part} UPI (${r1}) → Partially paid; ₹${balance + 100} rejected ("${errText}"); paid ₹${balance.toFixed(2)} (${r2}) → Paid; receipt page rendered`);
});

tcE2E({
  id: 'ST-RPT-01', level: S, fr: ['FR-48', 'FR-49', 'FR-50'],
  title: 'Administrator views dashboard, reports, users, doctors and the audit trail',
  input: 'Admin opens Dashboard, Reports (last 14 days), Users, Doctors, Audit trail filtered by action PAYMENT',
  expected: 'KPI cards and charts render; audit trail lists the payments recorded by billing staff',
}, async ({ page, note }) => {
  await login(page, 'admin');
  await expect(page.getByTestId('kpi-grid')).toBeVisible();
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
  await shot(page, 'dashboard-admin');
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Reports & Analytics' })).toBeVisible();
  await expect(page.locator('.recharts-surface').nth(3)).toBeVisible();
  const charts = await page.locator('.recharts-surface').count();
  await shot(page, 'reports');
  await page.goto('/users');
  await expect(page.getByTestId('permission-matrix')).toBeVisible();
  await shot(page, 'users');
  await page.goto('/doctors');
  await expect(page.getByText('Dr. Arjun Sharma').first()).toBeVisible();
  await shot(page, 'doctors');
  await page.goto('/audit');
  await page.locator('select').nth(1).selectOption('PAYMENT');
  const first = page.getByRole('row').filter({ hasText: 'PAYMENT' }).first();
  await expect(first).toContainText('billing');
  await expect(first).toContainText(/received ₹/);
  await shot(page, 'audit');
  note(`dashboard KPIs + charts visible; reports page renders ${charts} charts; users permission matrix and doctors list shown; audit PAYMENT entry: "${(await first.innerText()).replace(/\s+/g, ' ').slice(0, 140)}"`);
});
