import { db } from '../db/connection.js';
import { todayStr, addDays, combineLocal } from '../utils/clock.js';
import { round2 } from '../domain/money.js';
import { can } from '../domain/permissions.js';
import { PharmacyService } from './pharmacyService.js';
import { BedService } from './bedService.js';

function dayRange(dateStr) {
  return [combineLocal(dateStr, '00:00').toISOString(), combineLocal(addDays(dateStr, 1), '00:00').toISOString()];
}

function daysBetween(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

function revenueByDay(from, to) {
  const rows = db()
    .prepare('SELECT created_at, amount, method FROM payments WHERE created_at >= ? AND created_at < ?')
    .all(dayRange(from)[0], dayRange(to)[1]);
  const map = Object.fromEntries(daysBetween(from, to).map((d) => [d, { date: d, total: 0, CASH: 0, CARD: 0, UPI: 0 }]));
  for (const r of rows) {
    const local = new Date(r.created_at);
    const key = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
    if (!map[key]) continue;
    map[key].total = round2(map[key].total + r.amount);
    map[key][r.method] = round2(map[key][r.method] + r.amount);
  }
  return Object.values(map);
}

function appointmentsByDay(from, to, doctorId) {
  const rows = db()
    .prepare(`SELECT date, status, COUNT(*) n FROM appointments WHERE date BETWEEN ? AND ? ${doctorId ? 'AND doctor_id = ?' : ''} GROUP BY date, status`)
    .all(...[from, to, ...(doctorId ? [doctorId] : [])]);
  const map = Object.fromEntries(daysBetween(from, to).map((d) => [d, { date: d, total: 0, COMPLETED: 0, CANCELLED: 0, NO_SHOW: 0, OPEN: 0 }]));
  for (const r of rows) {
    if (!map[r.date]) continue;
    map[r.date].total += r.n;
    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(r.status)) map[r.date][r.status] += r.n;
    else map[r.date].OPEN += r.n;
  }
  return Object.values(map);
}

