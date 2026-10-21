import { describe, expect } from 'vitest';
import { tc } from '../helpers/tc.js';
import { canTransitionLab, isAbnormal } from '../../server/domain/labRules.js';
import { isLowStock, expiryStatus, checkDispensable, stockAlerts } from '../../server/domain/inventoryRules.js';
import { formatPatientCode, validatePatient, findPossibleDuplicates, ageFrom } from '../../server/domain/patientRules.js';
import { afterFailedAttempt, isLocked, validatePasswordStrength } from '../../server/domain/authRules.js';
import { can, permissionsFor } from '../../server/domain/permissions.js';

const U = 'Unit';
const TODAY = '2026-10-21';

describe('Laboratory rules (LAB)', () => {
  tc({ id: 'UT-LAB-01', level: U, fr: ['FR-32'], title: 'Lab order life cycle allows only defined transitions', input: 'ORDERED→SAMPLE_COLLECTED, SAMPLE_COLLECTED→COMPLETED, ORDERED→COMPLETED, COMPLETED→CANCELLED', expected: 'true, true, false, false' }, (note) => {
    const r = [canTransitionLab('ORDERED', 'SAMPLE_COLLECTED'), canTransitionLab('SAMPLE_COLLECTED', 'COMPLETED'), canTransitionLab('ORDERED', 'COMPLETED'), canTransitionLab('COMPLETED', 'CANCELLED')];
    note(r.join(', '));
    expect(r).toEqual([true, true, false, false]);
  });

  tc({ id: 'UT-LAB-02', level: U, fr: ['FR-33'], title: 'Numeric results outside the reference range are flagged abnormal (bounds inclusive)', input: 'FBS 70–100 mg/dL with values 69, 70, 100, 145', expected: 'true, false, false, true' }, (note) => {
    const r = [69, 70, 100, 145].map((v) => isAbnormal(v, 70, 100));
    note(r.join(', '));
    expect(r).toEqual([true, false, false, true]);
  });

  tc({ id: 'UT-LAB-03', level: U, fr: ['FR-33'], title: 'Text-only tests and non-numeric values are not auto-flagged', input: 'Chest X-ray (no range); value "abc" for FBS', expected: 'null (not applicable) in both cases' }, (note) => {
    const r = [isAbnormal(null, null, null), isAbnormal('abc', 70, 100)];
    note(JSON.stringify(r));
    expect(r).toEqual([null, null]);
  });
});

describe('Pharmacy rules (PHA)', () => {
  tc({ id: 'UT-PHA-01', level: U, fr: ['FR-36'], title: 'Low stock when quantity is at or below the reorder level', input: 'Reorder level 20 with stock 21, 20, 0', expected: 'false, true, true' }, (note) => {
    const r = [21, 20, 0].map((q) => isLowStock({ stock_qty: q, reorder_level: 20 }));
    note(r.join(', '));
    expect(r).toEqual([false, true, true]);
  });

  tc({ id: 'UT-PHA-02', level: U, fr: ['FR-36'], title: 'Expiry status uses a 30-day warning window', input: 'Expiry 2026-10-20, 2026-11-20 (30 d), 2026-11-21 (31 d)', expected: 'EXPIRED, NEAR_EXPIRY, OK' }, (note) => {
    const r = ['2026-10-20', '2026-11-20', '2026-11-21'].map((d) => expiryStatus(d, TODAY));
    note(r.join(', '));
    expect(r).toEqual(['EXPIRED', 'NEAR_EXPIRY', 'OK']);
  });

  tc({ id: 'UT-PHA-03', level: U, fr: ['FR-37'], title: 'Dispensing is refused for insufficient stock, expired batches and invalid quantities', input: 'Stock 3 & qty 5; expired batch; qty 0', expected: 'Three errors; valid case returns null' }, (note) => {
    const med = { name: 'Insulin Glargine', stock_qty: 3, expiry_date: '2027-05-01' };
    const r = [checkDispensable(med, 5, TODAY), checkDispensable({ ...med, stock_qty: 50, expiry_date: '2026-10-01' }, 1, TODAY), checkDispensable(med, 0, TODAY), checkDispensable(med, 3, TODAY)];
    note(r.map((x) => x || 'ok').join(' | '));
    expect(r[0]).toMatch(/Insufficient stock.*3 available, 5 required/);
    expect(r[1]).toMatch(/expired/);
    expect(r[2]).toMatch(/positive whole number/);
    expect(r[3]).toBeNull();
  });

  tc({ id: 'UT-PHA-04', level: U, fr: ['FR-36'], title: 'Stock alerts list out-of-stock, low-stock, near-expiry and expired items', input: '4 medicines in different states', expected: 'Alert types OUT_OF_STOCK, LOW_STOCK, NEAR_EXPIRY, EXPIRED' }, (note) => {
    const meds = [
      { name: 'A', stock_qty: 0, reorder_level: 10, expiry_date: '2027-12-01' },
      { name: 'B', stock_qty: 5, reorder_level: 10, expiry_date: '2027-12-01' },
      { name: 'C', stock_qty: 50, reorder_level: 10, expiry_date: '2026-11-05' },
      { name: 'D', stock_qty: 50, reorder_level: 10, expiry_date: '2026-09-30' },
    ];
    const types = stockAlerts(meds, TODAY).map((a) => a.type).sort();
    note(types.join(', '));
    expect(types).toEqual(['EXPIRED', 'LOW_STOCK', 'NEAR_EXPIRY', 'OUT_OF_STOCK']);
  });
});

