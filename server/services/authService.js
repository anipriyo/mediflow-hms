import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { db } from '../db/connection.js';
import { config } from '../config.js';
import { clock, nowIso } from '../utils/clock.js';
import { unauthorized, locked } from '../utils/errors.js';
import { isLocked, afterFailedAttempt } from '../domain/authRules.js';
import { permissionsFor } from '../domain/permissions.js';
import { AuditService } from './auditService.js';

function publicUser(u) {
  const doctor = u.role === 'DOCTOR' ? db().prepare('SELECT id FROM doctors WHERE user_id = ?').get(u.id) : null;
  return {
    id: u.id,
    username: u.username,
    full_name: u.full_name,
    role: u.role,
    email: u.email,
    doctorId: doctor?.id ?? null,
    permissions: permissionsFor(u.role),
  };
}

export const AuthService = {
  hashPassword(plain) {
    return bcrypt.hashSync(plain, config.bcryptRounds);
  },

  /** FR-01, FR-02 */
  login(username, password) {
    const now = clock.now();
    const user = db().prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim());
    if (!user) {
      AuditService.log(null, 'LOGIN_FAILED', 'User', null, `Unknown username "${String(username || '').slice(0, 40)}"`);
      throw unauthorized('Invalid username or password');
    }
    if (!user.active) {
      AuditService.log(user, 'LOGIN_FAILED', 'User', user.id, 'Login attempt on deactivated account');
      throw unauthorized('This account has been deactivated. Contact the administrator.');
    }
    if (isLocked(user, now)) {
      const mins = Math.ceil((new Date(user.locked_until).getTime() - now.getTime()) / 60000);
      throw locked(`Account locked after repeated failed attempts. Try again in ${mins} minute(s).`);
    }
    if (!bcrypt.compareSync(String(password || ''), user.password_hash)) {
      const next = afterFailedAttempt(user, now);
      db().prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(next.failed_attempts, next.locked_until, user.id);
      AuditService.log(user, 'LOGIN_FAILED', 'User', user.id, `Wrong password (attempt ${next.failed_attempts})`);
      if (next.locked_until) {
        AuditService.log(user, 'ACCOUNT_LOCKED', 'User', user.id, 'Locked for 15 minutes after 5 failed attempts');
        throw locked('Account locked for 15 minutes after 5 failed attempts.');
      }
      throw unauthorized('Invalid username or password');
    }
    db().prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?').run(nowIso(), user.id);

    const jti = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + config.tokenTtlHours * 3600_000);
    db().prepare('INSERT INTO sessions (jti, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(jti, user.id, now.toISOString(), expiresAt.toISOString());
    // Token expiry is enforced by the JWT itself and by the server-side session row (which also enables logout).
    const token = jwt.sign({ sub: user.id, role: user.role, jti }, config.jwtSecret, { expiresIn: `${config.tokenTtlHours}h` });
    AuditService.log(user, 'LOGIN', 'User', user.id, 'Successful login');
    return { token, expiresAt: expiresAt.toISOString(), user: publicUser(user) };
  },

  /** Verifies a bearer token and returns the acting user (FR-04). */
  verify(token) {
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw unauthorized('Session is invalid or has expired. Please log in again.');
    }
    const session = db().prepare('SELECT * FROM sessions WHERE jti = ?').get(payload.jti);
    if (!session || session.revoked_at) throw unauthorized('Session has ended. Please log in again.');
    if (new Date(session.expires_at).getTime() <= clock.now().getTime()) throw unauthorized('Session has expired. Please log in again.');
    const user = db().prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user || !user.active) throw unauthorized('Account is not active');
    return { ...publicUser(user), jti: payload.jti };
  },

  logout(actor) {
    db().prepare('UPDATE sessions SET revoked_at = ? WHERE jti = ?').run(nowIso(), actor.jti);
    AuditService.log(actor, 'LOGOUT', 'User', actor.id, 'Logged out');
  },

  me(actor) {
    return actor;
  },
};
