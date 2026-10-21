import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, TestTube2, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Search, Zap, ClipboardCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useAuth } from '../lib/auth.jsx';
import {
  Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, SearchInput, Select, Spinner, StatCard, StatusBadge,
  Table, Tabs, Textarea, useToast, cx,
} from '../components/ui.jsx';
import { fmtDateTime, timeAgo, age, genderShort } from '../lib/format.js';

const STATUS_TABS = [
  { value: 'ORDERED', label: 'Awaiting sample' },
  { value: 'SAMPLE_COLLECTED', label: 'Sample collected' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function hasRange(o) {
  return o.ref_low !== null && o.ref_low !== undefined || (o.ref_high !== null && o.ref_high !== undefined);
}

function rangeText(o) {
  if (hasRange(o)) return `${o.ref_low ?? '–'} – ${o.ref_high ?? '–'}${o.unit ? ` ${o.unit}` : ''}`;
  return o.ref_text || '—';
}

function previewFlag(value, o) {
  if (value === '' || value === null || value === undefined || Number.isNaN(Number(value))) return null;
  const v = Number(value);
  if (o.ref_low !== null && o.ref_low !== undefined && v < o.ref_low) return 'LOW';
  if (o.ref_high !== null && o.ref_high !== undefined && v > o.ref_high) return 'HIGH';
  return 'NORMAL';
}

function ResultCell({ o }) {
  if (o.status !== 'COMPLETED') return <span className="text-slate-400">—</span>;
  if (o.result_value !== null && o.result_value !== undefined) {
    return (
      <div>
        <span className={cx('font-semibold tabular-nums', o.is_abnormal ? 'text-rose-600' : 'text-slate-800')}>{o.result_value}</span>
        {o.unit && <span className="ml-1 text-xs text-slate-500">{o.unit}</span>}
        <div className="mt-0.5">{o.is_abnormal ? <Badge color="red"><AlertTriangle className="h-3 w-3" />Abnormal</Badge> : <Badge color="green">Normal</Badge>}</div>
      </div>
    );
  }
  return <span className="text-sm text-slate-700">{o.result_text || '—'}</span>;
}

function ResultModal({ order, onClose, onSaved }) {
  const toast = useToast();
  const numeric = hasRange(order);
  const [value, setValue] = useState('');
  const [text, setText] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const flag = numeric ? previewFlag(value, order) : null;

  const save = async () => {
    if (numeric && (value === '' || Number.isNaN(Number(value)))) { setErr('Enter a numeric result value'); return; }
    if (!numeric && !text.trim()) { setErr('Enter the findings'); return; }
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post(`/lab/orders/${order.id}/result`, {
        result_value: numeric ? Number(value) : null,
        result_text: text.trim() || null,
        remarks: remarks.trim() || null,
      });
      toast.success(`${res.test_name}: result saved${res.is_abnormal ? ' (ABNORMAL)' : ''}`, 'Result recorded');
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Enter result – ${order.test_name}`} subtitle={`${order.patient_name} (${order.patient_code}) · ordered by ${order.doctor_name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={ClipboardCheck} loading={busy} onClick={save} data-testid="save-result">Save result</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-3">
          <div><p className="text-xs uppercase tracking-wide text-slate-500">Test code</p><p className="font-mono font-semibold text-slate-800">{order.test_code}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-slate-500">Reference</p><p className="font-medium text-slate-800">{rangeText(order)}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-slate-500">Sample collected</p><p className="font-medium text-slate-800">{fmtDateTime(order.sample_collected_at)}</p></div>
        </div>
        {err && <Alert tone="error">{err}</Alert>}
        {numeric ? (
          <Field label={<>Result value{order.unit ? <span className="normal-case tracking-normal"> ({order.unit})</span> : null}</>} required>
            <div className="flex items-center gap-3">
              <Input type="number" step="any" autoFocus value={value} onChange={(e) => setValue(e.target.value)} className="max-w-[200px]" data-testid="result-value" />
              {flag === 'NORMAL' && <Badge color="green"><CheckCircle2 className="h-3 w-3" />Within range</Badge>}
              {(flag === 'HIGH' || flag === 'LOW') && <Badge color="red"><AlertTriangle className="h-3 w-3" />Abnormal ({flag.toLowerCase()})</Badge>}
            </div>
          </Field>
        ) : null}
        <Field label={numeric ? 'Additional findings (optional)' : 'Findings'} required={!numeric}>
          <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={order.ref_text ? `e.g. ${order.ref_text}` : 'Describe findings'} data-testid="result-text" />
        </Field>
        <Field label="Remarks"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional" /></Field>
      </div>
    </Modal>
  );
}

function CancelModal({ order, onClose, onSaved }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/lab/orders/${order.id}/cancel`, { reason: reason.trim() || 'Not specified' });
      toast.success(`${order.test_name} order cancelled and charge removed`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} size="sm" title="Cancel lab order" subtitle={`${order.test_name} for ${order.patient_name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Keep order</Button><Button variant="danger" loading={busy} onClick={submit}>Cancel order</Button></>}>
      <p className="mb-3 text-sm text-slate-600">Only orders awaiting sample collection can be cancelled. The unbilled test charge will be removed.</p>
      <Field label="Reason"><Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Ordered in error" /></Field>
    </Modal>
  );
}

export default function Lab() {
  const { user, can } = useAuth();
  const toast = useToast();
  const isDoctor = user.role === 'DOCTOR';
  const canProcess = can('lab:process');
  const [status, setStatus] = useState(canProcess ? 'ORDERED' : 'COMPLETED');
  const [mine, setMine] = useState(isDoctor);
  const [q, setQ] = useState('');
  const [resultFor, setResultFor] = useState(null);
  const [cancelFor, setCancelFor] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const query = { status, doctorId: isDoctor && mine ? user.doctorId : undefined };
  const { data, loading, error, reload } = useApi('/lab/orders', query, { interval: 20000 });
  const stats = useApi('/lab/stats', { doctorId: isDoctor && mine ? user.doctorId : undefined }, { interval: 20000 });

  const refreshAll = () => { reload({ silent: true }); stats.reload({ silent: true }); };

  const rows = useMemo(() => {
    const list = data || [];
    const term = q.trim().toLowerCase();
    const filtered = term
      ? list.filter((o) => `${o.patient_name} ${o.patient_code} ${o.test_name} ${o.test_code} ${o.doctor_name}`.toLowerCase().includes(term))
      : list;
    return [...filtered].sort((a, b) => (a.priority === 'STAT' ? 0 : 1) - (b.priority === 'STAT' ? 0 : 1)
      || (status === 'COMPLETED' ? String(b.completed_at).localeCompare(String(a.completed_at)) : String(a.created_at).localeCompare(String(b.created_at))));
  }, [data, q, status]);

  const collect = async (o) => {
    setBusyId(o.id);
    try {
      await api.post(`/lab/orders/${o.id}/collect`);
      toast.success(`Sample collected for ${o.test_name} (${o.patient_code})`);
      refreshAll();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyId(null);
    }
  };

  const s = stats.data ? { ORDERED: 0, SAMPLE_COLLECTED: 0, COMPLETED: 0, CANCELLED: 0, ...stats.data } : {};
  const tabs = STATUS_TABS.map((t) => ({ ...t, count: s[t.value] ?? 0 }));
  const statCount = (data || []).filter((o) => o.priority === 'STAT').length;

  const columns = [
    { header: 'Ordered', render: (o) => (<div><p className="text-sm text-slate-800">{fmtDateTime(o.created_at)}</p><p className="text-xs text-slate-500">{timeAgo(o.created_at)}</p></div>) },
    {
      header: 'Patient',
      render: (o) => (
        <div>
          {can('patients:read') ? <Link to={`/patients/${o.patient_id}`} className="link">{o.patient_name}</Link> : <span className="font-medium">{o.patient_name}</span>}
          <p className="text-xs text-slate-500">{o.patient_code} · {age(o.patient_dob)}y {genderShort(o.patient_gender)}{o.admission_id ? ' · Inpatient' : ''}</p>
        </div>
      ),
    },
    { header: 'Test', render: (o) => (<div><p className="font-medium text-slate-800">{o.test_name}</p><p className="text-xs text-slate-500">{o.test_code} · {o.category}</p></div>) },
    { header: 'Doctor', render: (o) => <span className="text-sm">{o.doctor_name}</span> },
    { header: 'Priority', render: (o) => (o.priority === 'STAT' ? <Badge color="red"><Zap className="h-3 w-3" />STAT</Badge> : <Badge color="gray">Routine</Badge>) },
    { header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
    { header: 'Result', render: (o) => <ResultCell o={o} /> },
  ];
  if (status === 'COMPLETED') columns.push({ header: 'Reference', render: (o) => <span className="text-xs text-slate-500">{rangeText(o)}</span> });
  if (status === 'COMPLETED' || status === 'CANCELLED') columns.push({ header: 'Processed by', render: (o) => <span className="text-xs text-slate-500">{o.processed_by_name || '—'}{o.remarks ? <span className="block text-slate-400">{o.remarks}</span> : null}</span> });
  if (canProcess && (status === 'ORDERED' || status === 'SAMPLE_COLLECTED')) {
    columns.push({
      header: '',
      className: 'text-right',
      render: (o) => (
        <div className="flex justify-end gap-2">
          {o.status === 'ORDERED' && (
            <>
              <Button size="sm" className="whitespace-nowrap" icon={TestTube2} loading={busyId === o.id} onClick={() => collect(o)} data-testid={`collect-${o.id}`}>Collect sample</Button>
              <Button size="sm" variant="ghost" icon={XCircle} onClick={() => setCancelFor(o)} aria-label="Cancel order">Cancel</Button>
            </>
          )}
          {o.status === 'SAMPLE_COLLECTED' && <Button size="sm" className="whitespace-nowrap" variant="success" icon={ClipboardCheck} onClick={() => setResultFor(o)} data-testid={`result-${o.id}`}>Enter result</Button>}
        </div>
      ),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Laboratory" subtitle={canProcess ? 'Process test orders: collect samples and record results.' : 'Lab orders and results for your patients.'}
        actions={<Button variant="secondary" icon={RefreshCw} onClick={refreshAll}>Refresh</Button>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Awaiting sample" value={s.ORDERED ?? '—'} icon={FlaskConical} tone="sky" onClick={() => setStatus('ORDERED')} />
        <StatCard label="Sample collected" value={s.SAMPLE_COLLECTED ?? '—'} hint="Results pending" icon={TestTube2} tone="amber" onClick={() => setStatus('SAMPLE_COLLECTED')} />
        <StatCard label="Completed" value={s.COMPLETED ?? '—'} icon={CheckCircle2} tone="emerald" onClick={() => setStatus('COMPLETED')} />
        <StatCard label="Cancelled" value={s.CANCELLED ?? '—'} icon={XCircle} tone="slate" onClick={() => setStatus('CANCELLED')} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs tabs={tabs} value={status} onChange={setStatus} />
        <div className="flex flex-wrap items-center gap-3">
          {isDoctor && (
            <Select value={mine ? 'mine' : 'all'} onChange={(e) => setMine(e.target.value === 'mine')} className="w-44" aria-label="Filter orders">
              <option value="mine">My orders</option>
              <option value="all">All doctors</option>
            </Select>
          )}
          <SearchInput icon={Search} className="w-full sm:w-72" placeholder="Filter by patient, test or doctor…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter lab orders" />
        </div>
      </div>

      {statCount > 0 && (status === 'ORDERED' || status === 'SAMPLE_COLLECTED') && (
        <Alert tone="warning" title={`${statCount} STAT order${statCount > 1 ? 's' : ''} in this list`}>STAT orders are urgent and are shown first.</Alert>
      )}

      <Card>
        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Spinner /> : (
          <Table rows={rows} columns={columns}
            empty={<EmptyState icon={FlaskConical} title="No orders in this list" message={q ? 'No orders match your filter.' : 'New orders will appear here automatically.'} />} />
        )}
      </Card>

      {resultFor && <ResultModal order={resultFor} onClose={() => setResultFor(null)} onSaved={refreshAll} />}
      {cancelFor && <CancelModal order={cancelFor} onClose={() => setCancelFor(null)} onSaved={refreshAll} />}
    </div>
  );
}
