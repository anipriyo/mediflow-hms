// Pure helpers for HH:MM arithmetic.
export function timeToMinutes(hhmm) {
  if (!/^\d{2}:\d{2}$/.test(hhmm || '')) throw new Error(`Invalid time "${hhmm}"`);
  const [h, m] = hhmm.split(':').map(Number);
  if (h > 23 || m > 59) throw new Error(`Invalid time "${hhmm}"`);
  return h * 60 + m;
}

export function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function addMinutes(hhmm, mins) {
  return minutesToTime(timeToMinutes(hhmm) + mins);
}

/** Half-open interval overlap test: [aStart, aEnd) ∩ [bStart, bEnd) ≠ ∅ */
export function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}

/** True when `s` is a real calendar date in YYYY-MM-DD form (rejects 2026-02-30, 2026-13-01 …). */
export function isRealDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < 1000) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
