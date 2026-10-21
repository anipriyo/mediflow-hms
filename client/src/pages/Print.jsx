import { useParams } from 'react-router-dom';
import { Activity, Printer, X } from 'lucide-react';
import { useApi } from '../lib/useApi.js';
import { Button, ErrorState, Spinner } from '../components/ui.jsx';
import { fmtDate, fmtDateTime, money } from '../lib/format.js';

const HOSPITAL = {
  name: 'MediFlow Multispeciality Hospital',
  address: 'Kalyani, Nadia, West Bengal 741235',
  contact: 'Phone: 033-2582-0000 · billing@mediflow.local',
  gstin: 'Healthcare services – exempt from GST',
};

// ── INR amount in words (Indian numbering: crore, lakh, thousand) ──
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}

function threeDigits(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ');
}

export function numberToWordsIndian(num) {
  let n = Math.floor(Math.abs(num));
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${numberToWordsIndian(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(' ');
}

export function amountInWords(amount) {
  const value = Math.round(Number(amount || 0) * 100);
  const rupees = Math.floor(value / 100);
  const paise = value % 100;
  return `Rupees ${numberToWordsIndian(rupees)}${paise ? ` and ${twoDigits(paise)} Paise` : ''} Only`;
}

function Toolbar({ title }) {
  return (
    <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <div className="flex gap-2">
        <Button variant="secondary" icon={X} onClick={() => window.close()}>Close</Button>
        <Button icon={Printer} onClick={() => window.print()}>Print</Button>
      </div>
    </div>
  );
}

function Letterhead({ docTitle, docNo, date }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b-2 border-brand-700 pb-5">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-700 text-white"><Activity className="h-7 w-7" /></span>
        <div>
          <p className="text-lg font-bold tracking-tight text-slate-900">{HOSPITAL.name}</p>
          <p className="text-xs text-slate-600">{HOSPITAL.address}</p>
          <p className="text-xs text-slate-600">{HOSPITAL.contact}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xl font-bold uppercase tracking-wide text-brand-800">{docTitle}</p>
        <p className="mt-1 font-mono text-sm font-semibold text-slate-800">{docNo}</p>
        <p className="text-xs text-slate-500">{date}</p>
      </div>
    </div>
  );
}

function Sheet({ children }) {
  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="print-sheet mx-auto w-full max-w-[210mm] bg-white p-10 text-slate-800 shadow-lg print:p-6">{children}</div>
    </div>
  );
}

function Footer() {
  return (
    <div className="mt-10 flex items-end justify-between border-t border-slate-200 pt-4 text-xs text-slate-500">
      <div>
        <p>This is a computer-generated document; no signature is required.</p>
        <p>{HOSPITAL.gstin}. Thank you for choosing MediFlow.</p>
      </div>
      <p>Printed {fmtDateTime(new Date().toISOString())}</p>
    </div>
  );
}

