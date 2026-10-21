import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Receipt, IndianRupee, FileText, Wallet, Search, BedDouble, Stethoscope, FileWarning, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useAuth } from '../lib/auth.jsx';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Modal, PageHeader, SearchInput, Spinner, StatCard, StatusBadge, Table, Tabs, cx, useToast,
} from '../components/ui.jsx';
import { fmtDate, fmtDateTime, money, money0, timeAgo, humanize } from '../lib/format.js';

const SOURCE_COLORS = { CONSULTATION: 'teal', LAB: 'blue', MEDICINE: 'green', BED: 'violet', OTHER: 'gray' };

export function SourceBadge({ type }) {
  return <Badge color={SOURCE_COLORS[type] || 'gray'}>{humanize(type)}</Badge>;
}

function GenerateInvoiceModal({ target, onClose }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const { data: lines, loading, error } = useApi(target ? '/billing/unbilled' : null, target ? { patientId: target.patient_id, admissionId: target.admission_id || undefined } : null);
  const total = useMemo(() => (lines || []).reduce((s, l) => s + l.amount, 0), [lines]);

  const generate = async () => {
    setBusy(true);
    try {
      const inv = await api.post('/billing/invoices', { patient_id: target.patient_id, admission_id: target.admission_id || null });
      toast.success(`${inv.invoice_no} created for ${money(inv.total)}`, 'Invoice generated');
      navigate(`/billing/invoices/${inv.id}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(target)} onClose={onClose} size="lg" title="Generate invoice"
      subtitle={target ? `${target.patient_name} (${target.patient_code}) · ${target.admission_no ? `Admission ${target.admission_no}` : 'Outpatient charges'}` : ''}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={FileText} loading={busy} disabled={!lines?.length} onClick={generate} data-testid="confirm-generate">Generate invoice · {money(total)}</Button></>}>
      {loading ? <Spinner /> : error ? <Alert tone="error">{error.message}</Alert> : (
        <div className="space-y-4">
          {target?.admission_id && target.admission_status !== 'DISCHARGE_PENDING' && (
            <Alert tone="info" title="Interim bill">The patient is still admitted. Bed charges are added only when the doctor requests discharge, so this invoice covers charges accrued so far.</Alert>
          )}
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50"><tr><th className="th">Description</th><th className="th">Type</th><th className="th text-right">Qty</th><th className="th text-right">Rate</th><th className="th text-right">Amount</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {lines?.map((l) => (
                  <tr key={l.id}>
                    <td className="td">{l.description}<p className="text-xs text-slate-400">{fmtDateTime(l.created_at)}</p></td>
                    <td className="td"><SourceBadge type={l.source_type} /></td>
                    <td className="td text-right tabular-nums">{l.quantity}</td>
                    <td className="td text-right tabular-nums">{money(l.unit_price)}</td>
                    <td className="td text-right font-medium tabular-nums">{money(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr><td className="td font-semibold" colSpan={4}>Total ({lines?.length || 0} item{lines?.length === 1 ? '' : 's'})</td><td className="td text-right text-base font-semibold tabular-nums">{money(total)}</td></tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-slate-500">Discounts can be applied on the invoice before the first payment is recorded.</p>
        </div>
      )}
    </Modal>
  );
}

function PendingTab({ canWrite }) {
  const { data, loading, error, reload } = useApi('/billing/pending');
  const [target, setTarget] = useState(null);
  const [q, setQ] = useState('');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  // OPD bills first, then admissions awaiting discharge, then interim charges of admitted patients
  const rank = (r) => (!r.admission_id ? 0 : r.admission_status === 'DISCHARGE_PENDING' ? 1 : 2);
  const rows = (data || [])
    .filter((r) => !q || `${r.patient_name} ${r.patient_code} ${r.admission_no || ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => rank(a) - rank(b) || String(a.oldest).localeCompare(String(b.oldest)));
  return (
    <Card>
      <CardHeader title="Charges waiting to be billed" subtitle="Consultation, lab, pharmacy and bed charges are added automatically as care is delivered." icon={Wallet}
        actions={<SearchInput icon={Search} className="w-64" placeholder="Filter by patient or admission…" value={q} onChange={(e) => setQ(e.target.value)} />} />
      <Table rows={rows} rowKey={(r) => `${r.patient_id}-${r.admission_id || 'opd'}`}
        empty={<EmptyState icon={CheckCircle2} title="All charges are billed" message="New charges will appear here as consultations, tests and medicines are completed." />}
        columns={[
          { header: 'Patient', render: (r) => (<div className="flex items-center gap-3"><Avatar name={r.patient_name} size="sm" /><div><p className="font-medium text-slate-800">{r.patient_name}</p><p className="font-mono text-xs text-slate-500">{r.patient_code}</p></div></div>) },
          { header: 'Billing for', render: (r) => (r.admission_id
            ? <span className="inline-flex items-center gap-2"><BedDouble className="h-4 w-4 text-violet-500" /><span className="font-mono text-xs font-semibold">{r.admission_no}</span><StatusBadge status={r.admission_status} /></span>
            : <span className="inline-flex items-center gap-2 text-slate-600"><Stethoscope className="h-4 w-4 text-brand-600" />Outpatient (OPD)</span>) },
          { header: 'Items', render: (r) => <span className="tabular-nums">{r.items}</span> },
          { header: 'Amount', render: (r) => <span className="font-semibold tabular-nums text-slate-900">{money(r.total)}</span> },
          { header: 'Oldest charge', render: (r) => <span className="text-slate-500" title={fmtDateTime(r.oldest)}>{timeAgo(r.oldest)}</span> },
          { header: '', className: 'text-right', render: (r) => canWrite && <Button size="sm" icon={FileText} onClick={() => setTarget(r)} data-testid={`generate-${r.patient_code}`}>Generate invoice</Button> },
        ]} />
      <GenerateInvoiceModal target={target} onClose={() => setTarget(null)} />
    </Card>
  );
}

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'PARTIALLY_PAID', label: 'Partially paid' },
  { value: 'PAID', label: 'Paid' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function InvoicesTab() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { data, loading, error, reload } = useApi('/billing/invoices', { status: status || undefined, q: debounced || undefined, limit: 300 });
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button key={f.value} type="button" onClick={() => setStatus(f.value)}
              className={cx('rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition',
                status === f.value ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>
              {f.label}
            </button>
          ))}
        </div>
        <SearchInput icon={Search} className="ml-auto w-full max-w-xs" placeholder="Invoice no., patient ID or name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search invoices" />
      </div>
      {loading && !data ? <Spinner /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <Table rows={data} onRowClick={(i) => navigate(`/billing/invoices/${i.id}`)}
          empty={<EmptyState icon={Receipt} title="No invoices found" message="Try a different filter or search term." />}
          columns={[
            { header: 'Invoice', render: (i) => <span className="font-mono text-xs font-semibold text-brand-800">{i.invoice_no}</span> },
            { header: 'Date', render: (i) => fmtDate(i.created_at) },
            { header: 'Patient', render: (i) => (<div><p className="font-medium text-slate-800">{i.patient_name}</p><p className="font-mono text-xs text-slate-500">{i.patient_code}</p></div>) },
            { header: 'Type', render: (i) => (i.admission_no ? <Badge color="violet">IPD · {i.admission_no}</Badge> : <Badge color="teal">OPD</Badge>) },
            { header: 'Total', className: 'text-right', render: (i) => <span className="tabular-nums">{money(i.total)}</span> },
            { header: 'Paid', className: 'text-right', render: (i) => <span className="tabular-nums text-slate-600">{money(i.paid_amount)}</span> },
            { header: 'Balance', className: 'text-right', render: (i) => { const b = i.status === 'CANCELLED' ? 0 : i.total - i.paid_amount; return <span className={cx('tabular-nums', b > 0 ? 'font-semibold text-rose-600' : 'text-slate-400')}>{money(b)}</span>; } },
            { header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
          ]} />
      )}
    </Card>
  );
}

