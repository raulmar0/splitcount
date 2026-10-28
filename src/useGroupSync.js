import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SyncError, attachRemoteGroup, commitSharedGroup, createSharedGroup,
  fetchSharedGroup, isSharedMetadata, parseInvite,
} from './sync.js';
import { canonicalizeGroup } from './sync-protocol.js';
import { validateState } from './domain.js';

const INVALID_SHARING = 'Este grupo tiene datos de sincronización inválidos. Conservamos tu copia local.';
const OFFLINE = 'Sin conexión. Conservamos la última copia del grupo.';
const isOffline = () => globalThis.navigator?.onLine === false;
const hasSharing = group => !!group && Object.hasOwn(group, '_shared');
const validSharing = group => isSharedMetadata(group?._shared) && group._shared.id === group.id;
const messageOf = error => error instanceof Error && error.message
  ? error.message : 'No se pudo sincronizar el grupo. Vuelve a intentarlo.';
const failureStatus = error => isOffline() || error?.code === 'network' ? 'offline' : 'error';

export default function useGroupSync({ state, setState, onJoined, enabled = true, signal, registerShared }) {
  const access = useRef({ enabled, signal, registerShared });
  access.current = { enabled, signal, registerShared };
  const sameAccess = scope => access.current.enabled && access.current.signal === scope.signal && !scope.signal?.aborted;
  const requireAccess = (scope = access.current) => { if (!sameAccess(scope)) throw new SyncError('Vuelve a iniciar sesión para guardar en tu cuenta. Tu borrador se conserva.', 'auth_required'); };
  const stateRef = useRef(state);
  stateRef.current = state;
  const onJoinedRef = useRef(onJoined);
  onJoinedRef.current = onJoined;
  const pendingSet = useRef(new Set());
  const pollingSet = useRef(new Set());
  const mounted = useRef(true);
  const initialInviteHandled = useRef(false);
  const lastInvite = useRef(null);
  const joinAttempt = useRef(0);
  const [groupResults, setGroupResults] = useState({});
  const [joinState, setJoinState] = useState(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const report = useCallback((id, status, error = '') => {
    if (mounted.current) setGroupResults(previous => ({ ...previous, [id]: { status, error } }));
  }, []);

  // Validate every response, and preserve the viewer chosen on this device.
  // The checks inside the updater also cover edits queued since the request began.
  const cacheEnvelope = useCallback((id, envelope, capability, scope = access.current) => {
    const cached = stateRef.current.groups.find(group => group.id === id);
    const remote = attachRemoteGroup(cached, envelope, capability);
    if (!mounted.current || !sameAccess(scope)) return remote;
    setState(previous => ({
      ...previous,
      groups: previous.groups.map(current => {
        if (!sameAccess(scope) || current.id !== id || !validSharing(current)
          || current._shared.token !== capability.token
          || current._shared.revision > remote._shared.revision) return current;
        return attachRemoteGroup(current, envelope, capability);
      }),
    }));
    return validSharing(cached) && cached._shared.token === capability.token
      && cached._shared.revision > remote._shared.revision ? cached : remote;
  }, [setState]);

  const poll = useCallback(async (id = stateRef.current.activeGroupId) => {
    const group = stateRef.current.groups.find(item => item.id === id);
    if (!access.current.enabled || !hasSharing(group) || pendingSet.current.has(id) || pollingSet.current.has(id)) return;
    if (!validSharing(group)) { report(id, 'error', INVALID_SHARING); return; }
    if (isOffline()) { report(id, 'offline', OFFLINE); return; }
    const capability = group._shared;
    const scope = access.current;
    pollingSet.current.add(id);
    try {
      const envelope = await fetchSharedGroup(capability, { signal: scope.signal });
      if (!mounted.current || !sameAccess(scope) || pendingSet.current.has(id)) return;
      const current = stateRef.current.groups.find(item => item.id === id);
      if (!validSharing(current) || current._shared.token !== capability.token) return;
      // A response that began before a save must never rewind the cache.
      if (envelope.revision > current._shared.revision) {
        const remote = attachRemoteGroup(current, envelope, capability);
        setState(previous => ({
          ...previous,
          groups: previous.groups.map(item => {
            if (!sameAccess(scope) || item.id !== id || pendingSet.current.has(id) || !validSharing(item)
              || item._shared.token !== capability.token
              || item._shared.revision >= remote._shared.revision) return item;
            return attachRemoteGroup(item, envelope, capability);
          }),
        }));
      }
      report(id, 'synced');
    } catch (error) {
      const current = stateRef.current.groups.find(item => item.id === id);
      if (sameAccess(scope) && !pendingSet.current.has(id) && validSharing(current)
        && current._shared.token === capability.token) report(id, failureStatus(error), messageOf(error));
    } finally {
      pollingSet.current.delete(id);
    }
  }, [report, setState]);

  const joinGroup = useCallback(async (capability) => {
    const retry = capability === undefined;
    capability ??= lastInvite.current;
    const attempt = ++joinAttempt.current;
    lastInvite.current = capability;
    const scope = access.current;
    setJoinState({ loading: true, error: '' });
    try {
      requireAccess(scope);
      const envelope = await fetchSharedGroup(capability, { signal: scope.signal });
      if (!mounted.current || !sameAccess(scope) || attempt !== joinAttempt.current) return null;
      const existing = stateRef.current.groups.find(group => group.id === capability.id);
      const received = attachRemoteGroup(existing, envelope, capability);
      let remote = validSharing(existing) && existing._shared.token === capability.token
        && existing._shared.revision > received._shared.revision ? existing : received;
      if (scope.registerShared) remote = await scope.registerShared(remote, { retry });
      if (!mounted.current || attempt !== joinAttempt.current || !sameAccess(scope)) return null;
      setState(previous => {
        if (!sameAccess(scope)) return previous;
        const current = previous.groups.find(group => group.id === remote.id);
        const joined = current && validSharing(current) && current._shared.token === capability.token
          && current._shared.revision >= remote._shared.revision
          ? { ...current } : attachRemoteGroup(current ?? remote, { group: remote, revision: remote._shared.revision }, capability);
        if (remote._account && (!joined._account || joined._account.version <= remote._account.version)) {
          joined._account = remote._account;
          if (remote._selfId) joined._selfId = remote._selfId;
          else delete joined._selfId;
        }
        return {
          ...previous,
          activeGroupId: joined.id,
          groups: current ? previous.groups.map(group => group.id === joined.id ? joined : group)
            : [...previous.groups, joined],
        };
      });
      report(remote.id, 'synced');
      const invitation = parseInvite(globalThis.location?.hash);
      if (invitation?.id === capability.id && invitation.token === capability.token) {
        globalThis.history?.replaceState(globalThis.history.state, '',
          `${globalThis.location.pathname}${globalThis.location.search}`);
      }
      setJoinState(null);
      onJoinedRef.current?.(remote);
      return remote;
    } catch (error) {
      if (mounted.current && attempt === joinAttempt.current) {
        setJoinState({ loading: false, error: messageOf(error) });
      }
      return null;
    }
  }, [report, setState]);

  useEffect(() => {
    const handleInvite = () => {
      const hash = globalThis.location?.hash ?? '';
      const capability = parseInvite(hash);
      if (capability) void joinGroup(capability);
      else if (hash.startsWith('#grupo=')) {
        joinAttempt.current += 1;
        setJoinState({ loading: false, error: 'El enlace del grupo no es válido. Pide que te lo compartan de nuevo.' });
      }
    };
    if (!initialInviteHandled.current) {
      initialInviteHandled.current = true;
      handleInvite();
    }
    globalThis.addEventListener?.('hashchange', handleInvite);
    return () => globalThis.removeEventListener?.('hashchange', handleInvite);
  }, [joinGroup]);

  const active = state.groups.find(group => group.id === state.activeGroupId);
  const activeId = active?.id;
  const activeToken = validSharing(active) ? active._shared.token : null;
  useEffect(() => {
    if (!activeToken || !enabled) return undefined;
    const refresh = () => { void poll(activeId); };
    const offline = () => { if (!pendingSet.current.has(activeId)) report(activeId, 'offline', OFFLINE); };
    refresh();
    const interval = globalThis.setInterval(refresh, 3000);
    globalThis.addEventListener?.('focus', refresh);
    globalThis.addEventListener?.('online', refresh);
    globalThis.addEventListener?.('offline', offline);
    return () => {
      globalThis.clearInterval(interval);
      globalThis.removeEventListener?.('focus', refresh);
      globalThis.removeEventListener?.('online', refresh);
      globalThis.removeEventListener?.('offline', offline);
    };
  }, [activeId, activeToken, enabled, poll, report]);

  const saveGroup = useCallback(async (after, before) => {
    const scope = access.current;
    requireAccess(scope);
    const baseline = before ?? stateRef.current.groups.find(group => group.id === after.id);
    if (!baseline) throw new SyncError('Este grupo ya no está disponible.');
    if (pendingSet.current.has(baseline.id)) throw new SyncError('Espera a que termine de guardarse el cambio anterior.');
    if (!hasSharing(baseline)) {
      if (after.id !== baseline.id || !validateState({ version: 1, activeGroupId: after.id, groups: [after] })) {
        throw new SyncError('El cambio no es válido para este grupo. Comprueba los integrantes y vuelve a intentarlo.', 'invalid_group');
      }
      setState(previous => ({ ...previous, groups: previous.groups.map(group => group.id === baseline.id ? after : group) }));
      return after;
    }
    if (!validSharing(baseline)) throw new SyncError(INVALID_SHARING, 'access');
    pendingSet.current.add(baseline.id);
    report(baseline.id, 'pending');
    try {
      const saved = await commitSharedGroup(baseline, after, { signal: scope.signal });
      requireAccess(scope);
      const remote = cacheEnvelope(baseline.id, { group: saved, revision: saved._shared.revision }, baseline._shared, scope);
      report(baseline.id, 'synced');
      return remote;
    } catch (error) {
      if (sameAccess(scope) && error instanceof SyncError && error.code === 'conflict' && error.latest) {
        // Keep the form's draft open while the rest of the app gets the latest data.
        try { cacheEnvelope(baseline.id, error.latest, baseline._shared, scope); } catch { /* Retain the valid cache. */ }
      }
      report(baseline.id, failureStatus(error), messageOf(error));
      throw error;
    } finally {
      pendingSet.current.delete(baseline.id);
    }
  }, [cacheEnvelope, report, setState]);

  const shareGroup = useCallback(async (before, name, selfId) => {
    const scope = access.current;
    requireAccess(scope);
    if (!before.members.some(member => member.id === selfId) || typeof name !== 'string' || !name.trim()) {
      throw new SyncError('Elige quién eres y escribe tu nombre para compartir el grupo.');
    }
    if (hasSharing(before)) {
      if (!validSharing(before)) throw new SyncError(INVALID_SHARING, 'access');
      return before;
    }
    if (pendingSet.current.has(before.id)) throw new SyncError('El grupo ya se está compartiendo.');
    const snapshot = JSON.stringify(canonicalizeGroup(before));
    const unchanged = current => {
      if (!current || hasSharing(current)) return false;
      try { return JSON.stringify(canonicalizeGroup(current)) === snapshot; } catch { return false; }
    };
    const changedError = () => new SyncError('El grupo cambió mientras se preparaba el enlace. Conservamos tu versión local; vuelve a compartirla.', 'local_changed');
    if (!unchanged(stateRef.current.groups.find(group => group.id === before.id))) throw changedError();
    pendingSet.current.add(before.id);
    report(before.id, 'pending');
    try {
      const remote = await createSharedGroup({
        ...before,
        _selfId: selfId,
        members: before.members.map(member => member.id === selfId ? { ...member, name: name.trim() } : member),
      }, { signal: scope.signal });
      requireAccess(scope);
      if (!unchanged(stateRef.current.groups.find(group => group.id === before.id))) throw changedError();
      if (mounted.current) setState(previous => {
        // An import queued after the response check must also retain its data.
        if (!sameAccess(scope) || !unchanged(previous.groups.find(group => group.id === before.id))) return previous;
        return {
          ...previous,
          activeGroupId: remote.id,
          groups: previous.groups.map(group => group.id === before.id ? remote : group),
        };
      });
      report(remote.id, 'synced');
      report(before.id, 'local');
      return remote;
    } catch (error) {
      report(before.id, failureStatus(error), messageOf(error));
      throw error;
    } finally {
      pendingSet.current.delete(before.id);
    }
  }, [report, setState]);

  const retrySync = useCallback(() => poll(), [poll]);
  const dismissJoin = useCallback(() => {
    joinAttempt.current += 1;
    setJoinState(null);
  }, []);
  const result = groupResults[activeId];
  const invalid = hasSharing(active) && !validSharing(active);
  const status = !enabled ? 'error' : invalid ? 'error' : pendingSet.current.has(activeId) ? 'pending'
    : !hasSharing(active) ? (result?.status === 'error' || result?.status === 'offline' ? result.status : 'local')
      : isOffline() ? 'offline' : result?.status ?? 'pending';
  const error = !enabled ? 'Vuelve a iniciar sesión para sincronizar. Tu copia se conserva.' : invalid ? INVALID_SHARING : status === 'offline' ? result?.error || OFFLINE : result?.error || '';

  return { status, error, joinState, joinGroup, retrySync, saveGroup, shareGroup, dismissJoin };
}
