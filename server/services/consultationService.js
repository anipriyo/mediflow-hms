import { db, tx } from '../db/connection.js';
import { nowIso, todayStr } from '../utils/clock.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { validate, z, dateStr, clampInt } from '../utils/validate.js';
import { AppointmentService } from './appointmentService.js';
import { PatientService } from './patientService.js';
import { ChargeService } from './chargeService.js';
import { AuditService } from './auditService.js';

const saveSchema = z.object({
  symptoms: z.string().max(2000).optional().nullable(),
  bp: z.string().regex(/^\d{2,3}\/\d{2,3}$/, 'BP must look like 120/80').optional().nullable().or(z.literal('')),
  pulse: z.coerce.number().int().min(20).max(250).optional().nullable(),
  temperature: z.coerce.number().min(90).max(110).optional().nullable(),
  weight: z.coerce.number().min(0.5).max(400).optional().nullable(),
  spo2: z.coerce.number().int().min(50).max(100).optional().nullable(),
  diagnosis: z.string().max(500).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  follow_up_date: dateStr.optional().nullable().or(z.literal('')),
});

const itemSchema = z.object({
  medicine_id: z.coerce.number().int().positive('Medicine is required'),
  dosage: z.string().trim().min(1, 'Dosage is required'),
  frequency: z.string().trim().min(1, 'Frequency is required'),
  duration_days: z.coerce.number().int().positive('Duration must be at least 1 day'),
  quantity: z.coerce.number().int().positive('Quantity must be greater than 0'),
  instructions: z.string().optional().nullable(),
});

function emptyToNull(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v === '' ? null : v;
  return out;
}

