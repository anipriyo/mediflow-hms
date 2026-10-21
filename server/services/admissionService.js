import { db, tx } from '../db/connection.js';
import { nowIso, compactDate } from '../utils/clock.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { validate, z, nonEmpty } from '../utils/validate.js';
import { canTransitionBed } from '../domain/bedStateMachine.js';
import { canTransitionAdmission, bedCharges, dischargeClearance } from '../domain/admissionRules.js';
import { PatientService } from './patientService.js';
import { DoctorService } from './doctorService.js';
import { BedService } from './bedService.js';
import { ChargeService } from './chargeService.js';
import { AuditService } from './auditService.js';

const BASE = `
  SELECT ad.*, p.patient_code, p.first_name || ' ' || p.last_name AS patient_name, p.gender AS patient_gender, p.dob AS patient_dob, p.phone AS patient_phone,
         u.full_name AS doctor_name, b.bed_no, w.name AS ward, w.type AS ward_type, w.daily_rate
  FROM admissions ad
  JOIN patients p ON p.id = ad.patient_id
  JOIN doctors d ON d.id = ad.doctor_id
  JOIN users u ON u.id = d.user_id
  JOIN beds b ON b.id = ad.bed_id
  JOIN wards w ON w.id = b.ward_id`;

function occupyBed(bed, admissionId, now) {
  if (!canTransitionBed(bed.status, 'OCCUPIED')) throw conflict(`Bed ${bed.ward} ${bed.bed_no} is ${bed.status} and cannot be assigned`, 'BED_NOT_AVAILABLE');
  const res = db()
    .prepare("UPDATE beds SET status = 'OCCUPIED', current_admission_id = ?, updated_at = ? WHERE id = ? AND status IN ('AVAILABLE','RESERVED') AND current_admission_id IS NULL")
    .run(admissionId, now, bed.id);
  if (res.changes !== 1) throw conflict(`Bed ${bed.ward} ${bed.bed_no} was just taken by another patient`, 'BED_NOT_AVAILABLE');
  db().prepare('INSERT INTO bed_stays (admission_id, bed_id, daily_rate, start_at) VALUES (?, ?, ?, ?)').run(admissionId, bed.id, bed.daily_rate, now);
}

function releaseBed(bedId, now) {
  db().prepare("UPDATE beds SET status = 'CLEANING', current_admission_id = NULL, updated_at = ? WHERE id = ?").run(now, bedId);
}

