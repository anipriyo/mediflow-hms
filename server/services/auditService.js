import { db } from '../db/connection.js';
import { nowIso } from '../utils/clock.js';

const SENSITIVE = /(password|token|secret)/i;

/** Remove anything that looks like a credential before it reaches the audit log (FR-50, NFR-03). */
function scrub(summary) {
  if (summary == null) return null;
  const text = typeof summary === 'string' ? summary : JSON.stringify(summary, (k, v) => (SENSITIVE.test(k) ? '[REDACTED]' : v));
  return text.length > 1000 ? `${text.slice(0, 997)}...` : text;
}

export const AuditService = {
  /**
   * Append an audit entry. `actor` may be null for anonymous events (e.g. failed login of unknown user).
   */
  log(actor, action, entity, entityId, summary) {
    db()
      .prepare(
        `INSERT INTO audit_logs (ts, user_id, username, role, action, entity, entity_id, summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(nowIso(), actor?.id ?? null, actor?.username ?? null, actor?.role ?? null, action, entity, entityId == null ? null : String(entityId), scrub(summary));
  },

  search({ q, entity, action, userId, from, to, limit = 200, offset = 0 } = {}) {
    const where = [];
    const params = [];
    if (q) {
      where.push('(summary LIKE ? OR username LIKE ? OR entity_id = ?)');
      params.push(`%${q}%`, `%${q}%`, q);
    }
    if (entity) { where.push('entity = ?'); params.push(entity); }
    if (action) { where.push('action = ?'); params.push(action); }
    if (userId) { where.push('user_id = ?'); params.push(Number(userId)); }
    if (from) { where.push('ts >= ?'); params.push(new Date(`${from}T00:00:00`).toISOString()); }
    if (to) { where.push('ts <= ?'); params.push(new Date(`${to}T23:59:59.999`).toISOString()); }
    const sql = `SELECT * FROM audit_logs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ? OFFSET ?`;
    const rows = db().prepare(sql).all(...params, Math.min(Number(limit) || 200, 1000), Number(offset) || 0);
    const total = db().prepare(`SELECT COUNT(*) c FROM audit_logs ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`).get(...params).c;
    return { rows, total };
  },

  entities() {
    return db().prepare('SELECT DISTINCT entity FROM audit_logs ORDER BY entity').all().map((r) => r.entity);
  },
};
