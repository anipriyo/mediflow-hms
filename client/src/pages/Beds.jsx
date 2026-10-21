import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BedDouble, UserPlus, Wrench, Sparkles, Lock, Unlock, RefreshCw, ArrowRight, Search, ClipboardList, Hospital } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useAuth } from '../lib/auth.jsx';
import PatientPicker from '../components/PatientPicker.jsx';
import {
  Alert, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Modal, PageHeader, SearchInput, Select, Spinner, StatusBadge, Table, Tabs, Textarea,
  useToast, cx,
} from '../components/ui.jsx';
import { fmtDateTime, money0, humanize } from '../lib/format.js';

const BED_STYLE = {
  AVAILABLE: { tile: 'border-emerald-200 bg-emerald-50 hover:border-emerald-400', dot: 'bg-emerald-500', text: 'text-emerald-800', label: 'Available' },
  RESERVED: { tile: 'border-sky-200 bg-sky-50 hover:border-sky-400', dot: 'bg-sky-500', text: 'text-sky-800', label: 'Reserved' },
  OCCUPIED: { tile: 'border-rose-200 bg-rose-50 hover:border-rose-400', dot: 'bg-rose-500', text: 'text-rose-800', label: 'Occupied' },
  CLEANING: { tile: 'border-amber-200 bg-amber-50 hover:border-amber-400', dot: 'bg-amber-500', text: 'text-amber-800', label: 'Cleaning' },
  MAINTENANCE: { tile: 'border-slate-300 bg-slate-100 hover:border-slate-400', dot: 'bg-slate-400', text: 'text-slate-600', label: 'Maintenance' },
};
const ORDER = ['AVAILABLE', 'RESERVED', 'OCCUPIED', 'CLEANING', 'MAINTENANCE'];
const WARD_TYPE_LABEL = { GENERAL: 'General', ICU: 'ICU', PRIVATE: 'Private', PEDIATRIC: 'Paediatric', MATERNITY: 'Maternity' };

