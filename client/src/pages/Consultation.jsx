import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Droplet, FlaskConical, HeartPulse, History, ListOrdered, Megaphone, Pill, Plus, Save,
  Search, Stethoscope, Thermometer, Trash2, Users, Activity, Weight, Wind, Clock3, Send,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useAuth } from '../lib/auth.jsx';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, PageHeader, Select, Spinner, StatusBadge, Textarea, cx, useToast,
} from '../components/ui.jsx';
import { addDays, fmtDate, fmtDateTime, fmtTime, money0, timeAgo, todayStr } from '../lib/format.js';

const tok = (n) => (n ? `#${String(n).padStart(2, '0')}` : '—');

// ── Empty state: no consultation in progress ─────────────────────────
function NoActiveConsultation({ doctorId, onCalled }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { data: board, loading, reload } = useApi(doctorId ? `/queue/${doctorId}` : null, null, { interval: 15000 });
  const [busy, setBusy] = useState(false);
  const callNext = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/queue/${doctorId}/call-next`);
      toast.success(`Token ${tok(r.appointment.token_no)} – ${r.appointment.patient_name}`, 'Patient called in');
      onCalled();
    } catch (err) { toast.error(err); reload({ silent: true }); } finally { setBusy(false); }
  };
  if (loading && !board) return <Spinner />;
  const waiting = board?.waiting || [];
  return (
    <div className="space-y-6">
      <PageHeader title="Consultation" subtitle="No consultation in progress. Call the next patient from your queue to begin." />
      <Card className="overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1.1fr,1fr]">
          <div className="flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-brand-50 to-white px-6 py-12 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-700 text-white shadow-sm"><Stethoscope className="h-8 w-8" /></span>
            <div>
              <p className="text-lg font-semibold text-slate-900">{waiting.length ? `${waiting.length} patient${waiting.length === 1 ? '' : 's'} waiting` : 'Your queue is empty'}</p>
              <p className="mt-1 text-sm text-slate-500">{waiting.length ? `Next: token ${tok(waiting[0].token_no)} – ${waiting[0].patient_name}${waiting[0].priority === 'URGENT' ? ' (urgent)' : ''}` : 'Patients appear here once reception checks them in.'}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="lg" icon={Megaphone} loading={busy} disabled={!waiting.length} onClick={callNext} data-testid="call-next">Call next patient</Button>
              <Button size="lg" variant="secondary" icon={ListOrdered} onClick={() => navigate('/queue')}>Open queue board</Button>
            </div>
          </div>
          <div className="border-t border-slate-100 lg:border-l lg:border-t-0">
            <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 text-center">
              {[['Waiting', board?.stats.waiting ?? 0, 'text-amber-700'], ['Served', board?.stats.served ?? 0, 'text-emerald-700'], ['Yet to arrive', board?.stats.scheduled ?? 0, 'text-sky-700']].map(([l, v, c]) => (
                <div key={l} className="px-3 py-4"><p className={cx('text-2xl font-semibold tabular-nums', c)}>{v}</p><p className="text-xs text-slate-500">{l}</p></div>
              ))}
            </div>
            {waiting.length ? (
              <ol className="divide-y divide-slate-100">
                {waiting.slice(0, 6).map((w) => (
                  <li key={w.id} className={cx('flex items-center gap-3 px-5 py-3', w.priority === 'URGENT' && 'bg-rose-50/60')}>
                    <span className={cx('rounded-md px-2 py-1 font-mono text-sm font-bold text-white', w.priority === 'URGENT' ? 'bg-rose-600' : 'bg-slate-900')}>{tok(w.token_no)}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{w.patient_name}</span><span className="block text-xs text-slate-500">{w.patient_code} · checked in {fmtTime(w.checked_in_at)}</span></span>
                    {w.priority === 'URGENT' ? <Badge color="red">Urgent</Badge> : <span className="text-xs tabular-nums text-slate-500">~{w.etaMinutes} min</span>}
                  </li>
                ))}
              </ol>
            ) : <EmptyState icon={Users} title="Nobody waiting" />}
          </div>
        </div>
      </Card>
      {board?.served?.length > 0 && (
        <Card>
          <CardHeader title="Completed today" subtitle={`${board.served.length} consultation${board.served.length === 1 ? '' : 's'}`} icon={CheckCircle2} />
          <ul className="divide-y divide-slate-100">
            {board.served.slice(0, 8).map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="font-mono text-xs font-semibold text-slate-500">{tok(a.token_no)}</span>
                <Link to={`/patients/${a.patient_id}`} className="min-w-0 flex-1 truncate text-slate-700 hover:text-brand-700 hover:underline">{a.patient_name}</Link>
                <span className="text-xs text-slate-400">{fmtTime(a.completed_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ── Prescription builder ─────────────────────────────────────────────
const FREQUENCIES = [
  ['1-0-0', 'Once daily (morning)'], ['0-0-1', 'Once daily (night)'], ['1-0-1', 'Twice daily'], ['1-1-1', 'Thrice daily'], ['1-1-1-1', 'Four times daily'], ['SOS', 'When required (SOS)'],
];
const INSTRUCTIONS = ['After food', 'Before food', 'At bedtime', 'On empty stomach', 'With plenty of water', 'Apply locally'];
const COUNTABLE = ['Tablet', 'Capsule', 'Sachet', 'Injection'];
const perDay = (f) => (f === 'SOS' ? 1 : String(f).split('-').reduce((s, x) => s + (Number(x) || 0), 0) || 1);
const defaultDosage = (form) => ({ Tablet: '1 tablet', Capsule: '1 capsule', Syrup: '10 ml', Injection: '1 injection', Ointment: 'Apply thin layer', Drops: '2 drops', Inhaler: '2 puffs', Sachet: '1 sachet in 200 ml water' }[form] || '1 unit');
const autoQty = (med, freq, days) => (COUNTABLE.includes(med?.form) ? Math.max(1, perDay(freq) * (Number(days) || 1)) : 1);
let keySeq = 0;

function stockBadge(m) {
  if (!m) return null;
  if (m.expiry_status === 'EXPIRED') return <Badge color="red">Expired</Badge>;
  if (m.stock_qty === 0) return <Badge color="red">Out of stock</Badge>;
  if (m.low_stock) return <Badge color="amber">Low · {m.stock_qty}</Badge>;
  if (m.expiry_status === 'NEAR_EXPIRY') return <Badge color="orange">Expiring</Badge>;
  return <Badge color="green">{m.stock_qty} in stock</Badge>;
}

function MedicineSearch({ medicines, onPick, exclude }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (medicines || []).filter((m) => !exclude.has(m.id) && (!t || m.name.toLowerCase().includes(t) || (m.generic_name || '').toLowerCase().includes(t))).slice(0, 10);
  }, [q, medicines, exclude]);
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input className="input pl-9" placeholder="Add medicine – search by brand or generic name…" value={q} aria-label="Search medicine" data-testid="medicine-search"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && list.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {list.map((m) => (
            <button key={m.id} type="button" onMouseDown={() => { onPick(m); setQ(''); setOpen(false); }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50">
              <Pill className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">{m.name} <span className="font-normal text-slate-500">{m.strength}</span></span>
                <span className="block truncate text-xs text-slate-500">{m.generic_name} · {m.form}</span>
              </span>
              {stockBadge(m)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PrescriptionBuilder({ consultation, items, setItems, dirty, setDirty, errors, busy, onSave }) {
  const { data: medicines } = useApi('/pharmacy/medicines');
  const medById = useMemo(() => Object.fromEntries((medicines || []).map((m) => [m.id, m])), [medicines]);
  const pr = consultation.prescription;
  const dispensed = pr?.status === 'DISPENSED';

  const update = (key, patch) => {
    setItems((list) => list.map((it) => {
      if (it.key !== key) return it;
      const next = { ...it, ...patch };
      if (!next.qtyEdited && ('frequency' in patch || 'duration_days' in patch)) next.quantity = autoQty(medById[next.medicine_id], next.frequency, next.duration_days);
      return next;
    }));
    setDirty(true);
  };
  const add = (m) => {
    setItems((list) => [...list, { key: ++keySeq, medicine_id: m.id, medicine_name: m.name, strength: m.strength, form: m.form, stock_qty: m.stock_qty, dosage: defaultDosage(m.form), frequency: '1-0-1', duration_days: 5, quantity: autoQty(m, '1-0-1', 5), instructions: 'After food', qtyEdited: false }]);
    setDirty(true);
  };
  const remove = (key) => { setItems((list) => list.filter((i) => i.key !== key)); setDirty(true); };
  const save = onSave;

  const exclude = useMemo(() => new Set(items.map((i) => i.medicine_id)), [items]);

  return (
    <Card>
      <CardHeader title="Prescription" icon={Pill}
        subtitle={dispensed ? `Dispensed ${fmtDateTime(pr.dispensed_at)} – read only` : pr ? 'Saved · pending at pharmacy' + (dirty ? ' · unsaved changes' : '') : dirty ? 'Unsaved prescription' : 'No medicines prescribed yet'}
        actions={dispensed ? <StatusBadge status="DISPENSED" /> : <Button size="sm" icon={Send} loading={busy} disabled={!dirty || !items.length} onClick={save} data-testid="save-prescription">Save prescription</Button>} />
      <div className="space-y-3 p-5">
        {!dispensed && <MedicineSearch medicines={medicines} onPick={add} exclude={exclude} />}
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">Search above to add medicines. Quantity is calculated from frequency × days.</p>
        ) : (
          <ul className="space-y-3" data-testid="rx-items">
            {items.map((it, idx) => {
              const m = medById[it.medicine_id] || { name: it.medicine_name, strength: it.strength, form: it.form, stock_qty: it.stock_qty };
              const short = m.stock_qty !== undefined && Number(it.quantity) > m.stock_qty;
              return (
                <li key={it.key} className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800">{idx + 1}</span>
                    <p className="font-medium text-slate-800">{m.name} <span className="text-sm font-normal text-slate-500">{m.strength} · {m.form}</span></p>
                    {medById[it.medicine_id] && stockBadge(medById[it.medicine_id])}
                    {short && <Badge color="amber"><AlertTriangle className="h-3 w-3" />Pharmacy has only {m.stock_qty}</Badge>}
                    {!dispensed && <button type="button" onClick={() => remove(it.key)} className="ml-auto rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${m.name}`}><Trash2 className="h-4 w-4" /></button>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
                    <Field label="Dosage" className="sm:col-span-3" error={errors[`${it.key}.dosage`]}><Input disabled={dispensed} value={it.dosage} onChange={(e) => update(it.key, { dosage: e.target.value })} error={errors[`${it.key}.dosage`]} /></Field>
                    <Field label="Frequency" className="sm:col-span-4">
                      <Select disabled={dispensed} value={it.frequency} onChange={(e) => update(it.key, { frequency: e.target.value })}>
                        {FREQUENCIES.map(([v, l]) => <option key={v} value={v}>{v} · {l}</option>)}
                        {!FREQUENCIES.some(([v]) => v === it.frequency) && <option value={it.frequency}>{it.frequency}</option>}
                      </Select>
                    </Field>
                    <Field label="Days" className="sm:col-span-2" error={errors[`${it.key}.duration_days`]}><Input disabled={dispensed} type="number" min={1} value={it.duration_days} onChange={(e) => update(it.key, { duration_days: e.target.value })} error={errors[`${it.key}.duration_days`]} /></Field>
                    <Field label="Quantity" className="sm:col-span-3" error={errors[`${it.key}.quantity`]}><Input disabled={dispensed} type="number" min={1} value={it.quantity} onChange={(e) => update(it.key, { quantity: e.target.value, qtyEdited: true })} error={errors[`${it.key}.quantity`]} /></Field>
                    <Field label="Instructions" className="col-span-2 sm:col-span-12">
                      <Input disabled={dispensed} list="rx-instructions" value={it.instructions || ''} onChange={(e) => update(it.key, { instructions: e.target.value })} />
                    </Field>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <datalist id="rx-instructions">{INSTRUCTIONS.map((i) => <option key={i} value={i} />)}</datalist>
      </div>
    </Card>
  );
}

