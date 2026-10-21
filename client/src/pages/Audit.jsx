import { useEffect, useState } from 'react';
import { ShieldCheck, Search, RotateCcw } from 'lucide-react';
import { useApi } from '../lib/useApi.js';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Pager, RoleBadge, SearchInput, Select, Spinner, Table } from '../components/ui.jsx';
import { fmtDateTime, humanize } from '../lib/format.js';

const ACTIONS = ['LOGIN', 'LOGIN_FAILED', 'ACCOUNT_LOCKED', 'LOGOUT', 'CREATE', 'UPDATE', 'STATUS_CHANGE', 'CHECK_IN', 'PRIORITY_URGENT', 'RESCHEDULE', 'SAVE',
  'DISPENSE', 'RESTOCK', 'TRANSFER', 'DISCHARGE_OVERRIDE', 'PAYMENT', 'DISCOUNT', 'ACTIVATE', 'DEACTIVATE', 'RESET_PASSWORD', 'SEED'];

function actionColor(a) {
  if (/FAILED|LOCKED|DEACTIVATE|OVERRIDE/.test(a)) return 'red';
  if (/LOGIN|LOGOUT/.test(a)) return 'gray';
  if (/CREATE|ACTIVATE|SEED/.test(a)) return 'green';
  if (/PAYMENT|DISCOUNT|DISPENSE|RESTOCK/.test(a)) return 'teal';
  if (/PRIORITY/.test(a)) return 'orange';
  if (/STATUS|CHECK_IN|TRANSFER|RESCHEDULE/.test(a)) return 'violet';
  return 'blue';
}

const EMPTY = { q: '', entity: '', action: '', from: '', to: '' };

export default function Audit() {
  const [filters, setFilters] = useState(EMPTY);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;
  useEffect(() => { const t = setTimeout(() => { setFilters((f) => ({ ...f, q: q.trim() })); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const { data: entities } = useApi('/audit/entities');
  const { data, loading, error, reload } = useApi('/audit', {
    q: filters.q || undefined, entity: filters.entity || undefined, action: filters.action || undefined,
    from: filters.from || undefined, to: filters.to || undefined, limit: pageSize, offset: (page - 1) * pageSize,
  }, { interval: 20000 });
  const set = (k) => (e) => { setFilters({ ...filters, [k]: e.target.value }); setPage(1); };

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Trail" subtitle="Who did what, and when — every create, update and state change is recorded (FR-50)." />
      <Alert tone="info" title="Append-only log">
        Entries can never be edited or deleted: database triggers reject every UPDATE and DELETE on the audit table, and passwords or tokens are never written to it.
      </Alert>

      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-2 xl:grid-cols-6">
          <Field label="Search" className="xl:col-span-2"><SearchInput icon={Search} placeholder="Summary, username or record ID…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search audit log" /></Field>
          <Field label="Entity">
            <Select value={filters.entity} onChange={set('entity')}><option value="">All entities</option>{entities?.map((e) => <option key={e} value={e}>{e}</option>)}</Select>
          </Field>
          <Field label="Action">
            <Select value={filters.action} onChange={set('action')}><option value="">All actions</option>{ACTIONS.map((a) => <option key={a} value={a}>{humanize(a)}</option>)}</Select>
          </Field>
          <Field label="From"><Input type="date" value={filters.from} onChange={set('from')} /></Field>
          <Field label="To"><Input type="date" value={filters.to} onChange={set('to')} /></Field>
        </div>
        <div className="flex items-center justify-between px-4 py-2 text-sm text-slate-500">
          <span>{data ? `${data.total} entr${data.total === 1 ? 'y' : 'ies'}` : ''}</span>
          <Button size="xs" variant="ghost" icon={RotateCcw} onClick={() => { setFilters(EMPTY); setQ(''); setPage(1); }}>Clear filters</Button>
        </div>
        {loading && !data ? <Spinner /> : error ? <ErrorState error={error} onRetry={reload} /> : (
          <>
            <Table rows={data?.rows} dense empty={<EmptyState icon={ShieldCheck} title="No audit entries match" />} columns={[
              { header: 'Time', className: 'whitespace-nowrap', render: (r) => <span className="text-slate-600">{fmtDateTime(r.ts)}</span> },
              { header: 'User', render: (r) => <span className="font-medium text-slate-800">{r.username || 'system'}</span> },
              { header: 'Role', render: (r) => (r.role ? <RoleBadge role={r.role} /> : <span className="text-slate-400">—</span>) },
              { header: 'Action', render: (r) => <Badge color={actionColor(r.action)}>{r.action}</Badge> },
              { header: 'Record', className: 'whitespace-nowrap', render: (r) => <span className="text-slate-600">{r.entity}{r.entity_id ? <span className="font-mono text-xs text-slate-400"> #{r.entity_id}</span> : null}</span> },
              { header: 'Summary', render: (r) => <span className="text-slate-700">{r.summary}</span> },
            ]} />
            {data && <Pager page={page} pageSize={pageSize} total={data.total} onChange={setPage} />}
          </>
        )}
      </Card>
    </div>
  );
}
