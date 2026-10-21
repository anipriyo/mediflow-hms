import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, BedDouble, ArrowRightLeft, LogOut, FileText, FlaskConical, Receipt, ShieldAlert, CheckCircle2, AlertTriangle, Stethoscope, CalendarClock,
  UserRound, Zap, FilePlus2,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useAuth } from '../lib/auth.jsx';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, KeyValue, Modal, Select, Spinner, StatusBadge, Table, Textarea,
  useToast, cx,
} from '../components/ui.jsx';
import { fmtDate, fmtDateTime, money, money0, age, genderShort } from '../lib/format.js';

function stayDays(a) {
  const end = a.discharged_at ? new Date(a.discharged_at) : new Date();
  return Math.max(1, Math.ceil((end.getTime() - new Date(a.admitted_at).getTime()) / 86_400_000));
}

function TransferModal({ adm, onClose, onDone }) {
  const toast = useToast();
  const { data: beds, loading } = useApi('/beds/available');
  const [bedId, setBedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const options = (beds || []).filter((b) => b.id !== adm.bed_id);
  const grouped = useMemo(() => options.reduce((acc, b) => { (acc[b.ward] = acc[b.ward] || []).push(b); return acc; }, {}), [options]);
  const submit = async () => {
    if (!bedId) { setErr('Select the new bed'); return; }
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post(`/admissions/${adm.id}/transfer`, { bed_id: Number(bedId) });
      toast.success(`Transferred to ${res.ward} ${res.bed_no}. Previous bed ${adm.bed_no} sent for cleaning.`, 'Bed transfer');
      onDone();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Transfer to another bed" subtitle={`Currently in ${adm.ward} · ${adm.bed_no}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={ArrowRightLeft} loading={busy} onClick={submit} data-testid="transfer-submit">Transfer</Button></>}>
      <div className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}
        {loading ? <Spinner /> : (
          <Field label="New bed" required hint="Only available or reserved beds are listed. Charges are kept separately for each stay.">
            <Select value={bedId} onChange={(e) => setBedId(e.target.value)} data-testid="transfer-bed">
              <option value="">Select a bed…</option>
              {Object.entries(grouped).map(([ward, list]) => (
                <optgroup key={ward} label={`${ward} (${money0(list[0].daily_rate)}/day)`}>
                  {list.map((b) => <option key={b.id} value={b.id}>{b.bed_no}{b.status === 'RESERVED' ? ' (reserved)' : ''}</option>)}
                </optgroup>
              ))}
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

function RequestDischargeModal({ adm, onClose, onDone }) {
  const toast = useToast();
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const submit = async () => {
    if (summary.trim().length < 10) { setErr('Discharge summary must be at least 10 characters'); return; }
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/admissions/${adm.id}/request-discharge`, { summary: summary.trim() });
      toast.success('Discharge requested. Bed charges have been added for billing.', 'Discharge requested');
      onDone();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} size="lg" title="Request discharge" subtitle={`${adm.patient_name} · ${adm.admission_no}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={LogOut} loading={busy} onClick={submit} data-testid="request-discharge-submit">Request discharge</Button></>}>
      <div className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}
        <Field label="Discharge summary" required hint="Condition at discharge, treatment given, medication and follow-up advice.">
          <Textarea rows={6} autoFocus value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Patient stable, afebrile for 48 hours. Continue oral antibiotics for 5 days. Review in OPD after 1 week." data-testid="discharge-summary" />
        </Field>
        <Alert tone="info">The admission moves to <b>Discharge pending</b>. Bed-day charges ({money0(adm.daily_rate)}/day, minimum 1 day) are calculated now; billing must clear the account before reception completes the discharge.</Alert>
      </div>
    </Modal>
  );
}

function OrderLabModal({ adm, onClose, onDone }) {
  const toast = useToast();
  const { data: tests, loading } = useApi('/lab/tests');
  const [selected, setSelected] = useState([]);
  const [priority, setPriority] = useState('ROUTINE');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const total = (tests || []).filter((t) => selected.includes(t.id)).reduce((s, t) => s + t.price, 0);
  const submit = async () => {
    if (!selected.length) { setErr('Select at least one test'); return; }
    setBusy(true);
    setErr(null);
    try {
      await api.post('/lab/orders', { patient_id: adm.patient_id, admission_id: adm.id, test_ids: selected, priority });
      toast.success(`${selected.length} lab test${selected.length > 1 ? 's' : ''} ordered`);
      onDone();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} size="lg" title="Order lab tests" subtitle={`For inpatient ${adm.patient_name} (${adm.admission_no})`}
      footer={<><span className="mr-auto self-center text-sm text-slate-500">{selected.length} selected · {money(total)}</span><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={FlaskConical} loading={busy} onClick={submit}>Place order</Button></>}>
      <div className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}
        <Field label="Priority">
          <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="max-w-[200px]"><option value="ROUTINE">Routine</option><option value="STAT">STAT (urgent)</option></Select>
        </Field>
        {loading ? <Spinner /> : (
          <div className="grid gap-2 sm:grid-cols-2">
            {(tests || []).map((t) => (
              <label key={t.id} className={cx('flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition', selected.includes(t.id) ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:bg-slate-50')}>
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-700" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-800">{t.name}</span>
                  <span className="block text-xs text-slate-500">{t.code} · {t.category}</span>
                </span>
                <span className="text-xs font-semibold tabular-nums text-slate-700">{money0(t.price)}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function DischargeModal({ adm, onClose, onDone }) {
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const [blocked, setBlocked] = useState(null);
  const [override, setOverride] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const submit = async () => {
    if (blocked && isAdmin && override.trim().length < 5) { setErr('Enter an override reason (at least 5 characters)'); return; }
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post(`/admissions/${adm.id}/discharge`, blocked && isAdmin ? { override_reason: override.trim() } : {});
      toast.success(`${res.patient_name} discharged. Bed ${res.bed_no} moved to cleaning.`, 'Discharge complete');
      onDone();
      onClose();
    } catch (e) {
      if (e.code === 'BILLING_NOT_CLEARED') setBlocked(e);
      else setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Complete discharge" subtitle={`${adm.patient_name} · ${adm.ward} ${adm.bed_no}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {(!blocked || isAdmin) && (
            <Button variant={blocked ? 'warning' : 'success'} icon={blocked ? ShieldAlert : CheckCircle2} loading={busy} onClick={submit} data-testid="discharge-confirm">
              {blocked ? 'Override and discharge' : 'Discharge patient'}
            </Button>
          )}
        </>
      )}>
      <div className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}
        {!blocked && <p className="text-sm text-slate-600">The system checks that every charge of this admission has been invoiced and paid. On success the admission is closed and the bed is sent for cleaning.</p>}
        {blocked && (
          <>
            <Alert tone="error" title="Discharge blocked by billing">{blocked.message}</Alert>
            {isAdmin ? (
              <Field label="Administrator override reason" required hint="The override, reason and outstanding amount are recorded in the audit trail.">
                <Textarea rows={3} autoFocus value={override} onChange={(e) => setOverride(e.target.value)} placeholder="e.g. Approved by medical superintendent – payment via insurance" data-testid="override-reason" />
              </Field>
            ) : <Alert tone="info">Ask Billing to generate the final invoice and collect payment, or request an administrator override.</Alert>}
          </>
        )}
      </div>
    </Modal>
  );
}

export default function AdmissionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const toast = useToast();
  const { data: a, loading, error, reload } = useApi(`/admissions/${id}`);
  const [modal, setModal] = useState(null);
  const [invoicing, setInvoicing] = useState(false);

  if (loading && !a) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const isDoctor = user.role === 'DOCTOR';
  const active = a.status !== 'DISCHARGED';
  const unbilledTotal = a.unbilled.reduce((s, c) => s + c.amount, 0);
  const done = () => reload({ silent: true });

  const generateInvoice = async () => {
    setInvoicing(true);
    try {
      const inv = await api.post('/billing/invoices', { patient_id: a.patient_id, admission_id: a.id });
      toast.success(`${inv.invoice_no} created for ${money(inv.total)}`, 'Invoice generated');
      navigate(`/billing/invoices/${inv.id}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setInvoicing(false);
    }
  };

  let clearanceBanner = null;
  if (a.status === 'DISCHARGED') {
    clearanceBanner = <Alert tone="success" title="Discharged">Discharged on {fmtDateTime(a.discharged_at)}.{a.override_reason ? ` Billing clearance overridden by administrator: ${a.override_reason}` : ''}</Alert>;
  } else if (a.status === 'DISCHARGE_PENDING') {
    clearanceBanner = a.clearance.allowed
      ? <Alert tone="success" title="Billing cleared">All charges are invoiced and paid. Reception can complete the discharge.</Alert>
      : <Alert tone="warning" title="Billing not cleared">{a.clearance.unbilledCount > 0 ? `${a.clearance.unbilledCount} charge(s) worth ${money(unbilledTotal)} are not yet invoiced.` : ''} {a.clearance.outstanding > 0 ? `Outstanding balance ${money(a.clearance.outstanding)}.` : ''} Discharge is blocked until cleared (administrator override possible).</Alert>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm"><Link to="/beds" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" />Beds & Admissions</Link></div>

      <Card className="p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex flex-1 items-start gap-4">
            <Avatar name={a.patient_name} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-slate-900">{a.patient_name}</h1>
                <Badge color="teal" className="font-mono">{a.admission_no}</Badge>
                <StatusBadge status={a.status} />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                <Link to={`/patients/${a.patient_id}`} className="link">{a.patient_code}</Link> · {age(a.patient_dob)} y {genderShort(a.patient_gender)} · {a.patient_phone}
              </p>
              <p className="mt-2 text-sm text-slate-700"><span className="text-slate-400">Reason:</span> {a.reason}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isDoctor && active && <Button variant="secondary" icon={FlaskConical} onClick={() => setModal('lab')}>Order lab test</Button>}
            {can('admissions:write') && a.status === 'ADMITTED' && <Button variant="secondary" icon={ArrowRightLeft} onClick={() => setModal('transfer')} data-testid="transfer-btn">Transfer bed</Button>}
            {can('admissions:request-discharge') && a.status === 'ADMITTED' && <Button icon={LogOut} onClick={() => setModal('request')} data-testid="request-discharge-btn">Request discharge</Button>}
            {can('admissions:write') && a.status === 'DISCHARGE_PENDING' && <Button variant="success" icon={CheckCircle2} onClick={() => setModal('discharge')} data-testid="discharge-btn">Complete discharge</Button>}
            {can('billing:write') && a.unbilled.length > 0 && <Button icon={FilePlus2} loading={invoicing} onClick={generateInvoice}>Generate invoice</Button>}
          </div>
        </div>
        <div className="mt-6 border-t border-slate-100 pt-5">
          <KeyValue cols={4} items={[
            ['Ward / bed', <span key="w" className="inline-flex items-center gap-1.5"><BedDouble className="h-4 w-4 text-slate-400" />{a.ward} · {a.bed_no}</span>],
            ['Attending doctor', <span key="d" className="inline-flex items-center gap-1.5"><Stethoscope className="h-4 w-4 text-slate-400" />{a.doctor_name}</span>],
            ['Admitted', fmtDateTime(a.admitted_at)],
            ['Length of stay', `${stayDays(a)} day${stayDays(a) > 1 ? 's' : ''}`],
            ['Daily rate', money0(a.daily_rate)],
            ['Discharge requested', fmtDateTime(a.discharge_requested_at)],
            ['Discharged', fmtDateTime(a.discharged_at)],
            ['Ward type', a.ward_type],
          ]} />
        </div>
      </Card>

      {clearanceBanner}

      {a.discharge_summary && (
        <Card>
          <CardHeader icon={FileText} title="Discharge summary" subtitle={a.discharge_requested_at ? `Written ${fmtDateTime(a.discharge_requested_at)}` : undefined} />
          <p className="whitespace-pre-line px-5 py-4 text-sm leading-relaxed text-slate-700">{a.discharge_summary}</p>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader icon={BedDouble} title="Bed stays" subtitle="Charged per stay at the ward's daily rate (minimum 1 day)" />
          <Table rows={a.stays} empty={<EmptyState icon={BedDouble} title="No bed stays" />} columns={[
            { header: 'Bed', render: (s) => (<div><p className="font-medium text-slate-800">{s.bed_no}</p><p className="text-xs text-slate-500">{s.ward}</p></div>) },
            { header: 'From', render: (s) => fmtDateTime(s.start_at) },
            { header: 'To', render: (s) => (s.end_at ? fmtDateTime(s.end_at) : <Badge color="violet">Current</Badge>) },
            { header: 'Days', render: (s) => <span className="tabular-nums">{s.days}</span> },
            { header: 'Amount', className: 'text-right', render: (s) => (<div className="text-right"><p className="tabular-nums font-medium">{money(s.amount)}</p><p className="text-xs text-slate-500">{s.charged ? 'charged' : 'accruing'}</p></div>) },
          ]} />
        </Card>

        <Card>
          <CardHeader icon={FlaskConical} title="Lab orders" subtitle={`${a.labOrders.length} during this admission`} />
          <Table rows={a.labOrders} empty={<EmptyState icon={FlaskConical} title="No lab orders" />} columns={[
            { header: 'Test', render: (l) => <span className="font-medium text-slate-800">{l.test_name}</span> },
            { header: 'Ordered', render: (l) => fmtDateTime(l.created_at) },
            { header: 'Priority', render: (l) => (l.priority === 'STAT' ? <Badge color="red"><Zap className="h-3 w-3" />STAT</Badge> : <Badge>Routine</Badge>) },
            { header: 'Result', render: (l) => (l.status === 'COMPLETED' ? (l.result_value !== null ? <span className={l.is_abnormal ? 'font-semibold text-rose-600' : ''}>{l.result_value}{l.is_abnormal ? ' ⚠' : ''}</span> : l.result_text) : '—') },
            { header: 'Status', render: (l) => <StatusBadge status={l.status} /> },
          ]} />
        </Card>

        <Card>
          <CardHeader icon={CalendarClock} title="Unbilled charges" subtitle={a.unbilled.length ? `${a.unbilled.length} item(s) · ${money(unbilledTotal)}` : 'Everything is invoiced'} />
          <Table rows={a.unbilled} empty={<EmptyState icon={CheckCircle2} title="No unbilled charges" />} columns={[
            { header: 'Description', render: (c) => <span className="text-sm">{c.description}</span> },
            { header: 'Type', render: (c) => <Badge>{c.source_type}</Badge> },
            { header: 'Date', render: (c) => fmtDate(c.created_at) },
            { header: 'Amount', className: 'text-right', render: (c) => <span className="tabular-nums">{money(c.amount)}</span> },
          ]} />
        </Card>

        <Card>
          <CardHeader icon={Receipt} title="Invoices" subtitle={a.clearance.outstanding > 0 ? `Outstanding ${money(a.clearance.outstanding)}` : 'No outstanding balance'} />
          <Table rows={a.invoices} onRowClick={can('billing:read') ? (i) => navigate(`/billing/invoices/${i.id}`) : undefined}
            empty={<EmptyState icon={Receipt} title="No invoices yet" message="Billing generates the final invoice after discharge is requested." />} columns={[
              { header: 'Invoice', render: (i) => <span className="whitespace-nowrap font-mono text-xs font-semibold">{i.invoice_no}</span> },
              { header: 'Date', render: (i) => fmtDate(i.created_at) },
              { header: 'Total', className: 'text-right', render: (i) => <span className="tabular-nums">{money(i.total)}</span> },
              { header: 'Balance', className: 'text-right', render: (i) => <span className={cx('tabular-nums', i.total - i.paid_amount > 0 && i.status !== 'CANCELLED' ? 'font-semibold text-rose-600' : '')}>{money(i.status === 'CANCELLED' ? 0 : i.total - i.paid_amount)}</span> },
              { header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
            ]} />
        </Card>
      </div>

      {a.status === 'ADMITTED' && !isDoctor && !can('admissions:write') && (
        <Alert tone="info"><UserRound className="mr-1 inline h-4 w-4" />Discharge is requested by the doctor, cleared by billing and completed by reception.</Alert>
      )}
      {a.override_reason && <Alert tone="warning" title="Administrator override"><AlertTriangle className="mr-1 inline h-4 w-4" />{a.override_reason}</Alert>}

      {modal === 'transfer' && <TransferModal adm={a} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'request' && <RequestDischargeModal adm={a} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'lab' && <OrderLabModal adm={a} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'discharge' && <DischargeModal adm={a} onClose={() => setModal(null)} onDone={done} />}
    </div>
  );
}