export const ReportService = {
  /** FR-48: role-aware dashboard */
  dashboard(actor) {
    const today = todayStr();
    const [start, end] = dayRange(today);
    const out = { date: today, role: actor.role };
    const count = (sql, ...p) => db().prepare(sql).get(...p).n;

    if (can(actor.role, 'appointments:read')) {
      const doctorFilter = actor.role === 'DOCTOR' ? actor.doctorId : null;
      const where = doctorFilter ? 'AND doctor_id = ?' : '';
      const p = doctorFilter ? [doctorFilter] : [];
      out.appointments = {
        today: count(`SELECT COUNT(*) n FROM appointments WHERE date = ? AND status <> 'CANCELLED' ${where}`, today, ...p),
        waiting: count(`SELECT COUNT(*) n FROM appointments WHERE date = ? AND status = 'CHECKED_IN' ${where}`, today, ...p),
        inConsultation: count(`SELECT COUNT(*) n FROM appointments WHERE date = ? AND status = 'IN_CONSULTATION' ${where}`, today, ...p),
        completed: count(`SELECT COUNT(*) n FROM appointments WHERE date = ? AND status = 'COMPLETED' ${where}`, today, ...p),
        scheduled: count(`SELECT COUNT(*) n FROM appointments WHERE date = ? AND status = 'SCHEDULED' ${where}`, today, ...p),
        cancelled: count(`SELECT COUNT(*) n FROM appointments WHERE date = ? AND status = 'CANCELLED' ${where}`, today, ...p),
      };
      out.appointmentTrend = appointmentsByDay(addDays(today, -6), today, doctorFilter);
      out.newPatientsToday = count('SELECT COUNT(*) n FROM patients WHERE created_at >= ? AND created_at < ?', start, end);
      out.totalPatients = count('SELECT COUNT(*) n FROM patients');
    }
    if (can(actor.role, 'beds:read') || can(actor.role, 'admissions:read')) {
      const board = BedService.board();
      out.beds = board.summary;
      out.wards = board.wards.map((w) => ({ id: w.id, name: w.name, total: w.total, occupied: w.occupied, available: w.available, occupancyPct: w.occupancyPct }));
      out.admissions = {
        active: count("SELECT COUNT(*) n FROM admissions WHERE status = 'ADMITTED'"),
        dischargePending: count("SELECT COUNT(*) n FROM admissions WHERE status = 'DISCHARGE_PENDING'"),
        admittedToday: count('SELECT COUNT(*) n FROM admissions WHERE admitted_at >= ? AND admitted_at < ?', start, end),
      };
    }
    if (can(actor.role, 'lab:read')) {
      const doc = actor.role === 'DOCTOR' ? 'AND doctor_id = ?' : '';
      const p = actor.role === 'DOCTOR' ? [actor.doctorId] : [];
      out.lab = {
        ordered: count(`SELECT COUNT(*) n FROM lab_orders WHERE status = 'ORDERED' ${doc}`, ...p),
        sampleCollected: count(`SELECT COUNT(*) n FROM lab_orders WHERE status = 'SAMPLE_COLLECTED' ${doc}`, ...p),
        completedToday: count(`SELECT COUNT(*) n FROM lab_orders WHERE status = 'COMPLETED' AND completed_at >= ? AND completed_at < ? ${doc}`, start, end, ...p),
        abnormalToday: count(`SELECT COUNT(*) n FROM lab_orders WHERE is_abnormal = 1 AND completed_at >= ? AND completed_at < ? ${doc}`, start, end, ...p),
      };
    }
    if (can(actor.role, 'pharmacy:read')) {
      const alerts = PharmacyService.alerts();
      out.pharmacy = {
        pendingPrescriptions: count("SELECT COUNT(*) n FROM prescriptions WHERE status = 'PENDING'"),
        dispensedToday: count("SELECT COUNT(*) n FROM prescriptions WHERE status = 'DISPENSED' AND dispensed_at >= ? AND dispensed_at < ?", start, end),
        lowStock: alerts.filter((a) => a.type === 'LOW_STOCK' || a.type === 'OUT_OF_STOCK').length,
        expiring: alerts.filter((a) => a.type === 'NEAR_EXPIRY' || a.type === 'EXPIRED').length,
        alerts: alerts.slice(0, 8).map((a) => ({ type: a.type, message: a.message })),
      };
    }
    if (can(actor.role, 'billing:read')) {
      out.billing = {
        collectedToday: round2(db().prepare('SELECT COALESCE(SUM(amount),0) n FROM payments WHERE created_at >= ? AND created_at < ?').get(start, end).n),
        invoicesToday: count('SELECT COUNT(*) n FROM invoices WHERE created_at >= ? AND created_at < ?', start, end),
        unpaidInvoices: count("SELECT COUNT(*) n FROM invoices WHERE status IN ('UNPAID','PARTIALLY_PAID')"),
        outstanding: round2(db().prepare("SELECT COALESCE(SUM(total - paid_amount),0) n FROM invoices WHERE status IN ('UNPAID','PARTIALLY_PAID')").get().n),
        pendingCharges: count('SELECT COUNT(DISTINCT patient_id) n FROM charges WHERE invoice_id IS NULL'),
      };
      out.revenueTrend = revenueByDay(addDays(today, -6), today);
    }
    if (actor.role === 'ADMIN') {
      out.users = { total: count('SELECT COUNT(*) n FROM users'), active: count('SELECT COUNT(*) n FROM users WHERE active = 1') };
      out.recentActivity = db().prepare('SELECT id, ts, username, role, action, entity, entity_id, summary FROM audit_logs ORDER BY id DESC LIMIT 8').all();
    }
    return out;
  },

  /** FR-49: management reports for a date range */
  summary({ from, to } = {}) {
    const today = todayStr();
    const t = to || today;
    const f = from || addDays(t, -13);
    const [start] = dayRange(f);
    const [, end] = dayRange(t);
    const appointments = appointmentsByDay(f, t);
    const revenue = revenueByDay(f, t);
    const byDepartment = db()
      .prepare(`SELECT dep.name AS department, COUNT(*) AS appointments, SUM(CASE WHEN a.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed
                FROM appointments a JOIN doctors d ON d.id = a.doctor_id JOIN departments dep ON dep.id = d.department_id
                WHERE a.date BETWEEN ? AND ? GROUP BY dep.name ORDER BY appointments DESC`)
      .all(f, t);
    const byDoctor = db()
      .prepare(`SELECT u.full_name AS doctor, dep.name AS department, COUNT(*) AS appointments,
                       SUM(CASE WHEN a.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
                       SUM(CASE WHEN a.status IN ('CANCELLED','NO_SHOW') THEN 1 ELSE 0 END) AS missed
                FROM appointments a JOIN doctors d ON d.id = a.doctor_id JOIN users u ON u.id = d.user_id JOIN departments dep ON dep.id = d.department_id
                WHERE a.date BETWEEN ? AND ? GROUP BY d.id ORDER BY appointments DESC`)
      .all(f, t);
    const topDiagnoses = db()
      .prepare(`SELECT c.diagnosis, COUNT(*) AS cases FROM consultations c JOIN appointments a ON a.id = c.appointment_id
                WHERE c.status = 'COMPLETED' AND c.diagnosis IS NOT NULL AND a.date BETWEEN ? AND ? GROUP BY lower(c.diagnosis) ORDER BY cases DESC LIMIT 8`)
      .all(f, t);
    const revenueBySource = db()
      .prepare(`SELECT c.source_type AS source, ROUND(SUM(c.amount), 2) AS amount FROM charges c JOIN invoices i ON i.id = c.invoice_id
                WHERE i.status <> 'CANCELLED' AND i.created_at >= ? AND i.created_at < ? GROUP BY c.source_type ORDER BY amount DESC`)
      .all(start, end);
    const paymentMethods = ['CASH', 'CARD', 'UPI'].map((m) => ({ method: m, amount: round2(revenue.reduce((s, d) => s + d[m], 0)) }));
    const totals = {
      appointments: appointments.reduce((s, d) => s + d.total, 0),
      completed: appointments.reduce((s, d) => s + d.COMPLETED, 0),
      cancelled: appointments.reduce((s, d) => s + d.CANCELLED, 0),
      noShow: appointments.reduce((s, d) => s + d.NO_SHOW, 0),
      revenue: round2(revenue.reduce((s, d) => s + d.total, 0)),
      admissions: db().prepare('SELECT COUNT(*) n FROM admissions WHERE admitted_at >= ? AND admitted_at < ?').get(start, end).n,
      discharges: db().prepare('SELECT COUNT(*) n FROM admissions WHERE discharged_at >= ? AND discharged_at < ?').get(start, end).n,
      newPatients: db().prepare('SELECT COUNT(*) n FROM patients WHERE created_at >= ? AND created_at < ?').get(start, end).n,
    };
    totals.cancellationRate = totals.appointments ? Math.round(((totals.cancelled + totals.noShow) / totals.appointments) * 1000) / 10 : 0;
    const occupancy = BedService.board().wards.map((w) => ({ ward: w.name, total: w.total, occupied: w.occupied, occupancyPct: w.occupancyPct }));
    return { from: f, to: t, totals, appointments, revenue, byDepartment, byDoctor, topDiagnoses, revenueBySource, paymentMethods, occupancy };
  },
};
