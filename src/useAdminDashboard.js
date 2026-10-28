import { useCallback, useEffect, useRef, useState } from 'react';

const allowed = auth => !!(auth.account && auth.session && auth.access?.isAdmin && auth.access.status === 'approved');
const validEntry = row => row && typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 255
  && typeof row.name === 'string' && typeof row.email === 'string'
  && ['pending', 'approved', 'rejected'].includes(row.status)
  && Number.isSafeInteger(row.version) && row.version > 0
  && Number.isSafeInteger(row.requestedAt) && Number.isSafeInteger(row.updatedAt);

export default function useAdminDashboard(auth) {
  const latest = useRef(auth); latest.current = auth;
  const mounted = useRef(false), generation = useRef(0), revision = useRef(-1), writing = useRef(false);
  const [accounts, setAccounts] = useState([]), [loading, setLoading] = useState(false), [busy, setBusy] = useState(null), [error, setError] = useState('');
  const same = snapshot => mounted.current && allowed(latest.current) && latest.current.account.id === snapshot.account.id
    && latest.current.session === snapshot.session && latest.current.signal === snapshot.signal && !snapshot.signal?.aborted;

  const refresh = useCallback(async () => {
    const scope = latest.current;
    if (!allowed(scope) || writing.current) return;
    const attempt = ++generation.current;
    setLoading(true); setError('');
    try {
      const result = await scope.request('/admin/accounts');
      if (!same(scope) || attempt !== generation.current) return;
      if (!Number.isSafeInteger(result?.revision) || !Array.isArray(result.accounts) || result.accounts.length > 2000
        || !result.accounts.every(validEntry) || new Set(result.accounts.map(row => row.id)).size !== result.accounts.length) throw new Error('La lista de solicitudes no es válida. Vuelve a actualizar el panel.');
      if (result.revision >= revision.current) { revision.current = result.revision; setAccounts(result.accounts); }
    } catch (error) { if (same(scope) && attempt === generation.current) setError(error.message); }
    finally { if (same(scope) && attempt === generation.current) setLoading(false); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    revision.current = -1;
    if (!allowed(auth)) { setAccounts([]); setBusy(null); setLoading(false); setError(''); }
    else void refresh();
    const onFocus = () => { void refresh(); };
    globalThis.addEventListener?.('focus', onFocus);
    return () => { mounted.current = false; generation.current++; globalThis.removeEventListener?.('focus', onFocus); };
  }, [auth.account?.id, auth.session, auth.access?.isAdmin, auth.access?.status, refresh]);

  const decide = useCallback(async (account, status) => {
    const scope = latest.current;
    if (!allowed(scope) || !validEntry(account) || !['approved', 'rejected'].includes(status)) return;
    if (writing.current) return;
    writing.current = true;
    generation.current++;
    setBusy(account.id); setError(''); setLoading(false);
    try {
      const result = await scope.request(`/admin/accounts/${encodeURIComponent(account.id)}`, { method: 'PATCH', body: { status, version: account.version } });
      if (!same(scope)) return;
      if (!validEntry(result?.account) || result.account.id !== account.id || result.account.status !== status || !Number.isSafeInteger(result.revision)) throw new Error('No pudimos confirmar el cambio. Actualiza el panel antes de intentarlo de nuevo.');
      if (result.revision >= revision.current) {
        revision.current = result.revision;
        setAccounts(previous => previous.map(row => row.id === account.id ? result.account : row));
      }
    } catch (error) {
      if (same(scope)) {
        if (error.code === 'access_conflict') { writing.current = false; await refresh(); }
        setError(error.message);
      }
    } finally { writing.current = false; if (same(scope)) setBusy(null); }
  }, [refresh]);

  return { accounts, loading, busy, error, refresh, decide };
}
