import { useI18n } from './i18n.jsx';
import { useState } from 'react';
import { Cloud, LogOut, RefreshCw, Upload } from 'lucide-react';
import { sharedGroupLimit } from './group-limits.js';
import GoogleSignIn from './GoogleSignIn.jsx';

export default function GoogleAccount({ auth, theme, accountSync, count = 0, sharedCount = 0, onAddLocal }) {
  const { t } = useI18n();
  const [checking, setChecking] = useState(false), [error, setError] = useState('');
  const approved = auth.access?.status === 'approved';
  async function checkApproval() {
    setChecking(true); setError('');
    try { await auth.refreshAccess(); } catch (error) { setError(error.message); }
    finally { setChecking(false); }
  }
  return <section className="settings-section google-account" aria-labelledby="account-heading">
    <h2 id="account-heading">{t("Cuenta")}</h2>
    {auth.account ? <>
      <div className="account-profile"><span className="avatar" aria-hidden="true">{(auth.account.name || auth.account.email).slice(0, 1).toUpperCase()}</span><div><strong>{auth.account.name || t("Tu cuenta de Google")}</strong><span>{auth.account.email}</span></div></div>
      <p className="account-verified" role="status"><Cloud size={16} />{!auth.session ? t("Sesión vencida · copia conservada") : auth.access?.status === 'pending' ? t('Aprobación pendiente · {count} de 1 grupo compartido', { count: sharedCount }) : auth.access?.status === 'rejected' ? t("Sin acceso a sincronización") : accountSync.status === 'pending' ? t("Recuperando tus grupos…") : t('{used} de {limit} grupos compartidos · {local} locales', { used: sharedCount, limit: sharedGroupLimit(true), local: count - sharedCount })}</p>
      {auth.session ? approved ? <div className="account-actions">
        <button className="button secondary" disabled={accountSync.busy} onClick={onAddLocal}><Upload size={17} />{t("Añadir grupos de este dispositivo")}</button>
        <button className="text-button" disabled={accountSync.busy} onClick={() => { void accountSync.refresh(); }}><RefreshCw size={16} />{t("Actualizar grupos")}</button>
      </div> : <>
        <p>{auth.access?.status === 'rejected' ? t("El administrador no ha autorizado la sincronización de esta cuenta. Puedes crear y usar grupos locales sin límite.") : t("Tu solicitud ya está enviada. Mientras esperas aprobación puedes usar grupos locales ilimitados y 1 grupo compartido, igual que en modo invitado. Al aprobarte tendrás hasta 6 compartidos en tu cuenta.")}</p>
        <button className="button secondary" disabled={checking} onClick={checkApproval}><RefreshCw size={17} />{checking ? t("Consultando…") : t("Comprobar aprobación")}</button>
      </> : <GoogleSignIn auth={auth} theme={theme} />}
      {(error || accountSync.error) && <p className="form-error" role="alert">{t(error || accountSync.error)}</p>}
      <button className="button secondary" onClick={() => auth.signOut()}><LogOut size={17} />{t("Cerrar sesión")}</button>
    </> : <>
      <p>{t("Sin cuenta: 1 grupo compartido. Con Google y aprobación: hasta 6 grupos compartidos.")}</p>
      <GoogleSignIn auth={auth} theme={theme} />
      <p className="settings-note">{t("Mientras esperas aprobación sigues en modo invitado, con 1 grupo compartido. La aprobación habilita los 6 grupos compartidos y su recuperación con Google.")}</p>
    </>}
    <p className="settings-note">{t("Grupos locales ilimitados y sin límite de movimientos en ambos modos.")}</p>
    <p className="settings-note">{auth.access?.status === 'pending' ? t("Tus grupos siguen en el espacio invitado de este navegador, también al cerrar sesión. Al aprobarte podrás incorporarlos a tu cuenta desde Ajustes; sus originales se conservan.") : auth.account ? t("Tus grupos compartidos se recuperan al entrar con esta cuenta en otro dispositivo. Los locales permanecen en este navegador. Cerrar sesión limpia la copia de los compartidos y conserva los locales para cuando vuelvas a entrar.") : t("Con una cuenta aprobada puedes recuperar tus grupos en otros dispositivos. Tus grupos locales solo se incorporan cuando tú los eliges.")} {t("Al recargar o vencer la sesión, vuelve a entrar. Los enlaces de invitación conservan sus permisos.")}</p>
  </section>;
}
