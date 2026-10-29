import { useI18n } from './i18n.jsx';
import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { loadGoogleIdentity } from './google-auth.js';

export default function GoogleSignIn({ auth, theme }) {
  const { t, resolvedLanguage } = useI18n();
  const button = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const activeTheme = theme || globalThis.document?.documentElement.dataset.theme || 'dark';
  useEffect(() => {
    let cancelled = false, observer;
    setLoading(true); setLoadError('');
    loadGoogleIdentity(resolvedLanguage).then(sdk => {
      if (cancelled || !button.current) return;
      auth.initialize(sdk);
      let lastWidth;
      function render() {
        if (cancelled || !button.current) return;
        const width = Math.max(200, Math.min(400, Math.floor(button.current.parentElement.clientWidth)));
        if (width === lastWidth) return;
        lastWidth = width;
        button.current.replaceChildren();
        sdk.renderButton(button.current, { type: 'standard', theme: activeTheme === 'dark' ? 'filled_black' : 'outline', size: 'large', text: 'continue_with', locale: resolvedLanguage, shape: 'rectangular', width });
      }
      render();
      if (globalThis.ResizeObserver) {
        observer = new ResizeObserver(render);
        observer.observe(button.current.parentElement);
      }
      setLoading(false);
    }).catch(error => { if (!cancelled) { setLoading(false); setLoadError(error.message); } });
    return () => { cancelled = true; observer?.disconnect(); };
  }, [auth.initialize, activeTheme, attempt, resolvedLanguage]);
  return <>
    <div className="google-signin" data-theme={activeTheme} hidden={!!loadError} aria-busy={loading || auth.busy}>
      <div className="google-signin-button" ref={button} hidden={loading || auth.busy} />
      {(loading || auth.busy) && <p className="google-signin-status" role="status"><LoaderCircle size={18} aria-hidden="true" />{auth.busy ? t("Verificando tu cuenta…") : t("Conectando con Google…")}</p>}
    </div>
    {(loadError || auth.error) && <p className="form-error" role="alert">{t(loadError || auth.error)}</p>}
    {loadError && <button className="button secondary" onClick={() => setAttempt(value => value + 1)}>{t("Reintentar conexión")}</button>}
    {auth.busy && <button className="text-button" onClick={auth.cancelSignIn}>{t("Cancelar verificación")}</button>}
  </>;
}
