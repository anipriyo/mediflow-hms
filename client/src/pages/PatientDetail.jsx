import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, Pencil, Phone, Mail, MapPin, Droplet, AlertTriangle, HeartPulse, Lock, Stethoscope, FlaskConical, BedDouble, Receipt, CalendarDays, Pill } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useAuth } from '../lib/auth.jsx';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, KeyValue, Modal, Spinner, StatusBadge, Table, Tabs, useToast, Alert } from '../components/ui.jsx';
import PatientForm, { validatePatientForm } from '../components/PatientForm.jsx';
import { fmtDate, fmtDateTime, fmtTime, money } from '../lib/format.js';

function EditPatientModal({ patient, open, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(patient);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const e = validatePatientForm(form);
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const fields = ['first_name', 'last_name', 'gender', 'dob', 'phone', 'email', 'address', 'blood_group', 'allergies', 'emergency_contact_name', 'emergency_contact_phone'];
      const p = await api.patch(`/patients/${patient.id}`, Object.fromEntries(fields.map((f) => [f, form[f] ?? ''])));
      toast.success('Patient details updated');
      onSaved(p);
      onClose();
    } catch (err) {
      if (err.details) setErrors(err.details);
      toast.error(err);
    } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={`Edit ${patient.patient_code}`} subtitle="The patient ID can never be changed."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save changes</Button></>}>
      <PatientForm value={form} onChange={setForm} errors={errors} />
    </Modal>
  );
}

