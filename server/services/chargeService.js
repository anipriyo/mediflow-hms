import { db } from '../db/connection.js';
import { nowIso } from '../utils/clock.js';
import { lineAmount } from '../domain/billingRules.js';

/** Creates unbilled charges that Billing later turns into invoices (FR-29, FR-34, FR-37, FR-42). */
export const ChargeService = {
  add({ patientId, appointmentId = null, admissionId = null, sourceType, sourceId = null, description, quantity = 1, unitPrice }) {
    const amount = lineAmount(quantity, unitPrice);
    return db()
      .prepare(`INSERT INTO charges (patient_id, appointment_id, admission_id, source_type, source_id, description, quantity, unit_price, amount, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(patientId, appointmentId, admissionId, sourceType, sourceId, description, quantity, unitPrice, amount, nowIso()).lastInsertRowid;
  },

  removeUnbilled(sourceType, sourceId) {
    return db().prepare('DELETE FROM charges WHERE source_type = ? AND source_id = ? AND invoice_id IS NULL').run(sourceType, sourceId).changes;
  },

  isInvoiced(sourceType, sourceId) {
    return Boolean(db().prepare('SELECT 1 FROM charges WHERE source_type = ? AND source_id = ? AND invoice_id IS NOT NULL').get(sourceType, sourceId));
  },
};
