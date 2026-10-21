/* eslint-disable no-console */
// Demo / test data for MediFlow. All dates are generated relative to "today" so the dashboards look live.
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { db, tx, initDb } from './connection.js';
import { config } from '../config.js';
import { clock, todayStr, addDays, combineLocal, compactDate, toDateStr } from '../utils/clock.js';
import { generateSlots, isWorkingDay } from '../domain/appointmentRules.js';
import { formatPatientCode } from '../domain/patientRules.js';
import { round2 } from '../domain/money.js';
import { isAbnormal } from '../domain/labRules.js';

export const DEMO_PASSWORD = 'Mediflow@123';

// ── deterministic PRNG ──────────────────────────────────────────
function mulberry32(a) {
  return function rand() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rand = mulberry32(20261021);
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const iso = (d) => d.toISOString();
const minutesFrom = (d, m) => new Date(d.getTime() + m * 60000);

// ── reference data ──────────────────────────────────────────────
const DEPARTMENTS = [
  ['General Medicine', 'Primary care, fever, infections and chronic disease management'],
  ['Cardiology', 'Heart and blood vessel disorders'],
  ['Orthopaedics', 'Bones, joints, fractures and sports injuries'],
  ['Paediatrics', 'Medical care of infants, children and adolescents'],
  ['Dermatology', 'Skin, hair and nail conditions'],
  ['Gynaecology', "Women's health, pregnancy and reproductive care"],
  ['ENT', 'Ear, nose and throat disorders'],
  ['Neurology', 'Brain, spinal cord and nerve disorders'],
];

const STAFF = [
  { username: 'admin', full_name: 'Ritika Sen', role: 'ADMIN', email: 'admin@mediflow.local' },
  { username: 'reception', full_name: 'Pooja Verma', role: 'RECEPTIONIST', email: 'reception@mediflow.local' },
  { username: 'reception2', full_name: 'Sandeep Roy', role: 'RECEPTIONIST' },
  { username: 'lab', full_name: 'Rahul Paul', role: 'LAB_TECH', email: 'lab@mediflow.local' },
  { username: 'pharmacy', full_name: 'Neha Gupta', role: 'PHARMACIST', email: 'pharmacy@mediflow.local' },
  { username: 'billing', full_name: 'Vikram Singh', role: 'BILLING', email: 'billing@mediflow.local' },
];

const DOCTORS = [
  { username: 'dr.sharma', full_name: 'Dr. Arjun Sharma', dept: 'General Medicine', specialization: 'General Physician', qualification: 'MBBS, MD (Medicine)', fee: 500, avg: 12, slot: 15, start: '09:00', end: '17:00', days: '0,1,2,3,4,5,6', room: 'OPD-101' },
  { username: 'dr.banerjee', full_name: 'Dr. Meera Banerjee', dept: 'Cardiology', specialization: 'Interventional Cardiologist', qualification: 'MBBS, MD, DM (Cardiology)', fee: 900, avg: 20, slot: 20, start: '10:00', end: '16:00', days: '1,2,3,4,5', room: 'OPD-201' },
  { username: 'dr.khan', full_name: 'Dr. Imran Khan', dept: 'Orthopaedics', specialization: 'Orthopaedic Surgeon', qualification: 'MBBS, MS (Ortho)', fee: 700, avg: 15, slot: 15, start: '09:00', end: '15:00', days: '1,2,3,4,5,6', room: 'OPD-105' },
  { username: 'dr.iyer', full_name: 'Dr. Lakshmi Iyer', dept: 'Paediatrics', specialization: 'Paediatrician', qualification: 'MBBS, MD (Paediatrics)', fee: 600, avg: 12, slot: 15, start: '09:00', end: '14:00', days: '1,2,3,4,5,6', room: 'OPD-110' },
  { username: 'dr.das', full_name: 'Dr. Sourav Das', dept: 'Dermatology', specialization: 'Dermatologist', qualification: 'MBBS, MD (Dermatology)', fee: 600, avg: 10, slot: 15, start: '11:00', end: '17:00', days: '1,2,3,4,5,6', room: 'OPD-115' },
  { username: 'dr.ghosh', full_name: 'Dr. Ananya Ghosh', dept: 'Gynaecology', specialization: 'Obstetrician & Gynaecologist', qualification: 'MBBS, MS (OBG)', fee: 700, avg: 15, slot: 15, start: '09:00', end: '15:00', days: '1,2,3,4,5,6', room: 'OPD-120' },
  { username: 'dr.mehta', full_name: 'Dr. Rohan Mehta', dept: 'ENT', specialization: 'ENT Surgeon', qualification: 'MBBS, MS (ENT)', fee: 550, avg: 12, slot: 15, start: '10:00', end: '16:00', days: '1,2,3,4,5,6', room: 'OPD-125' },
  { username: 'dr.reddy', full_name: 'Dr. Kavya Reddy', dept: 'Neurology', specialization: 'Neurologist', qualification: 'MBBS, MD, DM (Neurology)', fee: 1000, avg: 20, slot: 20, start: '10:00', end: '16:00', days: '1,2,3,4,5', room: 'OPD-205' },
];

const DIAGNOSES = {
  'General Medicine': ['Acute viral fever', 'Type 2 diabetes mellitus', 'Essential hypertension', 'Upper respiratory tract infection', 'Acute gastroenteritis', 'Typhoid fever', 'Iron deficiency anaemia'],
  Cardiology: ['Stable angina', 'Essential hypertension', 'Atrial fibrillation', 'Dyslipidaemia', 'Heart failure (NYHA II)'],
  Orthopaedics: ['Lumbar spondylosis', 'Osteoarthritis of knee', 'Ankle sprain', 'Frozen shoulder', 'Distal radius fracture'],
  Paediatrics: ['Acute otitis media', 'Viral fever', 'Acute bronchiolitis', 'Acute gastroenteritis', 'Childhood asthma'],
  Dermatology: ['Atopic dermatitis', 'Tinea corporis', 'Acne vulgaris', 'Psoriasis', 'Urticaria'],
  Gynaecology: ['Polycystic ovary syndrome', 'Normal antenatal check-up', 'Urinary tract infection', 'Dysmenorrhoea'],
  ENT: ['Allergic rhinitis', 'Acute tonsillitis', 'Chronic sinusitis', 'Otitis externa'],
  Neurology: ['Migraine without aura', 'Tension-type headache', 'Peripheral neuropathy', 'Epilepsy – follow-up'],
};

const SYMPTOMS = ['Fever for 3 days with body ache', 'Headache and fatigue', 'Persistent dry cough', 'Pain in lower back for 2 weeks', 'Skin rash with itching', 'Abdominal pain and loose stools', 'Chest discomfort on exertion', 'Joint pain and stiffness in the morning', 'Sore throat and difficulty swallowing', 'Dizziness and palpitations'];

const LAB_TESTS = [
  ['HB', 'Haemoglobin', 'Haematology', 150, 'g/dL', 12, 17, null],
  ['TLC', 'Total Leucocyte Count', 'Haematology', 150, '×10³/µL', 4, 11, null],
  ['FBS', 'Fasting Blood Sugar', 'Biochemistry', 100, 'mg/dL', 70, 100, null],
  ['PPBS', 'Post-Prandial Blood Sugar', 'Biochemistry', 100, 'mg/dL', 70, 140, null],
  ['HBA1C', 'Glycated Haemoglobin (HbA1c)', 'Biochemistry', 450, '%', 4, 5.6, null],
  ['CHOL', 'Total Cholesterol', 'Biochemistry', 300, 'mg/dL', 125, 200, null],
  ['CREAT', 'Serum Creatinine', 'Biochemistry', 200, 'mg/dL', 0.6, 1.3, null],
  ['TSH', 'Thyroid Stimulating Hormone', 'Endocrinology', 400, 'µIU/mL', 0.4, 4.0, null],
  ['VITD', 'Vitamin D (25-OH)', 'Biochemistry', 1200, 'ng/mL', 30, 100, null],
  ['URINE', 'Urine Routine & Microscopy', 'Pathology', 120, null, null, null, 'No abnormality detected'],
  ['CXR', 'Chest X-Ray (PA view)', 'Radiology', 450, null, null, null, 'Normal study'],
  ['ECG', 'Electrocardiogram (12-lead)', 'Cardiology', 300, null, null, null, 'Normal sinus rhythm'],
];

// name, generic, form, strength, price, stock, reorder, expiryOffsetDays
const MEDICINES = [
  ['Paracetamol', 'Acetaminophen', 'Tablet', '500 mg', 2, 900, 100, 400],
  ['Amoxicillin', 'Amoxicillin', 'Capsule', '500 mg', 8, 400, 60, 300],
  ['Azithromycin', 'Azithromycin', 'Tablet', '500 mg', 25, 180, 40, 280],
  ['Cetirizine', 'Cetirizine', 'Tablet', '10 mg', 1.5, 500, 60, 500],
  ['Pantoprazole', 'Pantoprazole', 'Tablet', '40 mg', 6, 600, 80, 365],
  ['Metformin', 'Metformin', 'Tablet', '500 mg', 3, 700, 100, 420],
  ['Amlodipine', 'Amlodipine', 'Tablet', '5 mg', 4, 450, 60, 390],
  ['Atorvastatin', 'Atorvastatin', 'Tablet', '10 mg', 9, 350, 50, 330],
  ['Ibuprofen', 'Ibuprofen', 'Tablet', '400 mg', 3, 520, 80, 450],
  ['Omeprazole', 'Omeprazole', 'Capsule', '20 mg', 4, 300, 60, 260],
  ['Salbutamol Inhaler', 'Salbutamol', 'Inhaler', '100 mcg', 150, 6, 10, 240],
  ['Cough Syrup DX', 'Dextromethorphan', 'Syrup', '100 ml', 95, 40, 15, 18],
  ['ORS', 'Oral Rehydration Salts', 'Sachet', '21 g', 20, 120, 30, 25],
  ['Vitamin D3', 'Cholecalciferol', 'Capsule', '60000 IU', 35, 140, 30, 500],
  ['Calcium + D3', 'Calcium carbonate + D3', 'Tablet', '500 mg', 7, 380, 60, 480],
  ['Losartan', 'Losartan', 'Tablet', '50 mg', 6, 260, 50, 360],
  ['Aspirin', 'Acetylsalicylic acid', 'Tablet', '75 mg', 1.2, 600, 80, 520],
  ['Clopidogrel', 'Clopidogrel', 'Tablet', '75 mg', 8, 220, 40, 300],
  ['Levothyroxine', 'Levothyroxine', 'Tablet', '50 mcg', 2.5, 300, 50, 410],
  ['Diclofenac Gel', 'Diclofenac', 'Ointment', '30 g', 110, 45, 15, 330],
  ['Ondansetron', 'Ondansetron', 'Tablet', '4 mg', 5, 240, 40, 350],
  ['Insulin Glargine', 'Insulin glargine', 'Injection', '100 IU/ml', 650, 3, 10, 200],
  ['Ceftriaxone', 'Ceftriaxone', 'Injection', '1 g', 55, 12, 25, 260],
  ['Montelukast', 'Montelukast', 'Tablet', '10 mg', 12, 0, 40, 400],
  ['Betamethasone Cream', 'Betamethasone valerate', 'Ointment', '15 g', 65, 30, 10, -10],
  ['Iron + Folic Acid', 'Ferrous sulphate + folic acid', 'Tablet', '100 mg', 2, 500, 80, 450],
];

const WARDS = [
  ['General Ward A', 'GENERAL', 'Ground floor', 1500, 'GA-', 12],
  ['General Ward B', 'GENERAL', 'First floor', 1500, 'GB-', 10],
  ['Intensive Care Unit', 'ICU', 'Second floor', 8000, 'ICU-', 6],
  ['Private Rooms', 'PRIVATE', 'Third floor', 4500, 'PR-3', 8],
  ['Paediatric Ward', 'PEDIATRIC', 'First floor', 2000, 'PD-', 6],
];

const MALE = ['Aarav', 'Rohit', 'Sayan', 'Debojit', 'Arnab', 'Vikash', 'Rajesh', 'Sourav', 'Anirban', 'Kunal', 'Pritam', 'Abhishek', 'Manoj', 'Subhajit', 'Rahul', 'Amit', 'Tanmoy', 'Sudip', 'Rakesh', 'Nikhil'];
const FEMALE = ['Ananya', 'Priya', 'Riya', 'Sneha', 'Moumita', 'Puja', 'Shreya', 'Payel', 'Tanisha', 'Ishita', 'Kavita', 'Sunita', 'Debasree', 'Rimi', 'Nandini', 'Swati', 'Aditi', 'Madhumita', 'Sharmistha', 'Anjali'];
const LAST = ['Chatterjee', 'Mukherjee', 'Banerjee', 'Ghosh', 'Bose', 'Dutta', 'Saha', 'Mondal', 'Pal', 'Biswas', 'Sarkar', 'Roy', 'Kumar', 'Singh', 'Gupta', 'Agarwal', 'Nath', 'Halder', 'Das', 'Sen'];
const PLACES = ['Kalyani, Nadia', 'Kanchrapara, North 24 Parganas', 'Barrackpore, North 24 Parganas', 'Chakdaha, Nadia', 'Ranaghat, Nadia', 'Naihati, North 24 Parganas', 'Halisahar, North 24 Parganas', 'Salt Lake, Kolkata', 'Dum Dum, Kolkata', 'Krishnanagar, Nadia'];
const BLOOD = ['A+', 'B+', 'O+', 'AB+', 'A-', 'B-', 'O-', 'AB-'];
const BLOOD_W = [0.22, 0.32, 0.3, 0.08, 0.02, 0.02, 0.03, 0.01];
const weighted = (items, weights) => { let r = rand(); for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; } return items[items.length - 1]; };

