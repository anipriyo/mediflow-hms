// Edge-case regression tests added during the hardening pass (invalid input, boundary dates, numbering, authorisation gaps).
import { beforeAll, describe, expect } from 'vitest';
import { tc } from '../helpers/tc.js';
import { setupApp, newPatient, TODAY, TOMORROW, checkedInPatient, resetClock } from './setup.js';
import { clock } from '../../server/utils/clock.js';

const I = 'Integration';
let ctx;
beforeAll(async () => { ctx = await setupApp(); });
const api = (u) => ctx.as(u);

describe('Edge cases – input validation', () => {
  tc({ id: 'IT-EDGE-01', level: I, fr: ['FR-08', 'FR-15', 'FR-16', 'FR-35'], title: 'Impossible calendar dates are rejected everywhere', input: 'Book on 2027-02-30; slots for 2026-13-01; DOB 1990-02-30; restock expiry 2027-02-31', expected: '400 "Not a valid calendar date" (or DOB equivalent) in all four cases; nothing stored' }, async (note) => {
    const p = (await api('reception').post('/patients', newPatient())).body;
    const book = await api('reception').post('/appointments', { patient_id: p.id, doctor_id: ctx.ids.sharma, date: '2027-02-30', start_time: '10:00' });
    const slots = await api('reception').get(`/doctors/${ctx.ids.sharma}/slots?date=2026-13-01`);
    const dob = await api('reception').post('/patients', newPatient({ dob: '1990-02-30' }));
    const exp = await api('pharmacy').post('/pharmacy/medicines/1/restock', { quantity: 5, expiry_date: '2027-02-31' });
    note(`booking ${book.status} "${book.body.error}"; slots ${slots.status}; DOB ${dob.status} "${dob.body.error}"; restock ${exp.status} "${exp.body.error}"`);
    expect([book.status, slots.status, dob.status, exp.status]).toEqual([400, 400, 400, 400]);
    expect(book.body.error).toMatch(/calendar date/);
    expect(dob.body.error).toMatch(/calendar date/);
  });

  tc({ id: 'IT-EDGE-02', level: I, fr: ['FR-20', 'FR-22', 'FR-49', 'FR-50'], title: 'Malformed date filters return 400 instead of a server error', input: 'reports ?from=abc&to=xyz; invoices ?from=abc; audit ?from=2026-99-99; queue ?date=xyz; appointments ?date=2026-02-31', expected: '400 with "must be a valid date" for every request (previously the report and list endpoints crashed with 500)' }, async (note) => {
    const r = [
      await api('admin').get('/reports/summary?from=abc&to=xyz'),
      await api('billing').get('/billing/invoices?from=abc'),
      await api('admin').get('/audit?from=2026-99-99'),
      await api('reception').get(`/queue/${ctx.ids.sharma}?date=xyz`),
      await api('reception').get('/appointments?date=2026-02-31'),
    ];
    note(r.map((x) => x.status).join(', '));
    expect(r.map((x) => x.status)).toEqual([400, 400, 400, 400, 400]);
  });

  tc({ id: 'IT-EDGE-03', level: I, fr: ['FR-49'], title: 'Report period must be ordered and at most 366 days', input: 'from=2026-10-30&to=2026-10-01; from=2024-01-01&to=2026-10-01; from=2026-10-01&to=2026-10-21', expected: '400 "from … must not be after …"; 400 "cannot exceed 366 days"; 200 with 21 daily rows' }, async (note) => {
    const a = await api('admin').get('/reports/summary?from=2026-10-30&to=2026-10-01');
    const b = await api('admin').get('/reports/summary?from=2024-01-01&to=2026-10-01');
    const c = await api('admin').get('/reports/summary?from=2026-10-01&to=2026-10-21');
    note(`${a.status} "${a.body.error}"; ${b.status} "${b.body.error}"; ${c.status} ${c.body.appointments?.length} days`);
    expect([a.status, b.status, c.status]).toEqual([400, 400, 200]);
    expect(c.body.appointments).toHaveLength(21);
  });

  tc({ id: 'IT-EDGE-04', level: I, fr: ['FR-08'], title: 'Patient fields must be text and within length limits', input: 'first_name as array ["a"]; first_name of 5,000 characters', expected: '400 "Must be text"; 400 "Must be at most 60 characters"' }, async (note) => {
    const a = await api('reception').post('/patients', newPatient({ first_name: ['a'] }));
    const b = await api('reception').post('/patients', newPatient({ first_name: 'x'.repeat(5000) }));
    note(`${a.status} "${a.body.error}"; ${b.status} "${b.body.error}"`);
    expect([a.status, b.status]).toEqual([400, 400]);
    expect(b.body.details.first_name).toMatch(/at most 60/);
  });

  tc({ id: 'IT-EDGE-05', level: I, fr: ['FR-08', 'FR-10'], title: 'Mobile numbers typed with +91, spaces or a leading 0 are normalised', input: 'Register with phone "+91 98765-43210"; search "9876543210"', expected: '201 with phone stored as 9876543210; search finds the patient' }, async (note) => {
    const res = await api('reception').post('/patients', newPatient({ first_name: 'Normal', last_name: 'Phone', phone: '+91 98765-43210' }));
    const found = (await api('reception').get('/patients?q=9876543210')).body.rows.map((r) => r.patient_code);
    note(`${res.status} phone=${res.body.phone}; search → ${found.join(',')}`);
    expect(res.status).toBe(201);
    expect(res.body.phone).toBe('9876543210');
    expect(found).toContain(res.body.patient_code);
  });

  tc({ id: 'IT-EDGE-06', level: I, fr: ['FR-10', 'FR-50'], title: 'Search terms containing % or _ are matched literally', input: 'GET /patients?q=% and /audit?q=%', expected: 'No rows (wildcards no longer match everything)' }, async (note) => {
    const a = (await api('reception').get('/patients?q=%25')).body;
    const b = (await api('admin').get('/audit?q=%25')).body;
    note(`patients ${a.rows.length}, audit ${b.rows.length}`);
    expect(a.rows).toHaveLength(0);
    expect(b.rows).toHaveLength(0);
  });

  tc({ id: 'IT-EDGE-07', level: I, fr: ['FR-10', 'FR-20'], title: 'Negative or non-numeric limit / offset values are clamped', input: '/patients?limit=-5; /appointments?limit=-1; /audit?limit=abc&offset=-1', expected: '200; limit=-5 returns at most 1 row (SQLite treats a negative LIMIT as "no limit")' }, async (note) => {
    const a = await api('reception').get('/patients?limit=-5');
    const b = await api('reception').get('/appointments?limit=-1');
    const c = await api('admin').get('/audit?limit=abc&offset=-1');
    note(`patients ${a.status} rows=${a.body.rows.length}; appointments ${b.status} rows=${b.body.length}; audit ${c.status} rows=${c.body.rows.length}`);
    expect([a.status, b.status, c.status]).toEqual([200, 200, 200]);
    expect(a.body.rows.length).toBeLessThanOrEqual(1);
    expect(b.body.length).toBeLessThanOrEqual(1);
  });

  tc({ id: 'IT-EDGE-08', level: I, fr: ['FR-39'], title: 'Non-text and over-long free-text values are rejected', input: 'Admission reason = 42; reason of 2,000 characters', expected: '400 "must be text"; 400 "at most 1000 characters"' }, async (note) => {
    const p = (await api('reception').post('/patients', newPatient())).body;
    const a = await api('reception').post('/admissions', { patient_id: p.id, doctor_id: ctx.ids.sharma, bed_id: 1, reason: 42 });
    const b = await api('reception').post('/admissions', { patient_id: p.id, doctor_id: ctx.ids.sharma, bed_id: 1, reason: 'y'.repeat(2000) });
    note(`${a.status} "${a.body.error}"; ${b.status} "${b.body.error}"`);
    expect([a.status, b.status]).toEqual([400, 400]);
  });
});

