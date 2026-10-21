import { db, tx } from '../db/connection.js';
import { todayStr, nowIso } from '../utils/clock.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { validatePatient, findPossibleDuplicates, formatPatientCode, ageFrom } from '../domain/patientRules.js';
import { can } from '../domain/permissions.js';
import { AuditService } from './auditService.js';

const FIELDS = ['first_name', 'last_name', 'gender', 'dob', 'phone', 'email', 'address', 'blood_group', 'allergies', 'emergency_contact_name', 'emergency_contact_phone'];

function clean(input) {
  const out = {};
  for (const f of FIELDS) {
    if (input[f] !== undefined) out[f] = typeof input[f] === 'string' ? input[f].trim() : input[f];
  }
  if (out.gender) out.gender = String(out.gender).toUpperCase();
  for (const k of ['email', 'address', 'blood_group', 'allergies', 'emergency_contact_name', 'emergency_contact_phone']) {
    if (out[k] === '') out[k] = null;
  }
  return out;
}

function withAge(p) {
  return p ? { ...p, age: ageFrom(p.dob, todayStr()), full_name: `${p.first_name} ${p.last_name}` } : p;
}

export const PatientService = {
  /** FR-09 */
  findDuplicates(input) {
    const data = clean(input);
    if (!data.dob) return [];
    const candidates = db().prepare('SELECT * FROM patients WHERE dob = ?').all(data.dob);
    return findPossibleDuplicates(data, candidates).map(withAge);
  },

  /** FR-07, FR-08, FR-09 */
  register(input, actor) {
    const data = clean(input);
    const errors = validatePatient(data, todayStr());
    if (Object.keys(errors).length) throw badRequest(Object.values(errors)[0], errors);
    const dups = this.findDuplicates(data);
    if (dups.length && !input.confirmDuplicate) {
      throw conflict('A patient with matching details already exists. Confirm to register anyway.', 'POSSIBLE_DUPLICATE', {
        duplicates: dups.map((d) => ({ id: d.id, patient_code: d.patient_code, full_name: d.full_name, phone: d.phone, dob: d.dob })),
      });
    }
    const id = tx(() => {
      const maxRow = db().prepare("SELECT MAX(CAST(SUBSTR(patient_code, 2) AS INTEGER)) AS n FROM patients").get();
      const code = formatPatientCode((maxRow.n || 0) + 1);
      const cols = Object.keys(data);
      const info = db()
        .prepare(`INSERT INTO patients (patient_code, ${cols.join(', ')}, created_by, created_at) VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)`)
        .run(code, ...cols.map((c) => data[c]), actor?.id ?? null, nowIso());
      return info.lastInsertRowid;
    });
    const patient = this.get(id);
    AuditService.log(actor, 'CREATE', 'Patient', id, `Registered patient ${patient.patient_code} ${patient.full_name}${dups.length ? ' (duplicate warning acknowledged)' : ''}`);
    return patient;
  },

  /** FR-10 */
  search({ q, limit = 50, offset = 0 } = {}) {
    const lim = Math.min(Number(limit) || 50, 500);
    if (!q || !String(q).trim()) {
      const rows = db().prepare('SELECT * FROM patients ORDER BY id DESC LIMIT ? OFFSET ?').all(lim, Number(offset) || 0);
      const total = db().prepare('SELECT COUNT(*) c FROM patients').get().c;
      return { rows: rows.map(withAge), total };
    }
    const term = String(q).trim();
    const like = `%${term}%`;
    const rows = db()
      .prepare(
        `SELECT * FROM patients
         WHERE patient_code = ? COLLATE NOCASE OR phone LIKE ? OR (first_name || ' ' || last_name) LIKE ? OR last_name LIKE ?
         ORDER BY CASE WHEN patient_code = ? COLLATE NOCASE THEN 0 ELSE 1 END, first_name, last_name LIMIT ?`,
      )
      .all(term, like, like, like, term, lim);
    return { rows: rows.map(withAge), total: rows.length };
  },

  get(id) {
    const p = db().prepare('SELECT * FROM patients WHERE id = ?').get(id);
    if (!p) throw notFound('Patient');
    return withAge(p);
  },

  /** FR-11 – the patient ID (code) can never change. */
  update(id, input, actor) {
    const existing = this.get(id);
    if (input.patient_code !== undefined && input.patient_code !== existing.patient_code) {
      throw badRequest('Patient ID cannot be changed', { patient_code: 'Patient ID is permanent' });
    }
    const data = clean(input);
    const errors = validatePatient(data, todayStr(), { partial: true });
    if (Object.keys(errors).length) throw badRequest(Object.values(errors)[0], errors);
    const cols = Object.keys(data);
    if (!cols.length) return existing;
    db().prepare(`UPDATE patients SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...cols.map((c) => data[c]), nowIso(), id);
    const changed = cols.filter((c) => String(existing[c] ?? '') !== String(data[c] ?? ''));
    AuditService.log(actor, 'UPDATE', 'Patient', id, `Updated ${existing.patient_code}: ${changed.join(', ') || 'no changes'}`);
    return this.get(id);
  },

  /** FR-12 – clinical sections only for clinical roles (FR-30). */
  history(id, actor) {
    const patient = this.get(id);
    const clinical = can(actor.role, 'clinical:read');
    const billing = can(actor.role, 'billing:read') || actor.role === 'RECEPTIONIST';
    const labs = can(actor.role, 'lab:read');
    const result = {
      patient,
      appointments: db()
        .prepare(`SELECT a.*, u.full_name AS doctor_name, dep.name AS department FROM appointments a
                  JOIN doctors d ON d.id = a.doctor_id JOIN users u ON u.id = d.user_id JOIN departments dep ON dep.id = d.department_id
                  WHERE a.patient_id = ? ORDER BY a.date DESC, a.start_time DESC`)
        .all(id),
      admissions: db()
        .prepare(`SELECT ad.id, ad.admission_no, ad.status, ad.admitted_at, ad.discharged_at, ad.reason, b.bed_no, w.name AS ward, u.full_name AS doctor_name
                  ${clinical ? ', ad.discharge_summary' : ''}
                  FROM admissions ad JOIN beds b ON b.id = ad.bed_id JOIN wards w ON w.id = b.ward_id
                  JOIN doctors d ON d.id = ad.doctor_id JOIN users u ON u.id = d.user_id
                  WHERE ad.patient_id = ? ORDER BY ad.admitted_at DESC`)
        .all(id),
      access: { clinical, billing, labs },
    };
    if (clinical) {
      result.consultations = db()
        .prepare(`SELECT c.*, u.full_name AS doctor_name, a.date FROM consultations c JOIN appointments a ON a.id = c.appointment_id
                  JOIN doctors d ON d.id = c.doctor_id JOIN users u ON u.id = d.user_id WHERE c.patient_id = ? ORDER BY c.created_at DESC`)
        .all(id);
      const presc = db()
        .prepare(`SELECT p.*, u.full_name AS doctor_name FROM prescriptions p JOIN doctors d ON d.id = p.doctor_id JOIN users u ON u.id = d.user_id
                  WHERE p.patient_id = ? ORDER BY p.created_at DESC`)
        .all(id);
      const items = db().prepare(`SELECT pi.*, m.name AS medicine_name, m.strength FROM prescription_items pi JOIN medicines m ON m.id = pi.medicine_id WHERE pi.prescription_id = ?`);
      result.prescriptions = presc.map((p) => ({ ...p, items: items.all(p.id) }));
    }
    if (labs) {
      result.labOrders = db()
        .prepare(`SELECT lo.*, t.name AS test_name, t.unit, t.ref_low, t.ref_high, t.ref_text FROM lab_orders lo JOIN lab_tests t ON t.id = lo.lab_test_id
                  WHERE lo.patient_id = ? ORDER BY lo.created_at DESC`)
        .all(id);
    }
    if (billing) {
      result.invoices = db().prepare('SELECT * FROM invoices WHERE patient_id = ? ORDER BY created_at DESC').all(id);
    }
    return result;
  },
};
