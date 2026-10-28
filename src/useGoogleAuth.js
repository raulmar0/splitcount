import { useCallback, useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID } from './google-config.js';
import { verifyGoogleCredential } from './google-auth.js';
import { accountRequest, isAccountApiPath } from './account-sync.js';
import { clearAccountCache } from './workspace-storage.js';
import { SyncError } from './sync.js';

function requireAccess(access, path) {
  if (path.startsWith('/admin/')) {
    if (access.status !== 'approved' || !access.isAdmin) throw new SyncError('Esta acción requiere una cuenta administradora aprobada.', 'forbidden');
  } else if (access.status !== 'approved') {
    throw new SyncError(access.status === 'rejected'
      ? 'Tu acceso para compartir grupos fue rechazado. Tus grupos locales se conservan.'
      : 'Tu cuenta espera aprobación para recuperar grupos con Google. Puedes seguir en modo invitado con 1 grupo compartido y grupos locales ilimitados.', `account_${access.status}`);
  }
}

export default function useGoogleAuth() {
  const [session, setSession] = useState(null);
  const [account, setAccount] = useState(null);
  const [access, setAccess] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const pending = useRef(null);
  const initialized = useRef(null);
  const identity = useRef(null);
  const currentAccount = useRef(null);

  useEffect(() => () => { sequence.current++; pending.current?.abort(); identity.current?.controller.abort(); identity.current = null; }, []);

  const expire = useCallback((message = 'Tu sesión venció. Vuelve a iniciar sesión con Google.') => {
    identity.current?.controller.abort();
    identity.current = null;
    setSession(null); setBusy(false); setError(message);
  }, []);

  const signOut = useCallback(() => {
    sequence.current++;
    pending.current?.abort();
    expire('');
    if (currentAccount.current) clearAccountCache(currentAccount.current.id);
    currentAccount.current = null;
    setAccount(null);
    setAccess(null);
    globalThis.google?.accounts?.id?.disableAutoSelect();
  }, [expire]);

  const signIn = useCallback(async credential => {
    const attempt = ++sequence.current;
    pending.current?.abort();
    identity.current?.controller.abort();
    identity.current = null;
    const controller = new AbortController();
    pending.current = controller;
    setSession(null); setBusy(true); setError('');
    try {
      const verified = await verifyGoogleCredential(credential, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) });
      if (sequence.current === attempt) {
        if (currentAccount.current && currentAccount.current.id !== verified.user.id) throw new Error('Entra con la misma cuenta para conservar este espacio. Para cambiar de cuenta, cierra sesión primero.');
        identity.current = { credential, expiresAt: verified.expiresAt, access: verified.access, controller: new AbortController() };
        currentAccount.current = verified.user;
        setAccount(verified.user);
        setAccess(verified.access);
        setSession(verified);
      }
    } catch (error) {
      if (sequence.current === attempt) setError(error.message);
    } finally {
      if (sequence.current === attempt) { setBusy(false); pending.current = null; }
    }
  }, []);

  const cancelSignIn = useCallback(() => {
    sequence.current++;
    pending.current?.abort();
    expire('');
  }, [expire]);

  const refreshAccess = useCallback(async () => {
    const active = identity.current;
    if (!active || Date.now() >= active.expiresAt) {
      expire();
      throw new SyncError('Vuelve a iniciar sesión para comprobar tu acceso.', 'auth_required');
    }
    const attempt = ++sequence.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError('');
    try {
      const verified = await verifyGoogleCredential(active.credential, { signal: AbortSignal.any([controller.signal, active.controller.signal, AbortSignal.timeout(12000)]) });
      if (sequence.current !== attempt || identity.current !== active) throw new SyncError('La sesión cambió. La solicitud se descartó.', 'auth_required');
      if (verified.user.id !== currentAccount.current?.id) throw new Error('Entra con la misma cuenta para conservar este espacio. Para cambiar de cuenta, cierra sesión primero.');
      active.expiresAt = verified.expiresAt;
      active.access = verified.access;
      setAccount(verified.user);
      setAccess(verified.access);
      setSession(verified);
      return verified;
    } catch (error) {
      if (sequence.current === attempt && identity.current === active) expire(error.message);
      throw error;
    } finally {
      if (sequence.current === attempt) { setBusy(false); pending.current = null; }
    }
  }, [expire]);

  const request = useCallback(async (path, options = {}) => {
    const active = identity.current;
    if (!active || Date.now() >= active.expiresAt) {
      expire();
      throw new SyncError('Vuelve a iniciar sesión para sincronizar tus grupos.', 'auth_required');
    }
    if (!isAccountApiPath(path)) throw new SyncError('La ruta de tu cuenta no es válida.', 'invalid_request');
    requireAccess(active.access, path);
    const requestedAccess = active.access;
    try {
      const result = await accountRequest(active.credential, path, {
        method: options.method, body: options.body,
        signal: options.signal ? AbortSignal.any([options.signal, active.controller.signal]) : active.controller.signal,
      });
      if (identity.current !== active) throw new SyncError('La sesión cambió. La solicitud se descartó.', 'auth_required');
      if (Date.now() >= active.expiresAt) throw new SyncError('Tu sesión venció. Vuelve a iniciar sesión para sincronizar.', 'auth_required');
      requireAccess(active.access, path);
      return result;
    } catch (error) {
      if (identity.current === active && error.code === 'auth_required') expire(error.message);
      if (identity.current === active && active.access === requestedAccess && ['account_pending', 'account_rejected'].includes(error.code)) {
        const access = { status: error.code === 'account_pending' ? 'pending' : 'rejected', isAdmin: false };
        active.access = access;
        setAccess(access);
        setSession(previous => previous ? { ...previous, access } : previous);
      }
      throw error;
    }
  }, [expire]);

  const initialize = useCallback(sdk => {
    if (initialized.current === sdk) return;
    sdk.initialize({ client_id: GOOGLE_CLIENT_ID, ux_mode: 'popup', auto_select: false, callback: response => { void signIn(response?.credential); } });
    initialized.current = sdk;
  }, [signIn]);

  useEffect(() => {
    if (!session) return;
    const check = () => { if (Date.now() >= session.expiresAt) expire(); };
    const timer = setTimeout(check, Math.max(0, session.expiresAt - Date.now()));
    globalThis.addEventListener('focus', check);
    globalThis.addEventListener('visibilitychange', check);
    return () => { clearTimeout(timer); globalThis.removeEventListener('focus', check); globalThis.removeEventListener('visibilitychange', check); };
  }, [session, expire]);

  return { session, account, access, busy, error, initialize, signOut, cancelSignIn, refreshAccess, request, signal: identity.current?.controller.signal };
}
