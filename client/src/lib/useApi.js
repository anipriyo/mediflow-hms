import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/**
 * Fetch data from GET `path` (with optional query) and keep it in state.
 * Returns { data, error, loading, reload, setData }.
 */
export function useApi(path, query, { auto = true, interval = 0 } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(path && auto));
  const key = JSON.stringify([path, query]);
  const alive = useRef(true);

  const reload = useCallback(async ({ silent = false } = {}) => {
    if (!path) return null;
    if (!silent) setLoading(true);
    try {
      const res = await api.get(path, query);
      if (alive.current) { setData(res); setError(null); }
      return res;
    } catch (e) {
      if (alive.current) setError(e);
      return null;
    } finally {
      if (alive.current && !silent) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    alive.current = true;
    if (auto) reload();
    return () => { alive.current = false; };
  }, [reload, auto]);

  useEffect(() => {
    if (!interval) return undefined;
    const t = setInterval(() => reload({ silent: true }), interval);
    return () => clearInterval(t);
  }, [interval, reload]);

  return { data, error, loading, reload, setData };
}

/** Wraps an async action with busy state + toast-friendly error capture. */
export function useAction(fn, { onSuccess, onError } = {}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async (...args) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn(...args);
      onSuccess?.(res);
      return res;
    } catch (e) {
      setError(e);
      onError?.(e);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [fn, onSuccess, onError]);
  return { run, busy, error, setError };
}
