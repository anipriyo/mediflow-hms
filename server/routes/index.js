import { Router } from 'express';
import { authenticate, authorize as allow } from '../middleware/auth.js';
import { AuthService } from '../services/authService.js';
import { UserService } from '../services/userService.js';
import { DoctorService } from '../services/doctorService.js';
import { PatientService } from '../services/patientService.js';
import { AppointmentService } from '../services/appointmentService.js';
import { QueueService } from '../services/queueService.js';
import { ConsultationService } from '../services/consultationService.js';
import { LabService } from '../services/labService.js';
import { PharmacyService } from '../services/pharmacyService.js';
import { BedService } from '../services/bedService.js';
import { AdmissionService } from '../services/admissionService.js';
import { BillingService } from '../services/billingService.js';
import { ReportService } from '../services/reportService.js';
import { AuditService } from '../services/auditService.js';
import { can } from '../domain/permissions.js';
import { forbidden } from '../utils/errors.js';
import { todayStr } from '../utils/clock.js';

/** Wrap a handler so that thrown errors reach the error middleware and results are sent as JSON. */
const h = (fn, status = 200) => (req, res, next) => {
  try {
    const result = fn(req, res);
    if (!res.headersSent) res.status(status).json(result ?? { ok: true });
  } catch (err) {
    next(err);
  }
};

