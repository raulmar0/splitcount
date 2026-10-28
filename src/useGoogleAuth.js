import { useCallback, useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID } from './google-config.js';
import { verifyGoogleCredential } from './google-auth.js';

export default function useGoogleAuth() {
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const pending = useRef(null);
  const initialized = useRef(null);

  useEffect(() => () => { sequence.current++; pending.current?.abort(); }, []);

  const signOut = useCallback((message = '') => {
    sequence.current++;
    pending.current?.abort();
    setSession(null); setBusy(false); setError(message);
    globalThis.google?.accounts?.id?.disableAutoSelect();
  }, []);

  const signIn = useCallback(async credential => {
    const attempt = ++sequence.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setSession(null); setBusy(true); setError('');
    try {
      const verified = await verifyGoogleCredential(credential, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) });
      if (sequence.current === attempt) setSession(verified);
    } catch (error) {
      if (sequence.current === attempt) setError(error.message);
    } finally {
      if (sequence.current === attempt) { setBusy(false); pending.current = null; }
    }
  }, []);

  const initialize = useCallback(sdk => {
    if (initialized.current === sdk) return;
    sdk.initialize({ client_id: GOOGLE_CLIENT_ID, ux_mode: 'popup', auto_select: false, callback: response => { void signIn(response?.credential); } });
    initialized.current = sdk;
  }, [signIn]);

  useEffect(() => {
    if (!session) return;
    const check = () => { if (Date.now() >= session.expiresAt) signOut('Tu sesión venció. Vuelve a iniciar sesión con Google.'); };
    const timer = setTimeout(check, Math.max(0, session.expiresAt - Date.now()));
    globalThis.addEventListener('focus', check);
    globalThis.addEventListener('visibilitychange', check);
    return () => { clearTimeout(timer); globalThis.removeEventListener('focus', check); globalThis.removeEventListener('visibilitychange', check); };
  }, [session, signOut]);

  return { session, busy, error, initialize, signOut };
}
