import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UserPlus, Search, Users, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useAuth } from '../lib/auth.jsx';
import { Alert, Avatar, Badge, Button, Card, Modal, PageHeader, Pager, SearchInput, Spinner, Table, useToast, EmptyState } from '../components/ui.jsx';
import PatientForm, { EMPTY_PATIENT, validatePatientForm } from '../components/PatientForm.jsx';
import { fmtDate } from '../lib/format.js';

export function RegisterPatientModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_PATIENT);
  const [errors, setErrors] = useState({});
  const [duplicates, setDuplicates] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setForm(EMPTY_PATIENT); setErrors({}); setDuplicates(null); } }, [open]);

  const submit = async (confirmDuplicate = false) => {
    const e = validatePatientForm(form);
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const p = await api.post('/patients', { ...form, confirmDuplicate });
      toast.success(`${p.full_name} registered with ID ${p.patient_code}`, 'Patient registered');
      onCreated?.(p);
      onClose();
    } catch (err) {
      if (err.code === 'POSSIBLE_DUPLICATE') setDuplicates(err.details.duplicates);
      else if (err.details && typeof err.details === 'object') { setErrors(err.details); toast.error(err); }
      else toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Register new patient" subtitle="A unique patient ID (P00001…) is generated automatically."
      footer={duplicates ? (
        <><Button variant="secondary" onClick={() => setDuplicates(null)}>Go back and edit</Button><Button variant="warning" loading={busy} onClick={() => submit(true)}>Register anyway</Button></>
      ) : (
        <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={UserPlus} loading={busy} onClick={() => submit(false)} data-testid="register-submit">Register patient</Button></>
      )}>
      {duplicates ? (
        <div className="space-y-4">
          <Alert tone="warning" title="Possible duplicate registration">A patient with the same mobile number and date of birth, or the same name and date of birth, already exists. Please check before creating a new record.</Alert>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {duplicates.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={d.full_name} size="sm" />
                <div className="flex-1 text-sm"><p className="font-medium text-slate-800">{d.full_name}</p><p className="text-xs text-slate-500">{d.patient_code} · {d.phone} · DOB {fmtDate(d.dob)}</p></div>
                <a className="link text-sm" href={`/patients/${d.id}`} target="_blank" rel="noreferrer">Open record</a>
              </li>
            ))}
          </ul>
        </div>
      ) : <PatientForm value={form} onChange={setForm} errors={errors} />}
    </Modal>
  );
}

export default function Patients() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [showNew, setShowNew] = useState(params.get('new') === '1');

  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setPage(1); }, 250); return () => clearTimeout(t); }, [q]);
  const { data, loading, reload } = useApi('/patients', { q: debounced || undefined, limit: debounced ? 100 : pageSize, offset: debounced ? 0 : (page - 1) * pageSize });

  return (
    <div>
      <PageHeader title="Patients" subtitle="Register patients, search records and open their complete history."
        actions={can('patients:write') && <Button icon={UserPlus} onClick={() => setShowNew(true)} data-testid="new-patient">Register patient</Button>} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <SearchInput icon={Search} className="w-full max-w-md" placeholder="Search by name, patient ID (P00012) or mobile…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search patients" />
          {data && <span className="text-sm text-slate-500">{data.total} patient{data.total === 1 ? '' : 's'}</span>}
        </div>
        {loading && !data ? <Spinner /> : (
          <>
            <Table
              rows={data?.rows}
              onRowClick={(p) => navigate(`/patients/${p.id}`)}
              empty={<EmptyState icon={Users} title="No patients found" message={debounced ? `No match for “${debounced}”.` : 'Register the first patient to get started.'} />}
              columns={[
                { header: 'Patient', render: (p) => (<div className="flex items-center gap-3"><Avatar name={p.full_name} size="sm" /><div><p className="font-medium text-slate-800">{p.full_name}</p><p className="text-xs text-slate-500">{p.email || '—'}</p></div></div>) },
                { header: 'Patient ID', render: (p) => <span className="font-mono text-xs font-semibold text-brand-800">{p.patient_code}</span> },
                { header: 'Age / Sex', render: (p) => `${p.age} y · ${p.gender[0]}` },
                { header: 'Mobile', key: 'phone' },
                { header: 'Blood', render: (p) => (p.blood_group ? <Badge color="red">{p.blood_group}</Badge> : '—') },
                { header: 'Allergies', render: (p) => (p.allergies ? <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />{p.allergies}</span> : <span className="text-slate-400">None</span>) },
                { header: 'Registered', render: (p) => fmtDate(p.created_at) },
              ]}
            />
            {!debounced && data && <Pager page={page} pageSize={pageSize} total={data.total} onChange={setPage} />}
          </>
        )}
      </Card>
      <RegisterPatientModal open={showNew} onClose={() => { setShowNew(false); if (params.get('new')) setParams({}); }} onCreated={(p) => { reload(); navigate(`/patients/${p.id}`); }} />
    </div>
  );
}
