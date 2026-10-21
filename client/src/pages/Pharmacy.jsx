import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Pill, PackagePlus, Plus, Search, AlertTriangle, CheckCircle2, PackageX, CalendarClock, Boxes, RefreshCw, HandCoins } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useAuth } from '../lib/auth.jsx';
import {
  Alert, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Modal, PageHeader, SearchInput, Select, Spinner, StatusBadge,
  Table, Tabs, useToast, cx,
} from '../components/ui.jsx';
import { fmtDate, fmtDateTime, money, todayStr, addDays } from '../lib/format.js';

const FORMS = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Drops', 'Inhaler', 'Sachet'];

// ── Prescriptions ────────────────────────────────────────────────
function PrescriptionCard({ pr, canDispense, onDispensed }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const problems = pr.items.filter((i) => i.problem);
  const dispense = async () => {
    setBusy(true);
    try {
      await api.post(`/pharmacy/prescriptions/${pr.id}/dispense`);
      toast.success(`Rx #${pr.id} dispensed to ${pr.patient_name}; stock updated and charges added`, 'Dispensed');
      onDispensed();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="flex flex-col" data-testid={`rx-${pr.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-700"><Pill className="h-4 w-4" /></span>
            <p className="font-semibold text-slate-900">Rx #{pr.id}</p>
            <StatusBadge status={pr.status} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            <Link to={`/patients/${pr.patient_id}`} className="link">{pr.patient_name}</Link> <span className="text-slate-400">({pr.patient_code})</span>
          </p>
          <p className="text-xs text-slate-500">{pr.doctor_name} · {fmtDateTime(pr.created_at)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500">{pr.status === 'DISPENSED' ? 'Billed' : 'Estimated'}</p>
          <p className="text-lg font-semibold tabular-nums text-slate-900">{money(pr.estimated_total)}</p>
        </div>
      </div>
      <ul className="flex-1 divide-y divide-slate-100">
        {pr.items.map((it) => (
          <li key={it.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-slate-800">{it.medicine_name} <span className="font-normal text-slate-500">{it.strength} · {it.form}</span></p>
              <p className="text-xs text-slate-500">{it.dosage} · {it.frequency} · {it.duration_days} days{it.instructions ? ` · ${it.instructions}` : ''}</p>
              {it.problem && <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-rose-600"><AlertTriangle className="h-3.5 w-3.5" />{it.problem}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className="font-semibold tabular-nums text-slate-800">× {it.quantity}</p>
              {pr.status === 'PENDING' && <p className={cx('text-xs', it.stock_qty >= it.quantity ? 'text-slate-500' : 'text-rose-600')}>{it.stock_qty} in stock</p>}
            </div>
          </li>
        ))}
      </ul>
      {pr.status === 'PENDING' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          {problems.length ? <span className="text-xs font-medium text-rose-600">Cannot dispense: {problems.length} item{problems.length > 1 ? 's' : ''} unavailable</span> : <span className="text-xs text-emerald-700">All items in stock</span>}
          {canDispense && (
            <Button size="sm" variant="success" icon={HandCoins} disabled={!pr.dispensable} loading={busy} onClick={dispense}
              title={pr.dispensable ? 'Dispense all items' : problems.map((p) => p.problem).join('; ')} data-testid={`dispense-${pr.id}`}>Dispense</Button>
          )}
        </div>
      ) : (
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-xs text-slate-500">Dispensed {fmtDateTime(pr.dispensed_at)} by {pr.dispensed_by_name || '—'}</div>
      )}
    </Card>
  );
}

function PrescriptionsTab({ canDispense, onChange }) {
  const [status, setStatus] = useState('PENDING');
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useApi('/pharmacy/prescriptions', { status }, { interval: 20000 });
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data || []).filter((p) => !term || `${p.patient_name} ${p.patient_code} ${p.doctor_name} ${p.id}`.toLowerCase().includes(term));
  }, [data, q]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={[{ value: 'PENDING', label: 'Pending' }, { value: 'DISPENSED', label: 'Dispensed' }]} value={status} onChange={setStatus} />
        <SearchInput icon={Search} className="w-full sm:w-72" placeholder="Filter by patient, doctor or Rx #" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter prescriptions" />
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Spinner /> : rows.length ? (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {rows.map((pr) => <PrescriptionCard key={pr.id} pr={pr} canDispense={canDispense} onDispensed={() => { reload({ silent: true }); onChange?.(); }} />)}
        </div>
      ) : (
        <Card><EmptyState icon={Pill} title={status === 'PENDING' ? 'No prescriptions waiting' : 'No dispensed prescriptions'} message={status === 'PENDING' ? 'Prescriptions issued by doctors appear here for dispensing.' : undefined} /></Card>
      )}
    </div>
  );
}

// ── Inventory ────────────────────────────────────────────────────
const EMPTY_MED = { name: '', generic_name: '', form: 'Tablet', strength: '', unit_price: '', stock_qty: '', reorder_level: '20', batch_no: '', expiry_date: '' };

function AddMedicineModal({ open, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(EMPTY_MED);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setF(EMPTY_MED); setErrors({}); } }, [open]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    const e = {};
    if (!f.name.trim()) e.name = 'Name is required';
    if (f.unit_price === '' || Number(f.unit_price) < 0) e.unit_price = 'Enter a valid price';
    if (f.stock_qty !== '' && (!Number.isInteger(Number(f.stock_qty)) || Number(f.stock_qty) < 0)) e.stock_qty = 'Whole number ≥ 0';
    if (f.expiry_date && f.expiry_date <= todayStr()) e.expiry_date = 'Must be a future date';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const m = await api.post('/pharmacy/medicines', {
        ...f,
        unit_price: Number(f.unit_price),
        stock_qty: f.stock_qty === '' ? 0 : Number(f.stock_qty),
        reorder_level: Number(f.reorder_level || 0),
        generic_name: f.generic_name || null,
        strength: f.strength || null,
        batch_no: f.batch_no || null,
        expiry_date: f.expiry_date || null,
      });
      toast.success(`${m.name} added to inventory`);
      onSaved();
      onClose();
    } catch (err) {
      if (err.details && typeof err.details === 'object') setErrors(err.details);
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Add medicine" subtitle="Create a new item in the pharmacy inventory."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Plus} loading={busy} onClick={save}>Add medicine</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Brand / name" required error={errors.name}><Input value={f.name} onChange={set('name')} error={errors.name} autoFocus /></Field>
        <Field label="Generic name"><Input value={f.generic_name} onChange={set('generic_name')} /></Field>
        <Field label="Form"><Select value={f.form} onChange={set('form')}>{FORMS.map((x) => <option key={x}>{x}</option>)}</Select></Field>
        <Field label="Strength"><Input value={f.strength} onChange={set('strength')} placeholder="e.g. 500 mg" /></Field>
        <Field label="Unit price (₹)" required error={errors.unit_price}><Input type="number" min="0" step="0.01" value={f.unit_price} onChange={set('unit_price')} error={errors.unit_price} /></Field>
        <Field label="Opening stock" error={errors.stock_qty}><Input type="number" min="0" value={f.stock_qty} onChange={set('stock_qty')} error={errors.stock_qty} /></Field>
        <Field label="Reorder level" hint="Alert when stock falls to this level"><Input type="number" min="0" value={f.reorder_level} onChange={set('reorder_level')} /></Field>
        <Field label="Batch no."><Input value={f.batch_no} onChange={set('batch_no')} /></Field>
        <Field label="Expiry date" error={errors.expiry_date}><Input type="date" min={addDays(todayStr(), 1)} value={f.expiry_date} onChange={set('expiry_date')} error={errors.expiry_date} /></Field>
      </div>
    </Modal>
  );
}

function RestockModal({ med, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ quantity: '', batch_no: '', expiry_date: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const qty = Number(f.quantity);
    if (!Number.isInteger(qty) || qty <= 0) { setErr('Quantity must be a whole number greater than 0'); return; }
    if (f.expiry_date && f.expiry_date <= todayStr()) { setErr('Cannot stock a batch that is already expired'); return; }
    setBusy(true);
    setErr(null);
    try {
      const m = await api.post(`/pharmacy/medicines/${med.id}/restock`, { quantity: qty, batch_no: f.batch_no || null, expiry_date: f.expiry_date || null });
      toast.success(`${m.name}: stock is now ${m.stock_qty}`, 'Restocked');
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} size="sm" title={`Restock ${med.name}`} subtitle={`Current stock ${med.stock_qty} · reorder level ${med.reorder_level}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={PackagePlus} loading={busy} onClick={save} data-testid="restock-save">Add stock</Button></>}>
      <div className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}
        <Field label="Quantity received" required><Input type="number" min="1" autoFocus value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} data-testid="restock-qty" /></Field>
        <Field label="New batch no." hint={med.batch_no ? `Current: ${med.batch_no}` : undefined}><Input value={f.batch_no} onChange={(e) => setF({ ...f, batch_no: e.target.value })} /></Field>
        <Field label="Expiry date of new batch" hint={med.expiry_date ? `Current: ${fmtDate(med.expiry_date)}` : undefined}><Input type="date" min={addDays(todayStr(), 1)} value={f.expiry_date} onChange={(e) => setF({ ...f, expiry_date: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function StockBar({ m }) {
  const max = Math.max(m.reorder_level * 4, m.stock_qty, 1);
  const pct = Math.min(100, Math.round((m.stock_qty / max) * 100));
  const marker = Math.min(100, Math.round((m.reorder_level / max) * 100));
  const color = m.stock_qty === 0 ? 'bg-rose-500' : m.low_stock ? 'bg-amber-500' : 'bg-brand-500';
  return (
    <div className="w-36">
      <div className="flex justify-between text-xs"><span className={cx('font-semibold tabular-nums', m.stock_qty === 0 ? 'text-rose-600' : m.low_stock ? 'text-amber-700' : 'text-slate-800')}>{m.stock_qty}</span><span className="text-slate-400">reorder {m.reorder_level}</span></div>
      <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={cx('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
        <div className="absolute inset-y-0 w-0.5 bg-slate-400" style={{ left: `${marker}%` }} />
      </div>
    </div>
  );
}

function expiryBadge(m) {
  if (m.expiry_status === 'EXPIRED') return <StatusBadge status="EXPIRED" label="Expired" />;
  if (m.expiry_status === 'NEAR_EXPIRY') return <StatusBadge status="NEAR_EXPIRY" label={`${m.days_to_expiry} days left`} />;
  if (m.expiry_status === 'OK') return <StatusBadge status="OK" label="OK" />;
  return <Badge>Unknown</Badge>;
}

function InventoryTab({ canManage }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const [restock, setRestock] = useState(null);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { data, loading, error, reload } = useApi('/pharmacy/medicines', { q: debounced || undefined, filter: filter || undefined });
  const columns = [
    { header: 'Medicine', render: (m) => (<div><p className="font-medium text-slate-800">{m.name} <span className="font-normal text-slate-500">{m.strength}</span></p><p className="text-xs text-slate-500">{m.generic_name || '—'} · {m.form}</p></div>) },
    { header: 'Stock', render: (m) => <StockBar m={m} /> },
    { header: 'Status', render: (m) => (m.stock_qty === 0 ? <StatusBadge status="OUT_OF_STOCK" label="Out of stock" /> : m.low_stock ? <StatusBadge status="LOW_STOCK" label="Low stock" /> : <StatusBadge status="OK" label="In stock" />) },
    { header: 'Batch', render: (m) => <span className="font-mono text-xs">{m.batch_no || '—'}</span> },
    { header: 'Expiry', render: (m) => (<div className="space-y-1"><p className="text-sm">{fmtDate(m.expiry_date)}</p>{expiryBadge(m)}</div>) },
    { header: 'Unit price', className: 'text-right', render: (m) => <span className="tabular-nums">{money(m.unit_price)}</span> },
  ];
  if (canManage) columns.push({ header: '', className: 'text-right', render: (m) => <Button size="sm" variant="secondary" icon={PackagePlus} onClick={() => setRestock(m)} data-testid={`restock-${m.id}`}>Restock</Button> });
  return (
    <Card>
      <CardHeader title="Medicine inventory" subtitle={data ? `${data.length} item${data.length === 1 ? '' : 's'}` : undefined} icon={Boxes}
        actions={(
          <>
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-40" aria-label="Inventory filter">
              <option value="">All items</option>
              <option value="low">Low stock</option>
              <option value="expiring">Expiring / expired</option>
            </Select>
            <SearchInput icon={Search} className="w-56" placeholder="Search medicines…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search medicines" />
            {canManage && <Button icon={Plus} onClick={() => setAdding(true)}>Add medicine</Button>}
          </>
        )} />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Spinner /> : (
        <Table rows={data} columns={columns} empty={<EmptyState icon={Pill} title="No medicines found" />} />
      )}
      <AddMedicineModal open={adding} onClose={() => setAdding(false)} onSaved={() => reload({ silent: true })} />
      {restock && <RestockModal med={restock} onClose={() => setRestock(null)} onSaved={() => reload({ silent: true })} />}
    </Card>
  );
}

// ── Alerts ───────────────────────────────────────────────────────
const ALERT_GROUPS = [
  { type: 'OUT_OF_STOCK', title: 'Out of stock', icon: PackageX, tone: 'error' },
  { type: 'EXPIRED', title: 'Expired batches', icon: AlertTriangle, tone: 'error' },
  { type: 'LOW_STOCK', title: 'Low stock', icon: Boxes, tone: 'warning' },
  { type: 'NEAR_EXPIRY', title: 'Expiring within 30 days', icon: CalendarClock, tone: 'warning' },
];

function AlertsTab({ canManage, onRestock }) {
  const { data, loading, error, reload } = useApi('/pharmacy/alerts');
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <Spinner />;
  if (!data.length) return <Card><EmptyState icon={CheckCircle2} title="No stock alerts" message="All medicines are above their reorder level and within expiry." /></Card>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {ALERT_GROUPS.map((g) => {
        const items = data.filter((a) => a.type === g.type);
        if (!items.length) return null;
        return (
          <Card key={g.type}>
            <CardHeader title={g.title} subtitle={`${items.length} item${items.length > 1 ? 's' : ''}`} icon={g.icon} />
            <ul className="divide-y divide-slate-100">
              {items.map((a) => (
                <li key={`${a.type}-${a.medicine.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">{a.medicine.name} <span className="font-normal text-slate-500">{a.medicine.strength}</span></p>
                    <p className="text-xs text-slate-500">{a.message}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={a.type} />
                    {canManage && <Button size="xs" variant="secondary" icon={PackagePlus} onClick={() => onRestock(a.medicine)}>Restock</Button>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
      <div className="lg:col-span-2"><Alert tone="info">Expired stock cannot be dispensed. Restock with a new batch and expiry date to clear the alert.</Alert></div>
    </div>
  );
}

export default function Pharmacy() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'prescriptions';
  const setTab = (t) => setParams(t === 'prescriptions' ? {} : { tab: t });
  const alerts = useApi('/pharmacy/alerts');
  const pending = useApi('/pharmacy/prescriptions', { status: 'PENDING' });
  const [restock, setRestock] = useState(null);
  const [alertsKey, setAlertsKey] = useState(0);
  const canManage = can('pharmacy:manage');
  const canSeeRx = can('prescriptions:read');

  const tabs = [
    canSeeRx && { value: 'prescriptions', label: 'Prescriptions', count: pending.data?.length },
    { value: 'inventory', label: 'Inventory' },
    { value: 'alerts', label: 'Alerts', count: alerts.data?.length },
  ].filter(Boolean);
  const active = tabs.some((t) => t.value === tab) ? tab : tabs[0].value;

  return (
    <div className="space-y-6">
      <PageHeader title="Pharmacy" subtitle={canManage ? 'Dispense prescriptions, manage stock and act on expiry alerts.' : 'Medicine availability and prescriptions (read-only).'}
        actions={<Button variant="secondary" icon={RefreshCw} onClick={() => { alerts.reload({ silent: true }); pending.reload({ silent: true }); setAlertsKey((k) => k + 1); }}>Refresh</Button>} />
      <Tabs tabs={tabs} value={active} onChange={setTab} />
      {active === 'prescriptions' && <PrescriptionsTab key={`rx-${alertsKey}`} canDispense={can('prescriptions:dispense')} onChange={() => { pending.reload({ silent: true }); alerts.reload({ silent: true }); }} />}
      {active === 'inventory' && <InventoryTab key={`inv-${alertsKey}`} canManage={canManage} />}
      {active === 'alerts' && <AlertsTab key={`al-${alertsKey}`} canManage={canManage} onRestock={setRestock} />}
      {restock && <RestockModal med={restock} onClose={() => setRestock(null)} onSaved={() => { alerts.reload({ silent: true }); setAlertsKey((k) => k + 1); }} />}
    </div>
  );
}
