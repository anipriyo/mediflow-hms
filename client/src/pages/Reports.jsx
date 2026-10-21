import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts';
import {
  BarChart3, CalendarDays, CheckCircle2, XCircle, IndianRupee, BedDouble, LogOut, UserPlus, Download, Stethoscope, Building2, Activity, PieChart as PieIcon, Wallet,
} from 'lucide-react';
import { useApi } from '../lib/useApi.js';
import { Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, PageHeader, Spinner, StatCard, Table, cx } from '../components/ui.jsx';
import { addDays, fmtDate, money, money0, todayStr, humanize } from '../lib/format.js';

const PALETTE = ['#0fa394', '#0ea5e9', '#8b5cf6', '#f59e0b', '#f43f5e', '#10b981', '#64748b'];
const tooltipStyle = { borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 };
const axis = { tick: { fontSize: 12, fill: '#64748b' }, axisLine: false, tickLine: false };
const shortDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

function ChartCard({ title, subtitle, icon, children, className, height = 'h-72' }) {
  return (
    <Card className={className}>
      <CardHeader title={title} subtitle={subtitle} icon={icon} />
      <div className={cx('px-2 py-4', height)}>{children}</div>
    </Card>
  );
}

function downloadCsv(filename, rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const PRESETS = [
  { days: 7, label: 'Last 7 days' },
  { days: 14, label: 'Last 14 days' },
  { days: 30, label: 'Last 30 days' },
];

export default function Reports() {
  const today = todayStr();
  const [range, setRange] = useState({ from: addDays(today, -13), to: today, preset: 14 });
  const { data, loading, error, reload } = useApi('/reports/summary', { from: range.from, to: range.to });

  const daily = useMemo(() => {
    if (!data) return [];
    const rev = Object.fromEntries(data.revenue.map((r) => [r.date, r]));
    return data.appointments.map((a) => ({
      date: a.date, day: shortDay(a.date), total: a.total, completed: a.COMPLETED, cancelled: a.CANCELLED, noShow: a.NO_SHOW, open: a.OPEN,
      revenue: rev[a.date]?.total || 0, cash: rev[a.date]?.CASH || 0, card: rev[a.date]?.CARD || 0, upi: rev[a.date]?.UPI || 0,
    }));
  }, [data]);

  const exportCsv = () => {
    downloadCsv(`mediflow-report-${range.from}-to-${range.to}.csv`, [
      ['Date', 'Appointments', 'Completed', 'Cancelled', 'No-show', 'Open', 'Revenue (INR)', 'Cash', 'Card', 'UPI'],
      ...daily.map((d) => [d.date, d.total, d.completed, d.cancelled, d.noShow, d.open, d.revenue.toFixed(2), d.cash.toFixed(2), d.card.toFixed(2), d.upi.toFixed(2)]),
      [],
      ['Totals', data.totals.appointments, data.totals.completed, data.totals.cancelled, data.totals.noShow, '', data.totals.revenue.toFixed(2)],
    ]);
  };

  const t = data?.totals;
  const completionPct = t?.appointments ? Math.round((t.completed / t.appointments) * 1000) / 10 : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Reports & Analytics" subtitle={data ? `Hospital performance from ${fmtDate(data.from)} to ${fmtDate(data.to)}` : 'Hospital performance'}
        actions={<Button variant="secondary" icon={Download} disabled={!data} onClick={exportCsv} data-testid="export-csv">Export CSV</Button>} />

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.days} type="button" onClick={() => setRange({ from: addDays(today, -(p.days - 1)), to: today, preset: p.days })}
              className={cx('rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition', range.preset === p.days ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-3">
          <Field label="From"><Input type="date" value={range.from} max={range.to} onChange={(e) => { const v = e.target.value; if (v) setRange((r) => ({ from: v, to: v > r.to ? v : r.to, preset: null })); }} /></Field>
          <Field label="To"><Input type="date" value={range.to} min={range.from} onChange={(e) => { const v = e.target.value; if (v) setRange((r) => ({ from: v < r.from ? v : r.from, to: v, preset: null })); }} /></Field>
        </div>
      </Card>

      {loading && !data ? <Spinner /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Appointments" value={t.appointments} hint={`${t.completed} completed`} icon={CalendarDays} tone="sky" />
            <StatCard label="Completion rate" value={`${completionPct}%`} hint="Completed / all appointments" icon={CheckCircle2} tone="emerald" />
            <StatCard label="Cancellation & no-show" value={`${t.cancellationRate}%`} hint={`${t.cancelled} cancelled · ${t.noShow} no-show`} icon={XCircle} tone="rose" />
            <StatCard label="Revenue collected" value={money0(t.revenue)} hint="Payments received in range" icon={IndianRupee} tone="brand" />
            <StatCard label="Admissions" value={t.admissions} hint="New inpatient admissions" icon={BedDouble} tone="violet" />
            <StatCard label="Discharges" value={t.discharges} hint="Completed discharges" icon={LogOut} tone="amber" />
            <StatCard label="New patients" value={t.newPatients} hint="Registrations in range" icon={UserPlus} tone="slate" />
            <StatCard label="Avg. daily revenue" value={money0(daily.length ? t.revenue / daily.length : 0)} hint={`${daily.length} day(s)`} icon={Wallet} tone="emerald" />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard title="Appointments per day" subtitle="By outcome" icon={CalendarDays}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="day" {...axis} />
                  <YAxis allowDecimals={false} width={32} {...axis} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="completed" name="Completed" stackId="a" fill="#0fa394" />
                  <Bar dataKey="open" name="Open" stackId="a" fill="#7dd3fc" />
                  <Bar dataKey="cancelled" name="Cancelled" stackId="a" fill="#fda4af" />
                  <Bar dataKey="noShow" name="No-show" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Revenue per day" subtitle="Payments received" icon={IndianRupee}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily}>
                  <defs><linearGradient id="revR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0fa394" stopOpacity={0.35} /><stop offset="100%" stopColor="#0fa394" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="day" {...axis} minTickGap={16} />
                  <YAxis tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} width={44} {...axis} />
                  <Tooltip formatter={(v) => money0(v)} contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#0d6962" strokeWidth={2} fill="url(#revR)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Revenue by payment method" icon={PieIcon}>
              {data.paymentMethods.some((m) => m.amount > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.paymentMethods} dataKey="amount" nameKey="method" innerRadius="55%" outerRadius="80%" paddingAngle={2}
                      label={({ method, percent }) => `${method} ${Math.round(percent * 100)}%`} labelLine={false}>
                      {data.paymentMethods.map((m, i) => <Cell key={m.method} fill={PALETTE[i]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => money(v)} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyState title="No payments in this range" />}
            </ChartCard>

            <ChartCard title="Billed revenue by source" subtitle="Consultation, lab, medicine and bed charges" icon={Wallet}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.revenueBySource.map((r) => ({ ...r, label: humanize(r.source) }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" {...axis} />
                  <YAxis tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} width={44} {...axis} />
                  <Tooltip formatter={(v) => money(v)} contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="amount" name="Amount" radius={[4, 4, 0, 0]}>
                    {data.revenueBySource.map((r, i) => <Cell key={r.source} fill={PALETTE[i % PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Appointments by department" icon={Building2} height="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byDepartment}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="department" {...axis} interval={0} angle={-30} textAnchor="end" height={70} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis allowDecimals={false} width={32} {...axis} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="appointments" name="Appointments" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completed" name="Completed" fill="#0fa394" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top diagnoses" subtitle="Completed consultations" icon={Stethoscope}>
              {data.topDiagnoses.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topDiagnoses} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" allowDecimals={false} {...axis} />
                    <YAxis type="category" dataKey="diagnosis" width={170} {...axis} tick={{ fontSize: 11, fill: '#475569' }} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                    <Bar dataKey="cases" name="Cases" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyState title="No completed consultations" />}
            </ChartCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Doctor performance" subtitle="Appointments in the selected range" icon={Activity} />
              <Table rows={data.byDoctor} rowKey="doctor" dense columns={[
                { header: 'Doctor', className: 'whitespace-nowrap', render: (r) => (<div><p className="font-medium text-slate-800">{r.doctor}</p><p className="text-xs text-slate-500">{r.department}</p></div>) },
                { header: 'Appointments', className: 'text-right', render: (r) => <span className="tabular-nums">{r.appointments}</span> },
                { header: 'Completed', className: 'text-right', render: (r) => <span className="tabular-nums">{r.completed}</span> },
                { header: 'Missed', className: 'text-right', render: (r) => <span className="tabular-nums">{r.missed}</span> },
                { header: 'Completion', render: (r) => { const pct = r.appointments ? Math.round((r.completed / r.appointments) * 100) : 0; return (<div className="flex items-center gap-2"><div className="h-2 w-16 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div><span className="w-9 text-right text-xs tabular-nums text-slate-500">{pct}%</span></div>); } },
              ]} />
            </Card>
            <Card>
              <CardHeader title="Current ward occupancy" subtitle="Live snapshot" icon={BedDouble} />
              <div className="space-y-4 px-5 py-5">
                {data.occupancy.map((w) => (
                  <div key={w.ward}>
                    <div className="mb-1 flex justify-between text-sm"><span className="font-medium text-slate-700">{w.ward}</span><span className="tabular-nums text-slate-500">{w.occupied}/{w.total} · {w.occupancyPct}%</span></div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={cx('h-full rounded-full', w.occupancyPct >= 85 ? 'bg-rose-500' : w.occupancyPct >= 60 ? 'bg-amber-500' : 'bg-brand-500')} style={{ width: `${w.occupancyPct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Daily summary" subtitle="The same table is exported by “Export CSV”" icon={BarChart3} />
            <Table rows={[...daily].reverse()} rowKey="date" dense columns={[
              { header: 'Date', render: (d) => <span className="font-medium">{fmtDate(d.date)}</span> },
              { header: 'Appointments', className: 'text-right', render: (d) => <span className="tabular-nums">{d.total}</span> },
              { header: 'Completed', className: 'text-right', render: (d) => <span className="tabular-nums">{d.completed}</span> },
              { header: 'Cancelled', className: 'text-right', render: (d) => <span className="tabular-nums">{d.cancelled}</span> },
              { header: 'No-show', className: 'text-right', render: (d) => <span className="tabular-nums">{d.noShow}</span> },
              { header: 'Cash', className: 'text-right', render: (d) => <span className="tabular-nums">{money(d.cash)}</span> },
              { header: 'Card', className: 'text-right', render: (d) => <span className="tabular-nums">{money(d.card)}</span> },
              { header: 'UPI', className: 'text-right', render: (d) => <span className="tabular-nums">{money(d.upi)}</span> },
              { header: 'Revenue', className: 'text-right', render: (d) => <span className="font-semibold tabular-nums">{money(d.revenue)}</span> },
            ]} />
          </Card>
        </>
      )}
    </div>
  );
}
