// Central clock so that tests can freeze "now" and business rules stay deterministic.
let frozen = null;

export const clock = {
  now() {
    return frozen ? new Date(frozen.getTime()) : new Date();
  },
  freeze(date) {
    frozen = new Date(date);
  },
  reset() {
    frozen = null;
  },
};

const pad = (n) => String(n).padStart(2, '0');

/** Local calendar date YYYY-MM-DD */
export function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local time HH:MM */
export function toTimeStr(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function todayStr() {
  return toDateStr(clock.now());
}

export function nowIso() {
  return clock.now().toISOString();
}

/** Combine local date (YYYY-MM-DD) and time (HH:MM) into a Date */
export function combineLocal(dateStr, timeStr = '00:00') {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export function addDays(dateStr, days) {
  const d = combineLocal(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function compactDate(d = clock.now()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
