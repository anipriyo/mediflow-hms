// Pharmacy stock rules (FR-36, FR-37, BR-07)
export const NEAR_EXPIRY_DAYS = 30;

export function isLowStock(med) {
  return med.stock_qty <= med.reorder_level;
}

function daysBetween(fromDateStr, toDateStr) {
  const [y1, m1, d1] = fromDateStr.split('-').map(Number);
  const [y2, m2, d2] = toDateStr.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** 'EXPIRED' | 'NEAR_EXPIRY' | 'OK' | 'UNKNOWN' */
export function expiryStatus(expiryDate, todayStr) {
  if (!expiryDate) return 'UNKNOWN';
  const days = daysBetween(todayStr, expiryDate);
  if (days < 0) return 'EXPIRED';
  if (days <= NEAR_EXPIRY_DAYS) return 'NEAR_EXPIRY';
  return 'OK';
}

export function daysToExpiry(expiryDate, todayStr) {
  return expiryDate ? daysBetween(todayStr, expiryDate) : null;
}

/** Returns an error message or null. */
export function checkDispensable(med, quantity, todayStr) {
  if (!Number.isInteger(quantity) || quantity <= 0) return 'Quantity must be a positive whole number';
  if (expiryStatus(med.expiry_date, todayStr) === 'EXPIRED') return `${med.name} is expired and cannot be dispensed`;
  if (med.stock_qty < quantity) return `Insufficient stock for ${med.name}: ${med.stock_qty} available, ${quantity} required`;
  return null;
}

export function stockAlerts(medicines, todayStr) {
  const alerts = [];
  for (const m of medicines) {
    if (isLowStock(m)) {
      alerts.push({ type: m.stock_qty === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK', medicine: m, message: `${m.name}: ${m.stock_qty} left (reorder level ${m.reorder_level})` });
    }
    const exp = expiryStatus(m.expiry_date, todayStr);
    if (exp === 'EXPIRED') alerts.push({ type: 'EXPIRED', medicine: m, message: `${m.name}: batch ${m.batch_no || ''} expired on ${m.expiry_date}` });
    else if (exp === 'NEAR_EXPIRY') alerts.push({ type: 'NEAR_EXPIRY', medicine: m, message: `${m.name}: expires in ${daysToExpiry(m.expiry_date, todayStr)} days (${m.expiry_date})` });
  }
  return alerts;
}
