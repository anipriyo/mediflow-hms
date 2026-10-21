import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, KeyRound, Power, PowerOff, Search, ShieldCheck, Check, Minus, Eye } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useAuth, ROLE_LABELS } from '../lib/auth.jsx';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, PageHeader, RoleBadge, SearchInput, Select, Spinner, Table, cx, useToast,
} from '../components/ui.jsx';
import { fmtDateTime, timeAgo } from '../lib/format.js';

const ROLES = ['ADMIN', 'RECEPTIONIST', 'DOCTOR', 'LAB_TECH', 'PHARMACIST', 'BILLING'];

// Access summary derived from the server-side role-permission matrix (server/domain/permissions.js).
// W = create/update, R = read only, '' = no access
const MATRIX = [
  ['Patient registration & records', { ADMIN: 'W', RECEPTIONIST: 'W', DOCTOR: 'R', LAB_TECH: 'R', PHARMACIST: 'R', BILLING: 'R' }],
  ['Clinical notes & diagnoses', { ADMIN: 'R', DOCTOR: 'W' }],
  ['Appointments & check-in', { ADMIN: 'W', RECEPTIONIST: 'W', DOCTOR: 'R' }],
  ['Queue priority (urgent)', { ADMIN: 'W', RECEPTIONIST: 'W', DOCTOR: 'W' }],
  ['Consultation & prescriptions', { ADMIN: 'R', DOCTOR: 'W', PHARMACIST: 'R' }],
  ['Lab orders', { ADMIN: 'R', DOCTOR: 'W', LAB_TECH: 'R' }],
  ['Lab results entry', { ADMIN: 'R', DOCTOR: 'R', LAB_TECH: 'W' }],
  ['Pharmacy inventory & dispensing', { ADMIN: 'R', DOCTOR: 'R', PHARMACIST: 'W' }],
  ['Beds, admissions & discharge', { ADMIN: 'W', RECEPTIONIST: 'W', DOCTOR: 'R', BILLING: 'R' }],
  ['Discharge request', { DOCTOR: 'W' }],
  ['Discharge billing override', { ADMIN: 'W' }],
  ['Invoices & payments', { ADMIN: 'R', BILLING: 'W' }],
  ['Reports & analytics', { ADMIN: 'R' }],
  ['Users, doctors & departments', { ADMIN: 'W' }],
  ['Audit trail', { ADMIN: 'R' }],
];

function statusOf(u) {
  if (!u.active) return ['Inactive', 'gray'];
  if (u.locked_until && new Date(u.locked_until).getTime() > Date.now()) return ['Locked', 'red'];
  return ['Active', 'green'];
}

function CreateUserModal({ open, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ username: '', full_name: '', role: 'RECEPTIONIST', password: '', email: '', phone: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    const e = {};
    if (!/^[a-zA-Z0-9._-]{3,}$/.test(form.username)) e.username = 'At least 3 characters: letters, digits, . _ -';
    if (!form.full_name.trim()) e.full_name = 'Full name is required';
    if (form.password.length < 8) e.password = 'Minimum 8 characters';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true); setError(null);
    try {
      const u = await api.post('/users', form);
      toast.success(`${u.full_name} can now sign in as “${u.username}”`, 'User created');
      onSaved();
      onClose();
      setForm({ username: '', full_name: '', role: 'RECEPTIONIST', password: '', email: '', phone: '' });
    } catch (err) {
      setError(err.message);
      if (err.details && typeof err.details === 'object') setErrors(err.details);
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create user account" subtitle="Passwords are stored only as bcrypt hashes."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={UserPlus} loading={busy} onClick={save} data-testid="create-user-submit">Create user</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {error && <Alert tone="error" className="sm:col-span-2">{error}</Alert>}
        <Field label="Full name" required error={errors.full_name} className="sm:col-span-2"><Input name="full_name" value={form.full_name} onChange={set('full_name')} error={errors.full_name} /></Field>
        <Field label="Username" required error={errors.username}><Input name="username" value={form.username} onChange={set('username')} error={errors.username} /></Field>
        <Field label="Role" required>
          <Select name="role" value={form.role} onChange={set('role')}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select>
        </Field>
        {form.role === 'DOCTOR' && (
          <Alert tone="info" className="sm:col-span-2">Doctors need a department, fee and OPD schedule. Use <Link className="link" to="/doctors">Doctors → Add doctor</Link> to create the login and profile together.</Alert>
        )}
        <Field label="Initial password" required error={errors.password} hint="At least 8 characters"><Input name="password" type="password" value={form.password} onChange={set('password')} error={errors.password} /></Field>
        <Field label="Email" error={errors.email}><Input name="email" type="email" value={form.email} onChange={set('email')} error={errors.email} /></Field>
        <Field label="Phone"><Input name="phone" value={form.phone} onChange={set('phone')} /></Field>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      await api.post(`/users/${user.id}/reset-password`, { password });
      toast.success(`Password reset for ${user.username}; the account is unlocked`);
      onClose(true);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={() => onClose(false)} size="sm" title={`Reset password · ${user.username}`}
      footer={<><Button variant="secondary" onClick={() => onClose(false)}>Cancel</Button><Button icon={KeyRound} loading={busy} onClick={save}>Reset password</Button></>}>
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="New password" hint="At least 8 characters. Resetting also clears any lockout."><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></Field>
      </div>
    </Modal>
  );
}

