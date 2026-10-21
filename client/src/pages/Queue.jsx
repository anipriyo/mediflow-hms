import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, BellRing, CheckCircle2, Clock3, DoorOpen, ListOrdered, LogIn, Megaphone, RefreshCw, Siren, Stethoscope, Timer, Users, AlertTriangle, ChevronRight,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useAuth } from '../lib/auth.jsx';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Modal, PageHeader, Spinner, Textarea, cx, useToast,
} from '../components/ui.jsx';
import { fmtDate, fmtTime, todayStr, timeAgo } from '../lib/format.js';

const tok = (n) => (n ? `#${String(n).padStart(2, '0')}` : '—');
const eta = (m) => (m <= 1 ? 'Next' : `~${m} min`);

function UrgentModal({ entry, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!reason.trim()) { setError('A reason is required to prioritise a patient'); return; }
    setBusy(true);
    try {
      await api.post(`/queue/${entry.id}/priority`, { reason: reason.trim() });
      toast.success(`${entry.patient_name} moved to the front of the queue`, 'Marked urgent');
      onDone(); onClose();
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title="Mark patient as urgent" subtitle={`Token ${tok(entry.token_no)} · ${entry.patient_name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" icon={Siren} loading={busy} onClick={submit} data-testid="confirm-urgent">Mark urgent</Button></>}>
      <div className="space-y-3">
        <Alert tone="warning">Urgent patients are seen before everyone else. This action is recorded in the audit trail with your name.</Alert>
        <div className="flex flex-wrap gap-2">
          {['Chest pain', 'Breathing difficulty', 'High fever (> 103°F)', 'Severe bleeding', 'Elderly / frail patient'].map((r) => (
            <button key={r} type="button" onClick={() => { setReason(r); setError(''); }} className={cx('rounded-full border px-3 py-1 text-xs', reason === r ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>{r}</button>
          ))}
        </div>
        <Field label="Reason" required error={error}>
          <Textarea rows={2} value={reason} onChange={(e) => { setReason(e.target.value); setError(''); }} error={error} data-testid="urgent-reason" />
        </Field>
      </div>
    </Modal>
  );
}

function NowServing({ board }) {
  const cur = board.inProgress;
  const next = board.waiting[0];
  return (
    <div className="relative overflow-hidden rounded-2xl bg-brand-900 text-white shadow-card">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(40,191,172,.35),transparent_50%)]" />
      <div className="relative grid gap-6 p-6 sm:grid-cols-[auto,1fr] sm:items-center">
        <div className="text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-200">Now serving</p>
          <p className="mt-1 font-mono text-6xl font-bold tabular-nums leading-none tracking-tight sm:text-7xl" data-testid="now-serving-token">{cur ? tok(cur.token_no) : '—'}</p>
        </div>
        <div className="min-w-0 sm:border-l sm:border-white/15 sm:pl-6">
          {cur ? (
            <>
              <p className="truncate text-xl font-semibold">{cur.patient_name}</p>
              <p className="text-sm text-brand-100">{cur.patient_code} · started {fmtTime(cur.consult_started_at)} ({timeAgo(cur.consult_started_at)})</p>
              {cur.priority === 'URGENT' && <Badge color="red" className="mt-2">Urgent</Badge>}
            </>
          ) : (
            <p className="text-lg font-medium text-brand-100">No consultation in progress</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-brand-100">
            <span className="inline-flex items-center gap-1.5"><DoorOpen className="h-4 w-4" />{board.doctor.room || 'OPD'}</span>
            <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" />{board.stats.waiting} waiting</span>
            <span className="inline-flex items-center gap-1.5"><Timer className="h-4 w-4" />avg {board.doctor.avg_consult_minutes} min / patient</span>
            {next && <span className="inline-flex items-center gap-1.5"><BellRing className="h-4 w-4" />Next: <span className="font-mono font-semibold text-white">{tok(next.token_no)}</span></span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function DoctorBoard({ doctorId, onBack }) {
  const { user, can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: board, loading, error, reload } = useApi(`/queue/${doctorId}`, null, { interval: 15000 });
  const [urgent, setUrgent] = useState(null);
  const [busy, setBusy] = useState(null);
  const isOwnBoard = user.role === 'DOCTOR' && user.doctorId === Number(doctorId);

  if (loading && !board) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const callNext = async () => {
    setBusy('call');
    try {
      const r = await api.post(`/queue/${doctorId}/call-next`);
      toast.success(`Token ${tok(r.appointment.token_no)} – ${r.appointment.patient_name}`, 'Patient called');
      navigate('/consultation');
    } catch (err) {
      if (err.code === 'CONSULTATION_IN_PROGRESS') { toast.warning(err.message); navigate('/consultation'); } else toast.error(err);
    } finally { setBusy(null); }
  };
  const checkIn = async (a) => {
    setBusy(a.id);
    try {
      const r = await api.post(`/appointments/${a.id}/check-in`);
      toast.success(`${r.patient_name} checked in · token ${tok(r.token_no)}`);
      reload({ silent: true });
    } catch (err) { toast.error(err); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isOwnBoard ? 'My queue' : board.doctor.full_name}
        subtitle={`${board.doctor.department}${board.doctor.room ? ` · ${board.doctor.room}` : ''} · ${fmtDate(board.date)} · refreshes automatically every 15 s`}
        actions={(
          <>
            {onBack && <Button variant="secondary" icon={ArrowLeft} onClick={onBack}>All doctors</Button>}
            <Button variant="secondary" icon={RefreshCw} onClick={() => reload()}>Refresh</Button>
            {isOwnBoard && (board.inProgress
              ? <Button size="lg" icon={Stethoscope} onClick={() => navigate('/consultation')}>Continue consultation</Button>
              : <Button size="lg" icon={Megaphone} loading={busy === 'call'} disabled={!board.waiting.length} onClick={callNext} data-testid="call-next">Call next patient</Button>)}
          </>
        )}
      />

      <NowServing board={board} />

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ['Waiting', board.stats.waiting, Users, 'text-amber-700 bg-amber-50'],
          ['Avg. wait', `${board.stats.avgWaitMinutes} min`, Clock3, 'text-sky-700 bg-sky-50'],
          ['Served today', board.stats.served, CheckCircle2, 'text-emerald-700 bg-emerald-50'],
          ['Yet to arrive', board.stats.scheduled, ListOrdered, 'text-slate-700 bg-slate-100'],
        ].map(([label, v, Icon, cls]) => (
          <Card key={label} className="flex items-center gap-3 px-4 py-3">
            <span className={cx('grid h-10 w-10 place-items-center rounded-xl', cls)}><Icon className="h-5 w-5" /></span>
            <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="text-xl font-semibold tabular-nums text-slate-900">{v}</p></div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Waiting queue" subtitle="Urgent patients first, then in order of check-in" icon={ListOrdered} />
          {board.waiting.length ? (
            <ol className="divide-y divide-slate-100" data-testid="waiting-list">
              {board.waiting.map((w) => (
                <li key={w.id} className={cx('flex flex-wrap items-center gap-4 px-5 py-3.5', w.priority === 'URGENT' && 'bg-rose-50/60', w.position === 1 && w.priority !== 'URGENT' && 'bg-brand-50/40')}>
                  <span className="w-6 text-center text-sm font-semibold text-slate-400">{w.position}</span>
                  <span className={cx('rounded-lg px-2.5 py-1.5 font-mono text-lg font-bold tabular-nums', w.priority === 'URGENT' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white')}>{tok(w.token_no)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/patients/${w.patient_id}`} className="truncate font-medium text-slate-800 hover:text-brand-700 hover:underline">{w.patient_name}</Link>
                      {w.priority === 'URGENT' && <Badge color="red"><AlertTriangle className="h-3 w-3" />Urgent</Badge>}
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {w.patient_code} · checked in {fmtTime(w.checked_in_at)} · slot {fmtTime(w.start_time)}
                      {w.priority === 'URGENT' && w.priority_reason ? <span className="text-rose-600"> · {w.priority_reason}</span> : null}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cx('text-sm font-semibold tabular-nums', w.position === 1 ? 'text-brand-700' : 'text-slate-700')}>{w.position === 1 && !board.inProgress ? 'Next' : eta(w.etaMinutes)}</p>
                    <p className="text-xs text-slate-400">{w.patientsAhead} ahead</p>
                  </div>
                  {can('queue:priority') && w.priority !== 'URGENT' && (
                    <Button size="xs" variant="ghost" className="text-rose-600 hover:bg-rose-50" icon={Siren} onClick={() => setUrgent(w)} data-testid={`urgent-${w.id}`}>Urgent</Button>
                  )}
                </li>
              ))}
            </ol>
          ) : <EmptyState icon={Users} title="No one is waiting" message="Checked-in patients will appear here with their token and estimated wait." />}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Yet to arrive" subtitle="Booked for today, not checked in" icon={Clock3} />
            {board.scheduled.length ? (
              <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                {board.scheduled.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="w-16 text-sm font-semibold tabular-nums text-slate-700">{fmtTime(a.start_time)}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm text-slate-800">{a.patient_name}</span><span className="block text-xs text-slate-500">{a.patient_code}</span></span>
                    {can('queue:checkin') && <Button size="xs" variant="soft" icon={LogIn} loading={busy === a.id} onClick={() => checkIn(a)}>Check in</Button>}
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon={CheckCircle2} title="Everyone has arrived" />}
          </Card>
          <Card>
            <CardHeader title="Served today" subtitle={`${board.served.length} consultation${board.served.length === 1 ? '' : 's'} completed`} icon={CheckCircle2} />
            {board.served.length ? (
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                {board.served.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span className="font-mono text-xs font-semibold text-slate-500">{tok(a.token_no)}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-700">{a.patient_name}</span>
                    <span className="text-xs text-slate-400">{fmtTime(a.completed_at)}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon={Stethoscope} title="No consultations completed yet" />}
          </Card>
        </div>
      </div>

      {urgent && <UrgentModal entry={urgent} onClose={() => setUrgent(null)} onDone={() => reload({ silent: true })} />}
    </div>
  );
}

function Overview({ onOpen }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { data, loading, error, reload } = useApi('/queue', null, { interval: 15000 });
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const totalWaiting = data.reduce((s, q) => s + q.stats.waiting, 0);
  const inConsult = data.filter((q) => q.inProgress).length;
  return (
    <div className="space-y-6">
      <PageHeader title="Queue board" subtitle={`Live OPD queues for ${fmtDate(todayStr())} · ${totalWaiting} patients waiting · ${inConsult} doctors consulting`}
        actions={<><Button variant="secondary" icon={RefreshCw} onClick={() => reload()}>Refresh</Button>{can('queue:checkin') && <Button icon={LogIn} onClick={() => navigate('/appointments')}>Check in patients</Button>}</>} />
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" data-testid="queue-overview">
        {data.map((q) => (
          <button key={q.doctor.id} type="button" onClick={() => onOpen(q.doctor.id)} data-testid={`queue-card-${q.doctor.id}`}
            className="card group flex flex-col p-5 text-left transition hover:border-brand-300 hover:shadow-md">
            <div className="flex items-start gap-3">
              <Avatar name={q.doctor.full_name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{q.doctor.full_name}</p>
                <p className="truncate text-xs text-slate-500">{q.doctor.department}{q.doctor.room ? ` · ${q.doctor.room}` : ''}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
            </div>
            <div className="mt-4 flex items-center gap-4 rounded-xl bg-slate-50 p-3">
              <div className="text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Serving</p>
                <p className={cx('font-mono text-3xl font-bold tabular-nums', q.inProgress ? 'text-brand-700' : 'text-slate-300')}>{q.inProgress ? tok(q.inProgress.token_no) : '—'}</p>
              </div>
              <div className="min-w-0 flex-1 border-l border-slate-200 pl-4 text-sm">
                {q.inProgress ? <p className="truncate font-medium text-slate-700">{q.inProgress.patient_name}</p> : <p className="text-slate-400">Doctor is free</p>}
                <div className="mt-1 flex flex-wrap gap-1">
                  {q.waiting.slice(0, 6).map((w) => (
                    <span key={w.id} className={cx('rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold', w.priority === 'URGENT' ? 'bg-rose-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200')}>{tok(w.token_no)}</span>
                  ))}
                  {q.waiting.length > 6 && <span className="text-xs text-slate-400">+{q.waiting.length - 6}</span>}
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div><p className="text-lg font-semibold tabular-nums text-amber-700">{q.stats.waiting}</p><p className="text-[11px] text-slate-500">waiting</p></div>
              <div><p className="text-lg font-semibold tabular-nums text-sky-700">{q.stats.avgWaitMinutes}<span className="text-xs font-normal"> min</span></p><p className="text-[11px] text-slate-500">avg wait</p></div>
              <div><p className="text-lg font-semibold tabular-nums text-emerald-700">{q.stats.served}</p><p className="text-[11px] text-slate-500">served</p></div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Queue() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  if (user.role === 'DOCTOR' && user.doctorId) return <DoctorBoard doctorId={user.doctorId} />;
  const selected = params.get('doctor');
  if (selected) return <DoctorBoard key={selected} doctorId={Number(selected)} onBack={() => setParams({})} />;
  return <Overview onOpen={(id) => setParams({ doctor: String(id) })} />;
}
