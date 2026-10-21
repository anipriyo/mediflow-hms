import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthContext = createContext(null);

export const ROLE_LABELS = {
  ADMIN: 'Administrator',
  RECEPTIONIST: 'Receptionist',
  DOCTOR: 'Doctor',
  LAB_TECH: 'Lab Technician',
  PHARMACIST: 'Pharmacist',
  BILLING: 'Billing Staff',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return;
    api.get('/auth/me').then(setUser).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onUnauthorized = () => { setToken(null); setUser(null); };
    window.addEventListener('mediflow:unauthorized', onUnauthorized);
    return () => window.removeEventListener('mediflow:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* token may already be invalid */ }
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    login,
    logout,
    can: (perm) => Boolean(user?.permissions?.includes(perm)),
    canAny: (...perms) => perms.some((p) => user?.permissions?.includes(p)),
  }), [user, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