describe('Patient rules (PAT)', () => {
  tc({ id: 'UT-PAT-01', level: U, fr: ['FR-07'], title: 'Patient IDs use the P + 5 digits format', input: '1, 42, 12345', expected: 'P00001, P00042, P12345' }, (note) => {
    const r = [1, 42, 12345].map(formatPatientCode);
    note(r.join(', '));
    expect(r).toEqual(['P00001', 'P00042', 'P12345']);
  });

  tc({ id: 'UT-PAT-02', level: U, fr: ['FR-08'], title: 'Required fields and a valid 10-digit mobile number are enforced', input: 'Empty names, phone "12345", gender "X"', expected: 'Errors for first_name, last_name, phone, gender, dob' }, (note) => {
    const e = validatePatient({ first_name: '', last_name: ' ', phone: '12345', gender: 'X', dob: '' }, TODAY);
    note(Object.keys(e).join(', '));
    expect(Object.keys(e).sort()).toEqual(['dob', 'first_name', 'gender', 'last_name', 'phone']);
  });

  tc({ id: 'UT-PAT-03', level: U, fr: ['FR-08'], title: 'Date of birth in the future is rejected', input: 'DOB 2026-12-01 when today is 2026-10-21', expected: 'Error "Date of birth cannot be in the future"' }, (note) => {
    const e = validatePatient({ first_name: 'A', last_name: 'B', phone: '9876543210', gender: 'MALE', dob: '2026-12-01' }, TODAY);
    note(e.dob);
    expect(e.dob).toBe('Date of birth cannot be in the future');
  });

  tc({ id: 'UT-PAT-04', level: U, fr: ['FR-09'], title: 'Duplicate detection matches phone+DOB or name+DOB (case-insensitive)', input: 'Existing Riya Ghosh 1990-05-01 9876543210; candidates with same phone, same name in caps, different DOB', expected: 'Match, match, no match' }, (note) => {
    const existing = [{ id: 1, first_name: 'Riya', last_name: 'Ghosh', dob: '1990-05-01', phone: '9876543210' }];
    const r = [
      findPossibleDuplicates({ first_name: 'Priya', last_name: 'Sen', dob: '1990-05-01', phone: '9876543210' }, existing).length,
      findPossibleDuplicates({ first_name: 'RIYA', last_name: ' ghosh ', dob: '1990-05-01', phone: '9000000000' }, existing).length,
      findPossibleDuplicates({ first_name: 'Riya', last_name: 'Ghosh', dob: '1991-05-01', phone: '9876543210' }, existing).length,
    ];
    note(r.join(', '));
    expect(r).toEqual([1, 1, 0]);
  });

  tc({ id: 'UT-PAT-05', level: U, fr: ['FR-12'], title: 'Age is computed correctly around the birthday', input: 'DOB 2000-10-21 and 2000-10-22 on 2026-10-21', expected: '26 and 25' }, (note) => {
    const r = [ageFrom('2000-10-21', TODAY), ageFrom('2000-10-22', TODAY)];
    note(r.join(', '));
    expect(r).toEqual([26, 25]);
  });
});

