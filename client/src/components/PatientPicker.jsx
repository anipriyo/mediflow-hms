import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { Avatar, cx } from './ui.jsx';

/** Search-as-you-type patient selector. `value` is a patient object or null. */
export default function PatientPicker({ value, onChange, autoFocus, error, placeholder = 'Search by name, patient ID or phone…' }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (value) return undefined;
    const t = setTimeout(() => {
      api.get('/patients', { q: q.trim() || undefined, limit: 8 }).then((r) => setRows(r.rows)).catch(() => setRows([]));
    }, 180);
    return () => clearTimeout(t);
  }, [q, value]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2" data-testid="selected-patient">
        <Avatar name={value.full_name || `${value.first_name} ${value.last_name}`} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">{value.full_name || `${value.first_name} ${value.last_name}`}</p>
          <p className="text-xs text-slate-500">{value.patient_code} · {value.age}y · {value.gender?.toLowerCase()} · {value.phone}</p>
        </div>
        <button type="button" className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-600" onClick={() => onChange(null)} aria-label="Change patient"><X className="h-4 w-4" /></button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input autoFocus={autoFocus} className={cx('input pl-9', error && 'input-error')} placeholder={placeholder} value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label="Patient search" data-testid="patient-picker" />
      {open && rows.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {rows.map((p) => (
            <button key={p.id} type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50" onMouseDown={() => { onChange(p); setQ(''); }}>
              <Avatar name={p.full_name} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800">{p.full_name}</span>
                <span className="block text-xs text-slate-500">{p.patient_code} · {p.age}y · {p.phone}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
    </div>
  );
}
