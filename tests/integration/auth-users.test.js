import { beforeAll, describe, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { tc } from '../helpers/tc.js';
import { setupApp } from './setup.js';

const I = 'Integration';
let ctx;
beforeAll(async () => { ctx = await setupApp(); });
const api = (u) => ctx.as(u);

describe('Authentication (AUTH)', () => {
  tc({ id: 'IT-AUTH-01', level: I, fr: ['FR-01'], title: 'Valid credentials return a session token and the role permissions', input: 'POST /auth/login reception / Mediflow@123', expected: '200 with JWT, role RECEPTIONIST and permissions list' }, async (note) => {
    const res = await api(null).post('/auth/login', { username: 'reception', password: 'Mediflow@123' });
    note(`HTTP ${res.status}, role ${res.body.user?.role}, ${res.body.user?.permissions.length} permissions, token length ${res.body.token?.length}`);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('RECEPTIONIST');
    expect(res.body.user.permissions).toContain('appointments:write');
    expect(res.body.token.split('.')).toHaveLength(3);
  });

  tc({ id: 'IT-AUTH-02', level: I, fr: ['FR-01'], title: 'Wrong password is rejected with a generic message', input: 'POST /auth/login billing / wrongpass', expected: '401 "Invalid username or password" (no hint which part was wrong)' }, async (note) => {
    const res = await api(null).post('/auth/login', { username: 'billing', password: 'wrongpass' });
    const unknown = await api(null).post('/auth/login', { username: 'nobody', password: 'x' });
    note(`HTTP ${res.status} "${res.body.error}"; unknown user HTTP ${unknown.status} "${unknown.body.error}"`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid username or password');
    expect(unknown.body.error).toBe(res.body.error);
  });

  tc({ id: 'IT-AUTH-03', level: I, fr: ['FR-02'], title: 'Five consecutive failures lock the account, even for the correct password', input: '5 × wrong password for "reception2", then correct password', expected: '5th attempt → 423 locked; correct password → 423 locked' }, async (note) => {
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await api(null).post('/auth/login', { username: 'reception2', password: `bad${i}` })).status);
    const ok = await api(null).post('/auth/login', { username: 'reception2', password: 'Mediflow@123' });
    note(`attempts → ${codes.join(', ')}; correct password → ${ok.status} "${ok.body.error}"`);
    expect(codes).toEqual([401, 401, 401, 401, 423]);
    expect(ok.status).toBe(423);
  });

  tc({ id: 'IT-AUTH-04', level: I, fr: ['FR-02', 'FR-06'], title: 'Deactivated accounts cannot log in and their sessions end', input: 'Admin deactivates "pharmacy"; pharmacy uses old token, then logs in', expected: 'Old token → 401; login → 401 "deactivated"' }, async (note) => {
    const off = await api('admin').post(`/users/${(await api('admin').get('/users')).body.find((u) => u.username === 'pharmacy').id}/deactivate`);
    const old = await api('pharmacy').get('/pharmacy/medicines');
    const login = await api(null).post('/auth/login', { username: 'pharmacy', password: 'Mediflow@123' });
    note(`deactivate ${off.status}; old token ${old.status}; login ${login.status} "${login.body.error}"`);
    expect(old.status).toBe(401);
    expect(login.status).toBe(401);
    expect(login.body.error).toMatch(/deactivated/);
    await api('admin').post(`/users/${off.body.id}/activate`);
    ctx.tokens.pharmacy = (await api(null).post('/auth/login', { username: 'pharmacy', password: 'Mediflow@123' })).body.token;
  });

  tc({ id: 'IT-AUTH-05', level: I, fr: ['FR-04'], title: 'Missing, tampered and expired tokens are rejected', input: 'GET /patients with no token, a token signed with another secret, and an expired token', expected: '401 in all three cases' }, async (note) => {
    const none = await ctx.agent.get('/api/patients');
    const forged = await ctx.agent.get('/api/patients').set('Authorization', `Bearer ${jwt.sign({ sub: 1, role: 'ADMIN', jti: 'x' }, 'attacker-secret')}`);
    const expired = await ctx.agent.get('/api/patients').set('Authorization', `Bearer ${jwt.sign({ sub: 1, role: 'ADMIN', jti: 'x', exp: Math.floor(Date.now() / 1000) - 60 }, 'mediflow-dev-secret-change-in-production')}`);
    note(`no token ${none.status}, forged ${forged.status}, expired ${expired.status}`);
    expect([none.status, forged.status, expired.status]).toEqual([401, 401, 401]);
  });

  tc({ id: 'IT-AUTH-06', level: I, fr: ['FR-04'], title: 'Logout revokes the session token', input: 'Login as lab, POST /auth/logout, reuse token', expected: 'Logout 200; reused token → 401' }, async (note) => {
    const { token } = (await api(null).post('/auth/login', { username: 'lab', password: 'Mediflow@123' })).body;
    const out = await ctx.agent.post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    const again = await ctx.agent.get('/api/lab/orders').set('Authorization', `Bearer ${token}`);
    note(`logout ${out.status}; reuse ${again.status} "${again.body.error}"`);
    expect(out.status).toBe(200);
    expect(again.status).toBe(401);
  });

  tc({ id: 'IT-AUTH-07', level: I, fr: ['FR-03'], title: 'Role-based access control blocks operations outside each role', input: 'Receptionist GET /users; Billing POST /patients; Lab GET /billing/invoices; Pharmacist POST /appointments', expected: '403 for all four' }, async (note) => {
    const r = [
      (await api('reception').get('/users')).status,
      (await api('billing').post('/patients', {})).status,
      (await api('lab').get('/billing/invoices')).status,
      (await api('pharmacy').post('/appointments', {})).status,
    ];
    note(r.join(', '));
    expect(r).toEqual([403, 403, 403, 403]);
  });
});