describe('Authentication & access control (AUTH)', () => {
  const now = new Date(2026, 9, 21, 10, 0);

  tc({ id: 'UT-AUTH-01', level: U, fr: ['FR-02'], title: 'Account locks on the 5th consecutive failed attempt', input: 'failed_attempts 3 then 4, then one more failure', expected: '4th failure: not locked; 5th: locked for 15 min' }, (note) => {
    const fourth = afterFailedAttempt({ failed_attempts: 3, locked_until: null }, now);
    const fifth = afterFailedAttempt({ failed_attempts: 4, locked_until: null }, now);
    const mins = (new Date(fifth.locked_until) - now) / 60000;
    note(`4th → locked_until=${fourth.locked_until}; 5th → locked for ${mins} min`);
    expect(fourth.locked_until).toBeNull();
    expect(mins).toBe(15);
  });

  tc({ id: 'UT-AUTH-02', level: U, fr: ['FR-02'], title: 'Lock expires after 15 minutes and the counter restarts', input: 'locked_until = now+15 min; check at +14 and +16 min', expected: 'locked, then unlocked; next failure counts as attempt 1' }, (note) => {
    const user = { failed_attempts: 5, locked_until: new Date(now.getTime() + 15 * 60000).toISOString() };
    const a = isLocked(user, new Date(now.getTime() + 14 * 60000));
    const b = isLocked(user, new Date(now.getTime() + 16 * 60000));
    const next = afterFailedAttempt(user, new Date(now.getTime() + 16 * 60000));
    note(`+14 min locked=${a}; +16 min locked=${b}; next attempt count=${next.failed_attempts}`);
    expect([a, b, next.failed_attempts]).toEqual([true, false, 1]);
  });

  tc({ id: 'UT-AUTH-03', level: U, fr: ['FR-03', 'FR-30'], title: 'Role-permission matrix enforces least privilege', input: 'clinical:read for RECEPTIONIST/DOCTOR; patients:write for BILLING; billing:write for ADMIN; audit:read for ADMIN', expected: 'false, true, false, false, true' }, (note) => {
    const r = [can('RECEPTIONIST', 'clinical:read'), can('DOCTOR', 'clinical:read'), can('BILLING', 'patients:write'), can('ADMIN', 'billing:write'), can('ADMIN', 'audit:read')];
    note(`${r.join(', ')}; LAB_TECH has ${permissionsFor('LAB_TECH').length} permissions`);
    expect(r).toEqual([false, true, false, false, true]);
  });

  tc({ id: 'UT-AUTH-04', level: U, fr: ['FR-05'], title: 'Passwords must have at least 8 characters', input: '"short" and "Mediflow@123"', expected: 'Error, then null' }, (note) => {
    const r = [validatePasswordStrength('short'), validatePasswordStrength('Mediflow@123')];
    note(r.map((x) => x || 'ok').join(' | '));
    expect(r[0]).toMatch(/at least 8/);
    expect(r[1]).toBeNull();
  });
});

describe('Input normalisation (robustness)', async () => {
  const { isRealDate } = await import('../../server/domain/time.js');
  const { normalizePhone } = await import('../../server/domain/patientRules.js');
  const { clampInt, likeTerm } = await import('../../server/utils/validate.js');

  tc({ id: 'UT-PAT-06', level: U, fr: ['FR-08'], title: 'Only real calendar dates are accepted', input: '2026-02-28, 2028-02-29 (leap), 2026-02-30, 2026-13-01, 0000-00-00', expected: 'true, true, false, false, false' }, (note) => {
    const r = ['2026-02-28', '2028-02-29', '2026-02-30', '2026-13-01', '0000-00-00'].map(isRealDate);
    note(r.join(', '));
    expect(r).toEqual([true, true, false, false, false]);
  });

  tc({ id: 'UT-PAT-07', level: U, fr: ['FR-08'], title: 'Mobile numbers typed in common formats are normalised to 10 digits', input: '"+91 98765 43210", "098765-43210", "(98765) 43210", "12345"', expected: '9876543210 ×3, "12345" unchanged (later rejected)' }, (note) => {
    const r = ['+91 98765 43210', '098765-43210', '(98765) 43210', '12345'].map(normalizePhone);
    note(r.join(', '));
    expect(r).toEqual(['9876543210', '9876543210', '9876543210', '12345']);
  });

  tc({ id: 'UT-PAT-08', level: U, fr: ['FR-10'], title: 'Paging values are clamped and search wildcards are escaped', input: 'clampInt(-5,50,1,500), clampInt("abc",50,1,500), clampInt(99999,50,1,500); likeTerm("50%_off")', expected: '1, 50, 500; "%50\\%\\_off%"' }, (note) => {
    const r = [clampInt(-5, 50, 1, 500), clampInt('abc', 50, 1, 500), clampInt(99999, 50, 1, 500)];
    const l = likeTerm('50%_off');
    note(`${r.join(', ')}; ${l}`);
    expect(r).toEqual([1, 50, 500]);
    expect(l).toBe('%50\\%\\_off%');
  });
});
