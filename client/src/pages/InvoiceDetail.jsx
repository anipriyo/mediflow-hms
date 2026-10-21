import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, CreditCard, Percent, Ban, ReceiptText, CheckCircle2, BedDouble, User } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useAuth } from '../lib/auth.jsx';
import {
  Alert, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, KeyValue, Modal, Spinner, StatusBadge, Textarea, cx, useToast,
} from '../components/ui.jsx';
import { fmtDate, fmtDateTime, money } from '../lib/format.js';
import { SourceBadge } from './Billing.jsx';

const METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CARD', label: 'Card' },
];

function PaymentModal({ invoice, open, onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({ amount: String(invoice.balance), method: 'CASH', reference: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const submit = async () => {
    setError(null);
    const amount = Number(form.amount);
    if (!form.amount || Number.isNaN(amount) || amount <= 0) { setError('Enter an amount greater than zero'); return; }
    if (form.method !== 'CASH' && !form.reference.trim()) { setError(`A transaction reference is required for ${form.method} payments`); return; }
    setBusy(true);
    try {
      const res = await api.post(`/billing/invoices/${invoice.id}/payments`, { amount, method: form.method, reference: form.reference.trim() || null });
      setReceipt(res.receipt);
      toast.success(`Receipt ${res.receipt.receipt_no} · ${money(amount)}`, 'Payment recorded');
      onDone(res.invoice);
    } catch (e) {
      setError(e.message); // e.g. "Payment exceeds the outstanding balance of ₹…"
    } finally {
      setBusy(false);
    }
  };

  const close = () => { setReceipt(null); setError(null); onClose(); };

  if (receipt) {
    return (
      <Modal open={open} onClose={close} size="sm" title="Payment recorded"
        footer={<><Button variant="secondary" onClick={close}>Done</Button><Button icon={Printer} onClick={() => window.open(`/print/receipt/${receipt.id}`, '_blank')}>Print receipt</Button></>}>
        <div className="flex flex-col items-center py-2 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-7 w-7" /></span>
          <p className="mt-3 text-lg font-semibold text-slate-900">{money(receipt.amount)}</p>
          <p className="text-sm text-slate-500">received by {receipt.method}{receipt.reference ? ` · ${receipt.reference}` : ''}</p>
          <p className="mt-3 font-mono text-sm font-semibold text-brand-800" data-testid="receipt-no">{receipt.receipt_no}</p>
          <p className="mt-1 text-sm text-slate-500">Balance after payment: <span className="font-medium text-slate-800">{money(receipt.balance_after)}</span></p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={close} size="sm" title="Record payment" subtitle={`${invoice.invoice_no} · balance ${money(invoice.balance)}`}
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button variant="success" icon={CreditCard} loading={busy} onClick={submit} data-testid="submit-payment">Record payment</Button></>}>
      <div className="space-y-4">
        {error && <Alert tone="error" title="Payment not accepted">{error}</Alert>}
        <Field label="Amount (₹)" required hint={`Outstanding balance: ${money(invoice.balance)}. Partial payments are allowed.`}>
          <Input name="amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </Field>
        <div>
          <span className="label" id="pay-method-label">Payment method<span className="text-rose-500"> *</span></span>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="pay-method-label">
            {METHODS.map((m) => (
              <button key={m.value} type="button" role="radio" aria-checked={form.method === m.value} onClick={() => setForm({ ...form, method: m.value })}
                className={cx('rounded-lg border px-3 py-2 text-sm font-medium transition', form.method === m.value ? 'border-brand-500 bg-brand-50 text-brand-800 ring-2 ring-brand-500/20' : 'border-slate-300 text-slate-600 hover:bg-slate-50')}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {form.method !== 'CASH' && (
          <Field label={form.method === 'UPI' ? 'UPI transaction ID' : 'Card transaction / approval no.'} required>
            <Input name="reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder={form.method === 'UPI' ? 'e.g. 4321 8765 1122' : 'e.g. TXN882134'} />
          </Field>
        )}
      </div>
    </Modal>
  );
}

function DiscountModal({ invoice, open, onClose, onDone }) {
  const toast = useToast();
  const [pct, setPct] = useState(String(invoice.discount_pct || 10));
  const [reason, setReason] = useState(invoice.discount_reason || '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const preview = Math.round(invoice.subtotal * (Number(pct) || 0)) / 100;
  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const inv = await api.post(`/billing/invoices/${invoice.id}/discount`, { discount_pct: Number(pct), reason });
      toast.success(`${pct}% discount applied`);
      onDone(inv);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Apply discount" subtitle="Allowed only before any payment, maximum 50%."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Percent} loading={busy} onClick={submit}>Apply discount</Button></>}>
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Discount (%)" required hint={`Discount amount: ${money(preview)} · new total ${money(invoice.subtotal - preview)}`}>
          <Input type="number" min="0" max="50" step="0.5" value={pct} onChange={(e) => setPct(e.target.value)} />
        </Field>
        <Field label="Reason" required><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Senior citizen concession" /></Field>
      </div>
    </Modal>
  );
}

function CancelModal({ invoice, open, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const inv = await api.post(`/billing/invoices/${invoice.id}/cancel`, { reason });
      toast.success(`${inv.invoice_no} cancelled; its charges can be billed again`);
      onDone(inv);
      onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="sm" title={`Cancel ${invoice.invoice_no}?`}
      footer={<><Button variant="secondary" onClick={onClose}>Keep invoice</Button><Button variant="danger" icon={Ban} loading={busy} onClick={submit}>Cancel invoice</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">The charges on this invoice will be released and can be included in a new invoice.</p>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Reason" required><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong patient selected" /></Field>
      </div>
    </Modal>
  );
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data: inv, loading, error, reload, setData } = useApi(`/billing/invoices/${id}`);
  const [modal, setModal] = useState(null);

  if (loading && !inv) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const writable = can('billing:write');
  const open = inv.status === 'UNPAID' || inv.status === 'PARTIALLY_PAID';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm"><Link to="/billing?tab=invoices" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" />Invoices</Link></div>

      <Card className="p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <ReceiptText className="h-5 w-5 text-brand-700" />
              <h1 className="font-mono text-xl font-semibold text-slate-900" data-testid="invoice-no">{inv.invoice_no}</h1>
              <span data-testid="invoice-status"><StatusBadge status={inv.status} /></span>
              {inv.admission_no ? <Badge color="violet"><BedDouble className="h-3 w-3" />{inv.admission_no}</Badge> : <Badge color="teal">OPD</Badge>}
            </div>
            <p className="mt-1 text-sm text-slate-500">Issued {fmtDateTime(inv.created_at)}{inv.created_by_name ? ` by ${inv.created_by_name}` : ''}</p>
            <p className="mt-3 inline-flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-slate-400" />
              <Link className="link" to={`/patients/${inv.patient_id}`}>{inv.patient_name}</Link>
              <span className="font-mono text-xs text-slate-500">{inv.patient_code}</span>
              <span className="text-slate-400">·</span><span className="text-slate-600">{inv.patient_phone}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Printer} onClick={() => window.open(`/print/invoice/${inv.id}`, '_blank')}>Print invoice</Button>
            {writable && inv.status === 'UNPAID' && <Button variant="secondary" icon={Percent} onClick={() => setModal('discount')}>Discount</Button>}
            {writable && inv.status === 'UNPAID' && inv.paid_amount === 0 && <Button variant="secondary" icon={Ban} onClick={() => setModal('cancel')}>Cancel</Button>}
            {writable && open && <Button variant="success" icon={CreditCard} onClick={() => setModal('pay')} data-testid="record-payment">Record payment</Button>}
          </div>
        </div>
        <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-4">
          {[['Invoice total', money(inv.total), 'text-slate-900'], ['Paid', money(inv.paid_amount), 'text-emerald-700'], ['Balance due', money(inv.status === 'CANCELLED' ? 0 : inv.balance), inv.balance > 0 && inv.status !== 'CANCELLED' ? 'text-rose-600' : 'text-slate-900'], ['Payments', inv.payments.length, 'text-slate-900']].map(([l, v, c]) => (
            <div key={l}><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{l}</p><p className={cx('mt-1 text-xl font-semibold tabular-nums', c)} data-testid={l === 'Balance due' ? 'invoice-balance' : undefined}>{v}</p></div>
          ))}
        </div>
      </Card>

      {inv.status === 'CANCELLED' && <Alert tone="warning" title="This invoice was cancelled">{inv.notes}</Alert>}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Line items" subtitle={`${inv.items.length} charge(s)`} icon={ReceiptText} />
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/80"><tr><th className="th">Description</th><th className="th">Type</th><th className="th text-right">Qty</th><th className="th text-right">Rate</th><th className="th text-right">Amount</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {inv.items.length === 0 && (
                  <tr><td className="td text-center text-slate-500" colSpan={5}>{inv.status === 'CANCELLED' ? 'The charges of this cancelled invoice were released back to the billing queue.' : 'No line items.'}</td></tr>
                )}
                {inv.items.map((l) => (
                  <tr key={l.id}>
                    <td className="td">{l.description}</td>
                    <td className="td"><SourceBadge type={l.source_type} /></td>
                    <td className="td text-right tabular-nums">{l.quantity}</td>
                    <td className="td text-right tabular-nums">{money(l.unit_price)}</td>
                    <td className="td text-right font-medium tabular-nums">{money(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ml-auto max-w-sm space-y-2 border-t border-slate-100 px-5 py-4 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="tabular-nums">{money(inv.subtotal)}</span></div>
            {inv.discount_amount > 0 && (
              <div className="flex justify-between text-emerald-700"><span>Discount ({inv.discount_pct}%){inv.discount_reason ? <span className="block text-xs text-slate-500">{inv.discount_reason}</span> : null}</span><span className="tabular-nums">− {money(inv.discount_amount)}</span></div>
            )}
            <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-semibold"><span>Total</span><span className="tabular-nums">{money(inv.total)}</span></div>
            <div className="flex justify-between text-slate-600"><span>Paid</span><span className="tabular-nums">{money(inv.paid_amount)}</span></div>
            <div className="flex justify-between font-semibold"><span>Balance</span><span className={cx('tabular-nums', inv.balance > 0 && inv.status !== 'CANCELLED' && 'text-rose-600')}>{money(inv.status === 'CANCELLED' ? 0 : inv.balance)}</span></div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Payments" subtitle="Each payment has its own receipt" icon={CreditCard} />
          {inv.payments.length ? (
            <ul className="divide-y divide-slate-100">
              {inv.payments.map((p) => (
                <li key={p.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-brand-800">{p.receipt_no}</span>
                    <span className="font-semibold tabular-nums text-slate-900">{money(p.amount)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span><Badge color={p.method === 'CASH' ? 'green' : p.method === 'UPI' ? 'violet' : 'blue'}>{p.method}</Badge>{p.reference ? <span className="ml-1.5">{p.reference}</span> : null}</span>
                    <span>{fmtDateTime(p.created_at)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span>Received by {p.received_by_name || '—'}</span>
                    <button type="button" className="link inline-flex items-center gap-1" onClick={() => window.open(`/print/receipt/${p.id}`, '_blank')}><Printer className="h-3.5 w-3.5" />Receipt</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={CreditCard} title="No payments yet" message={open ? 'Record a full or partial payment.' : undefined} />}
          <div className="border-t border-slate-100 px-5 py-4">
            <KeyValue items={[['Invoice date', fmtDate(inv.created_at)], ['Patient ID', inv.patient_code]]} />
          </div>
        </Card>
      </div>

      {modal === 'pay' && <PaymentModal invoice={inv} open onClose={() => setModal(null)} onDone={setData} />}
      {modal === 'discount' && <DiscountModal invoice={inv} open onClose={() => setModal(null)} onDone={setData} />}
      {modal === 'cancel' && <CancelModal invoice={inv} open onClose={() => setModal(null)} onDone={setData} />}
    </div>
  );
}
