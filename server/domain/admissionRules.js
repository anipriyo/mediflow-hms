import { round2 } from './money.js';

export const ADMISSION_TRANSITIONS = Object.freeze({
  ADMITTED: ['DISCHARGE_PENDING'],
  DISCHARGE_PENDING: ['DISCHARGED'],
  DISCHARGED: [],
});

export function canTransitionAdmission(from, to) {
  return (ADMISSION_TRANSITIONS[from] || []).includes(to);
}

/** Bed days for a stay: ceil(hours / 24), minimum 1 (BR-09). */
export function bedDays(startIso, endIso) {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (Number.isNaN(ms)) throw new Error('Invalid dates for bed day calculation');
  const hours = Math.max(ms, 0) / 3_600_000;
  return Math.max(1, Math.ceil(hours / 24));
}

/**
 * Charges for each bed stay of an admission.
 * The admission as a whole is billed max(1, ceil(totalHours / 24)) bed-days (BR-09); those days are
 * shared between the stays in proportion to the time spent in each bed (largest-remainder method),
 * so a transfer never creates an extra "minimum day" (fix for DEF-05).
 */
export function bedCharges(stays, endIso) {
  if (!stays.length) return [];
  const hours = stays.map((s) => Math.max(0, new Date(s.end_at || endIso).getTime() - new Date(s.start_at).getTime()) / 3_600_000);
  const totalHours = hours.reduce((a, b) => a + b, 0);
  const totalDays = Math.max(1, Math.ceil(totalHours / 24));
  const exact = hours.map((h) => (totalHours > 0 ? (h / totalHours) * totalDays : totalDays / stays.length));
  const days = exact.map(Math.floor);
  let remaining = totalDays - days.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => [v - Math.floor(v), hours[i], i]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  for (let k = 0; remaining > 0; k = (k + 1) % order.length, remaining -= 1) days[order[k][2]] += 1;
  return stays.map((s, i) => ({ ...s, days: days[i], amount: round2(days[i] * s.daily_rate) }));
}

/**
 * Discharge clearance (FR-43): every charge of the admission must be invoiced and every
 * invoice fully paid, unless an administrator overrides with a reason.
 */
export function dischargeClearance({ unbilledCount, invoices, override }) {
  const outstanding = round2(
    invoices.filter((i) => i.status !== 'CANCELLED').reduce((sum, i) => sum + (i.total - i.paid_amount), 0),
  );
  const cleared = unbilledCount === 0 && outstanding <= 0;
  if (cleared) return { allowed: true, outstanding, unbilledCount, overridden: false };
  if (override && override.role === 'ADMIN' && override.reason && override.reason.trim().length >= 5) {
    return { allowed: true, outstanding, unbilledCount, overridden: true };
  }
  return { allowed: false, outstanding, unbilledCount, overridden: false };
}
