import { useCallback, useEffect, useRef, useState } from 'react';
import { attachAccountGroup, isAccountEntry, registrationBody, validateDirectory } from './account-sync.js';
import { fetchSharedGroup, SyncError } from './sync.js';
import { validateState } from './domain.js';

const authError = () => new SyncError('Vuelve a iniciar sesión para sincronizar. Tus datos y borradores se conservan.', 'auth_required');
const accountAccess = auth => auth.access ?? auth.session?.access;
const accessError = auth => {
  if (!auth.session || Date.now() >= auth.session.expiresAt) return authError();
  const status = accountAccess(auth)?.status;
  if (status === 'pending') return new SyncError('Tu cuenta está pendiente de aprobación. Puedes usar el modo invitado con 1 grupo compartido y grupos locales ilimitados.', 'account_pending');
  if (status === 'rejected') return new SyncError('Tu acceso para compartir grupos fue rechazado. Tus grupos locales se conservan.', 'account_rejected');
  return status === 'approved' ? null : authError();
};
const errorStatus = error => error.code === 'account_pending' ? 'pending_approval'
  : error.code === 'account_rejected' ? 'rejected' : error.code === 'auth_required' ? 'expired' : 'error';
const available = auth => !accessError(auth);
const validRevision = revision => Number.isSafeInteger(revision) && revision >= 0;
const localSnapshot = group => JSON.stringify(group, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
const isLocalGroup = group => group?._shared === undefined && group?._account === undefined;
const findLocalGroup = (groups, id) => groups.find(group => group.id === id && isLocalGroup(group));
const localConflict = () => new SyncError('Ya existe un grupo local con el mismo identificador y datos distintos. Conservamos el grupo actual.', 'local_conflict');
const matchesPublication = (candidate, local) => {
  const { _selfId: selectedId, ...submitted } = candidate;
  const { _selfId, ...current } = local;
  return localSnapshot({ ...submitted, members: submitted.members.map(member => member.id === selectedId
    ? { ...member, name: current.members.find(item => item.id === member.id)?.name } : member) }) === localSnapshot(current);
};

export default function useAccountSync({ auth, state, setState, paused = false }) {
  const latest = useRef({ auth, state, paused });
  latest.current = { auth, state, paused };
  const mounted = useRef(false);
  const epoch = useRef(0);
  const reading = useRef(false);
  const writing = useRef(false);
  const revision = useRef(state.accountRevision ?? 0);
  const [status, setStatus] = useState(() => auth.account ? accessError(auth) ? errorStatus(accessError(auth)) : 'pending' : 'guest');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; epoch.current++; };
  }, []);

  const check = useCallback(signal => {
    if (!mounted.current || !latest.current.auth.session || latest.current.auth.signal !== signal || signal?.aborted) throw authError();
    const error = accessError(latest.current.auth);
    if (error) throw error;
  }, []);

  const refresh = useCallback(async () => {
    const { auth, paused } = latest.current;
    if (!auth.account || !auth.session || paused || reading.current || writing.current) return;
    const blocked = accessError(auth);
    if (blocked) { setStatus(errorStatus(blocked)); return; }
    const generation = epoch.current;
    const signal = auth.signal;
    reading.current = true;
    setStatus(previous => previous === 'synced' ? previous : 'pending'); setError('');
    try {
      const directory = validateDirectory(await auth.request('/account/groups'));
      check(signal);
      // Fetch at most four ledgers at once; a failed recovery never replaces the cache with a partial list.
      const recovered = new Array(directory.groups.length);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(4, directory.groups.length) }, async () => {
        while (next < directory.groups.length) {
          const index = next++;
          const entry = directory.groups[index];
          const envelope = await fetchSharedGroup(entry, { signal });
          check(signal);
          recovered[index] = { entry, envelope };
        }
      }));
      check(signal);
      if (generation !== epoch.current || latest.current.paused || directory.revision < revision.current) return;
      revision.current = directory.revision;
      const ids = new Set(directory.groups.map(entry => entry.id));
      for (const key of inviteSources.current.keys()) if (!ids.has(key.split('.')[0])) inviteSources.current.delete(key);
      setState(previous => {
        if (generation !== epoch.current || latest.current.paused || !available(latest.current.auth)) return previous;
        const recoveredGroups = new Map(recovered.map(({ entry, envelope }) => {
          const local = previous.groups.find(group => group.id === entry.id);
          const newest = local?._shared?.token === entry.token && local._shared.revision > envelope.revision
            ? { group: local, revision: local._shared.revision } : envelope;
          return [entry.id, attachAccountGroup(local, newest, entry)];
        }));
        const groups = previous.groups.flatMap(group => {
          const remote = recoveredGroups.get(group.id);
          if (remote) { recoveredGroups.delete(group.id); return [remote]; }
          return group._shared && group._account ? [] : [group];
        });
        groups.push(...recoveredGroups.values());
        return {
          ...previous, groups, accountRevision: directory.revision,
          activeGroupId: groups.some(group => group.id === previous.activeGroupId) ? previous.activeGroupId : groups[0]?.id ?? null,
        };
      });
      setStatus('synced');
    } catch (error) {
      if (mounted.current && generation === epoch.current) {
        setError(error.message); setStatus(errorStatus(error));
      }
    } finally {
      reading.current = false;
      if (generation !== epoch.current && mounted.current && available(latest.current.auth) && !latest.current.paused && !writing.current) void refresh();
    }
  }, [check, setState]);

  const sessionId = auth.session?.expiresAt;
  const accessStatus = accountAccess(auth)?.status;
  useEffect(() => {
    epoch.current++;
    if (!auth.account) { setStatus('guest'); setError(''); return; }
    const blocked = accessError(auth);
    if (blocked) { setStatus(errorStatus(blocked)); setError(''); return; }
    void refresh();
    const interval = globalThis.setInterval(() => { void refresh(); }, 15000);
    const retry = () => { void refresh(); };
    globalThis.addEventListener?.('focus', retry);
    globalThis.addEventListener?.('online', retry);
    return () => {
      epoch.current++;
      globalThis.clearInterval(interval);
      globalThis.removeEventListener?.('focus', retry);
      globalThis.removeEventListener?.('online', retry);
    };
  }, [auth.account?.id, sessionId, auth.signal, accessStatus, paused, refresh]);

  const mutate = useCallback(async operation => {
    const { auth } = latest.current;
    const signal = auth.signal;
    check(signal);
    if (writing.current) throw new SyncError('Espera a que termine de sincronizarse el cambio anterior.');
    epoch.current++;
    writing.current = true;
    setBusy(true); setError('');
    try {
      const result = await operation(auth.request);
      check(signal);
      if (!validRevision(result.revision)) throw new SyncError('El servidor devolvió una revisión inválida.');
      revision.current = Math.max(revision.current, result.revision);
      setStatus('synced');
      return { ...result, requestSignal: signal };
    } catch (error) {
      if (mounted.current) { setError(error.message); setStatus(errorStatus(error)); }
      throw error;
    } finally {
      writing.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [check]);

  const cache = useCallback((result, fallback, sourceSnapshot) => {
    check(result.requestSignal);
    if (!isAccountEntry(result.entry)) throw new SyncError('El servidor devolvió una referencia de grupo inválida.');
    const remote = attachAccountGroup(fallback, result.envelope, result.entry);
    const sourceNow = isLocalGroup(fallback) ? findLocalGroup(latest.current.state.groups, fallback?.id) : null;
    const sourceChanged = sourceNow && localSnapshot(sourceNow) !== sourceSnapshot;
    setState(previous => {
      if (!mounted.current || !available(latest.current.auth) || latest.current.auth.signal !== result.requestSignal || result.requestSignal?.aborted) return previous;
      const existing = previous.groups.find(group => group.id === remote.id);
      const candidateSource = isLocalGroup(fallback) ? findLocalGroup(previous.groups, fallback?.id) : null;
      const source = candidateSource && localSnapshot(candidateSource) === sourceSnapshot ? candidateSource : null;
      if (existing?._account?.version > result.entry.version && !source) return previous;
      const newest = existing?._account?.version > result.entry.version ? existing
        : existing?._shared?.token === remote._shared.token && existing._shared.revision > remote._shared.revision
          ? attachAccountGroup(existing, { group: existing, revision: existing._shared.revision }, result.entry) : remote;
      const groups = source
        ? previous.groups.flatMap(group => group === source ? [newest] : group.id === newest.id ? [] : [group])
        : existing ? previous.groups.map(group => group.id === newest.id ? newest : group) : [...previous.groups, newest];
      return {
        ...previous, accountRevision: Math.max(previous.accountRevision ?? 0, result.revision),
        activeGroupId: source?.id === previous.activeGroupId ? newest.id : previous.activeGroupId ?? newest.id,
        groups,
      };
    });
    if (sourceChanged) throw new SyncError('El grupo se compartió, pero tu copia local cambió durante la solicitud. Conservamos ambas copias para que revises tus cambios.', 'local_conflict');
    return remote;
  }, [check, setState]);

  const registerGroup = useCallback(async (group, sourceId, allowIdentityChange = false) => {
    check(latest.current.auth.signal);
    const body = registrationBody(group, sourceId);
    const source = isLocalGroup(group) ? findLocalGroup(latest.current.state.groups, group.id) : null;
    if (source && !(allowIdentityChange ? matchesPublication(group, source) : localSnapshot(group) === localSnapshot(source))) throw localConflict();
    const sourceSnapshot = source ? localSnapshot(source) : undefined;
    const result = await mutate(request => request('/account/groups', { method: 'POST', body }));
    return cache(result, group, sourceSnapshot);
  }, [mutate, cache, check]);

  const createGroup = useCallback(group => registerGroup(group, `create:${group.id}`, true), [registerGroup]);

  const addLocalGroup = useCallback(group => {
    const accountId = latest.current.auth.account?.id;
    if (!mounted.current || !accountId) throw authError();
    if (group?._shared !== undefined || group?._account !== undefined
      || !validateState({ version: 1, activeGroupId: group?.id, groups: [group] })
      || latest.current.state.groups.some(item => item.id === group.id)) {
      throw new SyncError('El grupo local no es válido o ya existe.', 'invalid_group');
    }
    // Make consecutive local additions visible to a backup retry before React renders.
    latest.current.state = { ...latest.current.state, activeGroupId: latest.current.state.activeGroupId ?? group.id, groups: [...latest.current.state.groups, group] };
    setState(previous => {
      if (!mounted.current || latest.current.auth.account?.id !== accountId || previous.groups.some(item => item.id === group.id)) return previous;
      return { ...previous, activeGroupId: previous.activeGroupId ?? group.id, groups: [...previous.groups, group] };
    });
    return group;
  }, [setState]);

  const inviteSources = useRef(new Map());
  const registerShared = useCallback((group, { retry = false } = {}) => {
    check(latest.current.auth.signal);
    const key = `${group.id}.${group._shared.token}`;
    if (!retry || !inviteSources.current.has(key)) inviteSources.current.set(key, `invite:${crypto.randomUUID()}`);
    return registerGroup(group, inviteSources.current.get(key));
  }, [registerGroup, check]);

  const incorporate = useCallback(async groups => {
    check(latest.current.auth.signal);
    for (const group of groups) await registerGroup(group, `${group._shared ? 'link' : 'import'}:${group.id}`);
  }, [registerGroup, check]);

  const restoreBackup = useCallback(async groups => {
    const accountId = latest.current.auth.account?.id;
    if (!mounted.current || !accountId) throw authError();
    if (!Array.isArray(groups)) throw new SyncError('El respaldo no contiene una lista de grupos válida.', 'invalid_group');
    for (const group of groups) {
      if (!mounted.current || latest.current.auth.account?.id !== accountId) throw authError();
      if (!validateState({ version: 1, activeGroupId: group?.id, groups: [group] })) {
        throw new SyncError('El respaldo contiene un grupo inválido.', 'invalid_group');
      }
      if (group._shared !== undefined) await incorporate([group]);
      else {
        const { _account, ...local } = group;
        const existing = latest.current.state.groups.find(item => item.id === local.id);
        if (existing) {
          if (existing._shared !== undefined || existing._account !== undefined || localSnapshot(existing) !== localSnapshot(local)) {
            throw localConflict();
          }
        } else addLocalGroup(local);
      }
    }
  }, [incorporate, addLocalGroup]);

  const chooseIdentity = useCallback(async (group, selfId) => {
    const signal = latest.current.auth.signal;
    check(signal);
    const cached = latest.current.state.groups.find(item => item.id === group.id);
    const current = cached && cached._shared.revision >= group._shared.revision ? cached : group;
    if (!current._account) throw new SyncError('Este grupo todavía no está vinculado a tu cuenta.');
    let result;
    try {
      result = await mutate(request => request(`/account/groups/${group.id}`, {
        method: 'PATCH', body: { selfId, version: current._account.version },
      }));
    } catch (error) {
      if (error.code === 'account_conflict' && error.latest?.entry === null && validRevision(error.latest.revision)) {
        throw new SyncError('Ya saliste de este grupo en otro dispositivo. Cierra este formulario para actualizar la lista; tu texto se conserva hasta que lo cierres.', 'group_removed');
      }
      if (error.code === 'account_conflict' && isAccountEntry(error.latest?.entry) && error.latest.entry.id === group.id) {
        cache({ ...error.latest, envelope: { group: current, revision: current._shared.revision }, requestSignal: signal }, current);
      }
      throw error;
    }
    if (result.entry?.id !== group.id) throw new SyncError('La identidad recibida no corresponde a este grupo.');
    return cache({ ...result, envelope: { group: current, revision: current._shared.revision } }, current);
  }, [mutate, cache, check]);

  const leaveGroup = useCallback(async group => {
    const signal = latest.current.auth.signal;
    check(signal);
    const current = latest.current.state.groups.find(item => item.id === group.id) ?? group;
    let result;
    try {
      result = await mutate(request => request(`/account/groups/${group.id}`, {
        method: 'DELETE', body: { version: current._account.version },
      }));
    } catch (error) {
      if (error.code === 'account_conflict' && error.latest?.entry === null && validRevision(error.latest.revision)) {
        check(signal);
        result = { revision: error.latest.revision, requestSignal: signal };
      } else {
        if (error.code === 'account_conflict' && isAccountEntry(error.latest?.entry) && error.latest.entry.id === group.id) {
          cache({ ...error.latest, envelope: { group: current, revision: current._shared.revision }, requestSignal: signal }, current);
        }
        throw error;
      }
    }
    setState(previous => {
      if (!mounted.current || !available(latest.current.auth) || latest.current.auth.signal !== result.requestSignal || result.requestSignal?.aborted) return previous;
      const groups = previous.groups.filter(item => item.id !== group.id);
      return { ...previous, groups, accountRevision: Math.max(previous.accountRevision ?? 0, result.revision), activeGroupId: previous.activeGroupId === group.id ? groups[0]?.id ?? null : previous.activeGroupId };
    });
    inviteSources.current.delete(`${group.id}.${group._shared.token}`);
  }, [mutate, setState, cache, check]);

  return { status, error, busy, refresh, createGroup, addLocalGroup, registerShared, incorporate, restoreBackup, chooseIdentity, leaveGroup };
}
