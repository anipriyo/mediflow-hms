import { useEffect, useMemo, useState } from 'react';
import { Building2, Plus, Pencil, Search, Stethoscope, Clock3, DoorOpen, IndianRupee, GraduationCap } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import {
  Alert, Avatar, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, SearchInput, Select, Spinner, Textarea, cx, useToast,
} from '../components/ui.jsx';
import { fmtTime, money0 } from '../lib/format.js';

const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
const parseDays = (s) => String(s || '').split(',').filter(Boolean).map(Number);

function DayChips({ value, onChange }) {
  const set = new Set(parseDays(value));
  return (
    <div className="flex flex-wrap gap-1.5">
      {DAYS.map(([n, label]) => {
        const on = set.has(n);
        return (
          <button key={n} type="button" disabled={!onChange} aria-pressed={on}
            onClick={() => { const s = new Set(set); if (on) s.delete(n); else s.add(n); onChange([...s].sort((a, b) => a - b).join(',')); }}
            className={cx('rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset transition', on ? 'bg-brand-50 text-brand-800 ring-brand-200' : 'bg-white text-slate-400 ring-slate-200',
              onChange && 'hover:ring-brand-400')}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

const EMPTY = {
  username: '', full_name: 'Dr. ', password: '', email: '', department_id: '', specialization: '', qualification: '', consultation_fee: '500',
  avg_consult_minutes: '15', slot_minutes: '15', work_start: '09:00', work_end: '17:00', work_days: '1,2,3,4,5,6', room: '',
};

function DoctorModal({ open, onClose, departments, doctor, onSaved }) {
  const toast = useToast();
  const editing = Boolean(doctor);
  const [form, setForm] = useState(() => (doctor ? {
    full_name: doctor.full_name, department_id: String(doctor.department_id), specialization: doctor.specialization, qualification: doctor.qualification || '',
    consultation_fee: String(doctor.consultation_fee), avg_consult_minutes: String(doctor.avg_consult_minutes), slot_minutes: String(doctor.slot_minutes),
    work_start: doctor.work_start, work_end: doctor.work_end, work_days: doctor.work_days, room: doctor.room || '',
  } : EMPTY));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const validate = () => {
    const e = {};
    if (!editing) {
      if (!/^[a-zA-Z0-9._-]{3,}$/.test(form.username)) e.username = 'At least 3 characters: letters, digits, . _ -';
      if ((form.password || '').length < 8) e.password = 'Minimum 8 characters';
    }
    if (!form.full_name.trim() || form.full_name.trim() === 'Dr.') e.full_name = 'Full name is required';
    if (!form.department_id) e.department_id = 'Select a department';
    if (!form.specialization.trim()) e.specialization = 'Specialisation is required';
    if (form.consultation_fee === '' || Number(form.consultation_fee) < 0) e.consultation_fee = 'Enter a valid fee';
    if (form.work_start >= form.work_end) e.work_end = 'Must be after start time';
    if (!form.work_days) e.work_days = 'Select at least one working day';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const save = async () => {
    if (!validate()) return;
    setBusy(true);
    setError(null);
    try {
      const body = { ...form, department_id: Number(form.department_id), consultation_fee: Number(form.consultation_fee), avg_consult_minutes: Number(form.avg_consult_minutes), slot_minutes: Number(form.slot_minutes) };
      const d = editing ? await api.patch(`/doctors/${doctor.id}`, body) : await api.post('/doctors', body);
      toast.success(editing ? `${d.full_name} updated` : `${d.full_name} added — they can now log in as “${d.username}”`);
      onSaved(d);
      onClose();
    } catch (err) {
      setError(err.message);
      if (err.details && typeof err.details === 'object') setErrors(err.details);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={editing ? `Edit ${doctor.full_name}` : 'Add doctor'}
      subtitle={editing ? 'Update schedule, fee and profile' : 'Creates the doctor\'s login account and OPD profile in one step'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save} data-testid="save-doctor">{editing ? 'Save changes' : 'Add doctor'}</Button></>}>
      <div className="space-y-5">
        {error && <Alert tone="error">{error}</Alert>}
        {!editing && (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Login account</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Username" required error={errors.username}><Input name="username" value={form.username} onChange={set('username')} placeholder="dr.kapoor" error={errors.username} /></Field>
              <Field label="Initial password" required error={errors.password}><Input name="password" type="password" value={form.password} onChange={set('password')} error={errors.password} /></Field>
              <Field label="Email" error={errors.email}><Input name="email" type="email" value={form.email} onChange={set('email')} /></Field>
            </div>
          </div>
        )}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Profile</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required error={errors.full_name}><Input name="full_name" value={form.full_name} onChange={set('full_name')} error={errors.full_name} /></Field>
            <Field label="Department" required error={errors.department_id}>
              <Select name="department_id" value={form.department_id} onChange={set('department_id')} error={errors.department_id}>
                <option value="">Select…</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <Field label="Specialisation" required error={errors.specialization}><Input name="specialization" value={form.specialization} onChange={set('specialization')} placeholder="e.g. Cardiologist" error={errors.specialization} /></Field>
            <Field label="Qualification"><Input name="qualification" value={form.qualification} onChange={set('qualification')} placeholder="MBBS, MD" /></Field>
            <Field label="Consultation fee (₹)" required error={errors.consultation_fee}><Input name="consultation_fee" type="number" min="0" value={form.consultation_fee} onChange={set('consultation_fee')} error={errors.consultation_fee} /></Field>
            <Field label="OPD room"><Input name="room" value={form.room} onChange={set('room')} placeholder="OPD-130" /></Field>
          </div>
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">OPD schedule</p>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Starts" required><Input type="time" value={form.work_start} onChange={set('work_start')} /></Field>
            <Field label="Ends" required error={errors.work_end}><Input type="time" value={form.work_end} onChange={set('work_end')} error={errors.work_end} /></Field>
            <Field label="Slot length" hint="minutes per booking slot">
              <Select value={form.slot_minutes} onChange={set('slot_minutes')}>{[10, 15, 20, 30].map((m) => <option key={m} value={m}>{m} min</option>)}</Select>
            </Field>
            <Field label="Avg. consultation" hint="used for wait-time estimates">
              <Input type="number" min="5" max="120" value={form.avg_consult_minutes} onChange={set('avg_consult_minutes')} />
            </Field>
          </div>
          <div className="mt-4">
            <span className="label">Working days<span className="text-rose-500"> *</span></span>
            <DayChips value={form.work_days} onChange={(v) => setForm({ ...form, work_days: v })} />
            {errors.work_days && <span className="mt-1 block text-xs text-rose-600">{errors.work_days}</span>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function DepartmentModal({ open, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', description: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setForm({ name: '', description: '' }); setError(null); } }, [open]);
  const save = async () => {
    if (!form.name.trim()) { setError('Department name is required'); return; }
    setBusy(true); setError(null);
    try {
      const d = await api.post('/departments', form);
      toast.success(`Department ${d.name} created`);
      onSaved();
      onClose();
      setForm({ name: '', description: '' });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Add department"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save} disabled={!form.name.trim()}>Add department</Button></>}>
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Nephrology" /></Field>
        <Field label="Description"><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export default function Doctors() {
  const { data: departments, reload: reloadDepts } = useApi('/departments');
  const { data: doctors, loading, error, reload } = useApi('/doctors');
  const [dept, setDept] = useState(null);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);

  const rows = useMemo(() => (doctors || []).filter((d) => (!dept || d.department_id === dept)
    && (!q || `${d.full_name} ${d.specialization} ${d.department}`.toLowerCase().includes(q.toLowerCase()))), [doctors, dept, q]);

  return (
    <div className="space-y-6">
      <PageHeader title="Doctors & Departments" subtitle="Manage doctor profiles, consultation fees and OPD schedules used for slot booking and queue estimates."
        actions={<><Button variant="secondary" icon={Building2} onClick={() => setModal({ type: 'dept' })}>Add department</Button><Button icon={Plus} onClick={() => setModal({ type: 'doctor' })} data-testid="add-doctor">Add doctor</Button></>} />

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setDept(null)} className={cx('rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset', !dept ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>
            All departments <span className="ml-1 opacity-70">{doctors?.length ?? ''}</span>
          </button>
          {departments?.map((d) => (
            <button key={d.id} type="button" onClick={() => setDept(d.id)} title={d.description || ''}
              className={cx('rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset', dept === d.id ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>
              {d.name} <span className="ml-1 opacity-70">{d.doctor_count}</span>
            </button>
          ))}
          <SearchInput icon={Search} className="ml-auto w-full max-w-xs" placeholder="Search doctors…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Card>

      {loading && !doctors ? <Spinner /> : error ? <ErrorState error={error} onRetry={reload} /> : rows.length ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((d) => (
            <Card key={d.id} className="flex flex-col p-5">
              <div className="flex items-start gap-3">
                <Avatar name={d.full_name} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{d.full_name}</p>
                  <p className="truncate text-sm text-slate-600">{d.specialization}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5"><Badge color="teal">{d.department}</Badge>{!d.active && <Badge color="gray">Inactive</Badge>}<Badge color="gray">@{d.username}</Badge></div>
                </div>
                <Button size="xs" variant="ghost" icon={Pencil} onClick={() => setModal({ type: 'doctor', doctor: d })} aria-label={`Edit ${d.full_name}`}>Edit</Button>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-slate-600"><GraduationCap className="h-4 w-4 text-slate-400" /><span className="truncate">{d.qualification || '—'}</span></div>
                <div className="flex items-center gap-2 text-slate-600"><IndianRupee className="h-4 w-4 text-slate-400" />{money0(d.consultation_fee)} / visit</div>
                <div className="flex items-center gap-2 text-slate-600"><Clock3 className="h-4 w-4 text-slate-400" />{fmtTime(d.work_start)} – {fmtTime(d.work_end)}</div>
                <div className="flex items-center gap-2 text-slate-600"><DoorOpen className="h-4 w-4 text-slate-400" />{d.room || '—'}</div>
                <div className="col-span-2 flex items-center gap-2 text-slate-600"><Stethoscope className="h-4 w-4 text-slate-400" />{d.slot_minutes}-min slots · ~{d.avg_consult_minutes} min per consultation</div>
              </dl>
              <div className="mt-4 border-t border-slate-100 pt-3"><DayChips value={d.work_days} /></div>
            </Card>
          ))}
        </div>
      ) : <Card><EmptyState icon={Stethoscope} title="No doctors match" message="Try another department or search term." /></Card>}

      {modal?.type === 'doctor' && departments && (
        <DoctorModal open departments={departments} doctor={modal.doctor} onClose={() => setModal(null)} onSaved={() => { reload(); reloadDepts(); }} />
      )}
      <DepartmentModal open={modal?.type === 'dept'} onClose={() => setModal(null)} onSaved={reloadDepts} />
    </div>
  );
}