function daysSince(iso) {
  if (!iso) return 0;
  return Math.max(1, Math.ceil((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

// ── Admit modal ──────────────────────────────────────────────────
export function AdmitModal({ bed, ward, onClose, onAdmitted }) {
  const toast = useToast();
  const { data: doctors } = useApi('/doctors');
  const [patient, setPatient] = useState(null);
  const [doctorId, setDoctorId] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(null);

  const submit = async () => {
    const e = {};
    if (!patient) e.patient = 'Select a patient';
    if (!doctorId) e.doctor = 'Select the attending doctor';
    if (!reason.trim()) e.reason = 'Reason for admission is required';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setServerError(null);
    try {
      const adm = await api.post('/admissions', { patient_id: patient.id, doctor_id: Number(doctorId), bed_id: bed.id, reason: reason.trim() });
      toast.success(`${adm.patient_name} admitted to ${adm.ward} ${adm.bed_no} (${adm.admission_no})`, 'Patient admitted');
      onAdmitted(adm);
      onClose();
    } catch (err) {
      setServerError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="lg" title={`Admit patient to ${bed.bed_no}`} subtitle={`${ward.name} · ${money0(ward.daily_rate)} per day`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={UserPlus} loading={busy} onClick={submit} data-testid="admit-submit">Admit patient</Button></>}>
      <div className="space-y-4">
        {serverError && <Alert tone="error">{serverError}</Alert>}
        <Field label="Patient" required error={errors.patient}><PatientPicker value={patient} onChange={setPatient} autoFocus /></Field>
        <Field label="Attending doctor" required error={errors.doctor}>
          <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} error={errors.doctor} data-testid="admit-doctor">
            <option value="">Select doctor…</option>
            {(doctors || []).map((d) => <option key={d.id} value={d.id}>{d.full_name} — {d.department}</option>)}
          </Select>
        </Field>
        <Field label="Reason for admission" required error={errors.reason}>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} placeholder="e.g. Community-acquired pneumonia, needs IV antibiotics" data-testid="admit-reason" />
        </Field>
        <Alert tone="info">A patient can have only one active admission. The bed becomes <b>Occupied</b> and bed charges accrue at the ward's daily rate until discharge is requested.</Alert>
      </div>
    </Modal>
  );
}

// ── Bed actions modal ────────────────────────────────────────────
function BedModal({ bed, ward, onClose, onChanged, onAdmit }) {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);
  const style = BED_STYLE[bed.status];
  const canManage = can('beds:manage');
  const canAdmit = can('admissions:write');

  const change = async (status) => {
    setBusy(status);
    try {
      await api.post(`/beds/${bed.id}/status`, { status });
      toast.success(`${ward.name} ${bed.bed_no}: ${humanize(bed.status)} → ${humanize(status)}`);
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  const actions = [];
  if (bed.status === 'AVAILABLE') {
    if (canAdmit) actions.push(<Button key="admit" icon={UserPlus} onClick={() => onAdmit(bed, ward)} data-testid="bed-admit">Admit patient here</Button>);
    if (canManage) actions.push(<Button key="res" variant="secondary" icon={Lock} loading={busy === 'RESERVED'} onClick={() => change('RESERVED')}>Reserve</Button>);
    if (canManage) actions.push(<Button key="mnt" variant="secondary" icon={Wrench} loading={busy === 'MAINTENANCE'} onClick={() => change('MAINTENANCE')}>Mark maintenance</Button>);
  } else if (bed.status === 'RESERVED') {
    if (canAdmit) actions.push(<Button key="admit" icon={UserPlus} onClick={() => onAdmit(bed, ward)}>Admit patient here</Button>);
    if (canManage) actions.push(<Button key="rel" variant="secondary" icon={Unlock} loading={busy === 'AVAILABLE'} onClick={() => change('AVAILABLE')}>Release reservation</Button>);
  } else if (bed.status === 'CLEANING') {
    if (canManage) actions.push(<Button key="cln" variant="success" icon={Sparkles} loading={busy === 'AVAILABLE'} onClick={() => change('AVAILABLE')} data-testid="bed-cleaned">Mark cleaned</Button>);
    if (canManage) actions.push(<Button key="mnt" variant="secondary" icon={Wrench} loading={busy === 'MAINTENANCE'} onClick={() => change('MAINTENANCE')}>Send to maintenance</Button>);
  } else if (bed.status === 'MAINTENANCE') {
    if (canManage) actions.push(<Button key="svc" variant="success" icon={Sparkles} loading={busy === 'AVAILABLE'} onClick={() => change('AVAILABLE')}>Back in service</Button>);
  } else if (bed.status === 'OCCUPIED' && bed.current_admission_id) {
    actions.push(<Button key="open" icon={ArrowRight} onClick={() => navigate(`/admissions/${bed.current_admission_id}`)}>Open admission</Button>);
  }

  return (
    <Modal open onClose={onClose} size="sm" title={`${ward.name} · ${bed.bed_no}`} subtitle={`${WARD_TYPE_LABEL[ward.type] || ward.type} ward · ${ward.floor || ''} · ${money0(ward.daily_rate)}/day`}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className={cx('h-3 w-3 rounded-full', style.dot)} />
          <span className={cx('text-sm font-semibold', style.text)}>{style.label}</span>
          {bed.updated_at && <span className="text-xs text-slate-500">since {fmtDateTime(bed.updated_at)}</span>}
        </div>
        {bed.status === 'OCCUPIED' && (
          <div className="rounded-lg border border-slate-200 p-4 text-sm">
            <p className="font-semibold text-slate-800">{bed.patient_name} <span className="font-normal text-slate-500">({bed.patient_code})</span></p>
            <p className="mt-1 text-slate-600">{bed.admission_no} · {bed.doctor_name}</p>
            <p className="text-slate-600">Admitted {fmtDateTime(bed.admitted_at)} · day {daysSince(bed.admitted_at)}</p>
            {bed.admission_status === 'DISCHARGE_PENDING' && <Badge color="amber" className="mt-2">Discharge pending</Badge>}
          </div>
        )}
        {actions.length ? <div className="flex flex-col gap-2 [&>button]:w-full">{actions}</div> : (
          <p className="text-sm text-slate-500">{bed.status === 'OCCUPIED' ? 'This bed is occupied.' : 'You can view this bed but your role cannot change its status.'}</p>
        )}
        <p className="text-xs text-slate-400">Allowed transitions follow the bed state machine: Available → Reserved/Occupied/Maintenance, Reserved → Occupied/Available, Occupied → Cleaning, Cleaning → Available/Maintenance, Maintenance → Available.</p>
      </div>
    </Modal>
  );
}

function BedTile({ bed, onClick }) {
  const s = BED_STYLE[bed.status];
  return (
    <button type="button" onClick={onClick} data-testid={`bed-${bed.bed_no}`} data-status={bed.status}
      className={cx('flex min-h-[92px] flex-col rounded-xl border-2 p-3 text-left transition focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30', s.tile)}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><BedDouble className={cx('h-4 w-4', s.text)} />{bed.bed_no}</span>
        <span className={cx('h-2.5 w-2.5 rounded-full', s.dot)} title={s.label} />
      </div>
      {bed.status === 'OCCUPIED' ? (
        <div className="mt-2 min-w-0">
          <p className="truncate text-xs font-semibold text-slate-800">{bed.patient_name}</p>
          <p className="truncate text-[11px] text-slate-500">{bed.patient_code} · day {daysSince(bed.admitted_at)}</p>
          {bed.admission_status === 'DISCHARGE_PENDING' && <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 text-[10px] font-semibold uppercase text-amber-800">Discharge pending</span>}
        </div>
      ) : (
        <p className={cx('mt-auto text-xs font-medium', s.text)}>{s.label}</p>
      )}
    </button>
  );
}

function BedBoard({ board, onChanged }) {
  const [selected, setSelected] = useState(null);
  const [admitting, setAdmitting] = useState(null);
  const [wardFilter, setWardFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const navigate = useNavigate();
  const wards = board.wards.filter((w) => !wardFilter || String(w.id) === wardFilter);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600" aria-label="Legend">
          {ORDER.map((s) => <span key={s} className="inline-flex items-center gap-1.5"><span className={cx('h-2.5 w-2.5 rounded-full', BED_STYLE[s].dot)} />{BED_STYLE[s].label}</span>)}
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={wardFilter} onChange={(e) => setWardFilter(e.target.value)} className="w-48" aria-label="Ward filter">
            <option value="">All wards</option>
            {board.wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40" aria-label="Status filter">
            <option value="">All statuses</option>
            {ORDER.map((s) => <option key={s} value={s}>{BED_STYLE[s].label}</option>)}
          </Select>
        </div>
      </div>
      {wards.map((w) => {
        const beds = w.beds.filter((b) => !statusFilter || b.status === statusFilter);
        return (
          <Card key={w.id}>
            <CardHeader icon={Hospital} title={w.name} subtitle={`${WARD_TYPE_LABEL[w.type] || w.type} · ${w.floor || ''} · ${money0(w.daily_rate)}/day`}
              actions={(
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-slate-500"><b className="text-slate-800">{w.available}</b> free</span>
                  <span className="text-slate-500"><b className="text-slate-800">{w.occupied}</b>/{w.total} occupied</span>
                  <div className="hidden h-2 w-28 overflow-hidden rounded-full bg-slate-100 sm:block"><div className={cx('h-full rounded-full', w.occupancyPct >= 85 ? 'bg-rose-500' : w.occupancyPct >= 60 ? 'bg-amber-500' : 'bg-brand-500')} style={{ width: `${w.occupancyPct}%` }} /></div>
                  <span className="font-semibold tabular-nums text-slate-700">{w.occupancyPct}%</span>
                </div>
              )} />
            {beds.length ? (
              <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {beds.map((b) => <BedTile key={b.id} bed={b} onClick={() => setSelected({ bed: b, ward: w })} />)}
              </div>
            ) : <EmptyState icon={BedDouble} title="No beds match the filter" />}
          </Card>
        );
      })}
      {selected && <BedModal bed={selected.bed} ward={selected.ward} onClose={() => setSelected(null)} onChanged={onChanged}
        onAdmit={(bed, ward) => { setSelected(null); setAdmitting({ bed, ward }); }} />}
      {admitting && <AdmitModal bed={admitting.bed} ward={admitting.ward} onClose={() => setAdmitting(null)} onAdmitted={(adm) => { onChanged(); navigate(`/admissions/${adm.id}`); }} />}
    </div>
  );
}

function AdmissionsList() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('ADMITTED,DISCHARGE_PENDING');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { data, loading, error, reload } = useApi('/admissions', { status: status || undefined, q: debounced || undefined }, { interval: 20000 });
  return (
    <Card>
      <CardHeader icon={ClipboardList} title="Admissions" subtitle={data ? `${data.length} record${data.length === 1 ? '' : 's'}` : undefined}
        actions={(
          <>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-52" aria-label="Admission status filter">
              <option value="ADMITTED,DISCHARGE_PENDING">Current inpatients</option>
              <option value="ADMITTED">Admitted</option>
              <option value="DISCHARGE_PENDING">Discharge pending</option>
              <option value="DISCHARGED">Discharged</option>
              <option value="">All</option>
            </Select>
            <SearchInput icon={Search} className="w-56" placeholder="Patient, ID or admission no." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search admissions" />
          </>
        )} />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Spinner /> : (
        <Table rows={data} onRowClick={(a) => navigate(`/admissions/${a.id}`)} empty={<EmptyState icon={BedDouble} title="No admissions found" />} columns={[
          { header: 'Admission', render: (a) => <span className="whitespace-nowrap font-mono text-xs font-semibold text-brand-800">{a.admission_no}</span> },
          { header: 'Patient', render: (a) => (<div><Link to={`/patients/${a.patient_id}`} className="link" onClick={(e) => e.stopPropagation()}>{a.patient_name}</Link><p className="text-xs text-slate-500">{a.patient_code}</p></div>) },
          { header: 'Ward / Bed', render: (a) => (<div><p className="text-sm text-slate-800">{a.ward}</p><p className="text-xs text-slate-500">{a.bed_no}</p></div>) },
          { header: 'Doctor', key: 'doctor_name' },
          { header: 'Reason', render: (a) => <span className="line-clamp-2 max-w-xs text-sm">{a.reason}</span> },
          { header: 'Admitted', render: (a) => (<div><p className="text-sm">{fmtDateTime(a.admitted_at)}</p>{a.status !== 'DISCHARGED' && <p className="text-xs text-slate-500">day {daysSince(a.admitted_at)}</p>}</div>) },
          { header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
        ]} />
      )}
    </Card>
  );
}

export default function Beds() {
  const { can } = useAuth();
  const canBeds = can('beds:read');
  const [tab, setTab] = useState(canBeds ? 'board' : 'admissions');
  const { data, loading, error, reload } = useApi(canBeds ? '/beds' : null, null, { interval: 20000, auto: canBeds });

  const summary = data?.summary;
  const tiles = useMemo(() => (summary ? ORDER.map((s) => ({ s, n: summary[s] })) : []), [summary]);

  return (
    <div className="space-y-6">
      <PageHeader title="Beds & Admissions" subtitle="Live ward-wise bed availability, admissions, transfers and discharge."
        actions={<Button variant="secondary" icon={RefreshCw} onClick={() => reload()}>Refresh</Button>} />

      {canBeds && summary && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3 xl:grid-cols-6" data-testid="bed-summary">
          <Card className="p-3 sm:p-4">
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:text-xs">Occupancy</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{summary.occupancyPct}%</p>
            <p className="text-xs text-slate-500">{summary.OCCUPIED}/{summary.total} beds</p>
          </Card>
          {tiles.map(({ s, n }) => (
            <Card key={s} className="p-3 sm:p-4">
              <p className="flex items-center gap-1.5 truncate text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:text-xs"><span className={cx('h-2 w-2 rounded-full', BED_STYLE[s].dot)} />{BED_STYLE[s].label}</p>
              <p className={cx('mt-1 text-2xl font-semibold tabular-nums', BED_STYLE[s].text)}>{n}</p>
            </Card>
          ))}
        </div>
      )}

      {canBeds && <Tabs tabs={[{ value: 'board', label: 'Bed board' }, { value: 'admissions', label: 'Admissions' }]} value={tab} onChange={setTab} />}

      {tab === 'board' && canBeds && (error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Spinner /> : data && <BedBoard board={data} onChanged={() => reload({ silent: true })} />)}
      {tab === 'admissions' && <AdmissionsList />}
    </div>
  );
}