describe('Edge cases – workflow rules', () => {
  tc({ id: 'IT-EDGE-09', level: I, fr: ['FR-19'], title: 'A no-show cannot be recorded before the appointment has started', input: 'Today 15:00 appointment, clock 10:00: POST no-show', expected: '400 "can only be marked as no-show after its start time"; status stays SCHEDULED' }, async (note) => {
    const p = (await api('reception').post('/patients', newPatient())).body;
    const a = (await api('reception').post('/appointments', { patient_id: p.id, doctor_id: ctx.ids.sharma, date: TODAY, start_time: '15:00' })).body;
    const res = await api('reception').post(`/appointments/${a.id}/no-show`);
    const after = (await api('reception').get(`/appointments/${a.id}`)).body;
    note(`${res.status} "${res.body.error}"; status ${after.status}`);
    expect(res.status).toBe(400);
    expect(after.status).toBe('SCHEDULED');
  });

  tc({ id: 'IT-EDGE-10', level: I, fr: ['FR-13', 'FR-16'], title: 'Appointments cannot be booked with a deactivated doctor', input: 'Admin deactivates a newly added doctor; reception books tomorrow 10:00', expected: '409 DOCTOR_INACTIVE' }, async (note) => {
    const dep = (await api('admin').get('/departments')).body[0];
    const d = (await api('admin').post('/doctors', { username: 'dr.leave', full_name: 'Dr. On Leave', password: 'Doctor@123', department_id: dep.id, specialization: 'GP', consultation_fee: 300, avg_consult_minutes: 10, slot_minutes: 15, work_start: '09:00', work_end: '17:00', work_days: '0,1,2,3,4,5,6' })).body;
    const user = (await api('admin').get('/users')).body.find((u) => u.username === 'dr.leave');
    await api('admin').post(`/users/${user.id}/deactivate`);
    const p = (await api('reception').post('/patients', newPatient())).body;
    const res = await api('reception').post('/appointments', { patient_id: p.id, doctor_id: d.id, date: TOMORROW, start_time: '10:00' });
    note(`${res.status} ${res.body.code} "${res.body.error}"`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DOCTOR_INACTIVE');
  });

  tc({ id: 'IT-EDGE-11', level: I, fr: ['FR-28', 'FR-03'], title: 'Lab orders: only on the doctor\'s own consultation, duplicates ordered once', input: 'Dr. Banerjee orders on Dr. Sharma\'s consultation; Dr. Sharma orders [FBS, FBS]; then FBS again', expected: '403; 201 with one FBS order; 409 DUPLICATE_LAB_ORDER' }, async (note) => {
    const v = await checkedInPatient((u) => ctx.as(u), ctx.ids, '10:15');
    const c = (await api('dr.sharma').post(`/queue/${ctx.ids.sharma}/call-next`)).body.consultationId;
    const fbs = (await api('dr.sharma').get('/lab/tests')).body.find((t) => t.code === 'FBS').id;
    const other = await api('dr.banerjee').post('/lab/orders', { patient_id: v.patient.id, consultation_id: c, test_ids: [fbs] });
    const twice = await api('dr.sharma').post('/lab/orders', { patient_id: v.patient.id, consultation_id: c, test_ids: [fbs, fbs] });
    const again = await api('dr.sharma').post('/lab/orders', { patient_id: v.patient.id, consultation_id: c, test_ids: [fbs] });
    note(`other doctor ${other.status}; [FBS,FBS] → ${twice.status} ${twice.body.length} order(s); again ${again.status} ${again.body.code}`);
    expect(other.status).toBe(403);
    expect(twice.body).toHaveLength(1);
    expect(again.status).toBe(409);
    ctx.edgeConsultation = { c, v };
  });

  tc({ id: 'IT-EDGE-12', level: I, fr: ['FR-27'], title: 'The same medicine cannot appear twice in one prescription', input: 'Prescription with two Paracetamol lines', expected: '400 "Each medicine can appear only once…"' }, async (note) => {
    const { c } = ctx.edgeConsultation;
    const para = (await api('pharmacy').get('/pharmacy/medicines?q=Paracetamol')).body[0];
    const line = { medicine_id: para.id, dosage: '1 tablet', frequency: '1-0-1', duration_days: 3, quantity: 6 };
    const res = await api('dr.sharma').put(`/consultations/${c}/prescription`, { items: [line, line] });
    note(`${res.status} "${res.body.error}"`);
    expect(res.status).toBe(400);
    await api('dr.sharma').put(`/consultations/${c}`, { diagnosis: 'Viral fever' });
    await api('dr.sharma').post(`/consultations/${c}/complete`);
  });

  tc({ id: 'IT-EDGE-13', level: I, fr: ['FR-44', 'FR-46'], title: 'A zero-value invoice is settled automatically instead of staying UNPAID', input: 'Free-camp doctor (fee ₹0) completes a consultation; billing generates the invoice', expected: 'Invoice total ₹0 with status PAID (a ₹0 invoice could never be paid otherwise)' }, async (note) => {
    const dep = (await api('admin').get('/departments')).body[0];
    const d = (await api('admin').post('/doctors', { username: 'dr.camp', full_name: 'Dr. Free Camp', password: 'Doctor@123', department_id: dep.id, specialization: 'GP', consultation_fee: 0, avg_consult_minutes: 10, slot_minutes: 15, work_start: '09:00', work_end: '17:00', work_days: '0,1,2,3,4,5,6' })).body;
    const token = (await ctx.agent.post('/api/auth/login').send({ username: 'dr.camp', password: 'Doctor@123' })).body.token;
    const auth = (r) => r.set('Authorization', `Bearer ${token}`);
    const p = (await api('reception').post('/patients', newPatient())).body;
    const a = (await api('reception').post('/appointments', { patient_id: p.id, doctor_id: d.id, date: TODAY, start_time: '11:30' })).body;
    await api('reception').post(`/appointments/${a.id}/check-in`);
    const cid = (await auth(ctx.agent.post(`/api/queue/${d.id}/call-next`))).body.consultationId;
    await auth(ctx.agent.put(`/api/consultations/${cid}`)).send({ diagnosis: 'Healthy – routine screening' });
    await auth(ctx.agent.post(`/api/consultations/${cid}/complete`));
    const inv = await api('billing').post('/billing/invoices', { patient_id: p.id });
    note(`${inv.status} ${inv.body.invoice_no} total ₹${inv.body.total} status ${inv.body.status}`);
    expect(inv.body.total).toBe(0);
    expect(inv.body.status).toBe('PAID');
  });

  tc({ id: 'IT-EDGE-14', level: I, fr: ['FR-39', 'FR-44', 'FR-47'], title: 'Admission, invoice and receipt numbers stay unique when older numbers are out of sequence', input: 'Database already holds ADM-20261021-005 (discharged), INV-20261021-0009 and R-20261021-0009 from an earlier import; create one more of each', expected: 'New numbers ADM-…-006, INV-…-0010, R-…-0010 – continuing after the highest existing number (a COUNT-based counter gives 002/0002 here and collides with an existing number once the count catches up)' }, async (note) => {
    const d = ctx.db();
    const p = (await api('reception').post('/patients', newPatient())).body;
    const freeBed = d.prepare("SELECT id FROM beds WHERE status = 'AVAILABLE' ORDER BY id DESC").get().id;
    d.prepare("INSERT INTO admissions (admission_no, patient_id, doctor_id, bed_id, reason, status, admitted_at, discharged_at) VALUES ('ADM-20261021-005', ?, ?, ?, 'Imported record', 'DISCHARGED', ?, ?)").run(p.id, ctx.ids.sharma, freeBed, '2026-10-21T00:00:00.000Z', '2026-10-21T01:00:00.000Z');
    const invId = d.prepare("INSERT INTO invoices (invoice_no, patient_id, subtotal, total, paid_amount, status, created_at) VALUES ('INV-20261021-0009', ?, 100, 100, 100, 'PAID', ?)").run(p.id, '2026-10-21T01:00:00.000Z').lastInsertRowid;
    d.prepare("INSERT INTO payments (invoice_id, receipt_no, amount, method, created_at) VALUES (?, 'R-20261021-0009', 100, 'CASH', ?)").run(invId, '2026-10-21T01:00:00.000Z');
    const p2 = (await api('reception').post('/patients', newPatient())).body;
    const adm = await api('reception').post('/admissions', { patient_id: p2.id, doctor_id: ctx.ids.sharma, bed_id: freeBed, reason: 'Observation' });
    const tests = (await api('dr.sharma').get('/lab/tests')).body;
    await api('dr.sharma').post('/lab/orders', { patient_id: p2.id, admission_id: adm.body.id, test_ids: [tests.find((t) => t.code === 'HB').id] });
    const inv = await api('billing').post('/billing/invoices', { patient_id: p2.id, admission_id: adm.body.id });
    const pay = await api('billing').post(`/billing/invoices/${inv.body.id}/payments`, { amount: inv.body.total, method: 'CASH' });
    note(`${adm.status} ${adm.body.admission_no}; ${inv.status} ${inv.body.invoice_no}; ${pay.status} ${pay.body.receipt?.receipt_no}`);
    expect(adm.body.admission_no).toBe('ADM-20261021-006');
    expect(inv.body.invoice_no).toBe('INV-20261021-0010');
    expect(pay.body.receipt.receipt_no).toBe('R-20261021-0010');
  });

  tc({ id: 'IT-EDGE-15', level: I, fr: ['FR-43', 'FR-44'], title: 'Cancelling the admission invoice re-blocks discharge', input: 'Discharge-pending admission whose invoice is cancelled; reception tries to discharge', expected: '409 BILLING_NOT_CLEARED because the released charges are unbilled again' }, async (note) => {
    const p = (await api('reception').post('/patients', newPatient())).body;
    const bed = ctx.db().prepare("SELECT id FROM beds WHERE status = 'AVAILABLE' ORDER BY id").get().id;
    const adm = (await api('reception').post('/admissions', { patient_id: p.id, doctor_id: ctx.ids.sharma, bed_id: bed, reason: 'Observation' })).body;
    await api('dr.sharma').post(`/admissions/${adm.id}/request-discharge`, { summary: 'Stable, discharged on oral medication.' });
    const inv = (await api('billing').post('/billing/invoices', { patient_id: p.id, admission_id: adm.id })).body;
    await api('billing').post(`/billing/invoices/${inv.id}/cancel`, { reason: 'Wrong ward rate' });
    const res = await api('reception').post(`/admissions/${adm.id}/discharge`);
    note(`${res.status} ${res.body.code} "${res.body.error}"`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BILLING_NOT_CLEARED');
  });

  tc({ id: 'IT-EDGE-16', level: I, fr: ['FR-31'], title: 'Lab worklist date filter uses the local (IST) day, not the UTC day', input: 'Clock 22-Oct-2026 01:00 IST (21-Oct 19:30 UTC); doctor orders TSH; filter date=2026-10-22 and date=2026-10-21', expected: 'Order listed for 2026-10-22, not for 2026-10-21' }, async (note) => {
    clock.freeze(new Date(2026, 9, 22, 1, 0, 0));
    await ctx.relogin();
    const p = (await api('reception').post('/patients', newPatient())).body;
    const tsh = (await api('dr.sharma').get('/lab/tests')).body.find((t) => t.code === 'TSH').id;
    const order = (await api('dr.sharma').post('/lab/orders', { patient_id: p.id, test_ids: [tsh] })).body[0];
    const on22 = (await api('lab').get('/lab/orders?date=2026-10-22')).body.map((o) => o.id);
    const on21 = (await api('lab').get('/lab/orders?date=2026-10-21')).body.map((o) => o.id);
    note(`order ${order.id} created_at ${order.created_at}; in 22-Oct list=${on22.includes(order.id)}, in 21-Oct list=${on21.includes(order.id)}`);
    expect(on22).toContain(order.id);
    expect(on21).not.toContain(order.id);
    resetClock();
    await ctx.relogin();
  });
});
