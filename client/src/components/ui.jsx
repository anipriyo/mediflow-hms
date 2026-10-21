import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, CheckCircle2, AlertTriangle, Info, XCircle, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';
import { humanize, initials } from '../lib/format.js';

export const cx = (...c) => c.filter(Boolean).join(' ');

// ── Buttons ───────────────────────────────────────────────────────
const BTN = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 focus-visible:ring-brand-500/40 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus-visible:ring-slate-400/30 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-400/30',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500/40 shadow-sm',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500/40 shadow-sm',
  warning: 'bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-amber-500/40 shadow-sm',
  soft: 'bg-brand-50 text-brand-800 hover:bg-brand-100 focus-visible:ring-brand-500/30',
};
const SIZES = { xs: 'px-2 py-1 text-xs gap-1', sm: 'px-3 py-1.5 text-sm gap-1.5', md: 'px-4 py-2 text-sm gap-2', lg: 'px-5 py-2.5 text-base gap-2' };

export function Button({ variant = 'primary', size = 'md', icon: Icon, loading = false, className, children, disabled, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx('inline-flex items-center justify-center rounded-lg font-medium transition focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60', BTN[variant], SIZES[size], className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className={size === 'xs' ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> : null}
      {children}
    </button>
  );
}

// ── Layout primitives ─────────────────────────────────────────────
export function Card({ className, children, ...rest }) {
  return <div className={cx('card', className)} {...rest}>{children}</div>;
}

export function CardHeader({ title, subtitle, actions, icon: Icon, className }) {
  return (
    <div className={cx('flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {Icon && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon className="h-5 w-5" /></span>}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, children }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  brand: 'bg-brand-50 text-brand-700',
  sky: 'bg-sky-50 text-sky-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
  violet: 'bg-violet-50 text-violet-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  slate: 'bg-slate-100 text-slate-700',
};

export function StatCard({ label, value, hint, icon: Icon, tone = 'brand', onClick }) {
  return (
    <Card className={cx('p-5', onClick && 'cursor-pointer transition hover:border-brand-300 hover:shadow-md')} onClick={onClick}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
          {hint && <p className="mt-1 truncate text-xs text-slate-500">{hint}</p>}
        </div>
        {Icon && <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', TONES[tone])}><Icon className="h-5 w-5" /></span>}
      </div>
    </Card>
  );
}

// ── Badges ────────────────────────────────────────────────────────
const BADGE = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  teal: 'bg-brand-50 text-brand-800 ring-brand-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
};

export function Badge({ color = 'gray', children, className, dot = false }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', BADGE[color], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS_COLORS = {
  SCHEDULED: 'blue', CHECKED_IN: 'amber', IN_CONSULTATION: 'violet', COMPLETED: 'green', CANCELLED: 'gray', NO_SHOW: 'red',
  ORDERED: 'blue', SAMPLE_COLLECTED: 'amber', PENDING: 'amber', DISPENSED: 'green',
  AVAILABLE: 'green', RESERVED: 'blue', OCCUPIED: 'red', CLEANING: 'amber', MAINTENANCE: 'gray',
  ADMITTED: 'violet', DISCHARGE_PENDING: 'amber', DISCHARGED: 'green',
  UNPAID: 'red', PARTIALLY_PAID: 'amber', PAID: 'green',
  URGENT: 'red', NORMAL: 'gray', STAT: 'red', ROUTINE: 'gray',
  IN_PROGRESS: 'violet', ACTIVE: 'green', INACTIVE: 'gray', LOCKED: 'red',
  LOW_STOCK: 'amber', OUT_OF_STOCK: 'red', NEAR_EXPIRY: 'orange', EXPIRED: 'red', OK: 'green',
};

export function StatusBadge({ status, label }) {
  return <Badge color={STATUS_COLORS[status] || 'gray'} dot>{label || humanize(status || '')}</Badge>;
}

export function RoleBadge({ role }) {
  const map = { ADMIN: 'violet', RECEPTIONIST: 'blue', DOCTOR: 'teal', LAB_TECH: 'amber', PHARMACIST: 'green', BILLING: 'orange' };
  const label = { ADMIN: 'Administrator', RECEPTIONIST: 'Receptionist', DOCTOR: 'Doctor', LAB_TECH: 'Lab Technician', PHARMACIST: 'Pharmacist', BILLING: 'Billing Staff' }[role] || role;
  return <Badge color={map[role] || 'gray'}>{label}</Badge>;
}

export function Avatar({ name, size = 'md', className }) {
  const s = { sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-xs', lg: 'h-12 w-12 text-sm' }[size];
  const palette = ['bg-brand-100 text-brand-800', 'bg-sky-100 text-sky-800', 'bg-violet-100 text-violet-800', 'bg-amber-100 text-amber-800', 'bg-rose-100 text-rose-800', 'bg-emerald-100 text-emerald-800'];
  const idx = [...(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
  return <span className={cx('grid shrink-0 place-items-center rounded-full font-semibold', s, palette[idx], className)}>{initials(name)}</span>;
}

// ── Form controls ─────────────────────────────────────────────────
export function Field({ label, error, hint, required, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="label">{label}{required && <span className="text-rose-500"> *</span>}</span>}
      {children}
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Input({ error, className, ...rest }) {
  return <input className={cx('input', error && 'input-error', className)} {...rest} />;
}

export function Select({ error, className, children, ...rest }) {
  return <select className={cx('input pr-8', error && 'input-error', className)} {...rest}>{children}</select>;
}

export function Textarea({ error, className, rows = 3, ...rest }) {
  return <textarea rows={rows} className={cx('input', error && 'input-error', className)} {...rest} />;
}

export function SearchInput({ icon: Icon, className, ...rest }) {
  return (
    <div className={cx('relative', className)}>
      {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
      <input className={cx('input', Icon && 'pl-9')} {...rest} />
    </div>
  );
}

// ── Feedback ──────────────────────────────────────────────────────
export function Spinner({ label = 'Loading…', className }) {
  return (
    <div className={cx('flex items-center justify-center gap-2 py-10 text-sm text-slate-500', className)}>
      <Loader2 className="h-5 w-5 animate-spin text-brand-600" /> {label}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', message, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400"><Icon className="h-6 w-6" /></span>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({ tone = 'info', title, children, className }) {
  const map = {
    info: ['bg-sky-50 border-sky-200 text-sky-800', Info],
    warning: ['bg-amber-50 border-amber-200 text-amber-900', AlertTriangle],
    error: ['bg-rose-50 border-rose-200 text-rose-800', XCircle],
    success: ['bg-emerald-50 border-emerald-200 text-emerald-800', CheckCircle2],
  };
  const [cls, Icon] = map[tone];
  return (
    <div className={cx('flex gap-3 rounded-lg border px-4 py-3 text-sm', cls, className)} role="alert">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  if (error?.status === 404 || error?.status === 403) {
    return (
      <Alert tone="warning" title={error.status === 404 ? 'Record not found' : 'Access denied'} className="m-4">
        {error.message || 'The requested record does not exist.'}
        <button type="button" className="ml-2 font-medium underline" onClick={() => window.history.back()}>Go back</button>
      </Alert>
    );
  }
  return (
    <Alert tone="error" title="Could not load data" className="m-4">
      {error?.message || 'Unknown error'}
      {onRetry && <button type="button" className="ml-2 underline" onClick={() => onRetry()}>Retry</button>}
    </Alert>
  );
}

// ── Modal ─────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', width)}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', variant = 'primary', onConfirm, onClose, busy, children }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={variant} loading={busy} onClick={onConfirm}>{confirmLabel}</Button></>}>
      {message && <p className="text-sm text-slate-600">{message}</p>}
      {children}
    </Modal>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────
export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cx('flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1', className)} role="tablist">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cx('flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition',
            value === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
          {t.label}
          {t.count !== undefined && <span className={cx('rounded-full px-1.5 text-xs', value === t.value ? 'bg-brand-100 text-brand-800' : 'bg-slate-200 text-slate-600')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────
export function Table({ columns, rows, rowKey = 'id', onRowClick, empty, className, dense }) {
  if (!rows?.length) return empty || <EmptyState />;
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50/80">
          <tr>{columns.map((c) => <th key={c.key || c.header} className={cx('th', c.className)}>{c.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((r, i) => (
            <tr key={typeof rowKey === 'function' ? rowKey(r) : r[rowKey] ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cx(onRowClick && 'cursor-pointer hover:bg-slate-50')}>
              {columns.map((c) => <td key={c.key || c.header} className={cx('td', dense && 'py-2', c.className)}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
      <span>{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : '0 results'}</span>
      <div className="flex gap-1">
        <Button size="xs" variant="secondary" icon={ChevronLeft} disabled={page <= 1} onClick={() => onChange(page - 1)}>Prev</Button>
        <Button size="xs" variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next <ChevronRight className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

export function KeyValue({ items, cols = 2 }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-3', cols === 3 ? 'sm:grid-cols-3' : cols === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-2')}>
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-slate-800">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Toasts ────────────────────────────────────────────────────────
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((tone, message, title) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, tone, message, title }]);
    setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 3500);
  }, [dismiss]);
  const api = useRef(null);
  api.current = {
    success: (m, t) => push('success', m, t),
    error: (m, t) => push('error', typeof m === 'string' ? m : m?.message || 'Something went wrong', t),
    info: (m, t) => push('info', m, t),
    warning: (m, t) => push('warning', m, t),
  };
  const stable = useRef({
    success: (...a) => api.current.success(...a),
    error: (...a) => api.current.error(...a),
    info: (...a) => api.current.info(...a),
    warning: (...a) => api.current.warning(...a),
  });
  return (
    <ToastContext.Provider value={stable.current}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className="pointer-events-auto" data-testid={`toast-${t.tone}`}>
              <Alert tone={t.tone} title={t.title} className="bg-white shadow-lg">{t.message}</Alert>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
