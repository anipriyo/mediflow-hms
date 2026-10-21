import { db, tx } from '../db/connection.js';
import { clock, nowIso } from '../utils/clock.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { validate, z, nonEmpty, timeStr, dateStr } from '../utils/validate.js';
import { freeSlots, isWorkingDay, ACTIVE_STATUSES } from '../domain/appointmentRules.js';
import { timeToMinutes } from '../domain/time.js';
import { AuthService } from './authService.js';
import { AuditService } from './auditService.js';

const BASE = `
  SELECT d.*, u.full_name, u.username, u.email, u.phone, u.active, dep.name AS department
  FROM doctors d JOIN users u ON u.id = d.user_id JOIN departments dep ON dep.id = d.department_id`;

const profileSchema = z.object({
  department_id: z.coerce.number().int().positive('Department is required'),
  specialization: nonEmpty('Specialisation'),
  qualification: z.string().optional(),
  consultation_fee: z.coerce.number().min(0, 'Fee cannot be negative'),
  avg_consult_minutes: z.coerce.number().int().min(5).max(120),
  slot_minutes: z.coerce.number().int().min(5).max(120),
  work_start: timeStr,
  work_end: timeStr,
  work_days: z.string().regex(/^[0-6](,[0-6])*$/, 'Working days must be a comma-separated list of 0-6'),
  room: z.string().optional(),
});

function checkHours(p) {
  if (p.work_start && p.work_end && timeToMinutes(p.work_start) >= timeToMinutes(p.work_end)) {
    throw badRequest('Work end time must be after work start time', { work_end: 'Must be after start time' });
  }
}

export const DoctorService = {
  departments() {
    return db().prepare(`SELECT dep.*, (SELECT COUNT(*) FROM doctors d WHERE d.department_id = dep.id) AS doctor_count FROM departments dep ORDER BY name`).all();
  },

  createDepartment(input, actor) {
    const data = validate(z.object({ name: nonEmpty('Name'), description: z.string().optional() }), input);
    if (db().prepare('SELECT 1 FROM departments WHERE name = ?').get(data.name)) throw conflict('Department already exists');
    const info = db().prepare('INSERT INTO departments (name, description) VALUES (?, ?)').run(data.name, data.description || null);
    AuditService.log(actor, 'CREATE', 'Department', info.lastInsertRowid, `Created department ${data.name}`);
    return db().prepare('SELECT * FROM departments WHERE id = ?').get(info.lastInsertRowid);
  },

  list({ departmentId, q } = {}) {
    const where = [];
    const params = [];
    if (departmentId) { where.push('d.department_id = ?'); params.push(Number(departmentId)); }
    if (q) { where.push('(u.full_name LIKE ? OR d.specialization LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    return db().prepare(`${BASE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY dep.name, u.full_name`).all(...params);
  },

  get(id) {
    const d = db().prepare(`${BASE} WHERE d.id = ?`).get(id);
    if (!d) throw notFound('Doctor');
    return d;
  },

  /** FR-13: creates the login account and the doctor profile together. */
  create(input, actor) {
    const account = validate(
      z.object({
        username: z.string().trim().min(3).regex(/^[a-zA-Z0-9._-]+$/),
        full_name: nonEmpty('Full name'),
        password: z.string().min(8, 'Password must be at least 8 characters'),
        email: z.string().email().optional().or(z.literal('')),
        phone: z.string().optional(),
      }),
      input,
    );
    const profile = validate(profileSchema, input);
    checkHours(profile);
    if (db().prepare('SELECT 1 FROM users WHERE username = ?').get(account.username)) throw conflict(`Username "${account.username}" is already taken`);
    const id = tx(() => {
      const u = db()
        .prepare("INSERT INTO users (username, password_hash, full_name, role, email, phone, created_at) VALUES (?, ?, ?, 'DOCTOR', ?, ?, ?)")
        .run(account.username, AuthService.hashPassword(account.password), account.full_name, account.email || null, account.phone || null, nowIso());
      const d = db()
        .prepare(`INSERT INTO doctors (user_id, department_id, specialization, qualification, consultation_fee, avg_consult_minutes, slot_minutes, work_start, work_end, work_days, room)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(u.lastInsertRowid, profile.department_id, profile.specialization, profile.qualification || null, profile.consultation_fee, profile.avg_consult_minutes, profile.slot_minutes, profile.work_start, profile.work_end, profile.work_days, profile.room || null);
      return d.lastInsertRowid;
    });
    AuditService.log(actor, 'CREATE', 'Doctor', id, `Added doctor ${account.full_name} (${profile.specialization})`);
    return this.get(id);
  },

  update(id, input, actor) {
    const current = this.get(id);
    const data = validate(profileSchema.partial(), input);
    checkHours({ work_start: data.work_start ?? current.work_start, work_end: data.work_end ?? current.work_end });
    const fields = Object.keys(data);
    if (fields.length) {
      db().prepare(`UPDATE doctors SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(...fields.map((f) => data[f]), id);
    }
    if (input.full_name) db().prepare('UPDATE users SET full_name = ? WHERE id = ?').run(String(input.full_name).trim(), current.user_id);
    AuditService.log(actor, 'UPDATE', 'Doctor', id, `Updated doctor profile (${fields.join(', ') || 'name'})`);
    return this.get(id);
  },

  /** FR-15 */
  slots(doctorId, date) {
    validate(z.object({ date: dateStr }), { date });
    const doctor = this.get(doctorId);
    const bookings = db()
      .prepare(`SELECT id, date, start_time, end_time, status FROM appointments WHERE doctor_id = ? AND date = ? AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`)
      .all(doctorId, date, ...ACTIVE_STATUSES);
    return {
      doctor: { id: doctor.id, full_name: doctor.full_name, department: doctor.department, slot_minutes: doctor.slot_minutes, work_start: doctor.work_start, work_end: doctor.work_end },
      date,
      workingDay: isWorkingDay(doctor, date),
      slots: freeSlots(doctor, date, bookings, clock.now()),
    };
  },
};
