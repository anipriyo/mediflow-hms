import { beforeAll, describe, expect } from 'vitest';
import { tc } from '../helpers/tc.js';
import { setupApp, newPatient, TODAY, TOMORROW, advance, resetClock, checkedInPatient } from './setup.js';

const I = 'Integration';
let ctx;
beforeAll(async () => { ctx = await setupApp(); });
const api = (u) => ctx.as(u);

describe('Patient management (PAT)', () => {
  tc({ id: 'IT-PAT-01', level: I, fr: ['FR-07'], title: 'Registering a patient generates the next sequential patient ID', input: 'POST /patients with valid details (6 patients already exist)', expected: '201, patient_code P00007, then P00008' }, async (note) => {
    const a = await api('reception').post('/patients', newPatient({ first_name: 'Arjun', last_name: 'Bose' }));
    const b = await api('reception').post('/patients', newPatient({ first_name: 'Mitali', last_name: 'Kar' }));
    note(`${a.status} ${a.body.patient_code}, ${b.status} ${b.body.patient_code}`);
    expect(a.status).toBe(201);
    expect([a.body.patient_code, b.body.patient_code]).toEqual(['P00007', 'P00008']);
  });

  tc({ id: 'IT-PAT-02', level: I, fr: ['FR-08'], title: 'Invalid patient data is rejected with field-level messages', input: 'phone "98765", dob 2030-01-01, gender missing', expected: '400 with details for phone, dob and gender' }, async (note) => {
    const res = await api('reception').post('/patients', { first_name: 'X', last_name: 'Y', phone: '98765', dob: '2030-01-01' });
    note(`${res.status}; fields: ${Object.keys(res.body.details || {}).join(', ')}`);
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.details)).toEqual(expect.arrayContaining(['phone', 'dob', 'gender']));
  });

  tc({ id: 'IT-PAT-03', level: I, fr: ['FR-09'], title: 'Possible duplicate registration is flagged and can be confirmed', input: 'Register Arjun Bose again with same DOB; then resend with confirmDuplicate=true', expected: '409 POSSIBLE_DUPLICATE listing P00007; confirmed → 201' }, async (note) => {
    const dup = await api('reception').post('/patients', newPatient({ first_name: 'arjun', last_name: 'BOSE' }));
    const ok = await api('reception').post('/patients', { ...newPatient({ first_name: 'arjun', last_name: 'BOSE' }), confirmDuplicate: true });
    note(`${dup.status} ${dup.body.code} → ${dup.body.details?.duplicates.map((d) => d.patient_code).join(',')}; confirmed ${ok.status} ${ok.body.patient_code}`);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('POSSIBLE_DUPLICATE');
    expect(dup.body.details.duplicates[0].patient_code).toBe('P00007');
    expect(ok.status).toBe(201);
  });

  tc({ id: 'IT-PAT-04', level: I, fr: ['FR-10'], title: 'Patients can be searched by ID, name and mobile number', input: 'q = "P00008", "mitali", phone of P00007', expected: 'Each search returns the matching patient first' }, async (note) => {
    const p7 = (await api('reception').get('/patients?q=P00007')).body.rows[0];
    const byName = (await api('dr.sharma').get('/patients?q=mitali')).body.rows;
    const byPhone = (await api('billing').get(`/patients?q=${p7.phone}`)).body.rows;
    note(`code → ${p7.patient_code}; name → ${byName.map((p) => p.patient_code).join(',')}; phone → ${byPhone[0]?.patient_code}`);
    expect(p7.patient_code).toBe('P00007');
    expect(byName[0].patient_code).toBe('P00008');
    expect(byPhone[0].patient_code).toBe('P00007');
  });

  tc({ id: 'IT-PAT-05', level: I, fr: ['FR-11'], title: 'Patient details can be updated but the patient ID cannot change', input: 'PATCH address; PATCH patient_code = P99999', expected: '200 with new address; 400 "Patient ID cannot be changed"' }, async (note) => {
    const p = (await api('reception').get('/patients?q=P00007')).body.rows[0];
    const a = await api('reception').patch(`/patients/${p.id}`, { address: '12 Lake Road, Kalyani' });
    const b = await api('reception').patch(`/patients/${p.id}`, { patient_code: 'P99999' });
    note(`${a.status} address="${a.body.address}"; ${b.status} "${b.body.error}"`);
    expect(a.body.address).toBe('12 Lake Road, Kalyani');
    expect(b.status).toBe(400);
  });
});

