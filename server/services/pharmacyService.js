import { db, tx } from '../db/connection.js';
import { nowIso, todayStr } from '../utils/clock.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { validate, z, nonEmpty, dateStr, likeTerm } from '../utils/validate.js';
import { isLowStock, expiryStatus, daysToExpiry, checkDispensable, stockAlerts } from '../domain/inventoryRules.js';
import { ChargeService } from './chargeService.js';
import { AuditService } from './auditService.js';

function decorate(m) {
  const today = todayStr();
  return { ...m, low_stock: isLowStock(m), expiry_status: expiryStatus(m.expiry_date, today), days_to_expiry: daysToExpiry(m.expiry_date, today) };
}

const medSchema = z.object({
  name: nonEmpty('Medicine name'),
  generic_name: z.string().optional().nullable(),
  form: z.enum(['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Drops', 'Inhaler', 'Sachet']).default('Tablet'),
  strength: z.string().optional().nullable(),
  unit_price: z.coerce.number().min(0, 'Price cannot be negative'),
  stock_qty: z.coerce.number().int().min(0).default(0),
  reorder_level: z.coerce.number().int().min(0).default(20),
  batch_no: z.string().optional().nullable(),
  expiry_date: dateStr.optional().nullable(),
});

export const PharmacyService = {
  medicines({ q, filter } = {}) {
    const rows = q
      ? db().prepare("SELECT * FROM medicines WHERE name LIKE ? ESCAPE '\\' OR generic_name LIKE ? ESCAPE '\\' ORDER BY name").all(likeTerm(q), likeTerm(q))
      : db().prepare('SELECT * FROM medicines ORDER BY name').all();
    let list = rows.map(decorate);
    if (filter === 'low') list = list.filter((m) => m.low_stock);
    if (filter === 'expiring') list = list.filter((m) => m.expiry_status !== 'OK');
    return list;
  },

  get(id) {
    const m = db().prepare('SELECT * FROM medicines WHERE id = ?').get(id);
    if (!m) throw notFound('Medicine');
    return decorate(m);
  },

  /** FR-35 */
  create(input, actor) {
    const d = validate(medSchema, input);
    const info = db()
      .prepare('INSERT INTO medicines (name, generic_name, form, strength, unit_price, stock_qty, reorder_level, batch_no, expiry_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(d.name, d.generic_name || null, d.form, d.strength || null, d.unit_price, d.stock_qty, d.reorder_level, d.batch_no || null, d.expiry_date || null, nowIso());
    AuditService.log(actor, 'CREATE', 'Medicine', info.lastInsertRowid, `Added ${d.name} (${d.stock_qty} units)`);
    return this.get(info.lastInsertRowid);
  },

  update(id, input, actor) {
    const m = this.get(id);
    const d = validate(medSchema.omit({ stock_qty: true }).partial(), input);
    const cols = Object.keys(d).filter((k) => d[k] !== undefined);
    if (cols.length) db().prepare(`UPDATE medicines SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => d[c]), id);
    AuditService.log(actor, 'UPDATE', 'Medicine', id, `Updated ${m.name} (${cols.join(', ')})`);
    return this.get(id);
  },

  /** FR-35: restock with a new batch / expiry */
  restock(id, input, actor) {
    const m = this.get(id);
    const d = validate(
      z.object({
        quantity: z.coerce.number().int().positive('Quantity must be greater than 0'),
        batch_no: z.string().trim().optional().nullable(),
        expiry_date: dateStr.optional().nullable(),
      }),
      input,
    );
    if (d.expiry_date && d.expiry_date <= todayStr()) throw badRequest('Cannot stock a batch that is already expired', { expiry_date: 'Must be a future date' });
    db()
      .prepare('UPDATE medicines SET stock_qty = stock_qty + ?, batch_no = COALESCE(?, batch_no), expiry_date = COALESCE(?, expiry_date) WHERE id = ?')
      .run(d.quantity, d.batch_no || null, d.expiry_date || null, id);
    AuditService.log(actor, 'RESTOCK', 'Medicine', id, `${m.name}: +${d.quantity} (was ${m.stock_qty})${d.batch_no ? `, batch ${d.batch_no}` : ''}`);
    return this.get(id);
  },

  /** FR-36 */
  alerts() {
    return stockAlerts(db().prepare('SELECT * FROM medicines ORDER BY name').all(), todayStr());
  },

  prescriptions({ status = 'PENDING', patientId } = {}) {
    const where = [];
    const params = [];
    if (status && status !== 'ALL') { where.push('pr.status = ?'); params.push(status); }
    if (patientId) { where.push('pr.patient_id = ?'); params.push(Number(patientId)); }
    const rows = db()
      .prepare(`SELECT pr.*, p.patient_code, p.first_name || ' ' || p.last_name AS patient_name, u.full_name AS doctor_name, du.full_name AS dispensed_by_name
                FROM prescriptions pr JOIN patients p ON p.id = pr.patient_id JOIN doctors d ON d.id = pr.doctor_id JOIN users u ON u.id = d.user_id
                LEFT JOIN users du ON du.id = pr.dispensed_by
                ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY pr.created_at DESC LIMIT 300`)
      .all(...params);
    return rows.map((r) => this.withItems(r));
  },

  withItems(pr) {
    const today = todayStr();
    const items = db()
      .prepare('SELECT pi.*, m.name AS medicine_name, m.strength, m.form, m.unit_price, m.stock_qty, m.expiry_date FROM prescription_items pi JOIN medicines m ON m.id = pi.medicine_id WHERE pi.prescription_id = ?')
      .all(pr.id)
      .map((it) => ({ ...it, problem: pr.status === 'PENDING' ? checkDispensable({ name: it.medicine_name, stock_qty: it.stock_qty, expiry_date: it.expiry_date }, it.quantity, today) : null }));
    const total = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
    return { ...pr, items, estimated_total: Math.round(total * 100) / 100, dispensable: items.every((i) => !i.problem) };
  },

  getPrescription(id) {
    const pr = db()
      .prepare(`SELECT pr.*, p.patient_code, p.first_name || ' ' || p.last_name AS patient_name, u.full_name AS doctor_name FROM prescriptions pr
                JOIN patients p ON p.id = pr.patient_id JOIN doctors d ON d.id = pr.doctor_id JOIN users u ON u.id = d.user_id WHERE pr.id = ?`)
      .get(id);
    if (!pr) throw notFound('Prescription');
    return this.withItems(pr);
  },

  /** FR-37: all-or-nothing dispensing inside one transaction (NFR-04). */
  dispense(id, actor) {
    const pr = this.getPrescription(id);
    if (pr.status !== 'PENDING') throw conflict(`Prescription is already ${pr.status}`, 'INVALID_STATE');
    const today = todayStr();
    tx(() => {
      const appointmentId = pr.consultation_id ? db().prepare('SELECT appointment_id FROM consultations WHERE id = ?').get(pr.consultation_id)?.appointment_id : null;
      for (const it of pr.items) {
        const med = db().prepare('SELECT * FROM medicines WHERE id = ?').get(it.medicine_id); // re-read inside transaction
        const problem = checkDispensable(med, it.quantity, today);
        if (problem) throw conflict(problem, 'CANNOT_DISPENSE');
        db().prepare('UPDATE medicines SET stock_qty = stock_qty - ? WHERE id = ?').run(it.quantity, med.id);
        ChargeService.add({
          patientId: pr.patient_id,
          appointmentId,
          admissionId: pr.admission_id || null,
          sourceType: 'MEDICINE',
          sourceId: it.id,
          description: `${med.name}${med.strength ? ` ${med.strength}` : ''} × ${it.quantity}`,
          quantity: it.quantity,
          unitPrice: med.unit_price,
        });
      }
      db().prepare("UPDATE prescriptions SET status = 'DISPENSED', dispensed_at = ?, dispensed_by = ? WHERE id = ?").run(nowIso(), actor.id, id);
    });
    AuditService.log(actor, 'DISPENSE', 'Prescription', id, `Dispensed ${pr.items.length} item(s) to ${pr.patient_code}`);
    return this.getPrescription(id);
  },
};