export const ConsultationService = {
  get(id) {
    const c = db()
      .prepare(`SELECT c.*, u.full_name AS doctor_name, a.date, a.start_time, a.token_no, a.reason AS visit_reason, a.priority, a.status AS appointment_status
                FROM consultations c JOIN appointments a ON a.id = c.appointment_id JOIN doctors d ON d.id = c.doctor_id JOIN users u ON u.id = d.user_id
                WHERE c.id = ?`)
      .get(id);
    if (!c) throw notFound('Consultation');
    const prescription = db().prepare("SELECT * FROM prescriptions WHERE consultation_id = ? AND status <> 'CANCELLED' ORDER BY id DESC").get(id) || null;
    const items = prescription
      ? db().prepare('SELECT pi.*, m.name AS medicine_name, m.strength, m.form, m.stock_qty FROM prescription_items pi JOIN medicines m ON m.id = pi.medicine_id WHERE pi.prescription_id = ?').all(prescription.id)
      : [];
    const labOrders = db()
      .prepare('SELECT lo.*, t.name AS test_name, t.code AS test_code, t.unit, t.ref_low, t.ref_high, t.ref_text, t.price FROM lab_orders lo JOIN lab_tests t ON t.id = lo.lab_test_id WHERE lo.consultation_id = ? ORDER BY lo.id')
      .all(id);
    const previous = db()
      .prepare(`SELECT c.id, c.diagnosis, c.symptoms, c.notes, c.completed_at, a.date, u.full_name AS doctor_name FROM consultations c
                JOIN appointments a ON a.id = c.appointment_id JOIN doctors d ON d.id = c.doctor_id JOIN users u ON u.id = d.user_id
                WHERE c.patient_id = ? AND c.id <> ? AND c.status = 'COMPLETED' ORDER BY c.completed_at DESC LIMIT 10`)
      .all(c.patient_id, id);
    const previousLabs = db()
      .prepare(`SELECT lo.id, lo.status, lo.result_value, lo.result_text, lo.is_abnormal, lo.completed_at, t.name AS test_name, t.unit FROM lab_orders lo JOIN lab_tests t ON t.id = lo.lab_test_id
                WHERE lo.patient_id = ? AND (lo.consultation_id IS NULL OR lo.consultation_id <> ?) ORDER BY lo.created_at DESC LIMIT 10`)
      .all(c.patient_id, id);
    return { ...c, patient: PatientService.get(c.patient_id), prescription: prescription ? { ...prescription, items } : null, labOrders, previous, previousLabs };
  },

  /** The doctor's consultation currently in progress (if any). */
  current(doctorId) {
    const row = db()
      .prepare("SELECT c.id FROM consultations c JOIN appointments a ON a.id = c.appointment_id WHERE c.doctor_id = ? AND c.status = 'IN_PROGRESS' AND a.status = 'IN_CONSULTATION' ORDER BY c.id DESC")
      .get(doctorId);
    return row ? this.get(row.id) : null;
  },

  list({ doctorId, patientId, date, limit = 100 } = {}) {
    const where = [];
    const params = [];
    if (doctorId) { where.push('c.doctor_id = ?'); params.push(Number(doctorId)); }
    if (patientId) { where.push('c.patient_id = ?'); params.push(Number(patientId)); }
    if (date) { where.push('a.date = ?'); params.push(date); }
    return db()
      .prepare(`SELECT c.*, a.date, a.token_no, p.patient_code, p.first_name || ' ' || p.last_name AS patient_name, u.full_name AS doctor_name
                FROM consultations c JOIN appointments a ON a.id = c.appointment_id JOIN patients p ON p.id = c.patient_id
                JOIN doctors d ON d.id = c.doctor_id JOIN users u ON u.id = d.user_id
                ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.created_at DESC LIMIT ?`)
      .all(...params, clampInt(limit, 100, 1, 500));
  },

  assertOwnOpen(consultation, actor) {
    if (actor.role !== 'DOCTOR' || actor.doctorId !== consultation.doctor_id) throw forbidden('Only the treating doctor can modify this consultation');
    if (consultation.status !== 'IN_PROGRESS') throw conflict('This consultation is already completed and can no longer be edited', 'CONSULTATION_CLOSED');
  },

  /** FR-26 */
  save(id, input, actor) {
    const c = this.get(id);
    this.assertOwnOpen(c, actor);
    const data = emptyToNull(validate(saveSchema, input));
    const cols = Object.keys(data);
    if (cols.length) db().prepare(`UPDATE consultations SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((k) => data[k]), id);
    AuditService.log(actor, 'UPDATE', 'Consultation', id, `Updated consultation notes for ${c.patient.patient_code} (${cols.join(', ')})`);
    return this.get(id);
  },

  /** FR-27: create or replace the (pending) prescription of this consultation. */
  savePrescription(id, input, actor) {
    const c = this.get(id);
    this.assertOwnOpen(c, actor);
    const { items } = validate(z.object({ items: z.array(itemSchema).min(1, 'Add at least one medicine').max(30, 'A prescription can have at most 30 medicines') }), input);
    const seen = new Set();
    for (const it of items) {
      if (seen.has(it.medicine_id)) throw badRequest('Each medicine can appear only once in a prescription – adjust the quantity instead', { items: 'Duplicate medicine' });
      seen.add(it.medicine_id);
      if (!db().prepare('SELECT 1 FROM medicines WHERE id = ?').get(it.medicine_id)) throw badRequest(`Medicine #${it.medicine_id} does not exist`);
    }
    const prescId = tx(() => {
      let presc = db().prepare("SELECT * FROM prescriptions WHERE consultation_id = ? AND status <> 'CANCELLED'").get(id);
      if (presc && presc.status === 'DISPENSED') throw conflict('Prescription has already been dispensed', 'ALREADY_DISPENSED');
      if (!presc) {
        const info = db().prepare("INSERT INTO prescriptions (consultation_id, patient_id, doctor_id, status, created_at) VALUES (?, ?, ?, 'PENDING', ?)").run(id, c.patient_id, c.doctor_id, nowIso());
        presc = { id: info.lastInsertRowid };
      } else {
        db().prepare('DELETE FROM prescription_items WHERE prescription_id = ?').run(presc.id);
      }
      const ins = db().prepare('INSERT INTO prescription_items (prescription_id, medicine_id, dosage, frequency, duration_days, quantity, instructions) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const it of items) ins.run(presc.id, it.medicine_id, it.dosage, it.frequency, it.duration_days, it.quantity, it.instructions || null);
      return presc.id;
    });
    AuditService.log(actor, 'SAVE', 'Prescription', prescId, `Prescription with ${items.length} item(s) for ${c.patient.patient_code}`);
    return this.get(id);
  },

  /** FR-26, FR-29 */
  complete(id, actor) {
    const c = this.get(id);
    this.assertOwnOpen(c, actor);
    if (!c.diagnosis || !c.diagnosis.trim()) throw badRequest('Diagnosis is required to complete the consultation', { diagnosis: 'Diagnosis is required' });
    const appt = AppointmentService.get(c.appointment_id);
    const doctor = db().prepare('SELECT consultation_fee FROM doctors WHERE id = ?').get(c.doctor_id);
    tx(() => {
      const now = nowIso();
      db().prepare("UPDATE consultations SET status = 'COMPLETED', completed_at = ? WHERE id = ?").run(now, id);
      db().prepare("UPDATE appointments SET status = 'COMPLETED', completed_at = ? WHERE id = ?").run(now, appt.id);
      ChargeService.add({
        patientId: c.patient_id,
        appointmentId: appt.id,
        sourceType: 'CONSULTATION',
        sourceId: id,
        description: `Consultation – ${c.doctor_name} (${appt.department}) on ${appt.date}`,
        unitPrice: doctor.consultation_fee,
      });
    });
    AuditService.log(actor, 'STATUS_CHANGE', 'Appointment', appt.id, `IN_CONSULTATION → COMPLETED (${c.patient.patient_code}); consultation fee charged`);
    return this.get(id);
  },

  todayStats(doctorId) {
    return db()
      .prepare(`SELECT status, COUNT(*) n FROM appointments WHERE doctor_id = ? AND date = ? GROUP BY status`)
      .all(doctorId, todayStr());
  },
};
