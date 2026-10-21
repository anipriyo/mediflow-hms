import { db } from '../db/connection.js';
import { nowIso } from '../utils/clock.js';
import { badRequest, conflict, notFound, forbidden } from '../utils/errors.js';
import { validate, z, nonEmpty } from '../utils/validate.js';
import { ROLES } from '../domain/permissions.js';
import { validatePasswordStrength } from '../domain/authRules.js';
import { AuthService } from './authService.js';
import { AuditService } from './auditService.js';

const createSchema = z.object({
  username: z.string().trim().min(3, 'Username must be at least 3 characters').max(40).regex(/^[a-zA-Z0-9._-]+$/, 'Username may contain letters, digits, dot, underscore and dash only'),
  full_name: nonEmpty('Full name'),
  role: z.enum(ROLES, { errorMap: () => ({ message: `Role must be one of ${ROLES.join(', ')}` }) }),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
});

const SAFE_COLUMNS = 'id, username, full_name, role, email, phone, active, failed_attempts, locked_until, last_login_at, created_at';

export const UserService = {
  list() {
    return db().prepare(`SELECT ${SAFE_COLUMNS} FROM users ORDER BY role, full_name`).all();
  },

  get(id) {
    const u = db().prepare(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`).get(id);
    if (!u) throw notFound('User');
    return u;
  },

  /** FR-05 */
  create(input, actor) {
    const data = validate(createSchema, input);
    if (db().prepare('SELECT 1 FROM users WHERE username = ?').get(data.username)) {
      throw conflict(`Username "${data.username}" is already taken`, 'DUPLICATE_USERNAME');
    }
    const info = db()
      .prepare('INSERT INTO users (username, password_hash, full_name, role, email, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(data.username, AuthService.hashPassword(data.password), data.full_name, data.role, data.email || null, data.phone || null, nowIso());
    AuditService.log(actor, 'CREATE', 'User', info.lastInsertRowid, `Created ${data.role} account "${data.username}"`);
    return this.get(info.lastInsertRowid);
  },

  update(id, input, actor) {
    const user = this.get(id);
    const data = validate(z.object({ full_name: z.string().trim().min(1).optional(), email: z.string().email().optional().or(z.literal('')), phone: z.string().optional() }), input);
    db().prepare('UPDATE users SET full_name = COALESCE(?, full_name), email = COALESCE(?, email), phone = COALESCE(?, phone) WHERE id = ?')
      .run(data.full_name ?? null, data.email ?? null, data.phone ?? null, user.id);
    AuditService.log(actor, 'UPDATE', 'User', id, `Updated profile of "${user.username}"`);
    return this.get(id);
  },

  /** FR-06 */
  setActive(id, active, actor) {
    const user = this.get(id);
    if (!active && Number(id) === actor.id) throw forbidden('You cannot deactivate your own account');
    db().prepare('UPDATE users SET active = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?').run(active ? 1 : 0, id);
    if (!active) db().prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(nowIso(), id);
    AuditService.log(actor, active ? 'ACTIVATE' : 'DEACTIVATE', 'User', id, `${active ? 'Activated' : 'Deactivated'} "${user.username}"`);
    return this.get(id);
  },

  resetPassword(id, password, actor) {
    const user = this.get(id);
    const problem = validatePasswordStrength(password);
    if (problem) throw badRequest(problem, { password: problem });
    db().prepare('UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?').run(AuthService.hashPassword(password), id);
    AuditService.log(actor, 'RESET_PASSWORD', 'User', id, `Password reset for "${user.username}"`);
    return { ok: true };
  },
};
