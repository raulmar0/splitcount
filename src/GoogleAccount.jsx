import { Cloud, LogOut, RefreshCw, Upload } from 'lucide-react';
import GoogleSignIn from './GoogleSignIn.jsx';

export default function GoogleAccount({ auth, theme, accountSync, count = 0, onAddLocal }) {

  return <section className="settings-section google-account" aria-labelledby="account-heading">
    <h2 id="account-heading">Cuenta</h2>
    {auth.account ? <>
      <div className="account-profile"><span className="avatar" aria-hidden="true">{(auth.account.name || auth.account.email).slice(0, 1).toUpperCase()}</span><div><strong>{auth.account.name || 'Tu cuenta de Google'}</strong><span>{auth.account.email}</span></div></div>
      <p className="account-verified" role="status"><Cloud size={16} />{!auth.session ? 'Sesión vencida · copia conservada' : accountSync.status === 'pending' ? 'Recuperando tus grupos…' : `${count} ${count === 1 ? 'grupo en tu cuenta' : 'grupos en tu cuenta'}`}</p>
      {auth.session ? <div className="account-actions">
        <button className="button secondary" disabled={accountSync.busy} onClick={onAddLocal}><Upload size={17} />Añadir grupos de este dispositivo</button>
        <button className="text-button" disabled={accountSync.busy} onClick={() => { void accountSync.refresh(); }}><RefreshCw size={16} />Actualizar grupos</button>
      </div> : <GoogleSignIn auth={auth} theme={theme} />}
      {accountSync.error && <p className="form-error" role="alert">{accountSync.error}</p>}
      <button className="button secondary" onClick={() => auth.signOut()}><LogOut size={17} />Cerrar sesión</button>
    </> : <>
      <p>Inicia sesión con Google o sigue usando Splitcount sin una cuenta.</p>
      <GoogleSignIn auth={auth} theme={theme} />
    </>}
    <p className="settings-note">{auth.account ? 'Tus grupos se recuperan al entrar con esta cuenta en otro dispositivo. Cerrar sesión limpia su copia de este navegador, sin borrar los grupos en línea ni tus datos del modo invitado.' : 'Con una cuenta puedes recuperar tus grupos en otros dispositivos. Tus grupos locales solo se incorporan cuando tú los eliges.'} Al recargar o vencer la sesión, vuelve a entrar. Los enlaces de invitación conservan sus permisos.</p>
  </section>;
}
