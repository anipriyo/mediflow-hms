import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Lock, User, ShieldCheck, Clock3, BedDouble, ListOrdered } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { Alert, Button, Field, Input } from '../components/ui.jsx';

const DEMO = [
  { username: 'admin', role: 'Administrator' },
  { username: 'reception', role: 'Receptionist' },
  { username: 'dr.sharma', role: 'Doctor' },
  { username: 'lab', role: 'Lab Technician' },
  { username: 'pharmacy', role: 'Pharmacist' },
  { username: 'billing', role: 'Billing Staff' },
];
const DEMO_PASSWORD = 'Mediflow@123';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(form.username.trim(), form.password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand-900 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(40,191,172,.35),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(14,165,233,.25),transparent_45%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20"><Activity className="h-6 w-6" /></span>
            <div>
              <p className="text-xl font-bold tracking-tight">MediFlow</p>
              <p className="text-sm text-brand-100">Hospital Management System</p>
            </div>
          </div>
          <div className="max-w-md">
            <h2 className="text-3xl font-semibold leading-tight">One connected flow from registration to discharge.</h2>
            <p className="mt-4 text-brand-100">Reception, doctors, laboratory, pharmacy and billing work on the same patient record — no repeated data entry.</p>
            <ul className="mt-8 space-y-4 text-sm">
              {[
                [ListOrdered, 'Smart queue tokens with live waiting-time estimates'],
                [BedDouble, 'Live bed board with a safe admission & discharge workflow'],
                [ShieldCheck, 'Role-based access control and a tamper-proof audit trail'],
                [Clock3, 'Automatic charges, invoices and receipts'],
              ].map(([Icon, text]) => (
                <li key={text} className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10"><Icon className="h-4 w-4" /></span>{text}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-brand-200">Software Engineering Assignment 1 · Group 11</p>
        </div>
      </div>

      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-700 text-white"><Activity className="h-5 w-5" /></span>
            <p className="text-xl font-bold">MediFlow</p>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in to your account</h1>
          <p className="mt-1 text-sm text-slate-500">Use your hospital staff credentials.</p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            {error && <Alert tone="error">{error}</Alert>}
            <Field label="Username">
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input name="username" autoComplete="username" className="pl-9" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="e.g. reception" required autoFocus />
              </div>
            </Field>
            <Field label="Password">
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input name="password" type="password" autoComplete="current-password" className="pl-9" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" required />
              </div>
            </Field>
            <Button type="submit" className="w-full" size="lg" loading={busy} disabled={!form.username || !form.password}>Sign in</Button>
          </form>

          <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Demo accounts · password <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-700">{DEMO_PASSWORD}</code></p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DEMO.map((d) => (
                <button key={d.username} type="button" onClick={() => setForm({ username: d.username, password: DEMO_PASSWORD })}
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-left transition hover:border-brand-300 hover:bg-brand-50">
                  <span className="block text-xs font-semibold text-slate-800">{d.role}</span>
                  <span className="block text-[11px] text-slate-500">{d.username}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
