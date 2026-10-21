import { beforeAll, describe, expect } from 'vitest';
import { tc } from '../helpers/tc.js';
import { setupApp, checkedInPatient, newPatient } from './setup.js';

const I = 'Integration';
let ctx;
let visit; // { patient, appointment }
let consultationId;
let prescriptionId;
let labOrderIds;
beforeAll(async () => {
  ctx = await setupApp();
  visit = await checkedInPatient((u) => ctx.as(u), ctx.ids, '10:15');
  const called = (await ctx.as('dr.sharma').post(`/queue/${ctx.ids.sharma}/call-next`)).body;
  consultationId = called.consultationId;
});
const api = (u) => ctx.as(u);
const med = async (name) => (await api('pharmacy').get(`/pharmacy/medicines?q=${encodeURIComponent(name)}`)).body[0];

describe('Consultation & medical records (CON)', () => {
  tc({ id: 'IT-CON-01', level: I, fr: ['FR-26'], title: 'Doctor saves vitals, symptoms and diagnosis; malformed vitals are rejected', input: 'PUT /consultations/{id} with BP "120-80"; then BP 128/84, pulse 88, diagnosis "Acute viral fever"', expected: '400 "BP must look like 120/80"; then 200 with saved values' }, async (note) => {
    const bad = await api('dr.sharma').put(`/consultations/${consultationId}`, { bp: '120-80' });
    const ok = await api('dr.sharma').put(`/consultations/${consultationId}`, { bp: '128/84', pulse: 88, temperature: 100.4, spo2: 97, symptoms: 'Fever and body ache for 3 days', diagnosis: 'Acute viral fever', notes: 'Hydration advised' });
    note(`${bad.status} "${bad.body.error}"; ${ok.status} BP ${ok.body.bp}, diagnosis "${ok.body.diagnosis}"`);
    expect(bad.status).toBe(400);
    expect(ok.status).toBe(200);
    expect(ok.body.diagnosis).toBe('Acute viral fever');
  });

  tc({ id: 'IT-CON-02', level: I, fr: ['FR-26'], title: 'A consultation cannot be completed without a diagnosis', input: 'Second patient: call next, then complete with empty diagnosis', expected: '400 "Diagnosis is required to complete the consultation"' }, async (note) => {
    // finish the current consultation first
    await api('dr.sharma').post(`/consultations/${consultationId}/complete`);
    const v2 = await checkedInPatient((u) => ctx.as(u), ctx.ids, '10:30');
    const c2 = (await api('dr.sharma').post(`/queue/${ctx.ids.sharma}/call-next`)).body.consultationId;
    const res = await api('dr.sharma').post(`/consultations/${c2}/complete`);
    note(`${res.status} "${res.body.error}"`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Diagnosis is required/);
    consultationId = c2;
    visit = v2;
  });

  tc({ id: 'IT-CON-03', level: I, fr: ['FR-27'], title: 'Prescriptions need a positive quantity; a valid prescription is saved', input: 'Items: Paracetamol qty 0; then Paracetamol 1-0-1 × 5 days qty 10 and Pantoprazole 1-0-0 × 5 qty 5', expected: '400 "Quantity must be greater than 0"; then 200 with 2 PENDING items' }, async (note) => {
    const para = await med('Paracetamol');
    const panto = await med('Pantoprazole');
    const bad = await api('dr.sharma').put(`/consultations/${consultationId}/prescription`, { items: [{ medicine_id: para.id, dosage: '1 tablet', frequency: '1-0-1', duration_days: 5, quantity: 0 }] });
    const ok = await api('dr.sharma').put(`/consultations/${consultationId}/prescription`, {
      items: [
        { medicine_id: para.id, dosage: '1 tablet', frequency: '1-0-1', duration_days: 5, quantity: 10, instructions: 'After food' },
        { medicine_id: panto.id, dosage: '1 tablet', frequency: '1-0-0', duration_days: 5, quantity: 5, instructions: 'Before breakfast' },
      ],
    });
    prescriptionId = ok.body.prescription?.id;
    note(`${bad.status} "${bad.body.error}"; ${ok.status} prescription #${prescriptionId} ${ok.body.prescription?.status} with ${ok.body.prescription?.items.length} items`);
    expect(bad.status).toBe(400);
    expect(ok.body.prescription.items).toHaveLength(2);
    expect(ok.body.prescription.status).toBe('PENDING');
  });

  tc({ id: 'IT-CON-04', level: I, fr: ['FR-28', 'FR-34'], title: 'Ordering lab tests during a consultation creates orders and unbilled charges', input: 'POST /lab/orders FBS + HB (STAT) for the open consultation', expected: '201 with 2 ORDERED orders; 2 LAB charges (₹100 + ₹150) unbilled' }, async (note) => {
    const tests = (await api('dr.sharma').get('/lab/tests')).body;
    const ids = ['FBS', 'HB'].map((c) => tests.find((t) => t.code === c).id);
    const res = await api('dr.sharma').post('/lab/orders', { patient_id: visit.patient.id, consultation_id: consultationId, test_ids: ids, priority: 'STAT' });
    labOrderIds = res.body.map((o) => o.id);
    const charges = (await api('billing').get(`/billing/unbilled?patientId=${visit.patient.id}`)).body.filter((c) => c.source_type === 'LAB');
    note(`${res.status}: ${res.body.map((o) => `${o.test_code} ${o.status}`).join(', ')}; charges ${charges.map((c) => c.amount).join(' + ')}`);
    expect(res.status).toBe(201);
    expect(charges.map((c) => c.amount).sort()).toEqual([100, 150]);
  });

  tc({ id: 'IT-CON-05', level: I, fr: ['FR-29'], title: 'Completing a consultation closes the visit and charges the consultation fee', input: 'Save diagnosis "Type 2 diabetes mellitus", POST complete', expected: 'Appointment COMPLETED; CONSULTATION charge ₹500 unbilled; further edits rejected (409)' }, async (note) => {
    await api('dr.sharma').put(`/consultations/${consultationId}`, { diagnosis: 'Type 2 diabetes mellitus' });
    const res = await api('dr.sharma').post(`/consultations/${consultationId}/complete`);
    const appt = (await api('reception').get(`/appointments/${visit.appointment.id}`)).body;
    const fee = (await api('billing').get(`/billing/unbilled?patientId=${visit.patient.id}`)).body.find((c) => c.source_type === 'CONSULTATION');
    const edit = await api('dr.sharma').put(`/consultations/${consultationId}`, { notes: 'late edit' });
    note(`${res.status} consultation ${res.body.status}; appointment ${appt.status}; fee ₹${fee?.amount}; late edit ${edit.status}`);
    expect(appt.status).toBe('COMPLETED');
    expect(fee.amount).toBe(500);
    expect(edit.status).toBe(409);
  });

  tc({ id: 'IT-CON-06', level: I, fr: ['FR-30'], title: 'Clinical notes are hidden from non-clinical roles', input: 'Receptionist and Billing GET /consultations/{id}; Receptionist GET /patients/{id}/history', expected: '403, 403; history without consultations/prescriptions' }, async (note) => {
    const a = await api('reception').get(`/consultations/${consultationId}`);
    const b = await api('billing').get(`/consultations/${consultationId}`);
    const h = (await api('reception').get(`/patients/${visit.patient.id}/history`)).body;
    const d = (await api('dr.sharma').get(`/patients/${visit.patient.id}/history`)).body;
    note(`${a.status}, ${b.status}; receptionist history has consultations=${'consultations' in h}; doctor sees ${d.consultations.length} consultation(s)`);
    expect([a.status, b.status]).toEqual([403, 403]);
    expect(h.consultations).toBeUndefined();
    expect(d.consultations.length).toBeGreaterThan(0);
  });
});

