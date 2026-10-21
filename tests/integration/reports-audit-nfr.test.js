import { beforeAll, describe, expect } from 'vitest';
import { tc } from '../helpers/tc.js';
import { setupApp, newPatient } from './setup.js';

const I = 'Integration';
let ctx;
beforeAll(async () => { ctx = await setupApp({ profile: 'demo' }); }, 60_000);
const api = (u) => ctx.as(u);

describe('Dashboard & reports (RPT)', () => {
  tc({ id: 'IT-RPT-01', level: I, fr: ['FR-48'], title: 'Dashboard KPIs are tailored to the role', input: 'GET /reports/dashboard as admin, receptionist, doctor, pharmacist', expected: 'Admin: all sections; receptionist: no billing; doctor: own appointments only; pharmacist: pharmacy only' }, async (note) => {
    const adm = (await api('admin').get('/reports/dashboard')).body;
    const rec = (await api('reception').get('/reports/dashboard')).body;
    const doc = (await api('dr.sharma').get('/reports/dashboard')).body;
    const ph = (await api('pharmacy').get('/reports/dashboard')).body;
    note(`admin keys [${Object.keys(adm).join(',')}]; reception billing=${'billing' in rec}; doctor today=${doc.appointments.today} vs all=${adm.appointments.today}; pharmacist appointments=${'appointments' in ph}, pharmacy=${'pharmacy' in ph}`);
    expect(adm).toHaveProperty('billing');
    expect(adm).toHaveProperty('beds');
    expect(rec).not.toHaveProperty('billing');
    expect(doc.appointments.today).toBeLessThan(adm.appointments.today);
    expect(ph).not.toHaveProperty('appointments');
    expect(ph).toHaveProperty('pharmacy');
  });

  tc({ id: 'IT-RPT-02', level: I, fr: ['FR-49'], title: 'Management report aggregates a date range; restricted to administrators', input: 'GET /reports/summary?from=2026-10-08&to=2026-10-21 as admin and as billing', expected: '14 daily rows, revenue = sum of daily revenue, top diagnoses present; billing → 403' }, async (note) => {
    const r = (await api('admin').get('/reports/summary?from=2026-10-08&to=2026-10-21')).body;
    const denied = await api('billing').get('/reports/summary');
    const revenue = Math.round(r.revenue.reduce((s, d) => s + d.total, 0) * 100) / 100;
    note(`${r.appointments.length} days; totals: ${r.totals.appointments} appointments, revenue ₹${r.totals.revenue} (daily sum ₹${revenue}); top diagnosis "${r.topDiagnoses[0]?.diagnosis}"; billing → ${denied.status}`);
    expect(r.appointments).toHaveLength(14);
    expect(r.totals.revenue).toBe(revenue);
    expect(r.topDiagnoses.length).toBeGreaterThan(0);
    expect(denied.status).toBe(403);
  });
});

describe('Audit trail (AUD)', () => {
  tc({ id: 'IT-AUD-01', level: I, fr: ['FR-50', 'NFR-03'], title: 'State changes are audited with user and role, and passwords never appear', input: 'Register patient, create user with password "Secret@999", then search the audit log', expected: 'CREATE Patient by reception (RECEPTIONIST); CREATE User by admin; no entry contains "Secret@999"' }, async (note) => {
    const p = (await api('reception').post('/patients', newPatient({ first_name: 'Audit', last_name: 'Check' }))).body;
    await api('admin').post('/users', { username: 'audit.user', full_name: 'Audit User', role: 'LAB_TECH', password: 'Secret@999' });
    const rows = (await api('admin').get('/audit?limit=50')).body.rows;
    const pat = rows.find((r) => r.entity === 'Patient' && r.entity_id === String(p.id));
    const usr = rows.find((r) => r.entity === 'User' && r.action === 'CREATE');
    const leak = rows.some((r) => (r.summary || '').includes('Secret@999'));
    note(`patient entry: ${pat?.action} by ${pat?.username} (${pat?.role}); user entry: "${usr?.summary}"; password leaked=${leak}`);
    expect(pat.username).toBe('reception');
    expect(pat.role).toBe('RECEPTIONIST');
    expect(usr).toBeTruthy();
    expect(leak).toBe(false);
  });

  tc({ id: 'IT-AUD-02', level: I, fr: ['FR-50'], title: 'The audit log is append-only at database level', input: 'Direct SQL UPDATE and DELETE on audit_logs', expected: 'Both rejected with "audit log is append-only"' }, async (note) => {
    let upd = null;
    let del = null;
    try { ctx.db().prepare("UPDATE audit_logs SET summary = 'tampered' WHERE id = 1").run(); } catch (e) { upd = e.message; }
    try { ctx.db().prepare('DELETE FROM audit_logs WHERE id = 1').run(); } catch (e) { del = e.message; }
    note(`UPDATE → "${upd}"; DELETE → "${del}"`);
    expect(upd).toMatch(/append-only/);
    expect(del).toMatch(/append-only/);
  });

  tc({ id: 'IT-AUD-03', level: I, fr: ['FR-50', 'FR-03'], title: 'Only administrators can read the audit trail', input: 'GET /audit as billing and doctor', expected: '403, 403' }, async (note) => {
    const r = [(await api('billing').get('/audit')).status, (await api('dr.sharma').get('/audit')).status];
    note(r.join(', '));
    expect(r).toEqual([403, 403]);
  });
});

