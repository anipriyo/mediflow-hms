// Direct REST helpers used by E2E tests for preconditions/look-ups (the behaviour under test is always driven through the UI).
import { PASSWORD } from './helpers.js';

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d); };

/** Letters-only unique suffix (patient names) and a unique valid mobile number. */
export const uniq = () => Date.now().toString(36).replace(/\d/g, (d) => 'abcdefghij'[Number(d)]).slice(-6);
export const mobile = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

export async function apiAs(page, username) {
  const res = await page.request.post('/api/auth/login', { data: { username, password: PASSWORD } });
  const body = await res.json();
  if (!res.ok()) throw new Error(`API login failed for ${username}: ${body.error}`);
  const headers = { Authorization: `Bearer ${body.token}` };
  const unwrap = async (r) => {
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok()) {
      const e = new Error(`${r.status()} ${data?.error}`);
      e.status = r.status();
      e.body = data;
      throw e;
    }
    return data;
  };
  return {
    user: body.user,
    get: (p, params) => page.request.get(`/api${p}`, { headers, params }).then(unwrap),
    post: (p, data = {}) => page.request.post(`/api${p}`, { headers, data }).then(unwrap),
    put: (p, data = {}) => page.request.put(`/api${p}`, { headers, data }).then(unwrap),
  };
}

export async function sharmaId(page) {
  const rec = await apiAs(page, 'reception');
  return (await rec.get('/doctors')).find((d) => d.full_name === 'Dr. Arjun Sharma').id;
}

export async function newPatient(page, over = {}) {
  const rec = await apiAs(page, 'reception');
  return rec.post('/patients', {
    first_name: 'Ishaan', last_name: `Test${uniq()}`, gender: 'MALE', dob: '1988-07-19', phone: mobile(), blood_group: 'O+', ...over,
  });
}

/** A SCHEDULED appointment of Dr. Sharma for today (seeded data), excluding ids already used. */
export async function scheduledToday(page, exclude = []) {
  const rec = await apiAs(page, 'reception');
  const doc = await sharmaId(page);
  const list = await rec.get('/appointments', { date: today(), doctorId: doc, status: 'SCHEDULED' });
  return list.filter((a) => !exclude.includes(a.id)).sort((a, b) => a.start_time.localeCompare(b.start_time))[0] || null;
}

/** Complete whatever consultation Dr. Sharma has open (used to reach a clean starting state). */
export async function closeOpenConsultation(page) {
  const dr = await apiAs(page, 'dr.sharma');
  const cur = await dr.get('/consultations/current');
  if (cur && cur.id) {
    if (!cur.diagnosis) await dr.put(`/consultations/${cur.id}`, { diagnosis: 'Acute viral fever' });
    await dr.post(`/consultations/${cur.id}/complete`);
    return cur.id;
  }
  return null;
}

/**
 * Serve (via API) every patient queued ahead of `targetApptId` in Dr. Sharma's queue so that the
 * UI test can call the target patient next. Returns the number of patients served.
 */
export async function serveQueueUntil(page, targetApptId) {
  const dr = await apiAs(page, 'dr.sharma');
  const doc = dr.user.doctorId;
  let served = 0;
  for (let i = 0; i < 25; i += 1) {
    await closeOpenConsultation(page);
    const board = await dr.get(`/queue/${doc}`);
    if (!board.waiting.length || board.waiting[0].id === targetApptId) return served;
    const called = await dr.post(`/queue/${doc}/call-next`);
    await dr.put(`/consultations/${called.consultationId}`, { diagnosis: 'Acute viral fever' });
    await dr.post(`/consultations/${called.consultationId}/complete`);
    served += 1;
  }
  return served;
}