describe('Doctors & appointments (DOC/APT)', () => {
  let patientId;
  let apptId;
  beforeAll(async () => { patientId = (await api('reception').get('/patients?q=P00008')).body.rows[0].id; });

  tc({ id: 'IT-DOC-01', level: I, fr: ['FR-13'], title: 'Administrator adds a doctor with a login; invalid hours are rejected', input: 'POST /doctors (Dermatology, 10:00–14:00); again with end 09:00 before start 10:00', expected: '201 with department name; 400 "Work end time must be after work start time"' }, async (note) => {
    const dep = (await api('admin').get('/departments')).body.find((d) => d.name === 'Dermatology');
    const body = { username: 'dr.paul', full_name: 'Dr. Ishan Paul', password: 'Doctor@123', department_id: dep.id, specialization: 'Dermatologist', consultation_fee: 650, avg_consult_minutes: 10, slot_minutes: 15, work_start: '10:00', work_end: '14:00', work_days: '1,2,3,4,5' };
    const ok = await api('admin').post('/doctors', body);
    const bad = await api('admin').post('/doctors', { ...body, username: 'dr.paul2', work_end: '09:00' });
    note(`${ok.status} ${ok.body.full_name} (${ok.body.department}); ${bad.status} "${bad.body.error}"`);
    expect(ok.status).toBe(201);
    expect(ok.body.department).toBe('Dermatology');
    expect(bad.status).toBe(400);
  });

  tc({ id: 'IT-DOC-03', level: I, fr: ['FR-14'], title: 'Departments are listed with their doctors', input: 'GET /departments; GET /doctors?departmentId={Cardiology}', expected: '8+ departments with doctor counts; only Cardiology doctors returned' }, async (note) => {
    const deps = (await api('reception').get('/departments')).body;
    const cardio = deps.find((d) => d.name === 'Cardiology');
    const docs = (await api('reception').get(`/doctors?departmentId=${cardio.id}`)).body;
    note(`${deps.length} departments (Cardiology has ${cardio.doctor_count} doctor(s)); filter → ${docs.map((d) => `${d.full_name} (${d.department})`).join(', ')}`);
    expect(deps.length).toBeGreaterThanOrEqual(8);
    expect(docs.length).toBe(cardio.doctor_count);
    expect(docs.every((d) => d.department === 'Cardiology')).toBe(true);
  });

  tc({ id: 'IT-APT-01', level: I, fr: ['FR-16'], title: 'A valid appointment is booked in the SCHEDULED state', input: 'Dr. Sharma, 2026-10-22 11:00', expected: '201, status SCHEDULED, end time 11:15' }, async (note) => {
    const res = await api('reception').post('/appointments', { patient_id: patientId, doctor_id: ctx.ids.sharma, date: TOMORROW, start_time: '11:00', reason: 'Headache' });
    apptId = res.body.id;
    note(`${res.status} ${res.body.status} ${res.body.start_time}–${res.body.end_time}`);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('SCHEDULED');
    expect(res.body.end_time).toBe('11:15');
  });

  tc({ id: 'IT-DOC-02', level: I, fr: ['FR-15'], title: 'Free-slot listing marks the booked slot unavailable', input: 'GET /doctors/{sharma}/slots?date=2026-10-22', expected: '11:00 → BOOKED; 11:15 → available' }, async (note) => {
    const res = await api('reception').get(`/doctors/${ctx.ids.sharma}/slots?date=${TOMORROW}`);
    const by = Object.fromEntries(res.body.slots.map((s) => [s.start, s]));
    note(`11:00 ${by['11:00'].reason}; 11:15 available=${by['11:15'].available}; ${res.body.slots.length} slots`);
    expect(by['11:00'].reason).toBe('BOOKED');
    expect(by['11:15'].available).toBe(true);
  });

  tc({ id: 'IT-APT-02', level: I, fr: ['FR-16'], title: 'Bookings in the past or outside working hours are rejected', input: 'Today 09:00 (now 10:00); tomorrow 18:00', expected: '400 "Cannot book a slot in the past"; 400 "outside the doctor\'s working hours"' }, async (note) => {
    const past = await api('reception').post('/appointments', { patient_id: patientId, doctor_id: ctx.ids.sharma, date: TODAY, start_time: '09:00' });
    const late = await api('reception').post('/appointments', { patient_id: patientId, doctor_id: ctx.ids.sharma, date: TOMORROW, start_time: '18:00' });
    note(`${past.status} "${past.body.error}"; ${late.status} "${late.body.error}"`);
    expect(past.status).toBe(400);
    expect(past.body.error).toMatch(/past/);
    expect(late.status).toBe(400);
    expect(late.body.error).toMatch(/working hours/);
  });

  tc({ id: 'IT-APT-03', level: I, fr: ['FR-17'], title: 'Double-booking a doctor\'s slot is rejected with a clear message', input: 'Another patient books Dr. Sharma 2026-10-22 11:00', expected: '409 DOCTOR_SLOT_TAKEN "Dr. Arjun Sharma already has an appointment at 11:00…" (no "Dr. Dr.")' }, async (note) => {
    const other = (await api('reception').post('/patients', newPatient())).body;
    const res = await api('reception').post('/appointments', { patient_id: other.id, doctor_id: ctx.ids.sharma, date: TOMORROW, start_time: '11:00' });
    note(`${res.status} ${res.body.code} "${res.body.error}"`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DOCTOR_SLOT_TAKEN');
    expect(res.body.error).toMatch(/^Dr\. Arjun Sharma already has an appointment at 11:00/);
    expect(res.body.error).not.toMatch(/Dr\. Dr\./);
  });

  tc({ id: 'IT-APT-04', level: I, fr: ['FR-17'], title: 'A patient cannot be booked with two doctors at the same time', input: 'Same patient, Dr. Banerjee 2026-10-22 11:00 (overlaps Sharma 11:00–11:15)', expected: '409 PATIENT_DOUBLE_BOOKED' }, async (note) => {
    const res = await api('reception').post('/appointments', { patient_id: patientId, doctor_id: ctx.ids.banerjee, date: TOMORROW, start_time: '11:00' });
    note(`${res.status} ${res.body.code} "${res.body.error}"`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PATIENT_DOUBLE_BOOKED');
  });

  tc({ id: 'IT-APT-05', level: I, fr: ['FR-18'], title: 'Rescheduling moves the booking and frees the old slot', input: 'PATCH reschedule to 2026-10-22 12:30', expected: '200 new time 12:30; slot 11:00 available again' }, async (note) => {
    const res = await api('reception').patch(`/appointments/${apptId}/reschedule`, { date: TOMORROW, start_time: '12:30' });
    const slots = (await api('reception').get(`/doctors/${ctx.ids.sharma}/slots?date=${TOMORROW}`)).body.slots;
    const s11 = slots.find((s) => s.start === '11:00');
    note(`${res.status} → ${res.body.start_time}; 11:00 available=${s11.available}`);
    expect(res.body.start_time).toBe('12:30');
    expect(s11.available).toBe(true);
  });

  tc({ id: 'IT-APT-06', level: I, fr: ['FR-19'], title: 'Cancellation needs a reason and only applies to SCHEDULED appointments', input: 'Cancel without reason; cancel with reason "Patient travelling"; cancel again', expected: '400; 200 CANCELLED; 409 INVALID_STATE' }, async (note) => {
    const a = await api('reception').post(`/appointments/${apptId}/cancel`, {});
    const b = await api('reception').post(`/appointments/${apptId}/cancel`, { reason: 'Patient travelling' });
    const c = await api('reception').post(`/appointments/${apptId}/cancel`, { reason: 'again' });
    note(`${a.status} "${a.body.error}"; ${b.status} ${b.body.status}; ${c.status} ${c.body.code}`);
    expect([a.status, b.status, c.status]).toEqual([400, 200, 409]);
    expect(b.body.status).toBe('CANCELLED');
  });

  tc({ id: 'IT-APT-07', level: I, fr: ['FR-20'], title: 'Appointments can be filtered by date, doctor and status', input: 'GET /appointments?date=2026-10-22&doctorId=sharma&status=CANCELLED', expected: 'Only the cancelled appointment is returned' }, async (note) => {
    const res = await api('reception').get(`/appointments?date=${TOMORROW}&doctorId=${ctx.ids.sharma}&status=CANCELLED`);
    note(`${res.body.length} row(s): ${res.body.map((a) => `#${a.id} ${a.status}`).join(', ')}`);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(apptId);
  });
});

describe('Smart queue (QUE)', () => {
  let q;
  beforeAll(async () => {
    resetClock();
    q = [];
    for (const t of ['10:15', '10:30', '10:45']) q.push(await checkedInPatient((u) => ctx.as(u), ctx.ids, t));
  });

  tc({ id: 'IT-QUE-01', level: I, fr: ['FR-21'], title: 'Check-in issues sequential tokens per doctor per day', input: 'Check in three of Dr. Sharma\'s appointments for today', expected: 'Tokens 1, 2, 3 and status CHECKED_IN' }, async (note) => {
    note(q.map((x) => `${x.appointment.token_no}:${x.appointment.status}`).join(', '));
    expect(q.map((x) => x.appointment.token_no)).toEqual([1, 2, 3]);
    expect(q.every((x) => x.appointment.status === 'CHECKED_IN')).toBe(true);
  });

  tc({ id: 'IT-QUE-02', level: I, fr: ['FR-21'], title: 'Only today\'s SCHEDULED appointments can be checked in', input: 'Check in a booking for tomorrow; check in token 1 again', expected: '400 (not today); 409 (already checked in)' }, async (note) => {
    const p = (await api('reception').post('/patients', newPatient())).body;
    const fut = (await api('reception').post('/appointments', { patient_id: p.id, doctor_id: ctx.ids.sharma, date: TOMORROW, start_time: '15:00' })).body;
    const a = await api('reception').post(`/appointments/${fut.id}/check-in`);
    const b = await api('reception').post(`/appointments/${q[0].appointment.id}/check-in`);
    note(`${a.status} "${a.body.error}"; ${b.status} "${b.body.error}"`);
    expect([a.status, b.status]).toEqual([400, 409]);
  });

  tc({ id: 'IT-QUE-03', level: I, fr: ['FR-22', 'FR-23'], title: 'Queue board lists waiting patients in order with wait estimates', input: 'GET /queue/{sharma} with 3 waiting, average 12 min, no consultation in progress', expected: 'Tokens 1,2,3 with ETA 0, 12, 24 min' }, async (note) => {
    const b = (await api('reception').get(`/queue/${ctx.ids.sharma}`)).body;
    note(b.waiting.map((w) => `#${w.token_no} ETA ${w.etaMinutes}`).join(', '));
    expect(b.waiting.map((w) => w.token_no)).toEqual([1, 2, 3]);
    expect(b.waiting.map((w) => w.etaMinutes)).toEqual([0, 12, 24]);
  });

  tc({ id: 'IT-QUE-04', level: I, fr: ['FR-24', 'FR-50'], title: 'Marking a patient URGENT needs a reason, moves them to the front and is audited', input: 'Mark token 3 urgent without reason, then with "Chest pain"', expected: '400; then token order 3,1,2 and an audit entry PRIORITY_URGENT' }, async (note) => {
    const a = await api('reception').post(`/queue/${q[2].appointment.id}/priority`, {});
    const b = await api('reception').post(`/queue/${q[2].appointment.id}/priority`, { reason: 'Chest pain' });
    const board = (await api('reception').get(`/queue/${ctx.ids.sharma}`)).body;
    const audit = (await api('admin').get('/audit?action=PRIORITY_URGENT')).body.rows;
    note(`${a.status}; ${b.status} ${b.body.priority}; order ${board.waiting.map((w) => w.token_no).join(',')}; audit "${audit[0]?.summary}"`);
    expect(a.status).toBe(400);
    expect(board.waiting.map((w) => w.token_no)).toEqual([3, 1, 2]);
    expect(audit[0].summary).toMatch(/Chest pain/);
  });

  tc({ id: 'IT-QUE-05', level: I, fr: ['FR-25'], title: 'Doctor calls the next patient; a second call while busy is refused', input: 'Dr. Sharma POST /queue/{id}/call-next twice', expected: '200 token 3 → IN_CONSULTATION; then 409 CONSULTATION_IN_PROGRESS' }, async (note) => {
    const a = await api('dr.sharma').post(`/queue/${ctx.ids.sharma}/call-next`);
    const b = await api('dr.sharma').post(`/queue/${ctx.ids.sharma}/call-next`);
    note(`${a.status} token ${a.body.appointment?.token_no} ${a.body.appointment?.status}; ${b.status} ${b.body.code}`);
    expect(a.body.appointment.token_no).toBe(3);
    expect(a.body.appointment.status).toBe('IN_CONSULTATION');
    expect(b.status).toBe(409);
    expect(b.body.code).toBe('CONSULTATION_IN_PROGRESS');
  });

  tc({ id: 'IT-QUE-06', level: I, fr: ['FR-25', 'FR-03'], title: 'A doctor cannot call patients from another doctor\'s queue', input: 'Dr. Banerjee POST /queue/{sharma}/call-next', expected: '403' }, async (note) => {
    const r = await api('dr.banerjee').post(`/queue/${ctx.ids.sharma}/call-next`);
    note(`${r.status} "${r.body.error}"`);
    expect(r.status).toBe(403);
  });

  tc({ id: 'IT-QUE-07', level: I, fr: ['FR-23'], title: 'Wait estimates account for the consultation in progress', input: '5 minutes after the call, board for Dr. Sharma (avg 12)', expected: 'Remaining waiting tokens 1,2 with ETA 7 and 19 min' }, async (note) => {
    advance(5);
    const b = (await api('reception').get(`/queue/${ctx.ids.sharma}`)).body;
    note(`in progress token ${b.inProgress?.token_no}; ${b.waiting.map((w) => `#${w.token_no} ETA ${w.etaMinutes}`).join(', ')}`);
    expect(b.waiting.map((w) => w.etaMinutes)).toEqual([7, 19]);
    resetClock();
  });
});
