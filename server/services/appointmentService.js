import { db, tx } from '../db/connection.js';
import { clock, nowIso, todayStr } from '../utils/clock.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { validate, z, dateStr, timeStr, nonEmpty } from '../utils/validate.js';
import { validateSlot, findConflict, endTimeFor, canTransitionAppointment, ACTIVE_STATUSES } from '../domain/appointmentRules.js';
import { DoctorService } from './doctorService.js';
import { PatientService } from './patientService.js';
import { AuditService } from './auditService.js';

const BASE = `
  SELECT a.*, p.patient_code, p.first_name || ' ' || p.last_name AS patient_name, p.phone AS patient_phone, p.gender AS patient_gender, p.dob AS patient_dob,
         u.full_name AS doctor_name, dep.name AS department, d.room
  FROM appointments a
  JOIN patients p ON p.id = a.patient_id
  JOIN doctors d ON d.id = a.doctor_id
  JOIN users u ON u.id = d.user_id
  JOIN departments dep ON dep.id = d.department_id`;

const bookSchema = z.object({
  patient_id: z.coerce.number().int().positive('Patient is required'),
  doctor_id: z.coerce.number().int().positive('Doctor is required'),
  date: dateStr,
  start_time: timeStr,
  reason: z.string().trim().max(500).optional(),
});

function activeFor(column, id, date) {
  return db()
    .prepare(`SELECT id, date, start_time, end_time, status FROM appointments WHERE ${column} = ? AND date = ? AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`)
    .all(id, date, ...ACTIVE_STATUSES);
}

/** Shared slot + conflict checks for booking and rescheduling (FR-16, FR-17). */
function assertBookable({ doctor, patientId, date, startTime, excludeId = null }) {
  const problems = validateSlot({ doctor, date, startTime, now: clock.now() });
  if (problems.length) throw badRequest(problems[0], { start_time: problems.join('; ') });
  const endTime = endTimeFor(doctor, startTime);
  const doctorClash = findConflict(activeFor('doctor_id', doctor.id, date), { date, startTime, endTime, excludeId });
  if (doctorClash) {
    throw conflict(`${doctor.full_name} already has an appointment at ${doctorClash.start_time} on ${date}`, 'DOCTOR_SLOT_TAKEN', { conflictingAppointmentId: doctorClash.id });
  }
  const patientClash = findConflict(activeFor('patient_id', patientId, date), { date, startTime, endTime, excludeId });
  if (patientClash) {
    throw conflict(`The patient already has an appointment at ${patientClash.start_time} on ${date}`, 'PATIENT_DOUBLE_BOOKED', { conflictingAppointmentId: patientClash.id });
  }
  return endTime;
}

export const AppointmentService = {
  /** FR-20 */
  list({ date, from, to, doctorId, patientId, status, q, limit = 500 } = {}) {
    const where = [];
    const params = [];
    if (date) { where.push('a.date = ?'); params.push(date); }
    if (from) { where.push('a.date >= ?'); params.push(from); }
    if (to) { where.push('a.date <= ?'); params.push(to); }
    if (doctorId) { where.push('a.doctor_id = ?'); params.push(Number(doctorId)); }
    if (patientId) { where.push('a.patient_id = ?'); params.push(Number(patientId)); }
    if (status) {
      const list = String(status).split(',');
      where.push(`a.status IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    }
    if (q) {
      where.push("(p.first_name || ' ' || p.last_name LIKE ? OR p.patient_code = ? OR u.full_name LIKE ?)");
      params.push(`%${q}%`, q, `%${q}%`);
    }
    return db()
      .prepare(`${BASE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.date DESC, a.start_time ASC LIMIT ?`)
      .all(...params, Math.min(Number(limit) || 500, 2000));
  },

  get(id) {
    const a = db().prepare(`${BASE} WHERE a.id = ?`).get(id);
    if (!a) throw notFound('Appointment');
    return a;
  },

  /** FR-16, FR-17 */
  book(input, actor) {
    const data = validate(bookSchema, input);
    const patient = PatientService.get(data.patient_id);
    const doctor = DoctorService.get(data.doctor_id);
    const id = tx(() => {
      const endTime = assertBookable({ doctor, patientId: patient.id, date: data.date, startTime: data.start_time });
      return db()
        .prepare(`INSERT INTO appointments (patient_id, doctor_id, date, start_time, end_time, reason, status, created_by, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?)`)
        .run(patient.id, doctor.id, data.date, data.start_time, endTime, data.reason || null, actor.id, nowIso()).lastInsertRowid;
    });
    AuditService.log(actor, 'CREATE', 'Appointment', id, `Booked ${patient.patient_code} with ${doctor.full_name} on ${data.date} ${data.start_time}`);
    return this.get(id);
  },

  /** FR-18 */
  reschedule(id, input, actor) {
    const appt = this.get(id);
    if (appt.status !== 'SCHEDULED') throw conflict(`Only SCHEDULED appointments can be rescheduled (current: ${appt.status})`, 'INVALID_STATE');
    const data = validate(z.object({ date: dateStr, start_time: timeStr, doctor_id: z.coerce.number().int().positive().optional() }), input);
    const doctor = DoctorService.get(data.doctor_id || appt.doctor_id);
    tx(() => {
      const endTime = assertBookable({ doctor, patientId: appt.patient_id, date: data.date, startTime: data.start_time, excludeId: appt.id });
      db().prepare('UPDATE appointments SET doctor_id = ?, date = ?, start_time = ?, end_time = ? WHERE id = ?').run(doctor.id, data.date, data.start_time, endTime, id);
    });
    AuditService.log(actor, 'RESCHEDULE', 'Appointment', id, `Moved from ${appt.date} ${appt.start_time} to ${data.date} ${data.start_time}${doctor.id !== appt.doctor_id ? ` with ${doctor.full_name}` : ''}`);
    return this.get(id);
  },

  /** FR-19 */
  cancel(id, input, actor) {
    const appt = this.get(id);
    const { reason } = validate(z.object({ reason: nonEmpty('Cancellation reason') }), input);
    if (!canTransitionAppointment(appt.status, 'CANCELLED')) {
      throw conflict(`Cannot cancel an appointment that is ${appt.status}`, 'INVALID_STATE');
    }
    db().prepare("UPDATE appointments SET status = 'CANCELLED', cancel_reason = ? WHERE id = ?").run(reason, id);
    AuditService.log(actor, 'STATUS_CHANGE', 'Appointment', id, `SCHEDULED → CANCELLED (${reason})`);
    return this.get(id);
  },

  markNoShow(id, actor) {
    const appt = this.get(id);
    if (!canTransitionAppointment(appt.status, 'NO_SHOW')) throw conflict(`Cannot mark ${appt.status} appointment as no-show`, 'INVALID_STATE');
    if (appt.date > todayStr()) throw badRequest('Cannot mark a future appointment as no-show');
    db().prepare("UPDATE appointments SET status = 'NO_SHOW' WHERE id = ?").run(id);
    AuditService.log(actor, 'STATUS_CHANGE', 'Appointment', id, 'SCHEDULED → NO_SHOW');
    return this.get(id);
  },
};