describe('Laboratory (LAB)', () => {
  tc({ id: 'IT-LAB-01', level: I, fr: ['FR-31'], title: 'Lab worklist can be filtered by status', input: 'Lab tech GET /lab/orders?status=ORDERED', expected: 'The two new orders, STAT first' }, async (note) => {
    const res = (await api('lab').get('/lab/orders?status=ORDERED')).body;
    note(`${res.length} order(s): ${res.map((o) => `${o.test_code}/${o.priority}`).join(', ')}`);
    expect(res.map((o) => o.id).sort()).toEqual([...labOrderIds].sort());
    expect(res.every((o) => o.status === 'ORDERED')).toBe(true);
  });

  tc({ id: 'IT-LAB-02', level: I, fr: ['FR-32'], title: 'Result entry is refused before the sample is collected', input: 'POST /lab/orders/{FBS}/result directly from ORDERED', expected: '409 INVALID_STATE' }, async (note) => {
    const res = await api('lab').post(`/lab/orders/${labOrderIds[0]}/result`, { result_value: 90 });
    note(`${res.status} ${res.body.code} "${res.body.error}"`);
    expect(res.status).toBe(409);
  });

  tc({ id: 'IT-LAB-03', level: I, fr: ['FR-32', 'FR-33'], title: 'Collect sample then record result; out-of-range values are flagged abnormal', input: 'FBS: collect, result 162 mg/dL (ref 70–100)', expected: 'SAMPLE_COLLECTED then COMPLETED with is_abnormal = 1' }, async (note) => {
    const c = await api('lab').post(`/lab/orders/${labOrderIds[0]}/collect`);
    const r = await api('lab').post(`/lab/orders/${labOrderIds[0]}/result`, { result_value: 162, remarks: 'Fasting confirmed' });
    note(`collect ${c.body.status}; result ${r.body.status}, value ${r.body.result_value} ${r.body.unit}, abnormal=${r.body.is_abnormal}`);
    expect(c.body.status).toBe('SAMPLE_COLLECTED');
    expect(r.body.status).toBe('COMPLETED');
    expect(r.body.is_abnormal).toBe(1);
  });

  tc({ id: 'IT-LAB-04', level: I, fr: ['FR-32'], title: 'Only lab technicians can process samples', input: 'Doctor POST /lab/orders/{HB}/collect', expected: '403' }, async (note) => {
    const res = await api('dr.sharma').post(`/lab/orders/${labOrderIds[1]}/collect`);
    note(`${res.status}`);
    expect(res.status).toBe(403);
  });

  tc({ id: 'IT-LAB-05', level: I, fr: ['FR-34'], title: 'Cancelling an ORDERED test removes its unbilled charge', input: 'Cancel HB order with reason "Duplicate order"', expected: 'Status CANCELLED; LAB charge for HB no longer unbilled' }, async (note) => {
    const res = await api('lab').post(`/lab/orders/${labOrderIds[1]}/cancel`, { reason: 'Duplicate order' });
    const lab = (await api('billing').get(`/billing/unbilled?patientId=${visit.patient.id}`)).body.filter((c) => c.source_type === 'LAB');
    note(`${res.body.status}; remaining LAB charges: ${lab.map((c) => c.description).join(' | ')}`);
    expect(res.body.status).toBe('CANCELLED');
    expect(lab).toHaveLength(1);
  });

  tc({ id: 'IT-LAB-06', level: I, fr: ['FR-31'], title: 'Lab status counters can be limited to one doctor (DEF-07 regression)', input: 'GET /lab/stats?doctorId={sharma} vs {banerjee}', expected: 'Sharma: 1 COMPLETED + 1 CANCELLED; Banerjee: no orders' }, async (note) => {
    const s = (await api('dr.sharma').get(`/lab/stats?doctorId=${ctx.ids.sharma}`)).body;
    const b = (await api('dr.sharma').get(`/lab/stats?doctorId=${ctx.ids.banerjee}`)).body;
    note(`sharma ${JSON.stringify(s)}; banerjee ${JSON.stringify(b)}`);
    expect(s).toEqual({ COMPLETED: 1, CANCELLED: 1 });
    expect(b).toEqual({});
  });
});

