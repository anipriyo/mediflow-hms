import { db, tx } from '../db/connection.js';
import { nowIso, combineLocal, addDays } from '../utils/clock.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { validate, z, clampInt, optionalDate } from '../utils/validate.js';
import { canTransitionLab, isAbnormal } from '../domain/labRules.js';
import { ChargeService } from './chargeService.js';
import { AuditService } from './auditService.js';

const BASE = `
  SELECT lo.*, t.code AS test_code, t.name AS test_name, t.category, t.unit, t.ref_low, t.ref_high, t.ref_text, t.price,
         p.patient_code, p.first_name || ' ' || p.last_name AS patient_name, p.gender AS patient_gender, p.dob AS patient_dob,
         u.full_name AS doctor_name, pu.full_name AS processed_by_name
  FROM lab_orders lo
  JOIN lab_tests t ON t.id = lo.lab_test_id
  JOIN patients p ON p.id = lo.patient_id
  JOIN doctors d ON d.id = lo.doctor_id
  JOIN users u ON u.id = d.user_id
  LEFT JOIN users pu ON pu.id = lo.processed_by`;

export const LabService = {
  tests() {
    return db().prepare('SELECT * FROM lab_tests ORDER BY category, name').all();
  },

  /** FR-31 */
  orders({ status, patientId, doctorId, date, limit = 300 } = {}) {
    const where = [];
    const params = [];
    if (status) { const s = String(status).split(','); where.push(`lo.status IN (${s.map(() => '?').join(',')})`); params.push(...s); }
    if (patientId) { where.push('lo.patient_id = ?'); params.push(Number(patientId)); }
    if (doctorId) { where.push('lo.doctor_id = ?'); params.push(Number(doctorId)); }
    date = optionalDate(date, 'date');
    if (date) {
      // compare in local time: the order timestamps are stored in UTC
      where.push('lo.created_at >= ? AND lo.created_at < ?');
      params.push(combineLocal(date).toISOString(), combineLocal(addDays(date, 1)).toISOString());
    }
    return db()
      .prepare(`${BASE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY CASE lo.priority WHEN 'STAT' THEN 0 ELSE 1 END, lo.created_at DESC LIMIT ?`)
      .all(...params, clampInt(limit, 300, 1, 1000));
  },

  get(id) {
    const o = db().prepare(`${BASE} WHERE lo.id = ?`).get(id);
    if (!o) throw notFound('Lab order');
    return o;
  },

  /** FR-28, FR-34 */
  order(input, actor) {
    const data = validate(
      z.object({
        patient_id: z.coerce.number().int().positive('Patient is required'),
        test_ids: z.array(z.coerce.number().int().positive()).min(1, 'Select at least one test'),
        consultation_id: z.coerce.number().int().positive().optional().nullable(),
        admission_id: z.coerce.number().int().positive().optional().nullable(),
        priority: z.enum(['ROUTINE', 'STAT']).default('ROUTINE'),
      }),
      input,
    );
    if (!actor.doctorId) throw forbidden('Only doctors can order lab tests');
    if (data.consultation_id) {
      const c = db().prepare('SELECT * FROM consultations WHERE id = ?').get(data.consultation_id);
      if (!c || c.patient_id !== data.patient_id) throw badRequest('Consultation does not belong to this patient');
      if (c.status !== 'IN_PROGRESS') throw conflict('Lab tests can only be ordered during an open consultation', 'CONSULTATION_CLOSED');
      if (c.doctor_id !== actor.doctorId) throw forbidden('Lab tests can only be added to your own consultation');
    }
    if (data.admission_id) {
      const a = db().prepare('SELECT * FROM admissions WHERE id = ?').get(data.admission_id);
      if (!a || a.patient_id !== data.patient_id) throw badRequest('Admission does not belong to this patient');
      if (a.status === 'DISCHARGED') throw conflict('Patient has already been discharged', 'ADMISSION_CLOSED');
    }
    const appointmentId = data.consultation_id ? db().prepare('SELECT appointment_id FROM consultations WHERE id = ?').get(data.consultation_id).appointment_id : null;
    const testIds = [...new Set(data.test_ids)]; // the same test twice in one request is ordered once
    const ids = tx(() =>
      testIds.map((testId) => {
        const test = db().prepare('SELECT * FROM lab_tests WHERE id = ?').get(testId);
        if (!test) throw badRequest(`Lab test #${testId} does not exist`);
        const pending = data.consultation_id
          ? db().prepare("SELECT 1 FROM lab_orders WHERE consultation_id = ? AND lab_test_id = ? AND status IN ('ORDERED','SAMPLE_COLLECTED')").get(data.consultation_id, testId)
          : data.admission_id
            ? db().prepare("SELECT 1 FROM lab_orders WHERE admission_id = ? AND lab_test_id = ? AND status IN ('ORDERED','SAMPLE_COLLECTED')").get(data.admission_id, testId)
            : null;
        if (pending) throw conflict(`${test.name} is already ordered and pending for this visit`, 'DUPLICATE_LAB_ORDER');
        const info = db()
          .prepare('INSERT INTO lab_orders (patient_id, doctor_id, consultation_id, admission_id, lab_test_id, status, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(data.patient_id, actor.doctorId, data.consultation_id || null, data.admission_id || null, testId, 'ORDERED', data.priority, nowIso());
        ChargeService.add({
          patientId: data.patient_id,
          appointmentId,
          admissionId: data.admission_id || null,
          sourceType: 'LAB',
          sourceId: info.lastInsertRowid,
          description: `Lab test – ${test.name} (${test.code})`,
          unitPrice: test.price,
        });
        return info.lastInsertRowid;
      }),
    );
    AuditService.log(actor, 'CREATE', 'LabOrder', ids.join(','), `Ordered ${ids.length} test(s) for patient #${data.patient_id} [${data.priority}]`);
    return ids.map((i) => this.get(i));
  },

  /** FR-32: ORDERED → SAMPLE_COLLECTED */
  collect(id, actor) {
    const o = this.get(id);
    if (!canTransitionLab(o.status, 'SAMPLE_COLLECTED')) throw conflict(`Cannot collect sample for an order that is ${o.status}`, 'INVALID_STATE');
    db().prepare("UPDATE lab_orders SET status = 'SAMPLE_COLLECTED', sample_collected_at = ?, processed_by = ? WHERE id = ?").run(nowIso(), actor.id, id);
    AuditService.log(actor, 'STATUS_CHANGE', 'LabOrder', id, `ORDERED → SAMPLE_COLLECTED (${o.test_name}, ${o.patient_code})`);
    return this.get(id);
  },

  /** FR-32, FR-33: SAMPLE_COLLECTED → COMPLETED with result */
  recordResult(id, input, actor) {
    const o = this.get(id);
    if (!canTransitionLab(o.status, 'COMPLETED')) throw conflict(`Cannot enter a result for an order that is ${o.status}`, 'INVALID_STATE');
    const data = validate(
      z.object({
        result_value: z.union([z.coerce.number(), z.literal(''), z.null()]).optional(),
        result_text: z.string().trim().max(2000).optional().nullable(),
        remarks: z.string().trim().max(1000).optional().nullable(),
      }),
      input,
    );
    const value = data.result_value === '' || data.result_value === undefined ? null : data.result_value;
    const hasNumericRange = o.ref_low !== null || o.ref_high !== null;
    if (hasNumericRange && value === null) throw badRequest('A numeric result value is required for this test', { result_value: 'Required' });
    if (!hasNumericRange && value === null && !data.result_text) throw badRequest('Enter a result (value or findings)', { result_text: 'Required' });
    const abnormal = isAbnormal(value, o.ref_low, o.ref_high);
    db()
      .prepare("UPDATE lab_orders SET status = 'COMPLETED', result_value = ?, result_text = ?, is_abnormal = ?, remarks = ?, completed_at = ?, processed_by = ? WHERE id = ?")
      .run(value, data.result_text || null, abnormal === null ? null : abnormal ? 1 : 0, data.remarks || null, nowIso(), actor.id, id);
    AuditService.log(actor, 'STATUS_CHANGE', 'LabOrder', id, `SAMPLE_COLLECTED → COMPLETED (${o.test_name}${abnormal ? ', ABNORMAL' : ''})`);
    return this.get(id);
  },

  /** FR-34: cancelling an ORDERED test removes its unbilled charge. */
  cancel(id, input, actor) {
    const o = this.get(id);
    if (!canTransitionLab(o.status, 'CANCELLED')) throw conflict(`Cannot cancel an order that is ${o.status}`, 'INVALID_STATE');
    if (ChargeService.isInvoiced('LAB', id)) throw conflict('This test is already on an invoice; cancel the invoice first', 'ALREADY_INVOICED');
    const reason = String(input?.reason || '').trim() || 'Not specified';
    tx(() => {
      db().prepare("UPDATE lab_orders SET status = 'CANCELLED', remarks = ? WHERE id = ?").run(`Cancelled: ${reason}`, id);
      ChargeService.removeUnbilled('LAB', id);
    });
    AuditService.log(actor, 'STATUS_CHANGE', 'LabOrder', id, `ORDERED → CANCELLED (${reason}); charge removed`);
    return this.get(id);
  },

  stats({ doctorId } = {}) {
    const rows = doctorId
      ? db().prepare('SELECT status, COUNT(*) n FROM lab_orders WHERE doctor_id = ? GROUP BY status').all(Number(doctorId))
      : db().prepare('SELECT status, COUNT(*) n FROM lab_orders GROUP BY status').all();
    return Object.fromEntries(rows.map((r) => [r.status, r.n]));
  },
};
