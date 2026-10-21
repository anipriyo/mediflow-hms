import { beforeAll, describe, expect } from 'vitest';
import { tc } from '../helpers/tc.js';
import { setupApp, newPatient, advance, resetClock } from './setup.js';

const I = 'Integration';
let ctx;
let patient;
let admission;
let bedA;
let bedB;
let invoice;
beforeAll(async () => {
  ctx = await setupApp();
  patient = (await ctx.as('reception').post('/patients', newPatient({ first_name: 'Kamal', last_name: 'Nath' }))).body;
});
const api = (u) => ctx.as(u);
const board = async () => (await api('reception').get('/beds')).body;
const bedByNo = async (no) => (await board()).wards.flatMap((w) => w.beds).find((b) => b.bed_no === no);

describe('Admissions, beds & discharge (IPD)', () => {
  tc({ id: 'IT-IPD-01', level: I, fr: ['FR-38'], title: 'Bed board shows every ward with bed status counts', input: 'GET /beds on reference data (5 wards, 42 beds)', expected: '5 wards, 42 beds, all AVAILABLE, occupancy 0%' }, async (note) => {
    const b = await board();
    note(`${b.wards.length} wards, ${b.summary.total} beds, AVAILABLE ${b.summary.AVAILABLE}, occupancy ${b.summary.occupancyPct}%`);
    expect(b.wards).toHaveLength(5);
    expect(b.summary.total).toBe(42);
    expect(b.summary.AVAILABLE).toBe(42);
  });

  tc({ id: 'IT-IPD-02', level: I, fr: ['FR-39'], title: 'Admitting a patient occupies the bed; a second active admission is refused', input: 'Admit Kamal Nath to GA-01; admit again to GA-02', expected: '201 ADMITTED, GA-01 OCCUPIED; 409 ALREADY_ADMITTED' }, async (note) => {
    bedA = await bedByNo('GA-01');
    const res = await api('reception').post('/admissions', { patient_id: patient.id, doctor_id: ctx.ids.sharma, bed_id: bedA.id, reason: 'Dengue fever with thrombocytopenia' });
    admission = res.body;
    const again = await api('reception').post('/admissions', { patient_id: patient.id, doctor_id: ctx.ids.sharma, bed_id: (await bedByNo('GA-02')).id, reason: 'x' });
    const a1 = await bedByNo('GA-01');
    note(`${res.status} ${res.body.admission_no} ${res.body.status}; GA-01 ${a1.status}; again ${again.status} ${again.body.code}`);
    expect(res.status).toBe(201);
    expect(a1.status).toBe('OCCUPIED');
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_ADMITTED');
  });

  tc({ id: 'IT-IPD-03', level: I, fr: ['FR-39'], title: 'A bed that is occupied or under maintenance cannot be assigned', input: 'Admit another patient to GA-01 (occupied) and to GA-03 after marking it MAINTENANCE', expected: '409 BED_NOT_AVAILABLE twice' }, async (note) => {
    const other = (await api('reception').post('/patients', newPatient())).body;
    const occ = await api('reception').post('/admissions', { patient_id: other.id, doctor_id: ctx.ids.sharma, bed_id: bedA.id, reason: 'Observation' });
    const ga3 = await bedByNo('GA-03');
    await api('reception').post(`/beds/${ga3.id}/status`, { status: 'MAINTENANCE' });
    const mnt = await api('reception').post('/admissions', { patient_id: other.id, doctor_id: ctx.ids.sharma, bed_id: ga3.id, reason: 'Observation' });
    note(`occupied → ${occ.status} ${occ.body.code}; maintenance → ${mnt.status} ${mnt.body.code}`);
    expect([occ.body.code, mnt.body.code]).toEqual(['BED_NOT_AVAILABLE', 'BED_NOT_AVAILABLE']);
  });

  tc({ id: 'IT-IPD-04', level: I, fr: ['FR-40'], title: 'Transfer moves the patient and sends the old bed for cleaning', input: '10 minutes after admission, transfer to GB-01', expected: 'Admission bed GB-01; GA-01 CLEANING; GB-01 OCCUPIED; 2 bed stays' }, async (note) => {
    advance(10);
    bedB = await bedByNo('GB-01');
    const res = await api('reception').post(`/admissions/${admission.id}/transfer`, { bed_id: bedB.id });
    const a1 = await bedByNo('GA-01');
    const b1 = await bedByNo('GB-01');
    note(`${res.status} now ${res.body.ward} ${res.body.bed_no}; GA-01 ${a1.status}; GB-01 ${b1.status}; stays ${res.body.stays.length}`);
    expect(res.body.bed_no).toBe('GB-01');
    expect([a1.status, b1.status]).toEqual(['CLEANING', 'OCCUPIED']);
    expect(res.body.stays).toHaveLength(2);
  });

  tc({ id: 'IT-IPD-05', level: I, fr: ['FR-41'], title: 'Manual bed status changes follow the state machine', input: 'GA-01 CLEANING → OCCUPIED (manual); GA-01 CLEANING → AVAILABLE', expected: '409 INVALID_BED_TRANSITION; 200 AVAILABLE' }, async (note) => {
    const bad = await api('reception').post(`/beds/${bedA.id}/status`, { status: 'OCCUPIED' });
    const ok = await api('reception').post(`/beds/${bedA.id}/status`, { status: 'AVAILABLE' });
    note(`${bad.status} ${bad.body.code}; ${ok.status} ${ok.body.status}`);
    expect(bad.status).toBe(409);
    expect(ok.body.status).toBe('AVAILABLE');
  });

  tc({ id: 'IT-IPD-06', level: I, fr: ['FR-42'], title: 'Discharge request adds one bed-day after a same-day transfer (DEF-05 regression)', input: '5 hours later Dr. Sharma requests discharge with summary', expected: 'DISCHARGE_PENDING; BED charges total ₹1,500 (1 day), no zero-amount lines' }, async (note) => {
    advance(300);
    const short = await api('dr.sharma').post(`/admissions/${admission.id}/request-discharge`, { summary: 'ok' });
    const res = await api('dr.sharma').post(`/admissions/${admission.id}/request-discharge`, { summary: 'Platelets recovered to 1.8 lakh; afebrile for 48 h. Review in OPD after 1 week.' });
    const bed = res.body.unbilled.filter((c) => c.source_type === 'BED');
    const total = bed.reduce((s, c) => s + c.amount, 0);
    note(`short summary ${short.status}; ${res.status} ${res.body.status}; bed lines: ${bed.map((c) => c.description).join(' | ')}; total ₹${total}`);
    expect(short.status).toBe(400);
    expect(res.body.status).toBe('DISCHARGE_PENDING');
    expect(total).toBe(1500);
    expect(bed.every((c) => c.amount > 0)).toBe(true);
  });

  tc({ id: 'IT-IPD-07', level: I, fr: ['FR-43'], title: 'Discharge is blocked until all admission charges are invoiced and paid', input: 'Reception discharges before invoicing; Billing invoices; Reception discharges with balance due', expected: '409 BILLING_NOT_CLEARED (uninvoiced), then 409 (outstanding ₹1,500)' }, async (note) => {
    const a = await api('reception').post(`/admissions/${admission.id}/discharge`);
    invoice = (await api('billing').post('/billing/invoices', { patient_id: patient.id, admission_id: admission.id })).body;
    const b = await api('reception').post(`/admissions/${admission.id}/discharge`);
    note(`${a.status} "${a.body.error}"; invoice ${invoice.invoice_no} ₹${invoice.total}; ${b.status} "${b.body.error}"`);
    expect(a.status).toBe(409);
    expect(a.body.error).toMatch(/not been invoiced/);
    expect(b.status).toBe(409);
    expect(b.body.error).toMatch(/outstanding balance of ₹1500.00/);
  });

  tc({ id: 'IT-IPD-08', level: I, fr: ['FR-43'], title: 'Only an administrator can override billing clearance, and must give a reason', input: 'Receptionist sends override_reason; Admin overrides with "Transferred to SSKM for surgery"', expected: '403; 200 DISCHARGED with DISCHARGE_OVERRIDE audit entry and bed CLEANING' }, async (note) => {
    const rec = await api('reception').post(`/admissions/${admission.id}/discharge`, { override_reason: 'Family request' });
    const adm = await api('admin').post(`/admissions/${admission.id}/discharge`, { override_reason: 'Transferred to SSKM for surgery' });
    const audit = (await api('admin').get('/audit?action=DISCHARGE_OVERRIDE')).body.rows[0];
    const bed = await bedByNo('GB-01');
    note(`receptionist ${rec.status}; admin ${adm.status} ${adm.body.status}; audit "${audit?.summary}"; GB-01 ${bed.status}`);
    expect(rec.status).toBe(403);
    expect(adm.body.status).toBe('DISCHARGED');
    expect(bed.status).toBe('CLEANING');
    expect(audit.summary).toMatch(/SSKM/);
  });

  tc({ id: 'IT-IPD-09', level: I, fr: ['FR-43'], title: 'With bills fully paid, discharge completes without override', input: 'New admission → discharge request → invoice → full payment → discharge', expected: '200 DISCHARGED, clearance.allowed = true' }, async (note) => {
    resetClock();
    const p = (await api('reception').post('/patients', newPatient())).body;
    const bed = await bedByNo('PR-301');
    const ad = (await api('reception').post('/admissions', { patient_id: p.id, doctor_id: ctx.ids.sharma, bed_id: bed.id, reason: 'Laparoscopic cholecystectomy' })).body;
    advance(60 * 26);
    await ctx.relogin(); // 26 h later the 8-hour sessions have expired (FR-01)
    await api('dr.sharma').post(`/admissions/${ad.id}/request-discharge`, { summary: 'Post-operative recovery uneventful; sutures to be removed on day 7.' });
    const inv = (await api('billing').post('/billing/invoices', { patient_id: p.id, admission_id: ad.id })).body;
    await api('billing').post(`/billing/invoices/${inv.id}/payments`, { amount: inv.total, method: 'CARD', reference: 'TXN55501' });
    const res = await api('reception').post(`/admissions/${ad.id}/discharge`);
    note(`invoice ₹${inv.total} (2 days × ₹4500); discharge ${res.status} ${res.body.status}`);
    expect(inv.total).toBe(9000);
    expect(res.body.status).toBe('DISCHARGED');
    resetClock();
  });
});