function PermissionMatrix() {
  const cell = (v) => (v === 'W'
    ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200"><Check className="h-3 w-3" />Full</span>
    : v === 'R'
      ? <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200"><Eye className="h-3 w-3" />View</span>
      : <Minus className="mx-auto h-4 w-4 text-slate-300" />);
  return (
    <Card>
      <CardHeader title="Role-permission matrix" subtitle="Enforced on every API request (FR-03); the menu shows only what each role can use" icon={ShieldCheck} />
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm" data-testid="permission-matrix">
          <thead className="bg-slate-50/80">
            <tr><th className="th">Module / capability</th>{ROLES.map((r) => <th key={r} className="th text-center">{ROLE_LABELS[r]}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MATRIX.map(([label, access]) => (
              <tr key={label}><td className="td font-medium text-slate-700">{label}</td>{ROLES.map((r) => <td key={r} className="td text-center">{cell(access[r])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useApi('/users');
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState(null);
  const [toggle, setToggle] = useState(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => (data || []).filter((u) => (!role || u.role === role) && (!q || `${u.full_name} ${u.username} ${u.email || ''}`.toLowerCase().includes(q.toLowerCase()))), [data, q, role]);
  const counts = useMemo(() => Object.fromEntries(ROLES.map((r) => [r, (data || []).filter((u) => u.role === r).length])), [data]);

  const doToggle = async () => {
    setBusy(true);
    try {
      await api.post(`/users/${toggle.id}/${toggle.active ? 'deactivate' : 'activate'}`);
      toast.success(`${toggle.username} ${toggle.active ? 'deactivated – active sessions were signed out' : 'activated'}`);
      reload();
    } catch (e) {
      toast.error(e.message, 'Not allowed');
    } finally {
      setBusy(false);
      setToggle(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Users & Roles" subtitle="Staff accounts, roles and access control." actions={<Button icon={UserPlus} onClick={() => setCreating(true)} data-testid="create-user">Create user</Button>} />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
          <button type="button" onClick={() => setRole('')} className={cx('rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset', !role ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>All <span className="opacity-70">{data?.length ?? ''}</span></button>
          {ROLES.map((r) => (
            <button key={r} type="button" onClick={() => setRole(r)} className={cx('rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset', role === r ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>
              {ROLE_LABELS[r]} <span className="opacity-70">{counts[r]}</span>
            </button>
          ))}
          <SearchInput icon={Search} className="ml-auto w-full max-w-xs" placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {loading && !data ? <Spinner /> : error ? <ErrorState error={error} onRetry={reload} /> : (
          <Table rows={rows} empty={<EmptyState title="No users match" />} columns={[
            { header: 'User', render: (u) => (<div className="flex items-center gap-3"><Avatar name={u.full_name} size="sm" /><div><p className="font-medium text-slate-800">{u.full_name}{u.id === me.id && <span className="ml-2 text-xs font-normal text-slate-400">(you)</span>}</p><p className="text-xs text-slate-500">{u.email || '—'}</p></div></div>) },
            { header: 'Username', render: (u) => <span className="font-mono text-xs">{u.username}</span> },
            { header: 'Role', render: (u) => <RoleBadge role={u.role} /> },
            { header: 'Status', render: (u) => { const [l, c] = statusOf(u); return <span title={u.locked_until ? `Locked until ${fmtDateTime(u.locked_until)}` : ''}><Badge color={c} dot>{l}</Badge>{u.failed_attempts > 0 && u.active ? <span className="ml-2 text-xs text-amber-700">{u.failed_attempts} failed</span> : null}</span>; } },
            { header: 'Last login', render: (u) => (u.last_login_at ? <span title={fmtDateTime(u.last_login_at)}>{timeAgo(u.last_login_at)}</span> : <span className="text-slate-400">Never</span>) },
            { header: '', className: 'text-right', render: (u) => (
              <div className="flex justify-end gap-1.5">
                <Button size="xs" variant="secondary" icon={KeyRound} onClick={() => setResetting(u)}>Reset password</Button>
                {u.active
                  ? <Button size="xs" variant="secondary" icon={PowerOff} className="text-rose-600" onClick={() => setToggle(u)} data-testid={`deactivate-${u.username}`}>Deactivate</Button>
                  : <Button size="xs" variant="soft" icon={Power} onClick={() => setToggle(u)} data-testid={`activate-${u.username}`}>Activate</Button>}
              </div>
            ) },
          ]} />
        )}
      </Card>

      <PermissionMatrix />
      <Alert tone="info" title="Security notes">Accounts lock for 15 minutes after 5 consecutive failed logins. Deactivating a user immediately ends their active sessions. Administrators cannot deactivate their own account.</Alert>

      <CreateUserModal open={creating} onClose={() => setCreating(false)} onSaved={reload} />
      {resetting && <ResetPasswordModal user={resetting} onClose={(changed) => { setResetting(null); if (changed) reload(); }} />}
      <ConfirmDialog open={Boolean(toggle)} onClose={() => setToggle(null)} busy={busy} onConfirm={doToggle}
        variant={toggle?.active ? 'danger' : 'primary'} confirmLabel={toggle?.active ? 'Deactivate' : 'Activate'}
        title={toggle?.active ? `Deactivate ${toggle?.full_name}?` : `Activate ${toggle?.full_name}?`}
        message={toggle?.active ? 'The user will be signed out and will not be able to log in until reactivated.' : 'The user will be able to log in again.'} />
    </div>
  );
}