export default function Billing() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'invoices' ? 'invoices' : 'pending';
  const { data: dash } = useApi('/reports/dashboard');
  const { data: pending } = useApi('/billing/pending');
  const b = dash?.billing;

  return (
    <div className="space-y-6">
      <PageHeader title="Billing & Payments" subtitle="Turn unbilled charges into invoices, collect payments and print receipts." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Collected today" value={b ? money0(b.collectedToday) : '—'} hint={b ? `${b.invoicesToday} invoice(s) raised today` : ''} icon={IndianRupee} tone="emerald" />
        <StatCard label="Unpaid invoices" value={b ? b.unpaidInvoices : '—'} hint="Unpaid or partially paid" icon={FileWarning} tone="rose" onClick={() => setParams({ tab: 'invoices' })} />
        <StatCard label="Outstanding balance" value={b ? money0(b.outstanding) : '—'} hint="Across all open invoices" icon={Wallet} tone="amber" />
        <StatCard label="Patients to bill" value={pending ? new Set(pending.map((p) => p.patient_id)).size : '—'} hint={pending ? `${pending.length} billing group(s) pending` : ''} icon={Receipt} tone="sky" onClick={() => setParams({})} />
      </div>
      <Tabs value={tab} onChange={(v) => setParams(v === 'invoices' ? { tab: 'invoices' } : {})}
        tabs={[{ value: 'pending', label: 'To bill', count: pending?.length }, { value: 'invoices', label: 'Invoices' }]} />
      {tab === 'pending' ? <PendingTab canWrite={can('billing:write')} /> : <InvoicesTab />}
    </div>
  );
}
