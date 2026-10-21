import { describe, expect } from 'vitest';
import { tc } from '../helpers/tc.js';
import {
  generateSlots, validateSlot, findConflict, freeSlots, canTransitionAppointment, isWorkingDay,
} from '../../server/domain/appointmentRules.js';
import { intervalsOverlap } from '../../server/domain/time.js';
import { sortQueue, nextToken, estimateWaits, remainingMinutes } from '../../server/domain/queueRules.js';

const doctor = { id: 1, work_start: '09:00', work_end: '17:00', slot_minutes: 15, work_days: '1,2,3,4,5,6' };
const WED = '2026-10-21'; // a Wednesday
const SUN = '2026-10-25';
const now = new Date(2026, 9, 21, 10, 0); // Wed 21 Oct 2026, 10:00 local
const U = 'Unit';

describe('Appointment rules (APT)', () => {
  tc({ id: 'UT-APT-01', level: U, fr: ['FR-15'], title: 'Generates slots across the working day', input: 'Doctor 09:00–17:00, 15-min slots, Wednesday', expected: '32 slots, first 09:00–09:15, last 16:45–17:00' }, (note) => {
    const slots = generateSlots(doctor, WED);
    note(`${slots.length} slots, first ${slots[0].start}–${slots[0].end}, last ${slots.at(-1).start}–${slots.at(-1).end}`);
    expect(slots).toHaveLength(32);
    expect(slots[0]).toEqual({ start: '09:00', end: '09:15' });
    expect(slots.at(-1)).toEqual({ start: '16:45', end: '17:00' });
  });

  tc({ id: 'UT-APT-02', level: U, fr: ['FR-15'], title: 'No slots on a non-working day', input: 'Doctor works Mon–Sat; date is Sunday 2026-10-25', expected: 'Empty slot list; isWorkingDay = false' }, (note) => {
    note(`slots=${generateSlots(doctor, SUN).length}, isWorkingDay=${isWorkingDay(doctor, SUN)}`);
    expect(generateSlots(doctor, SUN)).toEqual([]);
    expect(isWorkingDay(doctor, SUN)).toBe(false);
  });

  tc({ id: 'UT-APT-03', level: U, fr: ['FR-16'], title: 'Rejects a time outside working hours', input: 'Start 17:00 and 08:45 for a 09:00–17:00 doctor', expected: 'Validation error "outside the doctor\'s working hours"' }, (note) => {
    const late = validateSlot({ doctor, date: '2026-10-22', startTime: '17:00', now });
    const early = validateSlot({ doctor, date: '2026-10-22', startTime: '08:45', now });
    note(`17:00 → "${late[0]}"; 08:45 → "${early[0]}"`);
    expect(late[0]).toMatch(/outside the doctor's working hours/);
    expect(early[0]).toMatch(/outside the doctor's working hours/);
  });

  tc({ id: 'UT-APT-04', level: U, fr: ['FR-16'], title: 'Rejects a time that is not on a slot boundary', input: 'Start 09:07 with 15-minute slots', expected: 'Validation error "must align to a 15-minute slot"' }, (note) => {
    const p = validateSlot({ doctor, date: '2026-10-22', startTime: '09:07', now });
    note(p.join(' | '));
    expect(p[0]).toMatch(/align to a 15-minute slot/);
  });

  tc({ id: 'UT-APT-05', level: U, fr: ['FR-16'], title: 'Rejects booking a slot in the past', input: 'Now = 21 Oct 10:00; request 21 Oct 09:30', expected: 'Validation error "Cannot book a slot in the past"' }, (note) => {
    const p = validateSlot({ doctor, date: WED, startTime: '09:30', now });
    note(p.join(' | '));
    expect(p).toContain('Cannot book a slot in the past');
  });

  tc({ id: 'UT-APT-06', level: U, fr: ['FR-16'], title: 'Accepts a valid future slot', input: '21 Oct 11:15, doctor working', expected: 'No validation problems' }, (note) => {
    const p = validateSlot({ doctor, date: WED, startTime: '11:15', now });
    note(`problems = ${JSON.stringify(p)}`);
    expect(p).toEqual([]);
  });

  tc({ id: 'UT-APT-07', level: U, fr: ['FR-17'], title: 'Detects an overlapping active appointment', input: 'Existing SCHEDULED 10:00–10:15; request 10:00–10:15', expected: 'Conflict returned (appointment id 7)' }, (note) => {
    const existing = [{ id: 7, date: WED, start_time: '10:00', end_time: '10:15', status: 'SCHEDULED' }];
    const c = findConflict(existing, { date: WED, startTime: '10:00', endTime: '10:15' });
    note(`conflict id = ${c?.id}`);
    expect(c?.id).toBe(7);
  });

  tc({ id: 'UT-APT-08', level: U, fr: ['FR-17', 'FR-18', 'FR-19'], title: 'Ignores cancelled bookings and the appointment being rescheduled', input: 'CANCELLED 10:00 booking; SCHEDULED booking id 9 excluded', expected: 'No conflict in both cases' }, (note) => {
    const cancelled = [{ id: 8, date: WED, start_time: '10:00', end_time: '10:15', status: 'CANCELLED' }];
    const self = [{ id: 9, date: WED, start_time: '10:00', end_time: '10:15', status: 'SCHEDULED' }];
    const a = findConflict(cancelled, { date: WED, startTime: '10:00', endTime: '10:15' });
    const b = findConflict(self, { date: WED, startTime: '10:00', endTime: '10:15', excludeId: 9 });
    note(`cancelled → ${a}, excluded self → ${b}`);
    expect(a).toBeNull();
    expect(b).toBeNull();
  });

  tc({ id: 'UT-APT-09', level: U, fr: ['FR-17'], title: 'Adjacent slots do not overlap (half-open intervals)', input: '[10:00,10:15) vs [10:15,10:30) and [10:10,10:25)', expected: 'false for adjacent, true for overlapping' }, (note) => {
    const adj = intervalsOverlap('10:00', '10:15', '10:15', '10:30');
    const ovl = intervalsOverlap('10:00', '10:15', '10:10', '10:25');
    note(`adjacent=${adj}, overlapping=${ovl}`);
    expect(adj).toBe(false);
    expect(ovl).toBe(true);
  });

  tc({ id: 'UT-APT-10', level: U, fr: ['FR-19', 'FR-21', 'FR-25'], title: 'Appointment state machine allows only defined transitions', input: 'SCHEDULED→CHECKED_IN, CHECKED_IN→IN_CONSULTATION, COMPLETED→SCHEDULED, CHECKED_IN→CANCELLED', expected: 'true, true, false, false' }, (note) => {
    const r = [
      canTransitionAppointment('SCHEDULED', 'CHECKED_IN'),
      canTransitionAppointment('CHECKED_IN', 'IN_CONSULTATION'),
      canTransitionAppointment('COMPLETED', 'SCHEDULED'),
      canTransitionAppointment('CHECKED_IN', 'CANCELLED'),
    ];
    note(r.join(', '));
    expect(r).toEqual([true, true, false, false]);
  });

  tc({ id: 'UT-APT-11', level: U, fr: ['FR-15'], title: 'Free-slot list marks booked and past slots unavailable', input: 'Now 10:00; booking at 10:30', expected: '09:45 PAST, 10:30 BOOKED, 10:45 available' }, (note) => {
    const slots = freeSlots(doctor, WED, [{ id: 1, date: WED, start_time: '10:30', end_time: '10:45', status: 'SCHEDULED' }], now);
    const by = Object.fromEntries(slots.map((s) => [s.start, s]));
    note(`09:45=${by['09:45'].reason}, 10:30=${by['10:30'].reason}, 10:45 available=${by['10:45'].available}`);
    expect(by['09:45'].reason).toBe('PAST');
    expect(by['10:30'].reason).toBe('BOOKED');
    expect(by['10:45'].available).toBe(true);
  });
});

describe('Smart queue rules (QUE)', () => {
  const t = (m) => new Date(2026, 9, 21, 9, m).toISOString();

  tc({ id: 'UT-QUE-01', level: U, fr: ['FR-22', 'FR-24'], title: 'Queue orders URGENT first, then by check-in time', input: 'A normal 09:01, B normal 09:05, C urgent 09:10', expected: 'Order C, A, B' }, (note) => {
    const q = sortQueue([
      { id: 'A', priority: 'NORMAL', checked_in_at: t(1), token_no: 1 },
      { id: 'B', priority: 'NORMAL', checked_in_at: t(5), token_no: 2 },
      { id: 'C', priority: 'URGENT', checked_in_at: t(10), token_no: 3 },
    ]).map((x) => x.id);
    note(q.join(', '));
    expect(q).toEqual(['C', 'A', 'B']);
  });

  tc({ id: 'UT-QUE-02', level: U, fr: ['FR-21'], title: 'Token numbers are sequential per doctor per day', input: 'Existing tokens [] and [1,2,5]', expected: '1 and 6' }, (note) => {
    note(`${nextToken([])} and ${nextToken([1, 2, 5])}`);
    expect(nextToken([])).toBe(1);
    expect(nextToken([1, 2, 5])).toBe(6);
  });

  tc({ id: 'UT-QUE-03', level: U, fr: ['FR-23'], title: 'Wait estimate without a consultation in progress', input: '3 waiting, average 15 min, nobody in consultation', expected: 'ETA 0, 15, 30 minutes' }, (note) => {
    const w = estimateWaits([{ checked_in_at: t(1) }, { checked_in_at: t(2) }, { checked_in_at: t(3) }], { avgMinutes: 15, now: new Date(2026, 9, 21, 9, 30) });
    note(w.map((x) => x.etaMinutes).join(', '));
    expect(w.map((x) => x.etaMinutes)).toEqual([0, 15, 30]);
  });

  tc({ id: 'UT-QUE-04', level: U, fr: ['FR-23'], title: 'Wait estimate includes remaining time of current consultation', input: '2 waiting, average 15 min, current consultation started 5 min ago', expected: 'ETA 10 and 25 minutes' }, (note) => {
    const nowQ = new Date(2026, 9, 21, 10, 0);
    const w = estimateWaits([{ checked_in_at: t(1) }, { checked_in_at: t(2) }], { avgMinutes: 15, inProgressStartedAt: new Date(2026, 9, 21, 9, 55).toISOString(), now: nowQ });
    note(w.map((x) => x.etaMinutes).join(', '));
    expect(w.map((x) => x.etaMinutes)).toEqual([10, 25]);
  });

  tc({ id: 'UT-QUE-05', level: U, fr: ['FR-23'], title: 'Remaining time never drops below 1 minute when a consultation overruns', input: 'Average 15 min, consultation running for 40 min', expected: 'Remaining = 1' }, (note) => {
    const r = remainingMinutes(15, new Date(2026, 9, 21, 9, 20).toISOString(), new Date(2026, 9, 21, 10, 0));
    note(`remaining = ${r}`);
    expect(r).toBe(1);
  });
});
