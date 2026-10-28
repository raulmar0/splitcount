import { useEffect, useRef, useState } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { loadGoogleIdentity } from './google-auth.js';

export default function GoogleAccount({ auth, theme }) {
  const button = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const signedIn = !!auth.session;

  useEffect(() => {
    if (signedIn) return;
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
  }, [auth.initialize, signedIn, theme, attempt]);

  return <section className="settings-section google-account" aria-labelledby="account-heading">
    <h2 id="account-heading">Cuenta</h2>
    {auth.session ? <>
      <div className="account-profile"><span className="avatar" aria-hidden="true">{(auth.session.user.name || auth.session.user.email).slice(0, 1).toUpperCase()}</span><div><strong>{auth.session.user.name || 'Tu cuenta de Google'}</strong><span>{auth.session.user.email}</span></div></div>
      <p className="account-verified" role="status"><ShieldCheck size={16} />Identidad verificada con Google</p>
      <button className="button secondary" onClick={() => auth.signOut()}><LogOut size={17} />Cerrar sesión</button>
    </> : <>
      <p>Inicia sesión con Google o sigue usando Splitcount sin una cuenta.</p>
      <div className="google-signin" hidden={!!loadError} aria-busy={loading || auth.busy}>
        <div ref={button} hidden={auth.busy} />
        {(loading || auth.busy) && <p role="status">{auth.busy ? 'Verificando tu cuenta…' : 'Cargando acceso con Google…'}</p>}
      </div>
      {(loadError || auth.error) && <p className="form-error" role="alert">{loadError || auth.error}</p>}
      {loadError && <button className="button secondary" onClick={() => setAttempt(value => value + 1)}>Reintentar conexión</button>}
      {auth.busy && <button className="text-button" onClick={() => auth.signOut()}>Cancelar</button>}
    </>}
    <p className="settings-note">Esta sesión solo verifica tu identidad; todavía no guarda ni recupera tus grupos con Google y no cambia los permisos de las invitaciones. Al recargar la app o vencer la sesión, tendrás que volver a entrar.</p>
  </section>;
}
