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

/** Charges for each bed stay of an admission. */
export function bedCharges(stays, endIso) {
  return stays.map((s) => {
    const days = bedDays(s.start_at, s.end_at || endIso);
    return { ...s, days, amount: round2(days * s.daily_rate) };
  });
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
