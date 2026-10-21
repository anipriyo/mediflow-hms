import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CalendarPlus, ChevronLeft, ChevronRight, Search, LogIn, CalendarClock, XCircle, UserX, CalendarDays, Stethoscope, Clock3,
  IndianRupee, DoorOpen, Check, ArrowRight, ArrowLeft,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useAuth } from '../lib/auth.jsx';
import {
  Alert, Avatar, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, SearchInput, Select, Spinner, StatusBadge, Table, Tabs, Textarea, cx, useToast,
} from '../components/ui.jsx';
import PatientPicker from '../components/PatientPicker.jsx';
import { addDays, fmtDate, fmtTime, money0, todayStr } from '../lib/format.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const workDaysLabel = (wd = '') => {
  const days = String(wd).split(',').filter(Boolean).map(Number).sort();
  if (days.length === 7) return 'All days';
  if (days.join(',') === '1,2,3,4,5,6') return 'Mon–Sat';
  if (days.join(',') === '1,2,3,4,5') return 'Mon–Fri';
  return days.map((d) => DAY_NAMES[d]).join(', ');
};

// ── Slot grid (shared by booking + reschedule) ─────────────────────
function SlotGrid({ doctorId, date, value, onChange, excludeStart }) {
  const { data, loading, error } = useApi(doctorId && date ? `/doctors/${doctorId}/slots` : null, { date });
  if (!doctorId || !date) return null;
  if (loading && !data) return <Spinner label="Loading slots…" className="py-6" />;
  if (error) return <Alert tone="error">{error.message}</Alert>;
  if (!data) return null;
  if (!data.workingDay) {
    return <Alert tone="warning" title="Doctor not available">{data.doctor.full_name} does not hold OPD on {fmtDate(date)}. Please choose another date.</Alert>;
  }
  const free = data.slots.filter((s) => s.available).length;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600"><span className="font-semibold text-slate-800">{free}</span> of {data.slots.length} slots free · {data.doctor.work_start}–{data.doctor.work_end}, {data.doctor.slot_minutes} min each</p>
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-brand-300 bg-white" />Available</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-brand-700" />Selected</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-rose-100" />Booked</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-slate-200" />Past</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6" data-testid="slot-grid">
        {data.slots.map((s) => {
          const selected = value === s.start;
          const own = excludeStart === s.start;
          const disabled = !s.available;
          return (
            <button key={s.start} type="button" disabled={disabled} onClick={() => onChange(s.start)} data-slot={s.start}
              title={s.reason === 'BOOKED' ? (own ? 'Current appointment time' : 'Already booked') : s.reason === 'PAST' ? 'This time has passed' : 'Available'}
              className={cx('rounded-lg border px-2 py-2 text-center text-sm font-medium tabular-nums transition',
                selected ? 'border-brand-700 bg-brand-700 text-white shadow-sm'
                  : s.reason === 'BOOKED' ? cx('cursor-not-allowed border-rose-100 bg-rose-50 text-rose-400 line-through', own && 'ring-2 ring-amber-300')
                    : s.reason === 'PAST' ? 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400'
                      : 'border-brand-200 bg-white text-slate-700 hover:border-brand-500 hover:bg-brand-50')}>
              {fmtTime(s.start)}
            </button>
          );
        })}
      </div>
      {free === 0 && <Alert tone="warning" className="mt-3">No free slots left on this date. Try another day.</Alert>}
    </div>
  );
}

// ── Booking wizard ─────────────────────────────────────────────────
const STEPS = ['Patient', 'Doctor', 'Date & time', 'Confirm'];

