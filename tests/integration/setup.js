// Integration-test harness: real Express app + real SQLite schema (in memory) + frozen clock.
import request from 'supertest';
import { initDb, db } from '../../server/db/connection.js';
import { seedDatabase, DEMO_PASSWORD } from '../../server/db/seed.js';
import { createApp } from '../../server/app.js';
import { clock } from '../../server/utils/clock.js';

export const TODAY = '2026-10-21'; // Wednesday
export const TOMORROW = '2026-10-22';
export const NOW = new Date(2026, 9, 21, 10, 0, 0); // 10:00 local

export const USERS = ['admin', 'reception', 'dr.sharma', 'dr.banerjee', 'lab', 'pharmacy', 'billing'];

export async function setupApp({ profile = 'test' } = {}) {
  clock.freeze(NOW);
  initDb(':memory:');
  seedDatabase({ profile });
  const app = createApp();
  const agent = request(app);
  const tokens = {};
  for (const u of USERS) {
    const res = await agent.post('/api/auth/login').send({ username: u, password: DEMO_PASSWORD });
    tokens[u] = res.body.token;
  }
  const as = (user) => {
    const auth = (r) => (user ? r.set('Authorization', `Bearer ${tokens[user]}`) : r);
    return {
      get: (p) => auth(agent.get(`/api${p}`)),
      post: (p, body = {}) => auth(agent.post(`/api${p}`).send(body)),
      put: (p, body = {}) => auth(agent.put(`/api${p}`).send(body)),
      patch: (p, body = {}) => auth(agent.patch(`/api${p}`).send(body)),
    };
  };
  const ids = {
    sharma: db().prepare("SELECT d.id FROM doctors d JOIN users u ON u.id = d.user_id WHERE u.username = 'dr.sharma'").get().id,
    banerjee: db().prepare("SELECT d.id FROM doctors d JOIN users u ON u.id = d.user_id WHERE u.username = 'dr.banerjee'").get().id,
  };
  /** Log everyone in again (sessions last 8 h of *clock* time, so long clock jumps need fresh tokens). */
  const relogin = async () => {
    for (const u of USERS) tokens[u] = (await agent.post('/api/auth/login').send({ username: u, password: DEMO_PASSWORD })).body.token;
  };
  return { app, agent, tokens, as, ids, db, relogin };
}

/** Advance the frozen clock by `minutes`. */
export function advance(minutes) {
  clock.freeze(new Date(clock.now().getTime() + minutes * 60000));
}

export function resetClock() {
  clock.freeze(NOW);
}

let phoneSeq = 0;
export function newPatient(over = {}) {
  phoneSeq += 1;
  return {
    first_name: 'Test', last_name: `Patient${phoneSeq}`, gender: 'FEMALE', dob: '1992-03-14',
    phone: `98300${String(10000 + phoneSeq).slice(-5)}`, blood_group: 'B+', ...over,
  };
}

/** Creates a patient + booked + checked-in appointment with Dr. Sharma and returns ids. */
export async function checkedInPatient(api, ids, startTime) {
  const p = (await api('reception').post('/patients', newPatient())).body;
  const a = (await api('reception').post('/appointments', { patient_id: p.id, doctor_id: ids.sharma, date: TODAY, start_time: startTime, reason: 'Fever' })).body;
  const c = (await api('reception').post(`/appointments/${a.id}/check-in`)).body;
  return { patient: p, appointment: c };
}