// ── Lab ordering ─────────────────────────────────────────────────────
function LabPanel({ consultation, onOrdered }) {
  const toast = useToast();
  const { data: tests } = useApi('/lab/tests');
  const [selected, setSelected] = useState(() => new Set());
  const [priority, setPriority] = useState('ROUTINE');
  const [busy, setBusy] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const orders = consultation.labOrders || [];
  const active = new Set(orders.filter((o) => o.status !== 'CANCELLED').map((o) => o.lab_test_id));
  const grouped = useMemo(() => {
    const g = {};
    for (const t of tests || []) (g[t.category || 'Other'] ||= []).push(t);
    return Object.entries(g);
  }, [tests]);
  const total = (tests || []).filter((t) => selected.has(t.id)).reduce((s, t) => s + t.price, 0);
  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const order = async () => {
    setBusy(true);
    try {
      const res = await api.post('/lab/orders', { patient_id: consultation.patient_id, consultation_id: consultation.id, test_ids: [...selected], priority });
      toast.success(`${res.length} test${res.length === 1 ? '' : 's'} sent to the laboratory${priority === 'STAT' ? ' (STAT)' : ''}`, 'Lab tests ordered');
      setSelected(new Set()); setPriority('ROUTINE'); setShowPicker(false);
      onOrdered();
    } catch (err) { toast.error(err, 'Could not order tests'); } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader title="Laboratory" icon={FlaskConical} subtitle={orders.length ? `${orders.length} test${orders.length === 1 ? '' : 's'} ordered this visit` : 'Order investigations for this visit'}
        actions={!showPicker && <Button size="sm" variant="soft" icon={Plus} onClick={() => setShowPicker(true)} data-testid="order-labs">Order tests</Button>} />
      {showPicker && (
        <div className="space-y-4 border-b border-slate-100 p-5">
          {grouped.map(([cat, list]) => (
            <div key={cat}>
              <p className="label">{cat}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {list.map((t) => {
                  const already = active.has(t.id);
                  return (
                    <label key={t.id} className={cx('flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition', already ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400' : selected.has(t.id) ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-brand-300')}>
                      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500" disabled={already} checked={selected.has(t.id)} onChange={() => toggle(t.id)} data-testid={`lab-test-${t.code}`} />
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{t.name}</span><span className="block text-xs text-slate-500">{t.code}{already ? ' · already ordered' : ''}</span></span>
                      <span className="text-xs font-semibold tabular-nums text-slate-600">{money0(t.price)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <div className="flex rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label="Priority">
              {['ROUTINE', 'STAT'].map((p) => (
                <button key={p} type="button" role="radio" aria-checked={priority === p} onClick={() => setPriority(p)} className={cx('rounded-md px-3 py-1 text-xs font-semibold', priority === p ? (p === 'STAT' ? 'bg-rose-600 text-white' : 'bg-white text-slate-900 shadow-sm') : 'text-slate-600')}>{p === 'STAT' ? 'STAT (urgent)' : 'Routine'}</button>
              ))}
            </div>
            <span className="text-sm text-slate-600">{selected.size} selected · <span className="font-semibold">{money0(total)}</span></span>
            <span className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => { setShowPicker(false); setSelected(new Set()); }}>Cancel</Button>
            <Button size="sm" icon={FlaskConical} disabled={!selected.size} loading={busy} onClick={order} data-testid="confirm-lab-order">Send to lab</Button>
          </div>
        </div>
      )}
      {orders.length ? (
        <ul className="divide-y divide-slate-100">
          {orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <FlaskConical className="h-4 w-4 text-slate-400" />
              <span className="min-w-0 flex-1"><span className="block font-medium text-slate-800">{o.test_name}</span><span className="block text-xs text-slate-500">{o.test_code} · ordered {timeAgo(o.created_at)}</span></span>
              {o.priority === 'STAT' && <Badge color="red">STAT</Badge>}
              {o.status === 'COMPLETED' && (
                <span className={cx('text-sm font-semibold', o.is_abnormal ? 'text-rose-600' : 'text-slate-700')}>
                  {o.result_value !== null ? `${o.result_value} ${o.unit || ''}` : o.result_text}
                  {o.is_abnormal ? ' ↑↓' : ''}
                </span>
              )}
              <StatusBadge status={o.status} />
            </li>
          ))}
        </ul>
      ) : !showPicker && <p className="px-5 py-6 text-center text-sm text-slate-500">No tests ordered for this visit.</p>}
    </Card>
  );
}

// ── Workspace ────────────────────────────────────────────────────────
const NOTE_FIELDS = ['symptoms', 'bp', 'pulse', 'temperature', 'weight', 'spo2', 'diagnosis', 'notes', 'follow_up_date'];
const NUMERIC = ['pulse', 'temperature', 'weight', 'spo2'];
const COMMON_DIAGNOSES = ['Acute viral fever', 'Upper respiratory tract infection', 'Acute gastroenteritis', 'Essential hypertension', 'Type 2 diabetes mellitus', 'Migraine without aura', 'Allergic rhinitis', 'Lumbar spondylosis', 'Urinary tract infection', 'Iron deficiency anaemia', 'Atopic dermatitis', 'Acute tonsillitis'];

function toForm(c) {
  return Object.fromEntries(NOTE_FIELDS.map((f) => [f, c[f] === null || c[f] === undefined ? '' : String(c[f])]));
}
function toItems(c) {
  return (c.prescription?.items || []).map((it) => ({ key: ++keySeq, medicine_id: it.medicine_id, medicine_name: it.medicine_name, strength: it.strength, form: it.form, stock_qty: it.stock_qty, dosage: it.dosage, frequency: it.frequency, duration_days: it.duration_days, quantity: it.quantity, instructions: it.instructions || '', qtyEdited: true }));
}

function Vital({ icon: Icon, label, unit, error, ...rest }) {
  return (
    <Field label={unit ? `${label} (${unit})` : label} error={error}>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input className="pl-9" error={error} {...rest} />
      </div>
    </Field>
  );
}

function Workspace({ c, onChange, onReload }) {
  const toast = useToast();
  const [form, setForm] = useState(() => toForm(c));
  const [errors, setErrors] = useState({});
  const [dirty, setDirty] = useState(false);
  const [items, setItems] = useState(() => toItems(c));
  const [rxDirty, setRxDirty] = useState(false);
  const [rxErrors, setRxErrors] = useState({});
  const [rxBusy, setRxBusy] = useState(false);
  const [busy, setBusy] = useState(null);
  const p = c.patient;

  const saveRx = async () => {
    const e = {};
    items.forEach((it) => {
      if (!String(it.dosage).trim()) e[`${it.key}.dosage`] = 'Required';
      const days = Number(it.duration_days);
      const qty = Number(it.quantity);
      if (!Number.isInteger(days) || days < 1 || days > 365) e[`${it.key}.duration_days`] = '1–365 days';
      if (!Number.isInteger(qty) || qty < 1 || qty > 10000) e[`${it.key}.quantity`] = 'Whole number ≥ 1';
    });
    setRxErrors(e);
    if (!items.length) { toast.error('Add at least one medicine to the prescription'); return false; }
    if (Object.keys(e).length) { toast.error('Please fix the highlighted prescription fields'); return false; }
    setRxBusy(true);
    try {
      const updated = await api.put(`/consultations/${c.id}/prescription`, {
        items: items.map((it) => ({ medicine_id: it.medicine_id, dosage: String(it.dosage).trim(), frequency: it.frequency, duration_days: Number(it.duration_days), quantity: Number(it.quantity), instructions: it.instructions || null })),
      });
      toast.success(`${items.length} medicine${items.length === 1 ? '' : 's'} sent to the pharmacy`, 'Prescription saved');
      setRxDirty(false);
      onChange(updated);
      return true;
    } catch (err) { toast.error(err, 'Prescription not saved'); return false; } finally { setRxBusy(false); }
  };
  const startedRef = useRef(c.created_at);

  useEffect(() => {
    const warn = (e) => { if (dirty || rxDirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, rxDirty]);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setDirty(true); if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined })); };

  const clientErrors = () => {
    const e = {};
    if (form.bp && !/^\d{2,3}\/\d{2,3}$/.test(form.bp)) e.bp = 'Format 120/80';
    if (form.pulse && (form.pulse < 20 || form.pulse > 250)) e.pulse = '20–250';
    if (form.temperature && (form.temperature < 90 || form.temperature > 110)) e.temperature = '90–110 °F';
    if (form.spo2 && (form.spo2 < 50 || form.spo2 > 100)) e.spo2 = '50–100 %';
    if (form.weight && (form.weight < 0.5 || form.weight > 400)) e.weight = '0.5–400 kg';
    return e;
  };

  const saveNotes = async ({ quiet = false } = {}) => {
    const e = clientErrors();
    setErrors(e);
    if (Object.keys(e).length) { toast.error('Please correct the highlighted vitals'); return false; }
    const payload = {};
    for (const f of NOTE_FIELDS) payload[f] = form[f] === '' ? null : NUMERIC.includes(f) ? Number(form[f]) : form[f];
    if (payload.bp === null) payload.bp = '';
    if (payload.follow_up_date === null) payload.follow_up_date = '';
    try {
      const updated = await api.put(`/consultations/${c.id}`, payload);
      onChange(updated);
      setDirty(false);
      if (!quiet) toast.success('Consultation notes saved');
      return true;
    } catch (err) {
      if (err.details && typeof err.details === 'object') setErrors(err.details);
      toast.error(err, 'Not saved');
      return false;
    }
  };

  const onSave = async () => { setBusy('save'); await saveNotes(); setBusy(null); };

  const complete = async () => {
    if (!form.diagnosis.trim()) {
      setErrors((x) => ({ ...x, diagnosis: 'Diagnosis is required to complete the consultation' }));
      toast.error('Enter a diagnosis before completing the consultation');
      document.getElementById('diagnosis')?.focus();
      return;
    }
    setBusy('complete');
    try {
      if (!(await saveNotes({ quiet: true }))) return;
      if (rxDirty && items.length && !(await saveRx())) return;
      await api.post(`/consultations/${c.id}/complete`);
      toast.success(`${p.full_name}'s visit is complete. Consultation fee has been sent to billing.`, 'Consultation completed');
      setDirty(false); setRxDirty(false);
      onReload();
    } catch (err) {
      if (err.details && typeof err.details === 'object') setErrors((x) => ({ ...x, ...err.details }));
      toast.error(err, 'Could not complete');
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      {/* Patient header */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-brand-50/70 to-white p-5 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Token</p>
              <p className={cx('rounded-lg px-2.5 py-1 font-mono text-2xl font-bold text-white', c.priority === 'URGENT' ? 'bg-rose-600' : 'bg-slate-900')}>{tok(c.token_no)}</p>
            </div>
            <Avatar name={p.full_name} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/patients/${p.id}`} className="truncate text-lg font-semibold text-slate-900 hover:text-brand-700 hover:underline" data-testid="consult-patient">{p.full_name}</Link>
                <Badge color="teal" className="font-mono">{p.patient_code}</Badge>
                {p.blood_group && <Badge color="red"><Droplet className="h-3 w-3" />{p.blood_group}</Badge>}
                {c.priority === 'URGENT' && <Badge color="red">Urgent</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-slate-500">{p.age} y · {p.gender.toLowerCase()} · {p.phone} · started {fmtTime(startedRef.current)} ({timeAgo(startedRef.current)})</p>
              {c.visit_reason && <p className="mt-1 text-sm text-slate-700"><span className="text-slate-400">Reason for visit:</span> {c.visit_reason}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Save} loading={busy === 'save'} disabled={!dirty} onClick={onSave} data-testid="save-notes">{dirty ? 'Save notes' : 'Saved'}</Button>
            <Button variant="success" icon={CheckCircle2} loading={busy === 'complete'} onClick={complete} data-testid="complete-consultation">Complete consultation</Button>
          </div>
        </div>
        {p.allergies && (
          <div className="flex items-center gap-2 bg-amber-50 px-5 py-2.5 text-sm text-amber-900"><AlertTriangle className="h-4 w-4" /><span className="font-semibold">Allergy alert:</span> {p.allergies}</div>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr),minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Vitals & clinical notes" icon={ClipboardList} subtitle={dirty ? 'Unsaved changes' : 'All changes saved'} />
            <div className="space-y-5 p-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-5">
                <Vital icon={HeartPulse} label="BP" unit="mmHg" placeholder="120/80" value={form.bp} onChange={set('bp')} error={errors.bp} name="bp" />
                <Vital icon={Activity} label="Pulse" unit="bpm" type="number" value={form.pulse} onChange={set('pulse')} error={errors.pulse} name="pulse" />
                <Vital icon={Thermometer} label="Temperature" unit="°F" type="number" step="0.1" value={form.temperature} onChange={set('temperature')} error={errors.temperature} name="temperature" />
                <Vital icon={Wind} label="SpO₂" unit="%" type="number" value={form.spo2} onChange={set('spo2')} error={errors.spo2} name="spo2" />
                <Vital icon={Weight} label="Weight" unit="kg" type="number" step="0.1" value={form.weight} onChange={set('weight')} error={errors.weight} name="weight" />
              </div>
              <Field label="Presenting symptoms" error={errors.symptoms}>
                <Textarea rows={2} value={form.symptoms} onChange={set('symptoms')} placeholder="Chief complaints and duration…" name="symptoms" />
              </Field>
              <Field label="Diagnosis" required error={errors.diagnosis} hint="Required to complete the consultation.">
                <Input id="diagnosis" name="diagnosis" list="dx-suggestions" value={form.diagnosis} onChange={set('diagnosis')} error={errors.diagnosis} placeholder="e.g. Acute viral fever" />
                <datalist id="dx-suggestions">{COMMON_DIAGNOSES.map((d) => <option key={d} value={d} />)}</datalist>
              </Field>
              <Field label="Clinical notes & advice" error={errors.notes}>
                <Textarea rows={4} value={form.notes} onChange={set('notes')} placeholder="Examination findings, advice, plan…" name="notes" />
              </Field>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Follow-up date" error={errors.follow_up_date}>
                  <Input type="date" min={todayStr()} value={form.follow_up_date} onChange={set('follow_up_date')} className="w-44" name="follow_up_date" />
                </Field>
                <div className="flex gap-1 pb-0.5">
                  {[7, 14, 30].map((n) => (
                    <Button key={n} size="xs" variant="secondary" icon={CalendarClock} onClick={() => { setForm((f) => ({ ...f, follow_up_date: addDays(todayStr(), n) })); setDirty(true); }}>+{n}d</Button>
                  ))}
                  {form.follow_up_date && <Button size="xs" variant="ghost" onClick={() => { setForm((f) => ({ ...f, follow_up_date: '' })); setDirty(true); }}>Clear</Button>}
                </div>
              </div>
            </div>
          </Card>

          <PrescriptionBuilder consultation={c} items={items} setItems={setItems} dirty={rxDirty} setDirty={setRxDirty} errors={rxErrors} busy={rxBusy} onSave={saveRx} />
          <LabPanel consultation={c} onOrdered={() => onReload({ silent: true })} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Previous visits" icon={History} subtitle={c.previous.length ? `${c.previous.length} earlier consultation${c.previous.length === 1 ? '' : 's'}` : 'First visit'} />
            {c.previous.length ? (
              <ol className="relative space-y-0 px-5 py-4">
                {c.previous.map((v, i) => (
                  <li key={v.id} className="relative pb-5 pl-6 last:pb-0">
                    {i < c.previous.length - 1 && <span className="absolute left-[7px] top-4 h-full w-px bg-slate-200" />}
                    <span className="absolute left-0 top-1 h-[15px] w-[15px] rounded-full border-2 border-brand-500 bg-white" />
                    <p className="text-xs text-slate-500">{fmtDate(v.date)} · {v.doctor_name}</p>
                    <p className="text-sm font-semibold text-slate-800">{v.diagnosis || '—'}</p>
                    {v.symptoms && <p className="text-xs text-slate-600">{v.symptoms}</p>}
                    {v.notes && <p className="mt-0.5 text-xs italic text-slate-500">{v.notes}</p>}
                  </li>
                ))}
              </ol>
            ) : <EmptyState icon={Stethoscope} title="No previous consultations" />}
          </Card>
          <Card>
            <CardHeader title="Recent lab results" icon={FlaskConical} />
            {c.previousLabs.length ? (
              <ul className="divide-y divide-slate-100">
                {c.previousLabs.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium text-slate-700">{l.test_name}</span><span className="block text-xs text-slate-400">{l.completed_at ? fmtDate(l.completed_at) : 'pending'}</span></span>
                    {l.status === 'COMPLETED' ? (
                      <span className={cx('text-right text-sm font-semibold', l.is_abnormal ? 'text-rose-600' : 'text-slate-700')}>
                        {l.result_value !== null ? `${l.result_value} ${l.unit || ''}` : l.result_text}
                        {l.is_abnormal ? <AlertTriangle className="ml-1 inline h-3.5 w-3.5" /> : null}
                      </span>
                    ) : <StatusBadge status={l.status} />}
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon={FlaskConical} title="No earlier lab results" />}
          </Card>
          <Alert tone="info" title="Workflow">
            <span className="inline-flex items-start gap-1"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />Prescriptions go to the pharmacy and lab orders to the laboratory immediately. Completing the visit adds the consultation fee to the patient's bill.</span>
          </Alert>
        </div>
      </div>
    </div>
  );
}

export default function Consultation() {
  const { user } = useAuth();
  const { data, loading, error, reload, setData } = useApi('/consultations/current');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const current = data && data.id ? data : null;
  if (!user.doctorId) return <Alert tone="warning" title="No doctor profile">Your account is not linked to a doctor profile.</Alert>;
  if (!current) return <NoActiveConsultation doctorId={user.doctorId} onCalled={() => reload()} />;
  return <Workspace key={current.id} c={current} onChange={setData} onReload={reload} />;
}
