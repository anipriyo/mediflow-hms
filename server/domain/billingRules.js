import { round2, sum } from './money.js';

export const INVOICE_STATUS = Object.freeze({
  UNPAID: 'UNPAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
});

export const PAYMENT_METHODS = ['CASH', 'CARD', 'UPI'];
export const MAX_DISCOUNT_PCT = 50;

/** Subtotal, discount and total for a list of charge lines (FR-44, FR-45). */
export function computeTotals(lines, discountPct = 0) {
  const subtotal = sum(lines.map((l) => l.amount));
  const discountAmount = round2((subtotal * discountPct) / 100);
  const total = round2(subtotal - discountAmount);
  return { subtotal, discountAmount, total };
}

export function lineAmount(quantity, unitPrice) {
  return round2(quantity * unitPrice);
}

/** Returns an error message or null. */
export function validateDiscount(invoice, pct) {
  if (typeof pct !== 'number' || Number.isNaN(pct)) return 'Discount must be a number';
  if (pct < 0 || pct > MAX_DISCOUNT_PCT) return `Discount must be between 0% and ${MAX_DISCOUNT_PCT}%`;
  if (invoice.status !== 'UNPAID') return 'Discount can only be applied to an UNPAID invoice';
  return null;
}

export function outstanding(invoice) {
  return round2(invoice.total - invoice.paid_amount);
}

/** Returns an error message or null (FR-46, BR-11). */
export function validatePayment(invoice, amount, method) {
  if (invoice.status === 'CANCELLED') return 'Cannot pay a cancelled invoice';
  if (invoice.status === 'PAID') return 'Invoice is already fully paid';
  if (!PAYMENT_METHODS.includes(method)) return `Payment method must be one of ${PAYMENT_METHODS.join(', ')}`;
  if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) return 'Payment amount must be greater than zero';
  if (round2(amount) !== amount) return 'Payment amount can have at most 2 decimal places';
  if (amount > outstanding(invoice)) return `Payment exceeds the outstanding balance of ₹${outstanding(invoice).toFixed(2)}`;
  return null;
}

/** Invoice status after payments. */
export function statusAfterPayment(total, paid) {
  if (paid <= 0) return 'UNPAID';
  if (round2(paid) >= round2(total)) return 'PAID';
  return 'PARTIALLY_PAID';
}

export function canCancelInvoice(invoice) {
  return invoice.status === 'UNPAID' && invoice.paid_amount === 0;
}

export function formatInvoiceNo(dateCompact, seq) {
  return `INV-${dateCompact}-${String(seq).padStart(4, '0')}`;
}

export function formatReceiptNo(dateCompact, seq) {
  return `R-${dateCompact}-${String(seq).padStart(4, '0')}`;
}
