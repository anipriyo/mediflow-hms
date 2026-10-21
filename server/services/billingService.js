import { db, tx } from '../db/connection.js';
import { nowIso, compactDate } from '../utils/clock.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { validate, z, nonEmpty } from '../utils/validate.js';
import { round2 } from '../domain/money.js';
import {
  computeTotals, validateDiscount, validatePayment, statusAfterPayment, canCancelInvoice, outstanding, formatInvoiceNo, formatReceiptNo, PAYMENT_METHODS,
} from '../domain/billingRules.js';
import { PatientService } from './patientService.js';
import { AuditService } from './auditService.js';

const BASE = `
  SELECT i.*, p.patient_code, p.first_name || ' ' || p.last_name AS patient_name, p.phone AS patient_phone,
         ad.admission_no, cu.full_name AS created_by_name
  FROM invoices i JOIN patients p ON p.id = i.patient_id
  LEFT JOIN admissions ad ON ad.id = i.admission_id
  LEFT JOIN users cu ON cu.id = i.created_by`;

export const BillingService = {
  /** Patients that have charges waiting to be invoiced. */
  pending() {
    return db()
      .prepare(`SELECT c.patient_id, p.patient_code, p.first_name || ' ' || p.last_name AS patient_name, c.admission_id, ad.admission_no, ad.status AS admission_status,
                       COUNT(*) AS items, ROUND(SUM(c.amount), 2) AS total, MIN(c.created_at) AS oldest
                FROM charges c JOIN patients p ON p.id = c.patient_id LEFT JOIN admissions ad ON ad.id = c.admission_id
                WHERE c.invoice_id IS NULL GROUP BY c.patient_id, c.admission_id ORDER BY oldest`)
      .all();
  },

  unbilled({ patientId, admissionId } = {}) {
    if (!patientId) throw badRequest('patientId is required');
    return admissionId
      ? db().prepare('SELECT * FROM charges WHERE patient_id = ? AND admission_id = ? AND invoice_id IS NULL ORDER BY id').all(patientId, admissionId)
      : db().prepare('SELECT * FROM charges WHERE patient_id = ? AND admission_id IS NULL AND invoice_id IS NULL ORDER BY id').all(patientId);
  },

  /** FR-44: invoice all unbilled OPD charges of a patient, or all charges of one admission. */
  generate(input, actor) {
    const data = validate(
      z.object({ patient_id: z.coerce.number().int().positive('Patient is required'), admission_id: z.coerce.number().int().positive().optional().nullable(), notes: z.string().max(500).optional() }),
      input,
    );
    const patient = PatientService.get(data.patient_id);
    const id = tx(() => {
      const lines = this.unbilled({ patientId: patient.id, admissionId: data.admission_id || null });
      if (!lines.length) throw badRequest('There are no unbilled charges for this patient');
      const totals = computeTotals(lines, 0);
      const day = compactDate();
      const seq = db().prepare('SELECT COUNT(*) c FROM invoices WHERE invoice_no LIKE ?').get(`INV-${day}-%`).c + 1;
      const info = db()
        .prepare(`INSERT INTO invoices (invoice_no, patient_id, admission_id, subtotal, discount_pct, discount_amount, total, paid_amount, status, notes, created_by, created_at)
                  VALUES (?, ?, ?, ?, 0, 0, ?, 0, 'UNPAID', ?, ?, ?)`)
        .run(formatInvoiceNo(day, seq), patient.id, data.admission_id || null, totals.subtotal, totals.total, data.notes || null, actor.id, nowIso());
      const upd = db().prepare('UPDATE charges SET invoice_id = ? WHERE id = ? AND invoice_id IS NULL');
      for (const l of lines) {
        if (upd.run(info.lastInsertRowid, l.id).changes !== 1) throw conflict('Charges changed while generating the invoice; please retry');
      }
      return info.lastInsertRowid;
    });
    const inv = this.get(id);
    AuditService.log(actor, 'CREATE', 'Invoice', id, `${inv.invoice_no} for ${patient.patient_code}: ${inv.items.length} item(s), total ₹${inv.total}`);
    return inv;
  },

  list({ status, patientId, q, from, to, limit = 300 } = {}) {
    const where = [];
    const params = [];
    if (status) { const s = String(status).split(','); where.push(`i.status IN (${s.map(() => '?').join(',')})`); params.push(...s); }
    if (patientId) { where.push('i.patient_id = ?'); params.push(Number(patientId)); }
    if (q) { where.push("(i.invoice_no LIKE ? OR p.patient_code = ? OR p.first_name || ' ' || p.last_name LIKE ?)"); params.push(`%${q}%`, q, `%${q}%`); }
    if (from) { where.push('i.created_at >= ?'); params.push(new Date(`${from}T00:00:00`).toISOString()); }
    if (to) { where.push('i.created_at <= ?'); params.push(new Date(`${to}T23:59:59.999`).toISOString()); }
    return db().prepare(`${BASE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY i.id DESC LIMIT ?`).all(...params, Number(limit) || 300);
  },

  get(id) {
    const inv = db().prepare(`${BASE} WHERE i.id = ?`).get(id);
    if (!inv) throw notFound('Invoice');
    const items = db().prepare('SELECT * FROM charges WHERE invoice_id = ? ORDER BY id').all(id);
    const payments = db().prepare('SELECT pay.*, u.full_name AS received_by_name FROM payments pay LEFT JOIN users u ON u.id = pay.received_by WHERE invoice_id = ? ORDER BY pay.id').all(id);
    return { ...inv, items, payments, balance: outstanding(inv), patient: PatientService.get(inv.patient_id) };
  },

  /** FR-45 */
  applyDiscount(id, input, actor) {
    const data = validate(z.object({ discount_pct: z.coerce.number(), reason: nonEmpty('Discount reason') }), input);
    const inv = this.get(id);
    const problem = validateDiscount(inv, data.discount_pct);
    if (problem) throw badRequest(problem, { discount_pct: problem });
    const totals = computeTotals(inv.items, data.discount_pct);
    db().prepare('UPDATE invoices SET discount_pct = ?, discount_amount = ?, discount_reason = ?, total = ? WHERE id = ?').run(data.discount_pct, totals.discountAmount, data.reason, totals.total, id);
    AuditService.log(actor, 'DISCOUNT', 'Invoice', id, `${inv.invoice_no}: ${data.discount_pct}% discount (₹${totals.discountAmount}) – ${data.reason}`);
    return this.get(id);
  },

  /** FR-46, FR-47 */
  recordPayment(id, input, actor) {
    const data = validate(
      z.object({
        amount: z.coerce.number({ invalid_type_error: 'Amount must be a number' }),
        method: z.string().transform((s) => s.toUpperCase()),
        reference: z.string().trim().max(100).optional().nullable(),
      }),
      input,
    );
    const result = tx(() => {
      const inv = db().prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      if (!inv) throw notFound('Invoice');
      const problem = validatePayment(inv, data.amount, data.method);
      if (problem) throw badRequest(problem, { amount: problem });
      if (data.method !== 'CASH' && !data.reference) throw badRequest(`A transaction reference is required for ${data.method} payments`, { reference: 'Required' });
      const day = compactDate();
      const seq = db().prepare('SELECT COUNT(*) c FROM payments WHERE receipt_no LIKE ?').get(`R-${day}-%`).c + 1;
      const receiptNo = formatReceiptNo(day, seq);
      const pay = db()
        .prepare('INSERT INTO payments (invoice_id, receipt_no, amount, method, reference, received_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, receiptNo, data.amount, data.method, data.reference || null, actor.id, nowIso());
      const paid = round2(inv.paid_amount + data.amount);
      const status = statusAfterPayment(inv.total, paid);
      db().prepare('UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?').run(paid, status, id);
      return { paymentId: pay.lastInsertRowid, receiptNo, before: inv.status, after: status, invoiceNo: inv.invoice_no };
    });
    AuditService.log(actor, 'PAYMENT', 'Invoice', id, `${result.invoiceNo}: received ₹${data.amount} by ${data.method} (${result.receiptNo}); ${result.before} → ${result.after}`);
    return { invoice: this.get(id), receipt: this.receipt(result.paymentId) };
  },

  cancel(id, input, actor) {
    const { reason } = validate(z.object({ reason: nonEmpty('Cancellation reason') }), input);
    const inv = this.get(id);
    if (!canCancelInvoice(inv)) throw conflict('Only unpaid invoices without payments can be cancelled', 'INVALID_STATE');
    tx(() => {
      db().prepare("UPDATE invoices SET status = 'CANCELLED', notes = COALESCE(notes || ' | ', '') || ? WHERE id = ?").run(`Cancelled: ${reason}`, id);
      db().prepare('UPDATE charges SET invoice_id = NULL WHERE invoice_id = ?').run(id); // charges can be re-invoiced
    });
    AuditService.log(actor, 'STATUS_CHANGE', 'Invoice', id, `${inv.invoice_no}: UNPAID → CANCELLED (${reason}); charges released`);
    return this.get(id);
  },

  receipt(paymentId) {
    const r = db()
      .prepare(`SELECT pay.*, i.invoice_no, i.total, i.paid_amount, i.status AS invoice_status, p.patient_code, p.first_name || ' ' || p.last_name AS patient_name, u.full_name AS received_by_name
                FROM payments pay JOIN invoices i ON i.id = pay.invoice_id JOIN patients p ON p.id = i.patient_id LEFT JOIN users u ON u.id = pay.received_by WHERE pay.id = ?`)
      .get(paymentId);
    if (!r) throw notFound('Receipt');
    return { ...r, balance_after: round2(r.total - r.paid_amount) };
  },

  methods() {
    return PAYMENT_METHODS;
  },
};
