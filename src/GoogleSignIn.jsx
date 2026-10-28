import { useEffect, useRef, useState } from 'react';
import { loadGoogleIdentity } from './google-auth.js';

export default function GoogleSignIn({ auth, theme }) {
  const button = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadError('');
    loadGoogleIdentity().then(sdk => {
      if (cancelled) return;
      auth.initialize(sdk);
      button.current.replaceChildren();
      sdk.renderButton(button.current, { type: 'standard', theme: theme === 'dark' ? 'filled_black' : 'outline', size: 'large', text: 'continue_with', locale: 'es', shape: 'rectangular' });
      setLoading(false);
    }).catch(error => { if (!cancelled) { setLoading(false); setLoadError(error.message); } });
    return () => { cancelled = true; };
  }, [auth.initialize, theme, attempt]);
  return <>
    <div className="google-signin" hidden={!!loadError} aria-busy={loading || auth.busy}>
      <div ref={button} hidden={auth.busy} />
      {(loading || auth.busy) && <p role="status">{auth.busy ? 'Verificando tu cuenta…' : 'Cargando acceso con Google…'}</p>}
    </div>
    {(loadError || auth.error) && <p className="form-error" role="alert">{loadError || auth.error}</p>}
    {loadError && <button className="button secondary" onClick={() => setAttempt(value => value + 1)}>Reintentar conexión</button>}
    {auth.busy && <button className="text-button" onClick={auth.cancelSignIn}>Cancelar verificación</button>}
  </>;
}