export const AdmissionService = {
  list({ status, patientId, q } = {}) {
    const where = [];
    const params = [];
    if (status) { const s = String(status).split(','); where.push(`ad.status IN (${s.map(() => '?').join(',')})`); params.push(...s); }
    if (patientId) { where.push('ad.patient_id = ?'); params.push(Number(patientId)); }
    if (q) { where.push("(p.first_name || ' ' || p.last_name LIKE ? OR p.patient_code = ? OR ad.admission_no = ?)"); params.push(`%${q}%`, q, q); }
    return db().prepare(`${BASE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ad.admitted_at DESC LIMIT 300`).all(...params);
  },

  get(id) {
    const a = db().prepare(`${BASE} WHERE ad.id = ?`).get(id);
    if (!a) throw notFound('Admission');
    const stays = db()
      .prepare('SELECT s.*, b.bed_no, w.name AS ward FROM bed_stays s JOIN beds b ON b.id = s.bed_id JOIN wards w ON w.id = b.ward_id WHERE s.admission_id = ? ORDER BY s.id')
      .all(id);
    const unbilled = db().prepare('SELECT * FROM charges WHERE admission_id = ? AND invoice_id IS NULL ORDER BY id').all(id);
    const invoices = db().prepare('SELECT * FROM invoices WHERE admission_id = ? ORDER BY id').all(id);
    const labOrders = db()
      .prepare('SELECT lo.*, t.name AS test_name FROM lab_orders lo JOIN lab_tests t ON t.id = lo.lab_test_id WHERE lo.admission_id = ? ORDER BY lo.id')
      .all(id);
    const clearance = dischargeClearance({ unbilledCount: unbilled.length, invoices, override: null });
    return { ...a, stays: bedCharges(stays, a.discharge_requested_at || nowIso()), unbilled, invoices, labOrders, clearance };
  },

  /** FR-39 */
  admit(input, actor) {
    const data = validate(
      z.object({
        patient_id: z.coerce.number().int().positive('Patient is required'),
        doctor_id: z.coerce.number().int().positive('Attending doctor is required'),
        bed_id: z.coerce.number().int().positive('Bed is required'),
        reason: nonEmpty('Reason for admission'),
      }),
      input,
    );
    const patient = PatientService.get(data.patient_id);
    DoctorService.get(data.doctor_id);
    const id = tx(() => {
      const active = db().prepare("SELECT admission_no FROM admissions WHERE patient_id = ? AND status <> 'DISCHARGED'").get(patient.id);
      if (active) throw conflict(`${patient.full_name} is already admitted (${active.admission_no})`, 'ALREADY_ADMITTED');
      const bed = BedService.get(data.bed_id);
      if (!['AVAILABLE', 'RESERVED'].includes(bed.status)) throw conflict(`Bed ${bed.ward} ${bed.bed_no} is ${bed.status} and cannot be assigned`, 'BED_NOT_AVAILABLE');
      const now = nowIso();
      const seq = db().prepare('SELECT COUNT(*) c FROM admissions WHERE admission_no LIKE ?').get(`ADM-${compactDate()}-%`).c + 1;
      const admissionNo = `ADM-${compactDate()}-${String(seq).padStart(3, '0')}`;
      const info = db()
        .prepare("INSERT INTO admissions (admission_no, patient_id, doctor_id, bed_id, reason, status, admitted_at, created_by) VALUES (?, ?, ?, ?, ?, 'ADMITTED', ?, ?)")
        .run(admissionNo, patient.id, data.doctor_id, bed.id, data.reason, now, actor.id);
      occupyBed(bed, info.lastInsertRowid, now);
      return info.lastInsertRowid;
    });
    const adm = this.get(id);
    AuditService.log(actor, 'CREATE', 'Admission', id, `Admitted ${patient.patient_code} to ${adm.ward} ${adm.bed_no} (${adm.admission_no})`);
    return adm;
  },

  /** FR-40 */
  transfer(id, input, actor) {
    const { bed_id: bedId } = validate(z.object({ bed_id: z.coerce.number().int().positive('New bed is required') }), input);
    const adm = this.get(id);
    if (adm.status !== 'ADMITTED') throw conflict(`Cannot transfer a patient whose admission is ${adm.status}`, 'INVALID_STATE');
    if (bedId === adm.bed_id) throw badRequest('Patient is already in this bed');
    tx(() => {
      const bed = BedService.get(bedId);
      const now = nowIso();
      db().prepare('UPDATE bed_stays SET end_at = ? WHERE admission_id = ? AND end_at IS NULL').run(now, id);
      releaseBed(adm.bed_id, now);
      occupyBed(bed, id, now);
      db().prepare('UPDATE admissions SET bed_id = ? WHERE id = ?').run(bedId, id);
    });
    const updated = this.get(id);
    AuditService.log(actor, 'TRANSFER', 'Admission', id, `${adm.patient_code}: ${adm.ward} ${adm.bed_no} → ${updated.ward} ${updated.bed_no}`);
    return updated;
  },

  /** FR-42: doctor requests discharge; bed charges are calculated up to now. */
  requestDischarge(id, input, actor) {
    const { summary } = validate(z.object({ summary: z.string().trim().min(10, 'Discharge summary must be at least 10 characters') }), input);
    const adm = this.get(id);
    if (!canTransitionAdmission(adm.status, 'DISCHARGE_PENDING')) throw conflict(`Cannot request discharge when admission is ${adm.status}`, 'INVALID_STATE');
    if (!actor.doctorId) throw forbidden('Only doctors can request discharge');
    tx(() => {
      const now = nowIso();
      db().prepare('UPDATE bed_stays SET end_at = ? WHERE admission_id = ? AND end_at IS NULL').run(now, id);
      const stays = db().prepare('SELECT s.*, b.bed_no, w.name AS ward FROM bed_stays s JOIN beds b ON b.id = s.bed_id JOIN wards w ON w.id = b.ward_id WHERE s.admission_id = ? AND s.charged = 0').all(id);
      for (const s of bedCharges(stays, now)) {
        db().prepare('UPDATE bed_stays SET charged = 1 WHERE id = ?').run(s.id);
        if (s.days === 0) continue; // a short stay before a transfer is absorbed into the other stay (DEF-05)
        ChargeService.add({
          patientId: adm.patient_id,
          admissionId: id,
          sourceType: 'BED',
          sourceId: s.id,
          description: `Bed charges – ${s.ward} ${s.bed_no} (${s.days} day${s.days > 1 ? 's' : ''} @ ₹${s.daily_rate})`,
          quantity: s.days,
          unitPrice: s.daily_rate,
        });
      }
      db().prepare("UPDATE admissions SET status = 'DISCHARGE_PENDING', discharge_requested_at = ?, discharge_summary = ? WHERE id = ?").run(now, summary, id);
    });
    AuditService.log(actor, 'STATUS_CHANGE', 'Admission', id, `ADMITTED → DISCHARGE_PENDING (${adm.admission_no}); bed charges added`);
    return this.get(id);
  },

  /** FR-43: complete discharge after billing clearance (or admin override). */
  discharge(id, input, actor) {
    const adm = this.get(id);
    if (!canTransitionAdmission(adm.status, 'DISCHARGED')) {
      throw conflict(adm.status === 'ADMITTED' ? 'The doctor must request discharge first' : `Admission is already ${adm.status}`, 'INVALID_STATE');
    }
    const overrideReason = input?.override_reason ? String(input.override_reason).trim() : '';
    if (overrideReason && actor.role !== 'ADMIN') throw forbidden('Only an administrator can override billing clearance');
    const clearance = dischargeClearance({ unbilledCount: adm.unbilled.length, invoices: adm.invoices, override: overrideReason ? { role: actor.role, reason: overrideReason } : null });
    if (!clearance.allowed) {
      throw conflict(
        clearance.unbilledCount > 0
          ? `Discharge blocked: ${clearance.unbilledCount} charge(s) have not been invoiced yet`
          : `Discharge blocked: outstanding balance of ₹${clearance.outstanding.toFixed(2)} must be paid`,
        'BILLING_NOT_CLEARED',
        clearance,
      );
    }
    tx(() => {
      const now = nowIso();
      db().prepare("UPDATE admissions SET status = 'DISCHARGED', discharged_at = ?, override_reason = ? WHERE id = ?").run(now, overrideReason || null, id);
      releaseBed(adm.bed_id, now);
    });
    AuditService.log(actor, clearance.overridden ? 'DISCHARGE_OVERRIDE' : 'STATUS_CHANGE', 'Admission', id,
      `DISCHARGE_PENDING → DISCHARGED (${adm.admission_no})${clearance.overridden ? `; override: ${overrideReason}; outstanding ₹${clearance.outstanding}` : ''}; bed ${adm.ward} ${adm.bed_no} → CLEANING`);
    return this.get(id);
  },
};
