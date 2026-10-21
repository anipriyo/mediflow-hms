import { db, tx } from '../db/connection.js';
import { clock, nowIso, todayStr } from '../utils/clock.js';
import { badRequest, conflict, forbidden } from '../utils/errors.js';
import { validate, z, nonEmpty, optionalDate } from '../utils/validate.js';
import { canTransitionAppointment } from '../domain/appointmentRules.js';
import { estimateWaits, nextToken, sortQueue } from '../domain/queueRules.js';
import { AppointmentService } from './appointmentService.js';
import { DoctorService } from './doctorService.js';
import { AuditService } from './auditService.js';

export const QueueService = {
  /** FR-21: check in a SCHEDULED appointment for today and issue a token. */
  checkIn(appointmentId, actor) {
    const appt = AppointmentService.get(appointmentId);
    if (appt.date !== todayStr()) throw badRequest(`Only today's appointments can be checked in (this one is on ${appt.date})`);
    if (!canTransitionAppointment(appt.status, 'CHECKED_IN')) throw conflict(`Cannot check in an appointment that is ${appt.status}`, 'INVALID_STATE');
    const token = tx(() => {
      const tokens = db().prepare('SELECT token_no FROM appointments WHERE doctor_id = ? AND date = ? AND token_no IS NOT NULL').all(appt.doctor_id, appt.date).map((r) => r.token_no);
      const t = nextToken(tokens);
      db().prepare("UPDATE appointments SET status = 'CHECKED_IN', token_no = ?, checked_in_at = ? WHERE id = ?").run(t, nowIso(), appt.id);
      return t;
    });
    AuditService.log(actor, 'CHECK_IN', 'Appointment', appt.id, `Checked in ${appt.patient_code}, token ${token} for ${appt.doctor_name}`);
    return AppointmentService.get(appt.id);
  },

  /** FR-22, FR-23: queue board for one doctor and day. */
  board(doctorId, dateParam) {
    const date = optionalDate(dateParam, 'date') || todayStr();
    const doctor = DoctorService.get(doctorId);
    const all = AppointmentService.list({ doctorId, date }).filter((a) => a.status !== 'CANCELLED');
    const inProgress = all.find((a) => a.status === 'IN_CONSULTATION') || null;
    const waitingRaw = all.filter((a) => a.status === 'CHECKED_IN');
    const waiting = estimateWaits(waitingRaw, {
      avgMinutes: doctor.avg_consult_minutes,
      inProgressStartedAt: inProgress?.consult_started_at || null,
      now: clock.now(),
    });
    const served = all.filter((a) => a.status === 'COMPLETED').sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)));
    const scheduled = all.filter((a) => a.status === 'SCHEDULED').sort((a, b) => a.start_time.localeCompare(b.start_time));
    return {
      doctor: { id: doctor.id, full_name: doctor.full_name, department: doctor.department, room: doctor.room, avg_consult_minutes: doctor.avg_consult_minutes },
      date,
      inProgress,
      waiting,
      served,
      scheduled,
      stats: {
        waiting: waiting.length,
        served: served.length,
        scheduled: scheduled.length,
        noShow: all.filter((a) => a.status === 'NO_SHOW').length,
        avgWaitMinutes: waiting.length ? Math.round(waiting.reduce((s, w) => s + w.etaMinutes, 0) / waiting.length) : 0,
      },
    };
  },

  /** Overview of all doctors' queues for today (reception screen). */
  overview(dateParam) {
    const date = optionalDate(dateParam, 'date') || todayStr();
    return DoctorService.list().map((d) => {
      const b = this.board(d.id, date);
      return { doctor: b.doctor, inProgress: b.inProgress, waiting: b.waiting, stats: b.stats };
    });
  },

  /** FR-24 */
  setPriority(appointmentId, input, actor) {
    const { reason } = validate(z.object({ reason: nonEmpty('Reason for urgent priority') }), input);
    const appt = AppointmentService.get(appointmentId);
    if (appt.status !== 'CHECKED_IN') throw conflict('Only waiting (checked-in) patients can be prioritised', 'INVALID_STATE');
    if (actor.role === 'DOCTOR' && actor.doctorId !== appt.doctor_id) throw forbidden('Doctors can only prioritise patients in their own queue');
    db().prepare("UPDATE appointments SET priority = 'URGENT', priority_reason = ? WHERE id = ?").run(reason, appt.id);
    AuditService.log(actor, 'PRIORITY_URGENT', 'Appointment', appt.id, `Marked ${appt.patient_code} (token ${appt.token_no}) URGENT: ${reason}`);
    return AppointmentService.get(appt.id);
  },

  /** FR-25: doctor calls the next patient; creates the consultation record. */
  callNext(doctorId, actor) {
    if (actor.role === 'DOCTOR' && actor.doctorId !== Number(doctorId)) throw forbidden('Doctors can only call patients from their own queue');
    const date = todayStr();
    const result = tx(() => {
      const busy = db().prepare("SELECT id FROM appointments WHERE doctor_id = ? AND date = ? AND status = 'IN_CONSULTATION'").get(doctorId, date);
      if (busy) throw conflict('Finish the current consultation before calling the next patient', 'CONSULTATION_IN_PROGRESS', { appointmentId: busy.id });
      const waiting = sortQueue(db().prepare("SELECT * FROM appointments WHERE doctor_id = ? AND date = ? AND status = 'CHECKED_IN'").all(doctorId, date));
      if (!waiting.length) throw conflict('No patients are waiting in the queue', 'QUEUE_EMPTY');
      const next = waiting[0];
      const now = nowIso();
      db().prepare("UPDATE appointments SET status = 'IN_CONSULTATION', consult_started_at = ? WHERE id = ?").run(now, next.id);
      const c = db()
        .prepare("INSERT INTO consultations (appointment_id, patient_id, doctor_id, status, created_at) VALUES (?, ?, ?, 'IN_PROGRESS', ?)")
        .run(next.id, next.patient_id, next.doctor_id, now);
      return { appointmentId: next.id, consultationId: c.lastInsertRowid };
    });
    const appt = AppointmentService.get(result.appointmentId);
    AuditService.log(actor, 'STATUS_CHANGE', 'Appointment', appt.id, `CHECKED_IN → IN_CONSULTATION (token ${appt.token_no}, ${appt.patient_code})`);
    return { appointment: appt, consultationId: result.consultationId };
  },
};