export default function PatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { data, loading, error, reload, setData } = useApi(`/patients/${id}/history`);
  const [tab, setTab] = useState('visits');
  const [editing, setEditing] = useState(false);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const { patient: p, access } = data;

  const tabs = [
    { value: 'visits', label: 'Appointments', count: data.appointments.length },
    access.clinical && { value: 'consultations', label: 'Consultations', count: data.consultations.length },
    access.clinical && { value: 'prescriptions', label: 'Prescriptions', count: data.prescriptions.length },
    access.labs && { value: 'labs', label: 'Lab results', count: data.labOrders.length },
    { value: 'admissions', label: 'Admissions', count: data.admissions.length },
    access.billing && { value: 'invoices', label: 'Invoices', count: data.invoices.length },
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm"><Link to="/patients" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" />Patients</Link></div>

      <Card className="p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex flex-1 items-start gap-4">
            <Avatar name={p.full_name} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 text-xl font-semibold text-slate-900 [overflow-wrap:anywhere]">{p.full_name}</h1>
                <Badge color="teal" className="font-mono">{p.patient_code}</Badge>
                {p.blood_group && <Badge color="red"><Droplet className="h-3 w-3" />{p.blood_group}</Badge>}
              </div>
              <p className="mt-1 text-sm text-slate-500">{p.age} years · {p.gender.toLowerCase()} · born {fmtDate(p.dob)} · registered {fmtDate(p.created_at)}</p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4 text-slate-400" />{p.phone}</span>
                {p.email && <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 [overflow-wrap:anywhere]"><Mail className="h-4 w-4 shrink-0 text-slate-400" />{p.email}</span>}
                {p.address && <span className="inline-flex min-w-0 max-w-full items-start gap-1.5 [overflow-wrap:anywhere]"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{p.address}</span>}
              </div>
              {p.allergies && <Alert tone="warning" className="mt-3 inline-flex"><span className="font-semibold">Allergy:</span> {p.allergies}</Alert>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {can('patients:write') && <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>}
            {can('appointments:write') && <Button icon={CalendarPlus} onClick={() => navigate(`/appointments?book=1&patient=${p.id}`)}>Book appointment</Button>}
          </div>
        </div>
        <div className="mt-6 border-t border-slate-100 pt-5">
          <KeyValue cols={4} items={[
            ['Emergency contact', p.emergency_contact_name ? `${p.emergency_contact_name} (${p.emergency_contact_phone || '—'})` : '—'],
            ['Total visits', data.appointments.filter((a) => a.status === 'COMPLETED').length],
            ['Last visit', fmtDate(data.appointments.find((a) => a.status === 'COMPLETED')?.date)],
            ['Admissions', data.admissions.length],
          ]} />
        </div>
      </Card>

      {!access.clinical && (
        <Alert tone="info" title="Clinical details hidden"><span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" />Diagnoses, notes and prescriptions are visible only to doctors and administrators (role-based access).</span></Alert>
      )}

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      <Card>
        {tab === 'visits' && (
          <Table rows={data.appointments} empty={<EmptyState icon={CalendarDays} title="No appointments yet" />} columns={[
            { header: 'Date', render: (a) => <span className="font-medium">{fmtDate(a.date)}</span> },
            { header: 'Time', render: (a) => fmtTime(a.start_time) },
            { header: 'Doctor', render: (a) => (<div><p className="font-medium text-slate-800">{a.doctor_name}</p><p className="text-xs text-slate-500">{a.department}</p></div>) },
            { header: 'Reason', key: 'reason' },
            { header: 'Token', render: (a) => (a.token_no ? `#${a.token_no}` : '—') },
            { header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
          ]} />
        )}
        {tab === 'consultations' && (
          data.consultations.length ? (
            <ul className="divide-y divide-slate-100">
              {data.consultations.map((c) => (
                <li key={c.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stethoscope className="h-4 w-4 text-brand-600" />
                    <p className="font-medium text-slate-800">{c.diagnosis || 'Consultation in progress'}</p>
                    <StatusBadge status={c.status} />
                    <span className="ml-auto text-xs text-slate-500">{fmtDate(c.date)} · {c.doctor_name}</span>
                  </div>
                  <div className="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                    {c.symptoms && <p><span className="text-slate-400">Symptoms:</span> {c.symptoms}</p>}
                    {(c.bp || c.pulse) && <p className="inline-flex items-center gap-1"><HeartPulse className="h-3.5 w-3.5 text-rose-500" />BP {c.bp || '—'} · Pulse {c.pulse || '—'} · Temp {c.temperature || '—'}°F · SpO₂ {c.spo2 || '—'}%</p>}
                    {c.notes && <p className="sm:col-span-2"><span className="text-slate-400">Notes:</span> {c.notes}</p>}
                    {c.follow_up_date && <p><span className="text-slate-400">Follow-up:</span> {fmtDate(c.follow_up_date)}</p>}
                  </div>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={Stethoscope} title="No consultations recorded" />
        )}
        {tab === 'prescriptions' && (
          data.prescriptions.length ? (
            <ul className="divide-y divide-slate-100">
              {data.prescriptions.map((pr) => (
                <li key={pr.id} className="px-5 py-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2"><Pill className="h-4 w-4 text-brand-600" /><span className="font-medium">Rx #{pr.id}</span><StatusBadge status={pr.status} /><span className="ml-auto text-xs text-slate-500">{fmtDateTime(pr.created_at)} · {pr.doctor_name}</span></div>
                  <ul className="space-y-1 text-sm text-slate-600">
                    {pr.items.map((it) => <li key={it.id}>• <span className="font-medium text-slate-800">{it.medicine_name} {it.strength}</span> — {it.dosage}, {it.frequency} for {it.duration_days} days (qty {it.quantity}){it.instructions ? `, ${it.instructions}` : ''}</li>)}
                  </ul>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={Pill} title="No prescriptions" />
        )}
        {tab === 'labs' && (
          <Table rows={data.labOrders} empty={<EmptyState icon={FlaskConical} title="No lab tests" />} columns={[
            { header: 'Ordered', render: (l) => fmtDateTime(l.created_at) },
            { header: 'Test', render: (l) => <span className="font-medium text-slate-800">{l.test_name}</span> },
            { header: 'Result', render: (l) => (l.status === 'COMPLETED' ? (l.result_value !== null ? <span className={l.is_abnormal ? 'font-semibold text-rose-600' : ''}>{l.result_value} {l.unit}</span> : l.result_text) : '—') },
            { header: 'Reference', render: (l) => (l.ref_low !== null ? `${l.ref_low}–${l.ref_high} ${l.unit || ''}` : l.ref_text || '—') },
            { header: 'Flag', render: (l) => (l.is_abnormal ? <Badge color="red"><AlertTriangle className="h-3 w-3" />Abnormal</Badge> : l.status === 'COMPLETED' ? <Badge color="green">Normal</Badge> : '—') },
            { header: 'Status', render: (l) => <StatusBadge status={l.status} /> },
          ]} />
        )}
        {tab === 'admissions' && (
          <Table rows={data.admissions} onRowClick={can('admissions:read') ? (a) => navigate(`/admissions/${a.id}`) : undefined} empty={<EmptyState icon={BedDouble} title="No admissions" />} columns={[
            { header: 'Admission', render: (a) => <span className="font-mono text-xs font-semibold">{a.admission_no}</span> },
            { header: 'Admitted', render: (a) => fmtDateTime(a.admitted_at) },
            { header: 'Ward / Bed', render: (a) => `${a.ward} · ${a.bed_no}` },
            { header: 'Doctor', key: 'doctor_name' },
            { header: 'Reason', key: 'reason' },
            { header: 'Discharged', render: (a) => fmtDateTime(a.discharged_at) },
            { header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
          ]} />
        )}
        {tab === 'invoices' && (
          <Table rows={data.invoices} onRowClick={can('billing:read') ? (i) => navigate(`/billing/invoices/${i.id}`) : undefined} empty={<EmptyState icon={Receipt} title="No invoices" />} columns={[
            { header: 'Invoice', render: (i) => <span className="font-mono text-xs font-semibold">{i.invoice_no}</span> },
            { header: 'Date', render: (i) => fmtDate(i.created_at) },
            { header: 'Total', render: (i) => money(i.total) },
            { header: 'Paid', render: (i) => money(i.paid_amount) },
            { header: 'Balance', render: (i) => <span className={i.total - i.paid_amount > 0 ? 'font-semibold text-rose-600' : ''}>{money(i.total - i.paid_amount)}</span> },
            { header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
          ]} />
        )}
      </Card>

      {editing && <EditPatientModal patient={p} open={editing} onClose={() => setEditing(false)} onSaved={(np) => setData({ ...data, patient: np })} />}
    </div>
  );
}
