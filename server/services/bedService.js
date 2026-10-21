import { db } from '../db/connection.js';
import { nowIso } from '../utils/clock.js';
import { conflict, notFound, badRequest } from '../utils/errors.js';
import { canManuallyTransitionBed, BED_STATUS } from '../domain/bedStateMachine.js';
import { AuditService } from './auditService.js';

export const BedService = {
  /** FR-38: ward-wise bed board */
  board() {
    const wards = db().prepare('SELECT * FROM wards ORDER BY id').all();
    const beds = db()
      .prepare(`SELECT b.*, ad.admission_no, ad.status AS admission_status, ad.admitted_at, p.id AS patient_id, p.patient_code,
                       p.first_name || ' ' || p.last_name AS patient_name, u.full_name AS doctor_name
                FROM beds b
                LEFT JOIN admissions ad ON ad.id = b.current_admission_id
                LEFT JOIN patients p ON p.id = ad.patient_id
                LEFT JOIN doctors d ON d.id = ad.doctor_id
                LEFT JOIN users u ON u.id = d.user_id
                ORDER BY b.ward_id, b.id`)
      .all();
    const summary = Object.fromEntries(Object.keys(BED_STATUS).map((s) => [s, 0]));
    for (const b of beds) summary[b.status] += 1;
    const total = beds.length;
    return {
      summary: { ...summary, total, occupancyPct: total ? Math.round((summary.OCCUPIED / total) * 100) : 0 },
      wards: wards.map((w) => {
        const wb = beds.filter((b) => b.ward_id === w.id);
        const occ = wb.filter((b) => b.status === 'OCCUPIED').length;
        return { ...w, beds: wb, total: wb.length, occupied: occ, available: wb.filter((b) => b.status === 'AVAILABLE').length, occupancyPct: wb.length ? Math.round((occ / wb.length) * 100) : 0 };
      }),
    };
  },

  available() {
    return db()
      .prepare("SELECT b.*, w.name AS ward, w.type AS ward_type, w.daily_rate FROM beds b JOIN wards w ON w.id = b.ward_id WHERE b.status IN ('AVAILABLE','RESERVED') ORDER BY w.id, b.id")
      .all();
  },

  get(id) {
    const b = db().prepare('SELECT b.*, w.name AS ward, w.daily_rate FROM beds b JOIN wards w ON w.id = b.ward_id WHERE b.id = ?').get(id);
    if (!b) throw notFound('Bed');
    return b;
  },

  /** FR-41: manual status changes (cleaning done, maintenance, reservations). */
  changeStatus(id, status, actor) {
    const bed = this.get(id);
    if (!Object.keys(BED_STATUS).includes(status)) throw badRequest(`Unknown bed status ${status}`);
    if (!canManuallyTransitionBed(bed.status, status)) {
      throw conflict(`Bed ${bed.ward} / ${bed.bed_no} cannot change from ${bed.status} to ${status}`, 'INVALID_BED_TRANSITION');
    }
    db().prepare('UPDATE beds SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), id);
    AuditService.log(actor, 'STATUS_CHANGE', 'Bed', id, `${bed.ward} ${bed.bed_no}: ${bed.status} → ${status}`);
    return this.get(id);
  },
};
