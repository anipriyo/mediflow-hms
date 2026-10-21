import { describe, expect } from 'vitest';
import { tc } from '../helpers/tc.js';
import { canTransitionBed, canManuallyTransitionBed } from '../../server/domain/bedStateMachine.js';
import { bedDays, bedCharges, canTransitionAdmission, dischargeClearance } from '../../server/domain/admissionRules.js';
import {
  computeTotals, validateDiscount, validatePayment, statusAfterPayment, formatInvoiceNo, formatReceiptNo, canCancelInvoice,
} from '../../server/domain/billingRules.js';
import { sum, round2 } from '../../server/domain/money.js';

const U = 'Unit';
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).toISOString();

describe('Bed & admission rules (IPD)', () => {
  tc({ id: 'UT-IPD-01', level: U, fr: ['FR-41'], title: 'Bed state machine accepts every defined transition', input: 'AVAILABLE→RESERVED→OCCUPIED→CLEANING→AVAILABLE, AVAILABLE↔MAINTENANCE, RESERVED→AVAILABLE', expected: 'All transitions allowed' }, (note) => {
    const pairs = [['AVAILABLE', 'RESERVED'], ['RESERVED', 'OCCUPIED'], ['OCCUPIED', 'CLEANING'], ['CLEANING', 'AVAILABLE'], ['AVAILABLE', 'MAINTENANCE'], ['MAINTENANCE', 'AVAILABLE'], ['RESERVED', 'AVAILABLE'], ['AVAILABLE', 'OCCUPIED'], ['CLEANING', 'MAINTENANCE']];
    const res = pairs.map(([a, b]) => canTransitionBed(a, b));
    note(`${res.filter(Boolean).length}/${pairs.length} allowed`);
    expect(res.every(Boolean)).toBe(true);
  });

  tc({ id: 'UT-IPD-02', level: U, fr: ['FR-41'], title: 'Bed state machine rejects undefined transitions', input: 'OCCUPIED→AVAILABLE, MAINTENANCE→OCCUPIED, CLEANING→OCCUPIED; manual AVAILABLE→OCCUPIED', expected: 'All rejected' }, (note) => {
    const res = [canTransitionBed('OCCUPIED', 'AVAILABLE'), canTransitionBed('MAINTENANCE', 'OCCUPIED'), canTransitionBed('CLEANING', 'OCCUPIED'), canManuallyTransitionBed('AVAILABLE', 'OCCUPIED')];
    note(res.join(', '));
    expect(res).toEqual([false, false, false, false]);
  });

  tc({ id: 'UT-IPD-03', level: U, fr: ['FR-42'], title: 'Bed days are rounded up with a 1-day minimum', input: 'Stays of 1 h, 24 h, 25 h, 48 h', expected: '1, 1, 2, 2 days' }, (note) => {
    const r = [bedDays(at(1, 10), at(1, 11)), bedDays(at(1, 10), at(2, 10)), bedDays(at(1, 10), at(2, 11)), bedDays(at(1, 10), at(3, 10))];
    note(r.join(', '));
    expect(r).toEqual([1, 1, 2, 2]);
  });

  tc({ id: 'UT-IPD-04', level: U, fr: ['FR-42', 'FR-43'], title: 'Admission life cycle allows only ADMITTED → DISCHARGE_PENDING → DISCHARGED', input: 'ADMITTED→DISCHARGE_PENDING, DISCHARGE_PENDING→DISCHARGED, ADMITTED→DISCHARGED', expected: 'true, true, false' }, (note) => {
    const r = [canTransitionAdmission('ADMITTED', 'DISCHARGE_PENDING'), canTransitionAdmission('DISCHARGE_PENDING', 'DISCHARGED'), canTransitionAdmission('ADMITTED', 'DISCHARGED')];
    note(r.join(', '));
    expect(r).toEqual([true, true, false]);
  });

  tc({ id: 'UT-IPD-05', level: U, fr: ['FR-40', 'FR-42'], title: 'Same-day transfer does not create an extra minimum bed-day (DEF-05 regression)', input: 'Ward A ₹1500 for 10 min, then Ward B ₹1500 for 5 h', expected: 'Total 1 bed-day (₹1,500), not 2' }, (note) => {
    const stays = [
      { id: 1, daily_rate: 1500, start_at: at(21, 9, 0), end_at: at(21, 9, 10) },
      { id: 2, daily_rate: 1500, start_at: at(21, 9, 10), end_at: at(21, 14, 10) },
    ];
    const c = bedCharges(stays, at(21, 14, 10));
    const total = c.reduce((s, x) => s + x.amount, 0);
    note(`days = [${c.map((x) => x.days).join(', ')}], total ₹${total}`);
    expect(c.reduce((s, x) => s + x.days, 0)).toBe(1);
    expect(total).toBe(1500);
  });

  tc({ id: 'UT-IPD-06', level: U, fr: ['FR-42'], title: 'Bed-days are shared between stays in proportion to time spent', input: 'ICU ₹8000 for 30 h then General ₹1500 for 20 h (50 h total)', expected: '3 days total: ICU 2, General 1 → ₹17,500' }, (note) => {
    const stays = [
      { id: 1, daily_rate: 8000, start_at: at(10, 0), end_at: at(11, 6) },
      { id: 2, daily_rate: 1500, start_at: at(11, 6), end_at: at(12, 2) },
    ];
    const c = bedCharges(stays, at(12, 2));
    const total = c.reduce((s, x) => s + x.amount, 0);
    note(`days = [${c.map((x) => x.days).join(', ')}], total ₹${total}`);
    expect(c.map((x) => x.days)).toEqual([2, 1]);
    expect(total).toBe(17500);
  });

  tc({ id: 'UT-IPD-07', level: U, fr: ['FR-43'], title: 'Discharge clearance requires settled bills unless an administrator overrides with a reason', input: '(a) ₹500 outstanding (b) all paid (c) admin override "Patient transferred to AIIMS" (d) receptionist override', expected: 'blocked, allowed, allowed+overridden, blocked' }, (note) => {
    const unpaid = [{ status: 'PARTIALLY_PAID', total: 1500, paid_amount: 1000 }];
    const paid = [{ status: 'PAID', total: 1500, paid_amount: 1500 }];
    const a = dischargeClearance({ unbilledCount: 0, invoices: unpaid, override: null });
    const b = dischargeClearance({ unbilledCount: 0, invoices: paid, override: null });
    const c = dischargeClearance({ unbilledCount: 0, invoices: unpaid, override: { role: 'ADMIN', reason: 'Patient transferred to AIIMS' } });
    const d = dischargeClearance({ unbilledCount: 0, invoices: unpaid, override: { role: 'RECEPTIONIST', reason: 'Patient transferred to AIIMS' } });
    note(`a=${a.allowed} (outstanding ₹${a.outstanding}), b=${b.allowed}, c=${c.allowed}/${c.overridden}, d=${d.allowed}`);
    expect([a.allowed, b.allowed, c.allowed && c.overridden, d.allowed]).toEqual([false, true, true, false]);
    expect(dischargeClearance({ unbilledCount: 2, invoices: paid, override: null }).allowed).toBe(false);
  });
});