export function PrintInvoice() {
  const { id } = useParams();
  const { data: inv, loading, error } = useApi(`/billing/invoices/${id}`);
  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} />;
  const p = inv.patient;
  const balance = inv.status === 'CANCELLED' ? 0 : inv.balance;
  return (
    <>
      <Toolbar title={`Invoice ${inv.invoice_no}`} />
      <Sheet>
        <Letterhead docTitle={inv.status === 'CANCELLED' ? 'Invoice (Cancelled)' : 'Invoice / Bill'} docNo={inv.invoice_no} date={`Date: ${fmtDate(inv.created_at)}`} />
        <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billed to</p>
            <p className="mt-1 font-semibold text-slate-900">{p.full_name}</p>
            <p>Patient ID: <span className="font-mono">{p.patient_code}</span></p>
            <p>{p.age} years · {p.gender.toLowerCase()} · {p.phone}</p>
            {p.address && <p className="text-slate-600">{p.address}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Details</p>
            <p className="mt-1">Type: {inv.admission_no ? `Inpatient (${inv.admission_no})` : 'Outpatient'}</p>
            <p>Status: <span className="font-semibold">{inv.status.replace('_', ' ')}</span></p>
            {inv.created_by_name && <p>Prepared by: {inv.created_by_name}</p>}
          </div>
        </div>

        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-slate-300 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <th className="px-2 py-2">#</th><th className="px-2 py-2">Description</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Rate</th><th className="px-2 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((l, i) => (
              <tr key={l.id} className="border-b border-slate-100">
                <td className="px-2 py-2 text-slate-500">{i + 1}</td>
                <td className="px-2 py-2">{l.description}</td>
                <td className="px-2 py-2 text-right tabular-nums">{l.quantity}</td>
                <td className="px-2 py-2 text-right tabular-nums">{money(l.unit_price)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <table className="w-72 text-sm">
            <tbody>
              <tr><td className="py-1 text-slate-600">Subtotal</td><td className="py-1 text-right tabular-nums">{money(inv.subtotal)}</td></tr>
              {inv.discount_amount > 0 && <tr><td className="py-1 text-slate-600">Discount ({inv.discount_pct}%)</td><td className="py-1 text-right tabular-nums">− {money(inv.discount_amount)}</td></tr>}
              <tr className="border-t border-slate-300 font-semibold"><td className="py-1.5">Total</td><td className="py-1.5 text-right tabular-nums">{money(inv.total)}</td></tr>
              <tr><td className="py-1 text-slate-600">Amount paid</td><td className="py-1 text-right tabular-nums">{money(inv.paid_amount)}</td></tr>
              <tr className="font-semibold"><td className="py-1">Balance due</td><td className="py-1 text-right tabular-nums">{money(balance)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm"><span className="font-semibold">Amount in words:</span> {amountInWords(inv.total)}</p>
        {inv.discount_reason && <p className="mt-2 text-xs text-slate-500">Discount reason: {inv.discount_reason}</p>}

        {inv.payments.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payments received</p>
            <table className="mt-2 w-full text-sm">
              <tbody>
                {inv.payments.map((pay) => (
                  <tr key={pay.id} className="border-b border-slate-100">
                    <td className="py-1.5 font-mono text-xs">{pay.receipt_no}</td>
                    <td className="py-1.5">{fmtDateTime(pay.created_at)}</td>
                    <td className="py-1.5">{pay.method}{pay.reference ? ` (${pay.reference})` : ''}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(pay.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Footer />
      </Sheet>
    </>
  );
}

export function PrintReceipt() {
  const { id } = useParams();
  const { data: r, loading, error } = useApi(`/billing/receipts/${id}`);
  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} />;
  return (
    <>
      <Toolbar title={`Receipt ${r.receipt_no}`} />
      <Sheet>
        <Letterhead docTitle="Payment Receipt" docNo={r.receipt_no} date={fmtDateTime(r.created_at)} />
        <div className="mt-8 space-y-4 text-sm">
          <p className="text-base leading-relaxed">
            Received with thanks from <span className="font-semibold">{r.patient_name}</span> (Patient ID <span className="font-mono">{r.patient_code}</span>)
            the sum of <span className="font-semibold">{money(r.amount)}</span> by <span className="font-semibold">{r.method}</span>
            {r.reference ? <> (ref. <span className="font-mono">{r.reference}</span>)</> : null} towards invoice <span className="font-mono font-semibold">{r.invoice_no}</span>.
          </p>
          <p className="rounded-md bg-slate-50 px-3 py-2"><span className="font-semibold">Amount in words:</span> {amountInWords(r.amount)}</p>
          <table className="mt-4 w-80 text-sm">
            <tbody>
              <tr><td className="py-1 text-slate-600">Invoice total</td><td className="py-1 text-right tabular-nums">{money(r.total)}</td></tr>
              <tr><td className="py-1 text-slate-600">This payment</td><td className="py-1 text-right font-semibold tabular-nums">{money(r.amount)}</td></tr>
              <tr><td className="py-1 text-slate-600">Total paid to date</td><td className="py-1 text-right tabular-nums">{money(r.paid_until_this ?? r.paid_amount)}</td></tr>
              <tr className="border-t border-slate-300 font-semibold"><td className="py-1.5">Balance after this payment</td><td className="py-1.5 text-right tabular-nums">{money(r.balance_after)}</td></tr>
            </tbody>
          </table>
          <p className="text-slate-600">Received by: {r.received_by_name || '—'}</p>
        </div>
        <Footer />
      </Sheet>
    </>
  );
}