describe('Billing & payments (BIL)', () => {
  let opd;
  beforeAll(async () => {
    resetClock();
    const p = (await api('reception').post('/patients', newPatient({ first_name: 'Sohini', last_name: 'Pal' }))).body;
    const a = (await api('reception').post('/appointments', { patient_id: p.id, doctor_id: ctx.ids.sharma, date: '2026-10-21', start_time: '12:00' })).body;
    await api('reception').post(`/appointments/${a.id}/check-in`);
    const c = (await api('dr.sharma').post(`/queue/${ctx.ids.sharma}/call-next`)).body.consultationId;
    const tests = (await api('dr.sharma').get('/lab/tests')).body;
    await api('dr.sharma').post('/lab/orders', { patient_id: p.id, consultation_id: c, test_ids: [tests.find((t) => t.code === 'CHOL').id] });
    await api('dr.sharma').put(`/consultations/${c}`, { diagnosis: 'Dyslipidaemia' });
    await api('dr.sharma').post(`/consultations/${c}/complete`);
    opd = p;
  });

  tc({ id: 'IT-BIL-01', level: I, fr: ['FR-44'], title: 'Invoice is generated from all unbilled OPD charges; nothing left to bill afterwards', input: 'POST /billing/invoices for Sohini Pal (consultation ₹500 + cholesterol ₹300); repeat', expected: '201 total ₹800, 2 lines, UNPAID; repeat → 400 "no unbilled charges"' }, async (note) => {
    const a = await api('billing').post('/billing/invoices', { patient_id: opd.id });
    const b = await api('billing').post('/billing/invoices', { patient_id: opd.id });
    invoice = a.body;
    note(`${a.status} ${a.body.invoice_no} ₹${a.body.total} (${a.body.items?.length} lines, ${a.body.status}); repeat ${b.status} "${b.body.error}"`);
    expect(a.status).toBe(201);
    expect(a.body.total).toBe(800);
    expect(a.body.invoice_no).toMatch(/^INV-20261021-\d{4}$/);
    expect(b.status).toBe(400);
  });

  tc({ id: 'IT-BIL-02', level: I, fr: ['FR-45'], title: 'Discounts above 50% are rejected; a 10% discount recalculates the total', input: 'discount_pct 60 then 10 with reason "Senior citizen"', expected: '400; 200 total ₹720, discount ₹80' }, async (note) => {
    const a = await api('billing').post(`/billing/invoices/${invoice.id}/discount`, { discount_pct: 60, reason: 'Too much' });
    const b = await api('billing').post(`/billing/invoices/${invoice.id}/discount`, { discount_pct: 10, reason: 'Senior citizen' });
    note(`${a.status} "${a.body.error}"; ${b.status} total ₹${b.body.total}, discount ₹${b.body.discount_amount}`);
    expect(a.status).toBe(400);
    expect([b.body.total, b.body.discount_amount]).toEqual([720, 80]);
  });

  tc({ id: 'IT-BIL-03', level: I, fr: ['FR-46'], title: 'A partial payment moves the invoice to PARTIALLY_PAID', input: 'Pay ₹200 CASH', expected: '201 receipt; status PARTIALLY_PAID; balance ₹520' }, async (note) => {
    const res = await api('billing').post(`/billing/invoices/${invoice.id}/payments`, { amount: 200, method: 'CASH' });
    note(`${res.status} ${res.body.receipt?.receipt_no}; ${res.body.invoice?.status}; balance ₹${res.body.invoice?.balance}`);
    expect(res.body.invoice.status).toBe('PARTIALLY_PAID');
    expect(res.body.invoice.balance).toBe(520);
  });

  tc({ id: 'IT-BIL-04', level: I, fr: ['FR-46'], title: 'Overpayments and card/UPI payments without a reference are rejected', input: 'Pay ₹600 (balance ₹520); pay ₹100 UPI without reference', expected: '400 "exceeds the outstanding balance of ₹520.00"; 400 "reference is required"' }, async (note) => {
    const a = await api('billing').post(`/billing/invoices/${invoice.id}/payments`, { amount: 600, method: 'CASH' });
    const b = await api('billing').post(`/billing/invoices/${invoice.id}/payments`, { amount: 100, method: 'UPI' });
    note(`${a.status} "${a.body.error}"; ${b.status} "${b.body.error}"`);
    expect(a.status).toBe(400);
    expect(a.body.error).toMatch(/exceeds the outstanding balance of ₹520.00/);
    expect(b.status).toBe(400);
  });

  tc({ id: 'IT-BIL-05', level: I, fr: ['FR-46'], title: 'Paying the balance marks the invoice PAID; no further payments or discounts', input: 'Pay ₹520 UPI ref UPI881234; then pay ₹1; then discount 5%', expected: 'PAID; 400 "already fully paid"; 400 discount only on UNPAID' }, async (note) => {
    const a = await api('billing').post(`/billing/invoices/${invoice.id}/payments`, { amount: 520, method: 'UPI', reference: 'UPI881234' });
    const b = await api('billing').post(`/billing/invoices/${invoice.id}/payments`, { amount: 1, method: 'CASH' });
    const c = await api('billing').post(`/billing/invoices/${invoice.id}/discount`, { discount_pct: 5, reason: 'x' });
    note(`${a.body.invoice?.status}; ${b.status} "${b.body.error}"; ${c.status} "${c.body.error}"`);
    expect(a.body.invoice.status).toBe('PAID');
    expect([b.status, c.status]).toEqual([400, 400]);
  });

  tc({ id: 'IT-BIL-06', level: I, fr: ['FR-47'], title: 'Every payment gets a unique, sequential receipt number', input: 'Receipts of the two payments', expected: 'R-20261021-NNNN numbers, strictly increasing and unique' }, async (note) => {
    const inv = (await api('billing').get(`/billing/invoices/${invoice.id}`)).body;
    const nos = inv.payments.map((p) => p.receipt_no);
    note(nos.join(', '));
    expect(new Set(nos).size).toBe(nos.length);
    expect(nos.every((n) => /^R-20261021-\d{4}$/.test(n))).toBe(true);
    expect([...nos].sort()).toEqual(nos);
  });

  tc({ id: 'IT-BIL-07', level: I, fr: ['FR-47'], title: 'A receipt shows the balance right after that payment (DEF-02 regression)', input: 'GET /billing/receipts/{first payment}', expected: 'Amount ₹200, balance after ₹520 (not ₹0)' }, async (note) => {
    const inv = (await api('billing').get(`/billing/invoices/${invoice.id}`)).body;
    const r = (await api('billing').get(`/billing/receipts/${inv.payments[0].id}`)).body;
    note(`${r.receipt_no}: ₹${r.amount}, balance_after ₹${r.balance_after}`);
    expect(r.amount).toBe(200);
    expect(r.balance_after).toBe(520);
  });

  tc({ id: 'IT-BIL-08', level: I, fr: ['FR-44'], title: 'Cancelling an unpaid invoice releases its charges; paid invoices cannot be cancelled', input: 'Cancel the paid invoice; create an invoice for another visit and cancel it', expected: '409 for the paid invoice; 200 CANCELLED and charges billable again' }, async (note) => {
    const a = await api('billing').post(`/billing/invoices/${invoice.id}/cancel`, { reason: 'test' });
    // a second OPD visit with one lab test → one unbilled charge
    const p = (await api('reception').post('/patients', newPatient({ first_name: 'Ritam', last_name: 'Saha' }))).body;
    const ap = (await api('reception').post('/appointments', { patient_id: p.id, doctor_id: ctx.ids.sharma, date: '2026-10-21', start_time: '12:15' })).body;
    await api('reception').post(`/appointments/${ap.id}/check-in`);
    const c = (await api('dr.sharma').post(`/queue/${ctx.ids.sharma}/call-next`)).body.consultationId;
    const tests = (await api('dr.sharma').get('/lab/tests')).body;
    await api('dr.sharma').post('/lab/orders', { patient_id: p.id, consultation_id: c, test_ids: [tests.find((t) => t.code === 'TSH').id] });
    const inv2 = (await api('billing').post('/billing/invoices', { patient_id: p.id })).body;
    const b = await api('billing').post(`/billing/invoices/${inv2.id}/cancel`, { reason: 'Billed to wrong patient' });
    const again = (await api('billing').get(`/billing/unbilled?patientId=${p.id}`)).body;
    note(`paid invoice cancel ${a.status}; ${inv2.invoice_no} → ${b.body.status}; ${again.length} charge(s) billable again`);
    expect(a.status).toBe(409);
    expect(b.body.status).toBe('CANCELLED');
    expect(again.length).toBe(inv2.items.length);
  });

  tc({ id: 'IT-BIL-09', level: I, fr: ['FR-03'], title: 'Only billing staff can create invoices or take payments', input: 'Receptionist POST /billing/invoices; Admin POST payment', expected: '403, 403' }, async (note) => {
    const a = await api('reception').post('/billing/invoices', { patient_id: opd.id });
    const b = await api('admin').post(`/billing/invoices/${invoice.id}/payments`, { amount: 1, method: 'CASH' });
    note(`${a.status}, ${b.status}`);
    expect([a.status, b.status]).toEqual([403, 403]);
  });
});