// ── insert helpers ─────────────────────────────────────────────
function insert(table, row) {
  const cols = Object.keys(row);
  return db().prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => row[c])).lastInsertRowid;
}

const invoiceSeq = {};
const receiptSeq = {};
function nextNo(prefix, map, date) {
  const key = compactDate(date);
  map[key] = (map[key] || 0) + 1;
  return `${prefix}-${key}-${String(map[key]).padStart(4, '0')}`;
}

function addCharge(row) {
  return insert('charges', { ...row, amount: round2(row.quantity * row.unit_price) });
}

function invoiceFor(patientId, chargeIds, when, { admissionId = null, payMode = 'FULL', createdBy, receivedBy }) {
  const charges = chargeIds.map((id) => db().prepare('SELECT * FROM charges WHERE id = ?').get(id));
  const subtotal = round2(charges.reduce((s, c) => s + c.amount, 0));
  let discountPct = 0;
  if (chance(0.08)) discountPct = pick([5, 10, 15]);
  const discountAmount = round2((subtotal * discountPct) / 100);
  const total = round2(subtotal - discountAmount);
  const invId = insert('invoices', {
    invoice_no: nextNo('INV', invoiceSeq, when), patient_id: patientId, admission_id: admissionId, subtotal, discount_pct: discountPct,
    discount_amount: discountAmount, discount_reason: discountPct ? pick(['Senior citizen concession', 'Staff family discount', 'BPL concession']) : null,
    total, paid_amount: 0, status: 'UNPAID', created_by: createdBy, created_at: iso(when),
  });
  for (const c of charges) db().prepare('UPDATE charges SET invoice_id = ? WHERE id = ?').run(invId, c.id);
  let paid = 0;
  const pay = (amount, at) => {
    const method = weighted(['UPI', 'CASH', 'CARD'], [0.5, 0.35, 0.15]);
    insert('payments', {
      invoice_id: invId, receipt_no: nextNo('R', receiptSeq, at), amount, method,
      reference: method === 'CASH' ? null : `${method === 'UPI' ? 'UPI' : 'TXN'}${randInt(100000000, 999999999)}`,
      received_by: receivedBy, created_at: iso(at),
    });
    paid = round2(paid + amount);
  };
  if (payMode === 'FULL') pay(total, minutesFrom(when, randInt(1, 20)));
  if (payMode === 'PARTIAL') pay(round2(Math.floor(total * pick([0.3, 0.5, 0.6]))), minutesFrom(when, randInt(1, 20)));
  const status = paid <= 0 ? 'UNPAID' : paid >= total ? 'PAID' : 'PARTIALLY_PAID';
  db().prepare('UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?').run(paid, status, invId);
  return invId;
}

