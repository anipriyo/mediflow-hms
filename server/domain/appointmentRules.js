import { timeToMinutes, minutesToTime, addMinutes, intervalsOverlap } from './time.js';

export const APPOINTMENT_STATUS = Object.freeze({
  SCHEDULED: 'SCHEDULED',
  CHECKED_IN: 'CHECKED_IN',
  IN_CONSULTATION: 'IN_CONSULTATION',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
});

/** States that occupy a slot (BR-03) */
export const ACTIVE_STATUSES = ['SCHEDULED', 'CHECKED_IN', 'IN_CONSULTATION'];

/** Appointment life cycle (BR-04) */
export const APPOINTMENT_TRANSITIONS = Object.freeze({
  SCHEDULED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['IN_CONSULTATION'],
  IN_CONSULTATION: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
});

export function canTransitionAppointment(from, to) {
  return (APPOINTMENT_TRANSITIONS[from] || []).includes(to);
}

export function isActive(status) {
  return ACTIVE_STATUSES.includes(status);
}

/** Day of week (0=Sun) for a YYYY-MM-DD string, independent of timezone. */
export function dayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function parseWorkDays(workDays) {
  return String(workDays || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
}

export function isWorkingDay(doctor, dateStr) {
  return parseWorkDays(doctor.work_days).includes(dayOfWeek(dateStr));
}

/** All slot start times for a doctor on a given date (BR-02). */
export function generateSlots(doctor, dateStr) {
  if (!isWorkingDay(doctor, dateStr)) return [];
  const start = timeToMinutes(doctor.work_start);
  const end = timeToMinutes(doctor.work_end);
  const len = doctor.slot_minutes;
  const slots = [];
  for (let t = start; t + len <= end; t += len) {
    slots.push({ start: minutesToTime(t), end: minutesToTime(t + len) });
  }
  return slots;
}

/**
 * Validates that a requested slot is bookable for the doctor (ignoring conflicts).
 * Returns an array of human-readable problems; empty array means valid.
 * @param {object} p
 * @param {object} p.doctor doctor row (work_days, work_start, work_end, slot_minutes)
 * @param {string} p.date YYYY-MM-DD
 * @param {string} p.startTime HH:MM
 * @param {Date}   p.now current time
 */
export function validateSlot({ doctor, date, startTime, now }) {
  const problems = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return ['Date must be in YYYY-MM-DD format'];
  if (!/^\d{2}:\d{2}$/.test(startTime || '')) return ['Time must be in HH:MM format'];
  if (!isWorkingDay(doctor, date)) problems.push('Doctor does not work on the selected day');
  const start = timeToMinutes(startTime);
  const ws = timeToMinutes(doctor.work_start);
  const we = timeToMinutes(doctor.work_end);
  if (start < ws || start + doctor.slot_minutes > we) {
    problems.push(`Time is outside the doctor's working hours (${doctor.work_start}–${doctor.work_end})`);
  } else if ((start - ws) % doctor.slot_minutes !== 0) {
    problems.push(`Time must align to a ${doctor.slot_minutes}-minute slot`);
  }
  const [y, m, d] = date.split('-').map(Number);
  const slotDate = new Date(y, m - 1, d, Math.floor(start / 60), start % 60);
  if (now && slotDate.getTime() < now.getTime()) problems.push('Cannot book a slot in the past');
  return problems;
}

/** Returns the first conflicting active appointment, or null (FR-17). */
export function findConflict(existing, { date, startTime, endTime, excludeId = null }) {
  return (
    existing.find(
      (a) =>
        a.id !== excludeId &&
        a.date === date &&
        isActive(a.status) &&
        intervalsOverlap(a.start_time, a.end_time, startTime, endTime),
    ) || null
  );
}

/** Free slots = generated slots minus those overlapping active bookings, minus past slots. */
export function freeSlots(doctor, dateStr, bookings, now) {
  return generateSlots(doctor, dateStr).map((s) => {
    const taken = findConflict(bookings, { date: dateStr, startTime: s.start, endTime: s.end });
    const past = validateSlot({ doctor, date: dateStr, startTime: s.start, now }).some((p) => p.includes('past'));
    return { ...s, available: !taken && !past, reason: taken ? 'BOOKED' : past ? 'PAST' : null };
  });
}

export function endTimeFor(doctor, startTime) {
  return addMinutes(startTime, doctor.slot_minutes);
}
