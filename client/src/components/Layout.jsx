import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, CalendarDays, ListOrdered, Stethoscope, FlaskConical, Pill, BedDouble, Receipt, BarChart3,
  UserCog, ShieldCheck, LogOut, Menu, X, Activity, Search, IdCard,
} from 'lucide-react';
import { useAuth, ROLE_LABELS } from '../lib/auth.jsx';
import { Avatar, cx } from './ui.jsx';
import { api } from '../lib/api.js';

export const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard:read', end: true },
  { to: '/patients', label: 'Patients', icon: Users, perm: 'patients:read' },
  { to: '/appointments', label: 'Appointments', icon: CalendarDays, perm: 'appointments:read' },
  { to: '/queue', label: 'Queue Board', icon: ListOrdered, perm: 'queue:read' },
  { to: '/consultation', label: 'Consultation', icon: Stethoscope, perm: 'consultation:write' },
  { to: '/lab', label: 'Laboratory', icon: FlaskConical, perm: 'lab:read' },
  { to: '/pharmacy', label: 'Pharmacy', icon: Pill, perm: 'pharmacy:read' },
  { to: '/beds', label: 'Beds & Admissions', icon: BedDouble, perm: ['beds:read', 'admissions:read'] },
  { to: '/billing', label: 'Billing', icon: Receipt, perm: 'billing:read' },
  { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports:read', section: 'Administration' },
  { to: '/doctors', label: 'Doctors', icon: IdCard, perm: 'doctors:manage', section: 'Administration' },
  { to: '/users', label: 'Users & Roles', icon: UserCog, perm: 'users:manage', section: 'Administration' },
  { to: '/audit', label: 'Audit Trail', icon: ShieldCheck, perm: 'audit:read', section: 'Administration' },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-700 text-white shadow-sm"><Activity className="h-5 w-5" /></span>
      <div className="leading-tight">
        <p className="text-base font-bold tracking-tight text-slate-900">MediFlow</p>
        <p className="text-[11px] font-medium text-slate-500">Hospital Management</p>
      </div>
    </div>
  );
}

function PatientQuickSearch() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return undefined; }
    const t = setTimeout(() => api.get('/patients', { q, limit: 6 }).then((r) => setResults(r.rows)).catch(() => setResults([])), 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative hidden w-full max-w-sm md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        className="input bg-slate-50 pl-9"
        placeholder="Search patients by name, ID or phone…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label="Quick patient search"
      />
      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {results.map((p) => (
            <button key={p.id} type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
              onMouseDown={() => { navigate(`/patients/${p.id}`); setQ(''); setOpen(false); }}>
              <Avatar name={p.full_name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">{p.full_name}</span>
                <span className="block text-xs text-slate-500">{p.patient_code} · {p.age}y · {p.phone}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout, canAny } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);

  const items = NAV.filter((n) => canAny(...[].concat(n.perm)));
  const main = items.filter((n) => !n.section);
  const admin = items.filter((n) => n.section);

  const link = (n) => (
    <NavLink key={n.to} to={n.to} end={n.end}
      className={({ isActive }) => cx('group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
        isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}>
      {({ isActive }) => (<><n.icon className={cx('h-[18px] w-[18px]', isActive ? 'text-brand-700' : 'text-slate-400 group-hover:text-slate-600')} />{n.label}</>)}
    </NavLink>
  );

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-3"><Logo /></div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Main navigation">
        {main.map(link)}
        {admin.length > 0 && <p className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Administration</p>}
        {admin.map(link)}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar name={user?.full_name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800" data-testid="current-user">{user?.full_name}</p>
            <p className="truncate text-xs text-slate-500">{ROLE_LABELS[user?.role]}</p>
          </div>
          <button type="button" onClick={logout} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600" title="Log out" aria-label="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <button type="button" className="absolute right-3 top-4 rounded-lg p-1 text-slate-500" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <PatientQuickSearch />
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:block">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            <span className="hidden rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800 ring-1 ring-inset ring-brand-200 sm:inline" data-testid="role-badge">{ROLE_LABELS[user?.role]}</span>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8"><Outlet /></main>
      </div>
    </div>
  );
}