function vitals() {
  return { bp: `${randInt(108, 150)}/${randInt(68, 96)}`, pulse: randInt(64, 104), temperature: round2(97 + rand() * 4), weight: randInt(14, 92), spo2: randInt(94, 100) };
}

function labResult(test) {
  if (test.ref_low === null && test.ref_high === null) {
    return chance(0.8) ? { result_value: null, result_text: test.ref_text, is_abnormal: null } : { result_value: null, result_text: pick(['Mild cardiomegaly noted', 'Pus cells 8–10/hpf', 'Sinus tachycardia', 'Bilateral hilar prominence']), is_abnormal: null };
  }
  const span = test.ref_high - test.ref_low;
  const v = chance(0.7) ? test.ref_low + rand() * span : chance(0.5) ? test.ref_high + rand() * span * 0.6 : Math.max(0, test.ref_low - rand() * span * 0.4);
  const value = round2(v);
  const ab = isAbnormal(value, test.ref_low, test.ref_high);
  return { result_value: value, result_text: null, is_abnormal: ab ? 1 : 0 };
}

// ── main ───────────────────────────────────────────────────────
/**
 * @param {{profile?: 'demo'|'test'}} opts  'test' loads only reference data + a few patients (used by integration tests)
 */
export function seedDatabase({ profile = 'demo' } = {}) {
  rand = mulberry32(20261021);
  for (const k of Object.keys(invoiceSeq)) delete invoiceSeq[k];
  for (const k of Object.keys(receiptSeq)) delete receiptSeq[k];
  const now = clock.now();
  const today = todayStr();
  const hash = bcrypt.hashSync(DEMO_PASSWORD, config.bcryptRounds);
  const created = iso(minutesFrom(now, -60 * 24 * 90));

  return tx(() => {
    const ids = { users: {}, doctors: {}, depts: {}, tests: {}, meds: [], beds: [], patients: [] };

    for (const s of STAFF) ids.users[s.username] = insert('users', { username: s.username, password_hash: hash, full_name: s.full_name, role: s.role, email: s.email || null, created_at: created });
    for (const [name, description] of DEPARTMENTS) ids.depts[name] = insert('departments', { name, description });
    const doctorRows = [];
    for (const d of DOCTORS) {
      const uid = insert('users', { username: d.username, password_hash: hash, full_name: d.full_name, role: 'DOCTOR', email: `${d.username}@mediflow.local`, created_at: created });
      const did = insert('doctors', { user_id: uid, department_id: ids.depts[d.dept], specialization: d.specialization, qualification: d.qualification, consultation_fee: d.fee, avg_consult_minutes: d.avg, slot_minutes: d.slot, work_start: d.start, work_end: d.end, work_days: d.days, room: d.room });
      ids.users[d.username] = uid;
      ids.doctors[d.username] = did;
      doctorRows.push({ ...d, id: did, user_id: uid, work_start: d.start, work_end: d.end, work_days: d.days, slot_minutes: d.slot, department: d.dept });
    }
    for (const [code, name, category, price, unit, lo, hi, txt] of LAB_TESTS) ids.tests[code] = insert('lab_tests', { code, name, category, price, unit, ref_low: lo, ref_high: hi, ref_text: txt });
    const testRows = db().prepare('SELECT * FROM lab_tests').all();
    for (const [name, generic, form, strength, price, stock, reorder, expOff] of MEDICINES) {
      ids.meds.push(insert('medicines', { name, generic_name: generic, form, strength, unit_price: price, stock_qty: stock, reorder_level: reorder, batch_no: `B${randInt(1000, 9999)}${String.fromCharCode(65 + randInt(0, 25))}`, expiry_date: addDays(today, expOff), created_at: created }));
    }
    const medRows = db().prepare('SELECT * FROM medicines').all();
    const stocked = medRows.filter((m) => m.stock_qty > 50 && m.expiry_date > addDays(today, 60));
    for (const [name, type, floor, rate, prefix, count] of WARDS) {
      const wid = insert('wards', { name, type, floor, daily_rate: rate });
      for (let i = 1; i <= count; i++) ids.beds.push({ id: insert('beds', { ward_id: wid, bed_no: `${prefix}${String(i).padStart(2, '0')}`, status: 'AVAILABLE', updated_at: created }), ward: name, type, rate });
    }

    // Patients
    const patientCount = profile === 'test' ? 6 : 64;
    for (let i = 1; i <= patientCount; i++) {
      const gender = i % 2 ? 'MALE' : 'FEMALE';
      const first = gender === 'MALE' ? pick(MALE) : pick(FEMALE);
      const last = pick(LAST);
      const age = i % 9 === 0 ? randInt(2, 12) : randInt(18, 82);
      const dob = toDateStr(new Date(now.getFullYear() - age, randInt(0, 11), randInt(1, 28)));
      const regAt = minutesFrom(now, -randInt(15, 120) * 24 * 60 - randInt(0, 600));
      ids.patients.push(insert('patients', {
        patient_code: formatPatientCode(i), first_name: first, last_name: last, gender, dob, phone: `${pick(['9', '8', '7', '6'])}${randInt(100000000, 999999999)}`,
        email: chance(0.5) ? `${first.toLowerCase()}.${last.toLowerCase()}${randInt(1, 99)}@gmail.com` : null,
        address: `${randInt(1, 220)}, ${pick(['Block A', 'Block B', 'Main Road', 'Station Road', 'Lake Road', 'College More'])}, ${pick(PLACES)}`,
        blood_group: weighted(BLOOD, BLOOD_W), allergies: chance(0.15) ? pick(['Penicillin', 'Sulfa drugs', 'Peanuts', 'Dust mites']) : null,
        emergency_contact_name: `${pick([...MALE, ...FEMALE])} ${last}`, emergency_contact_phone: `9${randInt(100000000, 999999999)}`,
        created_by: ids.users.reception, created_at: iso(regAt),
      }));
    }
    if (profile === 'test') return ids;

    const patients = db().prepare('SELECT * FROM patients').all();
    const recUser = ids.users.reception;
    const billUser = ids.users.billing;
    const labUser = ids.users.lab;
    const pharmUser = ids.users.pharmacy;

    const busy = new Set(); // patient|date|time to avoid patient double-booking
    const makeVisit = (doc, dateStr, slot, status, opts = {}) => {
      let patient;
      for (let k = 0; k < 20; k++) {
        patient = opts.patient || pick(doc.department === 'Paediatrics' ? patients.filter((p) => (now.getFullYear() - Number(p.dob.slice(0, 4))) <= 14) : patients);
        if (!busy.has(`${patient.id}|${dateStr}|${slot.start}`)) break;
      }
      busy.add(`${patient.id}|${dateStr}|${slot.start}`);
      const slotStart = combineLocal(dateStr, slot.start);
      const row = {
        patient_id: patient.id, doctor_id: doc.id, date: dateStr, start_time: slot.start, end_time: slot.end,
        reason: pick(['Follow-up visit', 'New complaint', 'Routine check-up', 'Review of reports', 'Fever and cough', 'Pain management']),
        status, priority: opts.urgent ? 'URGENT' : 'NORMAL', priority_reason: opts.urgent ? 'High fever with breathlessness' : null,
        created_by: recUser, created_at: iso(minutesFrom(slotStart, -randInt(1, 5) * 24 * 60)),
      };
      if (['CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED'].includes(status)) {
        row.token_no = opts.token;
        row.checked_in_at = iso(opts.checkedInAt || minutesFrom(slotStart, -randInt(3, 15)));
      }
      if (['IN_CONSULTATION', 'COMPLETED'].includes(status)) row.consult_started_at = iso(opts.startedAt || minutesFrom(slotStart, randInt(0, 10)));
      if (status === 'COMPLETED') row.completed_at = iso(opts.completedAt || minutesFrom(new Date(row.consult_started_at), doc.avg + randInt(-3, 5)));
      if (status === 'CANCELLED') row.cancel_reason = pick(['Patient requested', 'Doctor unavailable', 'Rescheduled by patient']);
      const apptId = insert('appointments', row);
      return { apptId, patient, row };
    };

    const completeVisit = ({ apptId, patient, row }, doc, { bill = true, payMode = 'FULL', prescribe = 0.55, labs = 0.3, dispense = true } = {}) => {
      const startedAt = new Date(row.consult_started_at);
      const completedAt = row.completed_at ? new Date(row.completed_at) : null;
      const v = vitals();
      const consId = insert('consultations', {
        appointment_id: apptId, patient_id: patient.id, doctor_id: doc.id, symptoms: pick(SYMPTOMS), ...v,
        diagnosis: completedAt ? pick(DIAGNOSES[doc.department]) : null,
        notes: completedAt ? pick(['Advised rest and plenty of fluids.', 'Review after 1 week with reports.', 'Diet and lifestyle counselling given.', 'Continue current medication; monitor BP at home.', 'Physiotherapy advised.']) : null,
        follow_up_date: completedAt && chance(0.4) ? addDays(row.date, 7) : null,
        status: completedAt ? 'COMPLETED' : 'IN_PROGRESS', created_at: iso(startedAt), completed_at: completedAt ? iso(completedAt) : null,
      });
      if (!completedAt) return { consId };
      const chargeIds = [addCharge({ patient_id: patient.id, appointment_id: apptId, source_type: 'CONSULTATION', source_id: consId, description: `Consultation – ${doc.full_name} (${doc.department}) on ${row.date}`, quantity: 1, unit_price: doc.fee, created_at: iso(completedAt) })];
      if (chance(prescribe)) {
        const prId = insert('prescriptions', { consultation_id: consId, patient_id: patient.id, doctor_id: doc.id, status: dispense ? 'DISPENSED' : 'PENDING', created_at: iso(completedAt), dispensed_at: dispense ? iso(minutesFrom(completedAt, 15)) : null, dispensed_by: dispense ? pharmUser : null });
        for (const m of shuffle(stocked).slice(0, randInt(1, 3))) {
          const days = pick([3, 5, 7, 10]);
          const freq = pick(['1-0-1', '1-1-1', '0-0-1', '1-0-0']);
          const qty = days * freq.split('-').reduce((s, x) => s + Number(x), 0);
          const itemId = insert('prescription_items', { prescription_id: prId, medicine_id: m.id, dosage: `1 ${m.form === 'Syrup' ? '10 ml' : m.form.toLowerCase()}`, frequency: freq, duration_days: days, quantity: qty, instructions: pick(['After food', 'Before food', 'At bedtime', null]) });
          if (dispense) chargeIds.push(addCharge({ patient_id: patient.id, appointment_id: apptId, source_type: 'MEDICINE', source_id: itemId, description: `${m.name} ${m.strength} × ${qty}`, quantity: qty, unit_price: m.unit_price, created_at: iso(minutesFrom(completedAt, 15)) }));
        }
      }
      if (chance(labs)) {
        for (const t of shuffle(testRows).slice(0, randInt(1, 2))) {
          const res = labResult(t);
          const loId = insert('lab_orders', { patient_id: patient.id, doctor_id: doc.id, consultation_id: consId, lab_test_id: t.id, status: 'COMPLETED', priority: 'ROUTINE', ...res, remarks: null, sample_collected_at: iso(minutesFrom(completedAt, 20)), completed_at: iso(minutesFrom(completedAt, 180)), processed_by: labUser, created_at: iso(minutesFrom(startedAt, 5)) });
          chargeIds.push(addCharge({ patient_id: patient.id, appointment_id: apptId, source_type: 'LAB', source_id: loId, description: `Lab test – ${t.name} (${t.code})`, quantity: 1, unit_price: t.price, created_at: iso(minutesFrom(startedAt, 5)) }));
        }
      }
      if (bill) invoiceFor(patient.id, chargeIds, minutesFrom(completedAt, 30), { payMode, createdBy: billUser, receivedBy: billUser });
      return { consId, chargeIds };
    };

    // ── past 14 days of OPD activity ──
    for (let d = -14; d <= -1; d++) {
      const dateStr = addDays(today, d);
      for (const doc of doctorRows) {
        if (!isWorkingDay(doc, dateStr)) continue;
        const slots = shuffle(generateSlots(doc, dateStr)).slice(0, randInt(3, 7)).sort((a, b) => a.start.localeCompare(b.start));
        let token = 0;
        for (const slot of slots) {
          const r = rand();
          const status = r < 0.82 ? 'COMPLETED' : r < 0.92 ? 'CANCELLED' : 'NO_SHOW';
          const visit = makeVisit(doc, dateStr, slot, status, { token: status === 'COMPLETED' ? ++token : undefined });
          if (status === 'COMPLETED') {
            const recent = d >= -2;
            const payMode = recent && chance(0.25) ? 'PARTIAL' : recent && chance(0.15) ? 'NONE' : chance(0.06) ? 'PARTIAL' : 'FULL';
            completeVisit(visit, doc, { bill: !(d === -1 && chance(0.35)), payMode });
          }
        }
      }
    }

    // ── future bookings (next 5 days) ──
    for (let d = 1; d <= 5; d++) {
      const dateStr = addDays(today, d);
      for (const doc of doctorRows) {
        if (!isWorkingDay(doc, dateStr)) continue;
        for (const slot of shuffle(generateSlots(doc, dateStr)).slice(0, randInt(1, 4))) makeVisit(doc, dateStr, slot, 'SCHEDULED');
      }
    }

    // ── today: live queues ──
    for (const doc of doctorRows) {
      if (!isWorkingDay(doc, today)) continue;
      const slots = generateSlots(doc, today);
      const chosen = shuffle(slots).slice(0, Math.min(slots.length, randInt(9, 12))).sort((a, b) => a.start.localeCompare(b.start));
      const isDemoDoctor = doc.username === 'dr.sharma';
      const plan = isDemoDoctor
        ? ['COMPLETED', 'COMPLETED', 'COMPLETED', 'CHECKED_IN', 'CHECKED_IN', 'CHECKED_IN', 'CHECKED_IN']
        : ['COMPLETED', 'COMPLETED', 'IN_CONSULTATION', 'CHECKED_IN', 'CHECKED_IN', 'CANCELLED'];
      let token = 0;
      const nCompleted = plan.filter((p) => p === 'COMPLETED').length;
      const nWaiting = plan.filter((p) => p === 'CHECKED_IN').length;
      let completedIdx = 0;
      let waitingIdx = 0;
      chosen.forEach((slot, i) => {
        const status = plan[i] || 'SCHEDULED';
        let opts = {};
        if (status === 'COMPLETED') {
          const back = (nCompleted - completedIdx) * (doc.avg + 4) + 25;
          completedIdx += 1;
          const started = minutesFrom(now, -back);
          opts = { token: ++token, checkedInAt: minutesFrom(started, -randInt(10, 25)), startedAt: started, completedAt: minutesFrom(started, doc.avg) };
        } else if (status === 'IN_CONSULTATION') {
          opts = { token: ++token, checkedInAt: minutesFrom(now, -35), startedAt: minutesFrom(now, -randInt(3, 8)) };
        } else if (status === 'CHECKED_IN') {
          opts = { token: ++token, checkedInAt: minutesFrom(now, -(nWaiting - waitingIdx) * 7 - 2), urgent: isDemoDoctor && waitingIdx === 2 };
          waitingIdx += 1;
        }
        const visit = makeVisit(doc, today, slot, status, opts);
        if (status === 'COMPLETED') completeVisit(visit, doc, { bill: false, prescribe: isDemoDoctor ? 1 : 0.6, dispense: !isDemoDoctor, labs: 0.2 });
        if (status === 'IN_CONSULTATION') completeVisit({ ...visit, row: { ...visit.row, completed_at: null } }, doc);
      });
    }

    // Pending lab work for today (lab technician worklist)
    const todayConsults = db().prepare("SELECT c.*, a.date FROM consultations c JOIN appointments a ON a.id = c.appointment_id WHERE a.date = ?").all(today);
    const labDoc = Object.fromEntries(doctorRows.map((d) => [d.id, d]));
    todayConsults.slice(0, 6).forEach((c, i) => {
      const t = pick(testRows);
      const status = i < 3 ? 'ORDERED' : 'SAMPLE_COLLECTED';
      const at = minutesFrom(now, -randInt(10, 90));
      const loId = insert('lab_orders', { patient_id: c.patient_id, doctor_id: c.doctor_id, consultation_id: c.id, lab_test_id: t.id, status, priority: i === 0 ? 'STAT' : 'ROUTINE', sample_collected_at: status === 'SAMPLE_COLLECTED' ? iso(minutesFrom(at, 10)) : null, processed_by: status === 'SAMPLE_COLLECTED' ? labUser : null, created_at: iso(at) });
      addCharge({ patient_id: c.patient_id, appointment_id: c.appointment_id, source_type: 'LAB', source_id: loId, description: `Lab test – ${t.name} (${t.code})`, quantity: 1, unit_price: t.price, created_at: iso(at) });
      void labDoc;
    });

    // Make one of Dr. Sharma's pending prescriptions undispensable (insufficient stock) for the demo
    const pendingPr = db().prepare("SELECT id FROM prescriptions WHERE status = 'PENDING' ORDER BY id LIMIT 1").get();
    const insulin = medRows.find((m) => m.name === 'Insulin Glargine');
    if (pendingPr && insulin) insert('prescription_items', { prescription_id: pendingPr.id, medicine_id: insulin.id, dosage: '10 units', frequency: '0-0-1', duration_days: 30, quantity: 5, instructions: 'Subcutaneous at bedtime' });

    // ── inpatients ──
    const usedPatients = new Set();
    const pickInpatient = (child = false) => {
      for (let k = 0; k < 50; k++) {
        const p = pick(patients);
        const age = now.getFullYear() - Number(p.dob.slice(0, 4));
        if (usedPatients.has(p.id) || (child ? age > 14 : age <= 14)) continue;
        usedPatients.add(p.id);
        return p;
      }
      return null;
    };
    const REASONS = {
      GENERAL: ['Dengue fever with thrombocytopenia', 'Community-acquired pneumonia', 'Uncontrolled diabetes', 'Acute gastroenteritis with dehydration', 'Post-operative care (appendectomy)', 'Cellulitis of left leg'],
      ICU: ['Acute myocardial infarction', 'Severe sepsis', 'Diabetic ketoacidosis', 'Stroke – monitoring'],
      PRIVATE: ['Total knee replacement', 'Laparoscopic cholecystectomy', 'Chest pain evaluation', 'Lower segment caesarean section'],
      PEDIATRIC: ['Bronchiolitis', 'Febrile seizure', 'Acute gastroenteritis', 'Pneumonia'],
    };
    const docFor = { GENERAL: ['dr.sharma', 'dr.khan', 'dr.ghosh'], ICU: ['dr.banerjee', 'dr.reddy', 'dr.sharma'], PRIVATE: ['dr.khan', 'dr.ghosh', 'dr.banerjee'], PEDIATRIC: ['dr.iyer'] };
    let admSeq = 0;
    const admit = (bed, admittedAt, status) => {
      const patient = pickInpatient(bed.type === 'PEDIATRIC');
      if (!patient) return null;
      const docUser = pick(docFor[bed.type] || docFor.GENERAL);
      admSeq += 1;
      const admId = insert('admissions', {
        admission_no: `ADM-${compactDate(admittedAt)}-${String(admSeq).padStart(3, '0')}`, patient_id: patient.id, doctor_id: ids.doctors[docUser], bed_id: bed.id,
        reason: pick(REASONS[bed.type] || REASONS.GENERAL), status, admitted_at: iso(admittedAt), created_by: recUser,
      });
      insert('bed_stays', { admission_id: admId, bed_id: bed.id, daily_rate: bed.rate, start_at: iso(admittedAt) });
      return { admId, patient, docUser };
    };

    const beds = shuffle(ids.beds);
    let bi = 0;
    // Active admissions (~50% occupancy)
    const activeTarget = 20;
    for (let k = 0; k < activeTarget && bi < beds.length; k++, bi++) {
      const bed = beds[bi];
      const admittedAt = minutesFrom(now, -randInt(4, 24 * 7) * 60);
      const a = admit(bed, admittedAt, 'ADMITTED');
      if (!a) continue;
      db().prepare("UPDATE beds SET status = 'OCCUPIED', current_admission_id = ?, updated_at = ? WHERE id = ?").run(a.admId, iso(admittedAt), bed.id);
      if (chance(0.5)) {
        const t = pick(testRows.filter((x) => x.ref_low !== null));
        const res = labResult(t);
        const loId = insert('lab_orders', { patient_id: a.patient.id, doctor_id: ids.doctors[a.docUser], admission_id: a.admId, lab_test_id: t.id, status: 'COMPLETED', priority: 'ROUTINE', ...res, sample_collected_at: iso(minutesFrom(admittedAt, 60)), completed_at: iso(minutesFrom(admittedAt, 240)), processed_by: labUser, created_at: iso(minutesFrom(admittedAt, 30)) });
        addCharge({ patient_id: a.patient.id, admission_id: a.admId, source_type: 'LAB', source_id: loId, description: `Lab test – ${t.name} (${t.code})`, quantity: 1, unit_price: t.price, created_at: iso(minutesFrom(admittedAt, 30)) });
      }
    }
    // Two admissions awaiting discharge: one fully paid (can be discharged), one with balance (blocked)
    for (const payMode of ['FULL', 'PARTIAL']) {
      const bed = beds[bi++];
      const admittedAt = minutesFrom(now, -randInt(2, 5) * 24 * 60);
      const a = admit(bed, admittedAt, 'DISCHARGE_PENDING');
      db().prepare("UPDATE beds SET status = 'OCCUPIED', current_admission_id = ?, updated_at = ? WHERE id = ?").run(a.admId, iso(admittedAt), bed.id);
      const requested = minutesFrom(now, -90);
      const days = Math.max(1, Math.ceil((requested - admittedAt) / 86_400_000));
      db().prepare('UPDATE bed_stays SET end_at = ?, charged = 1 WHERE admission_id = ?').run(iso(requested), a.admId);
      db().prepare('UPDATE admissions SET discharge_requested_at = ?, discharge_summary = ? WHERE id = ?').run(iso(requested), 'Patient stable, afebrile for 48 hours. Continue oral medication and review in OPD after 7 days.', a.admId);
      const chargeIds = [addCharge({ patient_id: a.patient.id, admission_id: a.admId, source_type: 'BED', source_id: null, description: `Bed charges – ${bed.ward} (${days} day${days > 1 ? 's' : ''} @ ₹${bed.rate})`, quantity: days, unit_price: bed.rate, created_at: iso(requested) })];
      const t = pick(testRows.filter((x) => x.ref_low !== null));
      const loId = insert('lab_orders', { patient_id: a.patient.id, doctor_id: ids.doctors[a.docUser], admission_id: a.admId, lab_test_id: t.id, status: 'COMPLETED', priority: 'ROUTINE', ...labResult(t), sample_collected_at: iso(minutesFrom(admittedAt, 60)), completed_at: iso(minutesFrom(admittedAt, 200)), processed_by: labUser, created_at: iso(minutesFrom(admittedAt, 30)) });
      chargeIds.push(addCharge({ patient_id: a.patient.id, admission_id: a.admId, source_type: 'LAB', source_id: loId, description: `Lab test – ${t.name} (${t.code})`, quantity: 1, unit_price: t.price, created_at: iso(minutesFrom(admittedAt, 30)) }));
      invoiceFor(a.patient.id, chargeIds, minutesFrom(requested, 20), { admissionId: a.admId, payMode, createdBy: billUser, receivedBy: billUser });
    }
    // Historical discharged admissions
    for (let k = 0; k < 8; k++) {
      const bed = pick(ids.beds);
      const admittedAt = minutesFrom(now, -randInt(9, 30) * 24 * 60);
      const dischargedAt = minutesFrom(admittedAt, randInt(2, 6) * 24 * 60 + randInt(0, 600));
      const a = admit(bed, admittedAt, 'DISCHARGED');
      if (!a) continue;
      const days = Math.max(1, Math.ceil((dischargedAt - admittedAt) / 86_400_000));
      db().prepare('UPDATE bed_stays SET end_at = ?, charged = 1 WHERE admission_id = ?').run(iso(dischargedAt), a.admId);
      db().prepare('UPDATE admissions SET discharge_requested_at = ?, discharged_at = ?, discharge_summary = ? WHERE id = ?').run(iso(minutesFrom(dischargedAt, -120)), iso(dischargedAt), 'Recovered well. Discharged in stable condition with oral medication.', a.admId);
      const charge = addCharge({ patient_id: a.patient.id, admission_id: a.admId, source_type: 'BED', source_id: null, description: `Bed charges – ${bed.ward} (${days} days @ ₹${bed.rate})`, quantity: days, unit_price: bed.rate, created_at: iso(minutesFrom(dischargedAt, -120)) });
      invoiceFor(a.patient.id, [charge], minutesFrom(dischargedAt, -100), { admissionId: a.admId, payMode: 'FULL', createdBy: billUser, receivedBy: billUser });
    }
    // Remaining bed states for a realistic board
    const free = beds.slice(bi).filter((b) => db().prepare('SELECT status FROM beds WHERE id = ?').get(b.id).status === 'AVAILABLE');
    const setBed = (b, s) => db().prepare('UPDATE beds SET status = ?, updated_at = ? WHERE id = ?').run(s, iso(minutesFrom(now, -randInt(10, 120))), b.id);
    if (free[0]) setBed(free[0], 'CLEANING');
    if (free[1]) setBed(free[1], 'CLEANING');
    if (free[2]) setBed(free[2], 'MAINTENANCE');
    if (free[3]) setBed(free[3], 'RESERVED');

    insert('audit_logs', { ts: iso(now), user_id: null, username: 'system', role: null, action: 'SEED', entity: 'System', entity_id: null, summary: 'Demo data loaded (8 doctors, 64 patients, 14 days of history)' });
    return ids;
  });
}

// CLI: `npm run seed` → reset the database and load demo data
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initDb(config.dbPath, { reset: process.argv.includes('--reset') });
  const t0 = Date.now();
  seedDatabase();
  const c = (t) => db().prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  console.log(`[seed] done in ${Date.now() - t0} ms → users ${c('users')}, patients ${c('patients')}, appointments ${c('appointments')}, consultations ${c('consultations')}, lab orders ${c('lab_orders')}, admissions ${c('admissions')}, invoices ${c('invoices')}, payments ${c('payments')}`);
  console.log(`[seed] demo password for all accounts: ${DEMO_PASSWORD}`);
}