describe('Non-functional requirements (NFR)', () => {
  tc({ id: 'IT-NFR-01', level: I, fr: ['NFR-02'], title: 'SQL injection attempts are treated as plain text', input: "GET /patients?q=' OR 1=1 --  and q=x'; DROP TABLE patients; --", expected: '200 with 0 matches; patients table intact' }, async (note) => {
    const a = await api('reception').get(`/patients?q=${encodeURIComponent("' OR 1=1 --")}`);
    const b = await api('reception').get(`/patients?q=${encodeURIComponent("x'; DROP TABLE patients; --")}`);
    const count = ctx.db().prepare('SELECT COUNT(*) n FROM patients').get().n;
    note(`${a.status} ${a.body.rows.length} rows; ${b.status} ${b.body.rows.length} rows; patients in DB ${count}`);
    expect(a.body.rows).toHaveLength(0);
    expect(b.body.rows).toHaveLength(0);
    expect(count).toBeGreaterThan(60);
  });

  tc({ id: 'IT-NFR-02', level: I, fr: ['NFR-02'], title: 'Passwords are stored only as bcrypt hashes and never returned by the API', input: 'Inspect users.password_hash; GET /users as admin', expected: 'Hashes start with $2; API rows have no password field' }, async (note) => {
    const hashes = ctx.db().prepare('SELECT password_hash FROM users').all().map((r) => r.password_hash);
    const rows = (await api('admin').get('/users')).body;
    note(`${hashes.length} users, all bcrypt=${hashes.every((h) => /^\$2[aby]\$/.test(h))}; API exposes password_hash=${rows.some((r) => 'password_hash' in r)}`);
    expect(hashes.every((h) => /^\$2[aby]\$/.test(h))).toBe(true);
    expect(rows.some((r) => 'password_hash' in r)).toBe(false);
  });

  tc({ id: 'IT-NFR-03', level: I, fr: ['NFR-01'], title: '95% of typical API requests finish within 500 ms on the demo dataset', input: '200 mixed requests (dashboard, queue, bed board, patient search, invoices, reports) on ~600 appointments / ~380 invoices', expected: 'p95 latency < 500 ms' }, async (note) => {
    const paths = [['admin', '/reports/dashboard'], ['reception', '/queue'], ['reception', '/beds'], ['reception', '/patients?q=Roy'], ['billing', '/billing/invoices'], ['admin', '/reports/summary'], ['lab', '/lab/orders'], ['pharmacy', '/pharmacy/prescriptions']];
    const times = [];
    for (let i = 0; i < 200; i++) {
      const [u, p] = paths[i % paths.length];
      const t0 = performance.now();
      const res = await api(u).get(p);
      times.push(performance.now() - t0);
      expect(res.status).toBe(200);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)];
    const p50 = times[Math.floor(times.length * 0.5)];
    note(`p50 ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, max ${times.at(-1).toFixed(1)} ms over ${times.length} requests`);
    expect(p95).toBeLessThan(500);
  }, 60_000);

  tc({ id: 'IT-NFR-04', level: I, fr: ['NFR-02'], title: 'Security headers are sent and malformed JSON is handled', input: 'GET /api/health; POST /auth/login with body "{bad json"', expected: 'X-Content-Type-Options nosniff, X-Frame-Options DENY; 400 BAD_JSON' }, async (note) => {
    const h = await ctx.agent.get('/api/health');
    const bad = await ctx.agent.post('/api/auth/login').set('Content-Type', 'application/json').send('{bad json');
    note(`nosniff=${h.headers['x-content-type-options']}, frame=${h.headers['x-frame-options']}; bad JSON → ${bad.status} ${bad.body.code}`);
    expect(h.headers['x-content-type-options']).toBe('nosniff');
    expect(h.headers['x-frame-options']).toBe('DENY');
    expect(bad.status).toBe(400);
  });
});