describe('Billing rules (BIL)', () => {
  tc({ id: 'UT-BIL-01', level: U, fr: ['FR-44', 'FR-45'], title: 'Invoice totals with discount are rounded to paise', input: 'Lines ₹500, ₹450.50, ₹284; discount 10%', expected: 'Subtotal ₹1234.50, discount ₹123.45, total ₹1111.05' }, (note) => {
    const t = computeTotals([{ amount: 500 }, { amount: 450.5 }, { amount: 284 }], 10);
    note(`subtotal ${t.subtotal}, discount ${t.discountAmount}, total ${t.total}`);
    expect(t).toEqual({ subtotal: 1234.5, discountAmount: 123.45, total: 1111.05 });
  });

  tc({ id: 'UT-BIL-02', level: U, fr: ['FR-45'], title: 'Discount must be 0–50% and only on UNPAID invoices', input: '60% on UNPAID, −5% on UNPAID, 10% on PARTIALLY_PAID, 50% on UNPAID', expected: 'error, error, error, ok' }, (note) => {
    const r = [validateDiscount({ status: 'UNPAID' }, 60), validateDiscount({ status: 'UNPAID' }, -5), validateDiscount({ status: 'PARTIALLY_PAID' }, 10), validateDiscount({ status: 'UNPAID' }, 50)];
    note(r.map((x) => x || 'ok').join(' | '));
    expect(r[0]).toMatch(/between 0% and 50%/);
    expect(r[1]).toMatch(/between 0% and 50%/);
    expect(r[2]).toMatch(/UNPAID/);
    expect(r[3]).toBeNull();
  });

  const inv = { status: 'UNPAID', total: 900, paid_amount: 100 };

  tc({ id: 'UT-BIL-03', level: U, fr: ['FR-46'], title: 'Payment amount must be greater than zero', input: 'Amounts 0 and −50 (CASH)', expected: 'Error "must be greater than zero"' }, (note) => {
    const r = [validatePayment(inv, 0, 'CASH'), validatePayment(inv, -50, 'CASH')];
    note(r.join(' | '));
    expect(r.every((m) => /greater than zero/.test(m))).toBe(true);
  });

  tc({ id: 'UT-BIL-04', level: U, fr: ['FR-46'], title: 'Overpayment beyond the outstanding balance is rejected', input: 'Outstanding ₹800; pay ₹800.01 and ₹800', expected: 'Error for ₹800.01; ₹800 accepted' }, (note) => {
    const over = validatePayment(inv, 800.01, 'UPI');
    const exact = validatePayment(inv, 800, 'UPI');
    note(`800.01 → "${over}"; 800 → ${exact}`);
    expect(over).toMatch(/exceeds the outstanding balance of ₹800.00/);
    expect(exact).toBeNull();
  });

  tc({ id: 'UT-BIL-05', level: U, fr: ['FR-46'], title: 'Rejects unknown methods and payments on PAID or CANCELLED invoices', input: 'Method CHEQUE; PAID invoice; CANCELLED invoice', expected: 'Three distinct errors' }, (note) => {
    const r = [validatePayment(inv, 10, 'CHEQUE'), validatePayment({ ...inv, status: 'PAID' }, 10, 'CASH'), validatePayment({ ...inv, status: 'CANCELLED' }, 10, 'CASH')];
    note(r.join(' | '));
    expect(r[0]).toMatch(/must be one of CASH, CARD, UPI/);
    expect(r[1]).toMatch(/already fully paid/);
    expect(r[2]).toMatch(/cancelled/);
  });

  tc({ id: 'UT-BIL-06', level: U, fr: ['FR-46'], title: 'Invoice status follows payments', input: 'Total ₹900 with paid ₹0, ₹300, ₹900', expected: 'UNPAID, PARTIALLY_PAID, PAID' }, (note) => {
    const r = [statusAfterPayment(900, 0), statusAfterPayment(900, 300), statusAfterPayment(900, 900)];
    note(r.join(', '));
    expect(r).toEqual(['UNPAID', 'PARTIALLY_PAID', 'PAID']);
    expect(canCancelInvoice({ status: 'UNPAID', paid_amount: 0 })).toBe(true);
    expect(canCancelInvoice({ status: 'PARTIALLY_PAID', paid_amount: 300 })).toBe(false);
  });

  tc({ id: 'UT-BIL-07', level: U, fr: ['FR-44', 'FR-47'], title: 'Invoice and receipt numbers follow the defined format', input: 'Date 20261021, sequence 7', expected: 'INV-20261021-0007 and R-20261021-0007' }, (note) => {
    const a = formatInvoiceNo('20261021', 7);
    const b = formatReceiptNo('20261021', 7);
    note(`${a}, ${b}`);
    expect(a).toBe('INV-20261021-0007');
    expect(b).toBe('R-20261021-0007');
  });

  tc({ id: 'UT-BIL-08', level: U, fr: ['FR-44'], title: 'Money arithmetic avoids floating-point drift', input: 'sum(0.1, 0.2) and round2(1.005)', expected: '0.3 and 1.01' }, (note) => {
    note(`${sum([0.1, 0.2])}, ${round2(1.005)}`);
    expect(sum([0.1, 0.2])).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });
});