function BookAppointmentModal({ open, onClose, onBooked, initialPatientId, defaultDate }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [patient, setPatient] = useState(null);
  const [deptId, setDeptId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(defaultDate || todayStr());
  const [slot, setSlot] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: departments } = useApi(open ? '/departments' : null);
  const { data: doctors } = useApi(open ? '/doctors' : null);

  useEffect(() => {
    if (!open) return;
    setStep(0); setPatient(null); setDeptId(''); setDoctorId(''); setDate(defaultDate && defaultDate >= todayStr() ? defaultDate : todayStr()); setSlot(''); setReason('');
    if (initialPatientId) {
      api.get(`/patients/${initialPatientId}`).then((p) => { setPatient(p); setStep(1); }).catch(() => {});
    }
  }, [open, initialPatientId, defaultDate]);

  useEffect(() => setSlot(''), [doctorId, date]);

  const doctorList = useMemo(() => (doctors || []).filter((d) => !deptId || d.department_id === Number(deptId)), [doctors, deptId]);
  const doctor = (doctors || []).find((d) => d.id === Number(doctorId));
  const canNext = [Boolean(patient), Boolean(doctor), Boolean(slot), true][step];

  const book = async () => {
    setBusy(true);
    try {
      const appt = await api.post('/appointments', { patient_id: patient.id, doctor_id: doctor.id, date, start_time: slot, reason: reason.trim() || undefined });
      toast.success(`${appt.patient_name} with ${appt.doctor_name} on ${fmtDate(appt.date)} at ${fmtTime(appt.start_time)}`, 'Appointment booked');
      onBooked?.(appt);
      onClose();
    } catch (err) {
      toast.error(err, err.status === 409 ? 'Slot not available' : 'Booking failed');
      if (err.status === 409 || err.status === 400) { setStep(2); setSlot(''); }
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Book appointment" subtitle="Choose the patient, doctor and a free slot."
      footer={(
        <>
          {step > 0 && <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(step - 1)}>Back</Button>}
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {step < 3
            ? <Button disabled={!canNext} onClick={() => setStep(step + 1)} data-testid="wizard-next">Next <ArrowRight className="h-4 w-4" /></Button>
            : <Button icon={Check} loading={busy} onClick={book} data-testid="confirm-booking">Confirm booking</Button>}
        </>
      )}>
      <ol className="mb-6 flex items-center gap-2 overflow-x-auto" aria-label="Booking steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <button type="button" disabled={i > step} onClick={() => i < step && setStep(i)}
              className={cx('flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold',
                i === step ? 'bg-brand-700 text-white' : i < step ? 'bg-brand-50 text-brand-800 hover:bg-brand-100' : 'bg-slate-100 text-slate-400')}>
              <span className={cx('grid h-5 w-5 place-items-center rounded-full text-[11px]', i === step ? 'bg-white/20' : i < step ? 'bg-brand-100' : 'bg-white')}>{i < step ? <Check className="h-3 w-3" /> : i + 1}</span>
              {s}
            </button>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-slate-200" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-3">
          <Field label="Patient" required hint="Search by name, patient ID (e.g. P00012) or mobile number.">
            <PatientPicker value={patient} onChange={setPatient} autoFocus />
          </Field>
          {!patient && <p className="text-sm text-slate-500">Patient not registered yet? <Link to="/patients?new=1" className="link" onClick={onClose}>Register a new patient</Link> first.</p>}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <p className="label">Department</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setDeptId('')} className={cx('rounded-full border px-3 py-1 text-sm', !deptId ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300')}>All</button>
              {(departments || []).map((d) => (
                <button key={d.id} type="button" onClick={() => { setDeptId(String(d.id)); setDoctorId(''); }}
                  className={cx('rounded-full border px-3 py-1 text-sm', Number(deptId) === d.id ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300')}>{d.name}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="label">Doctor</p>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Doctor">
              {doctorList.map((d) => (
                <button key={d.id} type="button" role="radio" aria-checked={Number(doctorId) === d.id} onClick={() => setDoctorId(String(d.id))} data-testid={`doctor-${d.id}`}
                  className={cx('flex items-start gap-3 rounded-xl border p-3 text-left transition', Number(doctorId) === d.id ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-500/20' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50')}>
                  <Avatar name={d.full_name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{d.full_name}</span>
                    <span className="block truncate text-xs text-slate-500">{d.specialization} · {d.department}</span>
                    <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1"><IndianRupee className="h-3 w-3" />{money0(d.consultation_fee)}</span>
                      <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{d.work_start}–{d.work_end}, {workDaysLabel(d.work_days)}</span>
                      {d.room && <span className="inline-flex items-center gap-1"><DoorOpen className="h-3 w-3" />{d.room}</span>}
                    </span>
                  </span>
                  {Number(doctorId) === d.id && <Check className="h-5 w-5 text-brand-700" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 2 && doctor && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Date" required>
              <div className="flex items-center gap-1">
                <Button variant="secondary" size="sm" icon={ChevronLeft} aria-label="Previous day" disabled={date <= todayStr()} onClick={() => setDate(addDays(date, -1))} />
                <Input type="date" min={todayStr()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-44" data-testid="booking-date" />
                <Button variant="secondary" size="sm" icon={ChevronRight} aria-label="Next day" onClick={() => setDate(addDays(date, 1))} />
              </div>
            </Field>
            <p className="pb-2 text-sm text-slate-500">{doctor.full_name} · {workDaysLabel(doctor.work_days)}</p>
          </div>
          <SlotGrid doctorId={doctor.id} date={date} value={slot} onChange={setSlot} />
        </div>
      )}

      {step === 3 && patient && doctor && (
        <div className="space-y-4">
          <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2">
            <div className="flex items-center gap-3"><Avatar name={patient.full_name} /><div><p className="text-xs uppercase tracking-wide text-slate-500">Patient</p><p className="font-semibold text-slate-800">{patient.full_name}</p><p className="text-xs text-slate-500">{patient.patient_code} · {patient.age}y · {patient.phone}</p></div></div>
            <div className="flex items-center gap-3"><Avatar name={doctor.full_name} /><div><p className="text-xs uppercase tracking-wide text-slate-500">Doctor</p><p className="font-semibold text-slate-800">{doctor.full_name}</p><p className="text-xs text-slate-500">{doctor.department}{doctor.room ? ` · ${doctor.room}` : ''}</p></div></div>
            <div><p className="text-xs uppercase tracking-wide text-slate-500">When</p><p className="font-semibold text-slate-800">{fmtDate(date)} · {fmtTime(slot)}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-slate-500">Consultation fee</p><p className="font-semibold text-slate-800">{money0(doctor.consultation_fee)} <span className="text-xs font-normal text-slate-500">(billed after the visit)</span></p></div>
          </div>
          <Field label="Reason for visit" hint="Optional – helps the doctor prepare.">
            <Textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fever and cough for 3 days" data-testid="booking-reason" />
          </Field>
        </div>
      )}
    </Modal>
  );
}

// ── Reschedule / cancel modals ─────────────────────────────────────
function RescheduleModal({ appt, onClose, onDone }) {
  const toast = useToast();
  const [date, setDate] = useState(appt.date >= todayStr() ? appt.date : todayStr());
  const [slot, setSlot] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setSlot(''), [date]);
  const save = async () => {
    setBusy(true);
    try {
      const a = await api.patch(`/appointments/${appt.id}/reschedule`, { date, start_time: slot });
      toast.success(`Moved to ${fmtDate(a.date)} at ${fmtTime(a.start_time)}`, 'Appointment rescheduled');
      onDone(); onClose();
    } catch (err) { toast.error(err, 'Could not reschedule'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="xl" title="Reschedule appointment" subtitle={`${appt.patient_name} with ${appt.doctor_name} · currently ${fmtDate(appt.date)} at ${fmtTime(appt.start_time)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={CalendarClock} disabled={!slot} loading={busy} onClick={save}>Move to {slot ? fmtTime(slot) : '…'}</Button></>}>
      <div className="space-y-4">
        <Field label="New date" required>
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" icon={ChevronLeft} aria-label="Previous day" disabled={date <= todayStr()} onClick={() => setDate(addDays(date, -1))} />
            <Input type="date" min={todayStr()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-44" />
            <Button variant="secondary" size="sm" icon={ChevronRight} aria-label="Next day" onClick={() => setDate(addDays(date, 1))} />
          </div>
        </Field>
        <SlotGrid doctorId={appt.doctor_id} date={date} value={slot} onChange={setSlot} excludeStart={date === appt.date ? appt.start_time : undefined} />
      </div>
    </Modal>
  );
}

function CancelModal({ appt, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!reason.trim()) { setError('A cancellation reason is required'); return; }
    setBusy(true);
    try {
      await api.post(`/appointments/${appt.id}/cancel`, { reason: reason.trim() });
      toast.success('The slot is free to book again.', 'Appointment cancelled');
      onDone(); onClose();
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title="Cancel appointment" subtitle={`${appt.patient_name} · ${fmtDate(appt.date)} ${fmtTime(appt.start_time)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Keep appointment</Button><Button variant="danger" icon={XCircle} loading={busy} onClick={submit} data-testid="confirm-cancel">Cancel appointment</Button></>}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {['Patient requested', 'Doctor unavailable', 'Patient unwell to travel', 'Booked by mistake'].map((r) => (
            <button key={r} type="button" onClick={() => { setReason(r); setError(''); }} className={cx('rounded-full border px-3 py-1 text-xs', reason === r ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>{r}</button>
          ))}
        </div>
        <Field label="Reason" required error={error}>
          <Textarea rows={2} value={reason} onChange={(e) => { setReason(e.target.value); setError(''); }} error={error} placeholder="Why is the appointment being cancelled?" data-testid="cancel-reason" />
        </Field>
      </div>
    </Modal>
  );
}

// ── Page ───────────────────────────────────────────────────────────
const STATUS_TABS = [
  ['ALL', 'All'], ['SCHEDULED', 'Scheduled'], ['CHECKED_IN', 'Checked in'], ['IN_CONSULTATION', 'In consultation'], ['COMPLETED', 'Completed'], ['CANCELLED', 'Cancelled'], ['NO_SHOW', 'No-show'],
];

export default function Appointments() {
  const { user, can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [date, setDate] = useState(params.get('date') || todayStr());
  const [doctorId, setDoctorId] = useState(user.role === 'DOCTOR' && user.doctorId ? String(user.doctorId) : '');
  const [status, setStatus] = useState('ALL');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [booking, setBooking] = useState(params.get('book') === '1');
  const [rescheduling, setRescheduling] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { data: doctors } = useApi('/doctors');
  const { data, loading, error, reload } = useApi('/appointments', { date, doctorId: doctorId || undefined, q: debounced || undefined }, { interval: 30000 });

  const rows = useMemo(() => [...(data || [])].sort((a, b) => a.start_time.localeCompare(b.start_time) || a.doctor_name.localeCompare(b.doctor_name)), [data]);
  const counts = useMemo(() => {
    const c = { ALL: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);
  const visible = status === 'ALL' ? rows : rows.filter((r) => r.status === status);
  const isToday = date === todayStr();

  const closeBooking = () => {
    setBooking(false);
    if (params.get('book') || params.get('patient')) { params.delete('book'); params.delete('patient'); setParams(params, { replace: true }); }
  };

  const act = async (appt, fn, success) => {
    setBusyId(appt.id);
    try { const r = await fn(); if (success) toast.success(success(r)); reload({ silent: true }); } catch (err) { toast.error(err); } finally { setBusyId(null); }
  };

  return (
    <div>
      <PageHeader title="Appointments" subtitle="Book, reschedule, cancel and check in OPD appointments."
        actions={can('appointments:write') && <Button icon={CalendarPlus} onClick={() => setBooking(true)} data-testid="book-appointment">Book appointment</Button>} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Total', counts.ALL || 0, 'text-slate-900'],
          ['Scheduled', counts.SCHEDULED || 0, 'text-sky-700'],
          ['Waiting', counts.CHECKED_IN || 0, 'text-amber-700'],
          ['Completed', counts.COMPLETED || 0, 'text-emerald-700'],
          ['Cancelled / no-show', (counts.CANCELLED || 0) + (counts.NO_SHOW || 0), 'text-rose-700'],
        ].map(([label, v, cls]) => (
          <Card key={label} className="px-4 py-3"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className={cx('mt-1 text-2xl font-semibold tabular-nums', cls)}>{v}</p></Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 xl:flex-row xl:items-center">
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" icon={ChevronLeft} aria-label="Previous day" onClick={() => setDate(addDays(date, -1))} />
            <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40" aria-label="Date" data-testid="appointments-date" />
            <Button variant="secondary" size="sm" icon={ChevronRight} aria-label="Next day" onClick={() => setDate(addDays(date, 1))} />
            {!isToday && <Button variant="ghost" size="sm" onClick={() => setDate(todayStr())}>Today</Button>}
          </div>
          <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="xl:w-64" aria-label="Doctor filter">
            <option value="">All doctors</option>
            {(doctors || []).map((d) => <option key={d.id} value={d.id}>{d.full_name} — {d.department}</option>)}
          </Select>
          <SearchInput icon={Search} className="w-full xl:max-w-xs" placeholder="Patient name, ID or doctor…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search appointments" />
          <p className="text-sm text-slate-500 xl:ml-auto">{fmtDate(date)}{isToday && <Badge color="teal" className="ml-2">Today</Badge>}</p>
        </div>
        <div className="border-b border-slate-100 px-4 py-3">
          <Tabs tabs={STATUS_TABS.map(([v, l]) => ({ value: v, label: l, count: counts[v] || 0 }))} value={status} onChange={setStatus} />
        </div>
        {error ? <Alert tone="error" className="m-4">{error.message}</Alert> : loading && !data ? <Spinner /> : (
          <Table
            rows={visible}
            empty={<EmptyState icon={CalendarDays} title="No appointments" message={debounced ? `Nothing matches “${debounced}” on this day.` : `No ${status === 'ALL' ? '' : `${STATUS_TABS.find((s) => s[0] === status)[1].toLowerCase()} `}appointments on ${fmtDate(date)}.`}
              action={can('appointments:write') && <Button size="sm" icon={CalendarPlus} onClick={() => setBooking(true)}>Book appointment</Button>} />}
            columns={[
              { header: 'Time', render: (a) => <span className="whitespace-nowrap font-semibold tabular-nums text-slate-800">{fmtTime(a.start_time)}</span> },
              { header: 'Token', render: (a) => (a.token_no ? <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-xs font-bold text-white">#{String(a.token_no).padStart(2, '0')}</span> : <span className="text-slate-300">—</span>) },
              {
                header: 'Patient',
                render: (a) => (
                  <Link to={`/patients/${a.patient_id}`} className="group flex items-center gap-2.5">
                    <Avatar name={a.patient_name} size="sm" />
                    <span><span className="block font-medium text-slate-800 group-hover:text-brand-700 group-hover:underline">{a.patient_name}</span><span className="block whitespace-nowrap text-xs text-slate-500">{a.patient_code} · {a.patient_phone}</span></span>
                  </Link>
                ),
              },
              { header: 'Doctor', render: (a) => (<div><p className="font-medium text-slate-800">{a.doctor_name}</p><p className="text-xs text-slate-500">{a.department}{a.room ? ` · ${a.room}` : ''}</p></div>) },
              { header: 'Reason', render: (a) => <span className="line-clamp-2 max-w-[220px] text-slate-600">{a.status === 'CANCELLED' && a.cancel_reason ? <span className="text-rose-600">Cancelled: {a.cancel_reason}</span> : a.reason || '—'}</span> },
              { header: 'Status', render: (a) => <div className="flex flex-col items-start gap-1"><StatusBadge status={a.status} />{a.priority === 'URGENT' && <Badge color="red">Urgent</Badge>}</div> },
              {
                header: '',
                className: 'text-right',
                render: (a) => {
                  const busy = busyId === a.id;
                  const scheduled = a.status === 'SCHEDULED';
                  return (
                    <div className="flex justify-end gap-1">
                      {scheduled && a.date === todayStr() && can('queue:checkin') && (
                        <Button size="xs" variant="soft" icon={LogIn} loading={busy} data-testid={`checkin-${a.id}`}
                          onClick={() => act(a, () => api.post(`/appointments/${a.id}/check-in`), (r) => `${r.patient_name} checked in · token #${String(r.token_no).padStart(2, '0')}`)}>Check in</Button>
                      )}
                      {['CHECKED_IN', 'IN_CONSULTATION'].includes(a.status) && can('queue:read') && (
                        <Button size="xs" variant="ghost" icon={Stethoscope} onClick={() => navigate(user.role === 'DOCTOR' ? '/consultation' : `/queue?doctor=${a.doctor_id}`)}>{user.role === 'DOCTOR' ? 'Open' : 'Queue'}</Button>
                      )}
                      {scheduled && can('appointments:write') && (
                        <>
                          <Button size="xs" variant="ghost" icon={CalendarClock} aria-label="Reschedule" title="Reschedule" onClick={() => setRescheduling(a)} />
                          {a.date <= todayStr() && <Button size="xs" variant="ghost" icon={UserX} aria-label="Mark no-show" title="Mark as no-show" disabled={busy}
                            onClick={() => act(a, () => api.post(`/appointments/${a.id}/no-show`), () => 'Marked as no-show')} />}
                          <Button size="xs" variant="ghost" className="text-rose-600 hover:bg-rose-50" icon={XCircle} aria-label="Cancel appointment" title="Cancel" onClick={() => setCancelling(a)} />
                        </>
                      )}
                    </div>
                  );
                },
              },
            ]}
          />
        )}
      </Card>

      {can('appointments:write') && (
        <BookAppointmentModal open={booking} onClose={closeBooking} initialPatientId={params.get('patient')} defaultDate={date}
          onBooked={(a) => { if (a.date !== date) setDate(a.date); reload({ silent: true }); }} />
      )}
      {rescheduling && <RescheduleModal appt={rescheduling} onClose={() => setRescheduling(null)} onDone={() => reload({ silent: true })} />}
      {cancelling && <CancelModal appt={cancelling} onClose={() => setCancelling(null)} onDone={() => reload({ silent: true })} />}
    </div>
  );
}