describe('Pharmacy & inventory (PHA)', () => {
  tc({ id: 'IT-PHA-01', level: I, fr: ['FR-35'], title: 'Pharmacist adds a medicine and restocks it; expired batches are refused', input: 'Add "Doxycycline 100 mg" stock 50; restock +100 batch DX2027 exp 2027-08-31; restock with expiry 2026-10-01', expected: '201 stock 50; 200 stock 150; 400' }, async (note) => {
    const a = await api('pharmacy').post('/pharmacy/medicines', { name: 'Doxycycline', generic_name: 'Doxycycline', form: 'Capsule', strength: '100 mg', unit_price: 6, stock_qty: 50, reorder_level: 20, batch_no: 'DX2026', expiry_date: '2027-03-31' });
    const b = await api('pharmacy').post(`/pharmacy/medicines/${a.body.id}/restock`, { quantity: 100, batch_no: 'DX2027', expiry_date: '2027-08-31' });
    const c = await api('pharmacy').post(`/pharmacy/medicines/${a.body.id}/restock`, { quantity: 10, expiry_date: '2026-10-01' });
    note(`${a.status} stock ${a.body.stock_qty}; ${b.status} stock ${b.body.stock_qty}; ${c.status} "${c.body.error}"`);
    expect([a.status, b.status, c.status]).toEqual([201, 200, 400]);
    expect(b.body.stock_qty).toBe(150);
  });

  tc({ id: 'IT-PHA-02', level: I, fr: ['FR-36'], title: 'Stock alerts report low-stock, out-of-stock and expiring medicines', input: 'GET /pharmacy/alerts on reference data', expected: 'Includes OUT_OF_STOCK Montelukast, LOW_STOCK Insulin Glargine, EXPIRED Betamethasone, NEAR_EXPIRY Cough Syrup DX' }, async (note) => {
    const alerts = (await api('pharmacy').get('/pharmacy/alerts')).body;
    const has = (type, name) => alerts.some((a) => a.type === type && a.medicine.name === name);
    const r = [has('OUT_OF_STOCK', 'Montelukast'), has('LOW_STOCK', 'Insulin Glargine'), has('EXPIRED', 'Betamethasone Cream'), has('NEAR_EXPIRY', 'Cough Syrup DX')];
    note(`${alerts.length} alerts; ${r.join(', ')}`);
    expect(r).toEqual([true, true, true, true]);
  });

  tc({ id: 'IT-PHA-03', level: I, fr: ['FR-37', 'NFR-04'], title: 'Dispensing is all-or-nothing when one item is out of stock', input: 'Prescription: Paracetamol 10 + Insulin Glargine 5 (only 3 in stock)', expected: '409 CANNOT_DISPENSE; Paracetamol stock unchanged; prescription still PENDING' }, async (note) => {
    const v = await checkedInPatient((u) => ctx.as(u), ctx.ids, '11:00');
    const c = (await api('dr.sharma').post(`/queue/${ctx.ids.sharma}/call-next`)).body.consultationId;
    const para = await med('Paracetamol');
    const insulin = await med('Insulin');
    const rx = (await api('dr.sharma').put(`/consultations/${c}/prescription`, { items: [{ medicine_id: para.id, dosage: '1 tab', frequency: '1-0-1', duration_days: 5, quantity: 10 }, { medicine_id: insulin.id, dosage: '10 units', frequency: '0-0-1', duration_days: 30, quantity: 5 }] })).body.prescription;
    await api('dr.sharma').put(`/consultations/${c}`, { diagnosis: 'Type 2 diabetes mellitus' });
    await api('dr.sharma').post(`/consultations/${c}/complete`);
    const res = await api('pharmacy').post(`/pharmacy/prescriptions/${rx.id}/dispense`);
    const after = await med('Paracetamol');
    const pr = (await api('pharmacy').get(`/pharmacy/prescriptions/${rx.id}`)).body;
    note(`${res.status} ${res.body.code} "${res.body.error}"; paracetamol ${para.stock_qty} → ${after.stock_qty}; prescription ${pr.status}`);
    expect(res.status).toBe(409);
    expect(after.stock_qty).toBe(para.stock_qty);
    expect(pr.status).toBe('PENDING');
    void v;
  });

  tc({ id: 'IT-PHA-04', level: I, fr: ['FR-37'], title: 'Dispensing a valid prescription reduces stock and adds medicine charges', input: 'Dispense the prescription from IT-CON-03 (Paracetamol 10, Pantoprazole 5)', expected: 'DISPENSED; stock −10 and −5; MEDICINE charges ₹20 and ₹30' }, async (note) => {
    const para = await med('Paracetamol');
    const panto = await med('Pantoprazole');
    const res = await api('pharmacy').post(`/pharmacy/prescriptions/${prescriptionId}/dispense`);
    const p2 = await med('Paracetamol');
    const pa2 = await med('Pantoprazole');
    const charges = (await api('billing').get(`/billing/unbilled?patientId=${res.body.patient_id}`)).body.filter((c) => c.source_type === 'MEDICINE');
    note(`${res.status} ${res.body.status}; paracetamol ${para.stock_qty}→${p2.stock_qty}, pantoprazole ${panto.stock_qty}→${pa2.stock_qty}; charges ${charges.map((c) => c.amount).join(', ')}`);
    expect(res.body.status).toBe('DISPENSED');
    expect([para.stock_qty - p2.stock_qty, panto.stock_qty - pa2.stock_qty]).toEqual([10, 5]);
    expect(charges.map((c) => c.amount).sort((a, b) => a - b)).toEqual([20, 30]);
  });

  tc({ id: 'IT-PHA-05', level: I, fr: ['FR-37', 'FR-03'], title: 'Only pharmacists can dispense; a prescription cannot be dispensed twice', input: 'Doctor dispenses; pharmacist dispenses the same prescription again', expected: '403; 409' }, async (note) => {
    const a = await api('dr.sharma').post(`/pharmacy/prescriptions/${prescriptionId}/dispense`);
    const b = await api('pharmacy').post(`/pharmacy/prescriptions/${prescriptionId}/dispense`);
    note(`${a.status}; ${b.status} "${b.body.error}"`);
    expect([a.status, b.status]).toEqual([403, 409]);
    void newPatient;
  });
});
