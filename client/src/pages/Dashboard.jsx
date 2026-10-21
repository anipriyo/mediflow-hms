import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, Users, BedDouble, IndianRupee, FlaskConical, Pill, AlertTriangle, ListOrdered, Stethoscope, Receipt, UserPlus, Clock3,
  CheckCircle2, ShieldCheck, Activity,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, AreaChart, Area } from 'recharts';
import { useApi } from '../lib/useApi.js';
import { useAuth } from '../lib/auth.jsx';
import { Card, CardHeader, PageHeader, StatCard, Spinner, ErrorState, Button, Badge, StatusBadge, EmptyState } from '../components/ui.jsx';
import { money0, fmtDate, timeAgo } from '../lib/format.js';

const shortDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

function ChartCard({ title, subtitle, children, icon }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} icon={icon} />
      <div className="h-64 px-2 py-4">{children}</div>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi('/reports/dashboard', null, { interval: 30000 });

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const d = data;
  const role = user.role;
  const firstName = user.full_name.replace(/^Dr\.\s*/, '').split(' ')[0];

  const quick = {
    RECEPTIONIST: [['Register patient', UserPlus, '/patients?new=1'], ['Book appointment', CalendarDays, '/appointments?book=1'], ['Queue board', ListOrdered, '/queue'], ['Admit patient', BedDouble, '/beds']],
    DOCTOR: [['Open consultation', Stethoscope, '/consultation'], ['My queue', ListOrdered, '/queue'], ['Lab results', FlaskConical, '/lab']],
    LAB_TECH: [['Lab worklist', FlaskConical, '/lab']],
    PHARMACIST: [['Pending prescriptions', Pill, '/pharmacy'], ['Stock alerts', AlertTriangle, '/pharmacy?tab=alerts']],
    BILLING: [['Generate invoice', Receipt, '/billing'], ['Unpaid invoices', IndianRupee, '/billing?tab=invoices']],
    ADMIN: [['Reports', Activity, '/reports'], ['Users & roles', Users, '/users'], ['Audit trail', ShieldCheck, '/audit']],
  }[role] || [];

  const stats = [];
  if (d.appointments) {
    stats.push(<StatCard key="ap" label={role === 'DOCTOR' ? 'My appointments today' : 'Appointments today'} value={d.appointments.today} hint={`${d.appointments.completed} completed · ${d.appointments.scheduled} upcoming`} icon={CalendarDays} tone="sky" onClick={() => navigate('/appointments')} />);
    stats.push(<StatCard key="wq" label="Patients waiting" value={d.appointments.waiting} hint={`${d.appointments.inConsultation} in consultation now`} icon={Clock3} tone="amber" onClick={() => navigate('/queue')} />);
  }
  if (d.beds) stats.push(<StatCard key="bd" label="Bed occupancy" value={`${d.beds.occupancyPct}%`} hint={`${d.beds.OCCUPIED}/${d.beds.total} occupied · ${d.beds.AVAILABLE} free`} icon={BedDouble} tone="violet" onClick={() => navigate('/beds')} />);
  if (d.billing) stats.push(<StatCard key="rv" label="Collected today" value={money0(d.billing.collectedToday)} hint={`${d.billing.unpaidInvoices} unpaid · ${money0(d.billing.outstanding)} due`} icon={IndianRupee} tone="emerald" onClick={() => navigate('/billing')} />);
  if (d.lab) stats.push(<StatCard key="lb" label="Pending lab orders" value={d.lab.ordered + d.lab.sampleCollected} hint={`${d.lab.completedToday} completed today · ${d.lab.abnormalToday} abnormal`} icon={FlaskConical} tone="brand" onClick={() => navigate('/lab')} />);
  if (d.pharmacy) stats.push(<StatCard key="ph" label="Stock alerts" value={d.pharmacy.lowStock + d.pharmacy.expiring} hint={`${d.pharmacy.pendingPrescriptions} prescriptions to dispense`} icon={Pill} tone="rose" onClick={() => navigate('/pharmacy')} />);
  if (d.totalPatients !== undefined && role !== 'DOCTOR') stats.push(<StatCard key="pt" label="Registered patients" value={d.totalPatients} hint={`${d.newPatientsToday} new today`} icon={Users} tone="slate" onClick={() => navigate('/patients')} />);
  if (d.billing && role === 'BILLING') stats.push(<StatCard key="pc" label="Patients to bill" value={d.billing.pendingCharges} hint="with unbilled charges" icon={Receipt} tone="amber" onClick={() => navigate('/billing')} />);

  return (
    <div className="space-y-6">
      <PageHeader title={`${greeting()}, ${role === 'DOCTOR' ? 'Dr. ' : ''}${firstName}`} subtitle={`Here is what is happening at MediFlow today, ${fmtDate(d.date)}.`}
        actions={quick.map(([label, Icon, to], i) => <Button key={label} variant={i === 0 ? 'primary' : 'secondary'} icon={Icon} onClick={() => navigate(to)}>{label}</Button>)} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="kpi-grid">{stats.slice(0, 8)}</div>

      <div className="grid gap-6 xl:grid-cols-2">
        {d.appointmentTrend && (
          <ChartCard title="Appointments – last 7 days" subtitle="Completed vs cancelled / no-show" icon={CalendarDays}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.appointmentTrend.map((x) => ({ ...x, day: shortDay(x.date), Missed: x.CANCELLED + x.NO_SHOW, Open: x.OPEN }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={32} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="COMPLETED" name="Completed" stackId="a" fill="#0fa394" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Open" name="Open" stackId="a" fill="#7dd3fc" />
                <Bar dataKey="Missed" name="Cancelled / no-show" stackId="a" fill="#fda4af" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
        {d.revenueTrend && (
          <ChartCard title="Revenue – last 7 days" subtitle="Payments received by method" icon={IndianRupee}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.revenueTrend.map((x) => ({ ...x, day: shortDay(x.date) }))}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0fa394" stopOpacity={0.35} /><stop offset="100%" stopColor="#0fa394" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={44} />
                <Tooltip formatter={(v) => money0(v)} contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }} />
                <Area type="monotone" dataKey="total" name="Total" stroke="#0d6962" strokeWidth={2} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
        {d.wards && (
          <Card>
            <CardHeader title="Ward occupancy" subtitle={`${d.admissions?.active ?? 0} admitted · ${d.admissions?.dischargePending ?? 0} awaiting discharge`} icon={BedDouble}
              actions={<Button size="sm" variant="secondary" onClick={() => navigate('/beds')}>Bed board</Button>} />
            <div className="space-y-4 px-5 py-5">
              {d.wards.map((w) => (
                <div key={w.id}>
                  <div className="mb-1 flex justify-between text-sm"><span className="font-medium text-slate-700">{w.name}</span><span className="tabular-nums text-slate-500">{w.occupied}/{w.total} · {w.occupancyPct}%</span></div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${w.occupancyPct >= 85 ? 'bg-rose-500' : w.occupancyPct >= 60 ? 'bg-amber-500' : 'bg-brand-500'}`} style={{ width: `${w.occupancyPct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
        {d.pharmacy && (
          <Card>
            <CardHeader title="Pharmacy alerts" subtitle="Low stock and expiry warnings" icon={AlertTriangle} actions={<Button size="sm" variant="secondary" onClick={() => navigate('/pharmacy?tab=alerts')}>View all</Button>} />
            {d.pharmacy.alerts.length ? (
              <ul className="divide-y divide-slate-100">
                {d.pharmacy.alerts.map((a) => (
                  <li key={a.message} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span className="text-slate-700">{a.message}</span><StatusBadge status={a.type} /></li>
                ))}
              </ul>
            ) : <EmptyState icon={CheckCircle2} title="No stock alerts" />}
          </Card>
        )}
        {d.lab && role === 'LAB_TECH' && (
          <Card>
            <CardHeader title="Laboratory workload" icon={FlaskConical} />
            <div className="grid grid-cols-2 gap-4 p-5">
              {[['Awaiting sample', d.lab.ordered, 'blue'], ['Sample collected', d.lab.sampleCollected, 'amber'], ['Completed today', d.lab.completedToday, 'green'], ['Abnormal today', d.lab.abnormalToday, 'red']].map(([l, v, c]) => (
                <div key={l} className="rounded-lg border border-slate-200 p-4"><p className="text-xs text-slate-500">{l}</p><p className="mt-1 text-2xl font-semibold">{v}</p><Badge color={c} className="mt-2">{l.split(' ')[0]}</Badge></div>
              ))}
            </div>
          </Card>
        )}
        {d.recentActivity && (
          <Card className="xl:col-span-2">
            <CardHeader title="Recent activity" subtitle="Latest entries in the audit trail" icon={ShieldCheck} actions={<Button size="sm" variant="secondary" onClick={() => navigate('/audit')}>Open audit trail</Button>} />
            <ul className="divide-y divide-slate-100">
              {d.recentActivity.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
                  <Badge color="teal">{a.action}</Badge>
                  <span className="font-medium text-slate-700">{a.username || 'system'}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-600">{a.summary}</span>
                  <span className="text-xs text-slate-400">{timeAgo(a.ts)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