export function buildRouter() {
  const r = Router();

  // ── Health & auth ──────────────────────────────────────────────
  r.get('/health', (_req, res) => res.json({ status: 'ok', today: todayStr() }));
  r.post('/auth/login', h((req) => AuthService.login(req.body?.username, req.body?.password)));

  r.use(authenticate);
  r.get('/auth/me', h((req) => req.user));
  r.post('/auth/logout', h((req) => { AuthService.logout(req.user); return { ok: true }; }));

  // ── Users (FR-05, FR-06) ───────────────────────────────────────
  r.get('/users', allow('users:manage'), h(() => UserService.list()));
  r.post('/users', allow('users:manage'), h((req) => UserService.create(req.body, req.user), 201));
  r.patch('/users/:id', allow('users:manage'), h((req) => UserService.update(Number(req.params.id), req.body, req.user)));
  r.post('/users/:id/activate', allow('users:manage'), h((req) => UserService.setActive(Number(req.params.id), true, req.user)));
  r.post('/users/:id/deactivate', allow('users:manage'), h((req) => UserService.setActive(Number(req.params.id), false, req.user)));
  r.post('/users/:id/reset-password', allow('users:manage'), h((req) => UserService.resetPassword(Number(req.params.id), req.body?.password, req.user)));

  // ── Departments & doctors (FR-13 … FR-15) ──────────────────────
  r.get('/departments', allow('doctors:read'), h(() => DoctorService.departments()));
  r.post('/departments', allow('doctors:manage'), h((req) => DoctorService.createDepartment(req.body, req.user), 201));
  r.get('/doctors', allow('doctors:read'), h((req) => DoctorService.list(req.query)));
  r.get('/doctors/:id', allow('doctors:read'), h((req) => DoctorService.get(Number(req.params.id))));
  r.post('/doctors', allow('doctors:manage'), h((req) => DoctorService.create(req.body, req.user), 201));
  r.patch('/doctors/:id', allow('doctors:manage'), h((req) => DoctorService.update(Number(req.params.id), req.body, req.user)));
  r.get('/doctors/:id/slots', allow('appointments:read'), h((req) => DoctorService.slots(Number(req.params.id), req.query.date)));

  // ── Patients (FR-07 … FR-12) ───────────────────────────────────
  r.get('/patients', allow('patients:read'), h((req) => PatientService.search(req.query)));
  r.post('/patients/check-duplicates', allow('patients:write'), h((req) => PatientService.findDuplicates(req.body)));
  r.post('/patients', allow('patients:write'), h((req) => PatientService.register(req.body, req.user), 201));
  r.get('/patients/:id', allow('patients:read'), h((req) => PatientService.get(Number(req.params.id))));
  r.patch('/patients/:id', allow('patients:write'), h((req) => PatientService.update(Number(req.params.id), req.body, req.user)));
  r.get('/patients/:id/history', allow('patients:read'), h((req) => PatientService.history(Number(req.params.id), req.user)));

  // ── Appointments (FR-16 … FR-20) ───────────────────────────────
  r.get('/appointments', allow('appointments:read'), h((req) => AppointmentService.list(req.query)));
  r.post('/appointments', allow('appointments:write'), h((req) => AppointmentService.book(req.body, req.user), 201));
  r.get('/appointments/:id', allow('appointments:read'), h((req) => AppointmentService.get(Number(req.params.id))));
  r.patch('/appointments/:id/reschedule', allow('appointments:write'), h((req) => AppointmentService.reschedule(Number(req.params.id), req.body, req.user)));
  r.post('/appointments/:id/cancel', allow('appointments:write'), h((req) => AppointmentService.cancel(Number(req.params.id), req.body, req.user)));
  r.post('/appointments/:id/no-show', allow('appointments:write'), h((req) => AppointmentService.markNoShow(Number(req.params.id), req.user)));

  // ── Queue (FR-21 … FR-25) ──────────────────────────────────────
  r.post('/appointments/:id/check-in', allow('queue:checkin'), h((req) => QueueService.checkIn(Number(req.params.id), req.user)));
  r.get('/queue', allow('queue:read'), h((req) => QueueService.overview(req.query.date)));
  r.get('/queue/:doctorId', allow('queue:read'), h((req) => QueueService.board(Number(req.params.doctorId), req.query.date)));
  r.post('/queue/:appointmentId/priority', allow('queue:priority'), h((req) => QueueService.setPriority(Number(req.params.appointmentId), req.body, req.user)));
  r.post('/queue/:doctorId/call-next', allow('consultation:write'), h((req) => QueueService.callNext(Number(req.params.doctorId), req.user)));

  // ── Consultations (FR-26 … FR-30) ──────────────────────────────
  r.get('/consultations', allow('clinical:read'), h((req) => ConsultationService.list(req.query)));
  r.get('/consultations/current', allow('consultation:write'), h((req) => ConsultationService.current(req.user.doctorId)));
  r.get('/consultations/:id', allow('clinical:read'), h((req) => ConsultationService.get(Number(req.params.id))));
  r.put('/consultations/:id', allow('consultation:write'), h((req) => ConsultationService.save(Number(req.params.id), req.body, req.user)));
  r.put('/consultations/:id/prescription', allow('consultation:write'), h((req) => ConsultationService.savePrescription(Number(req.params.id), req.body, req.user)));
  r.post('/consultations/:id/complete', allow('consultation:write'), h((req) => ConsultationService.complete(Number(req.params.id), req.user)));

  // ── Laboratory (FR-31 … FR-34) ─────────────────────────────────
  r.get('/lab/tests', allow('lab:read', 'lab:order'), h(() => LabService.tests()));
  r.get('/lab/orders', allow('lab:read'), h((req) => LabService.orders(req.query)));
  r.get('/lab/stats', allow('lab:read'), h(() => LabService.stats()));
  r.post('/lab/orders', allow('lab:order'), h((req) => LabService.order(req.body, req.user), 201));
  r.get('/lab/orders/:id', allow('lab:read'), h((req) => LabService.get(Number(req.params.id))));
  r.post('/lab/orders/:id/collect', allow('lab:process'), h((req) => LabService.collect(Number(req.params.id), req.user)));
  r.post('/lab/orders/:id/result', allow('lab:process'), h((req) => LabService.recordResult(Number(req.params.id), req.body, req.user)));
  r.post('/lab/orders/:id/cancel', allow('lab:process', 'lab:order'), h((req) => LabService.cancel(Number(req.params.id), req.body, req.user)));

  // ── Pharmacy (FR-35 … FR-37) ───────────────────────────────────
  r.get('/pharmacy/medicines', allow('pharmacy:read'), h((req) => PharmacyService.medicines(req.query)));
  r.post('/pharmacy/medicines', allow('pharmacy:manage'), h((req) => PharmacyService.create(req.body, req.user), 201));
  r.patch('/pharmacy/medicines/:id', allow('pharmacy:manage'), h((req) => PharmacyService.update(Number(req.params.id), req.body, req.user)));
  r.post('/pharmacy/medicines/:id/restock', allow('pharmacy:manage'), h((req) => PharmacyService.restock(Number(req.params.id), req.body, req.user)));
  r.get('/pharmacy/alerts', allow('pharmacy:read'), h(() => PharmacyService.alerts()));
  r.get('/pharmacy/prescriptions', allow('prescriptions:read'), h((req) => PharmacyService.prescriptions(req.query)));
  r.get('/pharmacy/prescriptions/:id', allow('prescriptions:read'), h((req) => PharmacyService.getPrescription(Number(req.params.id))));
  r.post('/pharmacy/prescriptions/:id/dispense', allow('prescriptions:dispense'), h((req) => PharmacyService.dispense(Number(req.params.id), req.user)));

  // ── Beds & admissions (FR-38 … FR-43) ──────────────────────────
  r.get('/beds', allow('beds:read', 'admissions:read'), h(() => BedService.board()));
  r.get('/beds/available', allow('admissions:write'), h(() => BedService.available()));
  r.post('/beds/:id/status', allow('beds:manage'), h((req) => BedService.changeStatus(Number(req.params.id), req.body?.status, req.user)));
  r.get('/admissions', allow('admissions:read'), h((req) => AdmissionService.list(req.query)));
  r.post('/admissions', allow('admissions:write'), h((req) => AdmissionService.admit(req.body, req.user), 201));
  r.get('/admissions/:id', allow('admissions:read'), h((req) => {
    const adm = AdmissionService.get(Number(req.params.id));
    if (!can(req.user.role, 'clinical:read')) delete adm.discharge_summary;
    return adm;
  }));
  r.post('/admissions/:id/transfer', allow('admissions:write'), h((req) => AdmissionService.transfer(Number(req.params.id), req.body, req.user)));
  r.post('/admissions/:id/request-discharge', allow('admissions:request-discharge'), h((req) => AdmissionService.requestDischarge(Number(req.params.id), req.body, req.user)));
  r.post('/admissions/:id/discharge', allow('admissions:write'), h((req) => AdmissionService.discharge(Number(req.params.id), req.body, req.user)));

  // ── Billing (FR-44 … FR-47) ────────────────────────────────────
  r.get('/billing/pending', allow('billing:read'), h(() => BillingService.pending()));
  r.get('/billing/unbilled', allow('billing:read'), h((req) => BillingService.unbilled({ patientId: Number(req.query.patientId), admissionId: req.query.admissionId ? Number(req.query.admissionId) : null })));
  r.get('/billing/invoices', allow('billing:read'), h((req) => BillingService.list(req.query)));
  r.post('/billing/invoices', allow('billing:write'), h((req) => BillingService.generate(req.body, req.user), 201));
  r.get('/billing/invoices/:id', allow('billing:read'), h((req) => BillingService.get(Number(req.params.id))));
  r.post('/billing/invoices/:id/discount', allow('billing:write'), h((req) => BillingService.applyDiscount(Number(req.params.id), req.body, req.user)));
  r.post('/billing/invoices/:id/payments', allow('billing:write'), h((req) => BillingService.recordPayment(Number(req.params.id), req.body, req.user), 201));
  r.post('/billing/invoices/:id/cancel', allow('billing:write'), h((req) => BillingService.cancel(Number(req.params.id), req.body, req.user)));
  r.get('/billing/receipts/:paymentId', allow('billing:read'), h((req) => BillingService.receipt(Number(req.params.paymentId))));

  // ── Reports & audit (FR-48 … FR-50) ────────────────────────────
  r.get('/reports/dashboard', allow('dashboard:read'), h((req) => ReportService.dashboard(req.user)));
  r.get('/reports/summary', allow('reports:read'), h((req) => ReportService.summary(req.query)));
  r.get('/audit', allow('audit:read'), h((req) => AuditService.search(req.query)));
  r.get('/audit/entities', allow('audit:read'), h(() => AuditService.entities()));

  r.use((req, _res, next) => next(Object.assign(forbidden(), { status: 404, code: 'NOT_FOUND', message: `No API route for ${req.method} ${req.path}` })));
  return r;
}