describe('User administration (USR)', () => {
  tc({ id: 'IT-USR-01', level: I, fr: ['FR-05'], title: 'Administrator creates users; duplicate usernames and short passwords are rejected', input: 'Create "nurse.anita" (BILLING); repeat; create with password "abc"', expected: '201, 409, 400' }, async (note) => {
    const a = await api('admin').post('/users', { username: 'nurse.anita', full_name: 'Anita Das', role: 'BILLING', password: 'Secure@123' });
    const b = await api('admin').post('/users', { username: 'nurse.anita', full_name: 'Anita Das', role: 'BILLING', password: 'Secure@123' });
    const c = await api('admin').post('/users', { username: 'new.user', full_name: 'New User', role: 'LAB_TECH', password: 'abc' });
    note(`${a.status}, ${b.status} "${b.body.error}", ${c.status} "${c.body.error}"`);
    expect([a.status, b.status, c.status]).toEqual([201, 409, 400]);
    expect(a.body.password_hash).toBeUndefined();
  });

  tc({ id: 'IT-USR-02', level: I, fr: ['FR-06'], title: 'An administrator cannot deactivate their own account', input: 'Admin POST /users/{self}/deactivate', expected: '403 "You cannot deactivate your own account"' }, async (note) => {
    const me = (await api('admin').get('/auth/me')).body;
    const res = await api('admin').post(`/users/${me.id}/deactivate`);
    note(`${res.status} "${res.body.error}"`);
    expect(res.status).toBe(403);
  });

  tc({ id: 'IT-USR-03', level: I, fr: ['FR-06'], title: 'Password reset lets the user log in with the new password only', input: 'Admin resets "nurse.anita" to NewPass@2026', expected: 'Old password 401, new password 200' }, async (note) => {
    const u = (await api('admin').get('/users')).body.find((x) => x.username === 'nurse.anita');
    await api('admin').post(`/users/${u.id}/reset-password`, { password: 'NewPass@2026' });
    const old = await api(null).post('/auth/login', { username: 'nurse.anita', password: 'Secure@123' });
    const neu = await api(null).post('/auth/login', { username: 'nurse.anita', password: 'NewPass@2026' });
    note(`old ${old.status}, new ${neu.status}`);
    expect([old.status, neu.status]).toEqual([401, 200]);
  });
});
