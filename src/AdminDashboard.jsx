import { useI18n } from './i18n.jsx';
import { useEffect, useState } from 'react';
import { Bell, BellOff, Check, RefreshCw, X } from 'lucide-react';
import useAdminDashboard from './useAdminDashboard.js';
import { disableAdminPush, enableAdminPush, inspectAdminPush } from './admin-push.js';

const FILTERS = [['pending', 'Pendientes'], ['approved', 'Aprobadas'], ['rejected', 'Rechazadas']];
const dateLabel = (value, locale) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Monterrey' }).format(new Date(value));

function PushSettings({ auth }) {
  const { t } = useI18n();
  const [device, setDevice] = useState(null), [config, setConfig] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    Promise.all([inspectAdminPush(), auth.request('/admin/push')]).then(([device, config]) => {
      if (alive) { setDevice(device); setConfig(config); }
    }).catch(error => { if (alive) setError(error.message); });
    return () => { alive = false; };
  }, [auth.request, auth.signal, retry]);
  const active = !!(device?.subscription && config?.endpoints?.includes(device.subscription.endpoint));
  async function toggle() {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (active) {
        await disableAdminPush({ subscription: device.subscription, request: auth.request });
        setDevice(previous => ({ ...previous, subscription: null }));
        setMessage('Notificaciones desactivadas en este dispositivo.');
      } else {
        const subscription = await enableAdminPush({ registration: device?.registration, publicKey: config?.publicKey, request: auth.request });
        setDevice(previous => ({ ...previous, subscription }));
        setMessage('Notificaciones activadas en este dispositivo.');
      }
      setConfig(await auth.request('/admin/push'));
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await auth.request('/admin/push/test', { method: 'POST', body: {} });
      setMessage(result.sent ? 'Prueba enviada. Comprueba las notificaciones de tus dispositivos.' : 'No hay dispositivos disponibles. Vuelve a activar las notificaciones.');
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <div className="admin-push">
    <h3>{t("Notificaciones de solicitudes")}</h3>
    <p>{t("Recibe un aviso cuando una cuenta nueva espere tu aprobación, incluso con la app cerrada.")}</p>
    {device && !device.supported ? <p className="settings-note">{t("Este navegador no admite notificaciones push. En iPhone, añade Splitcount a Inicio desde Safari y abre la app desde su icono.")}</p> : device && !device.registration?.active ? <p className="settings-note">{t("Actívalas desde la versión publicada de Splitcount. En iPhone, abre la app instalada en Inicio.")}</p> : <div className="account-actions">
      <button className="button secondary" onClick={toggle} disabled={busy || !config || !device}>{active ? <BellOff size={17} /> : <Bell size={17} />}{busy ? t("Guardando…") : active ? t("Desactivar en este dispositivo") : t("Activar en este dispositivo")}</button>
      {active && <button className="text-button" onClick={test} disabled={busy}>{t("Enviar prueba")}</button>}
    </div>}
    {config && <p className="settings-note">{t(config.subscriptions === 1 ? '{count} dispositivo vinculado. Los avisos no muestran nombres ni correos en la pantalla bloqueada.' : '{count} dispositivos vinculados. Los avisos no muestran nombres ni correos en la pantalla bloqueada.', { count: config.subscriptions })}</p>}
    {message && <p className="settings-note" role="status">{t(message)}</p>}
    {error && <><p className="form-error" role="alert">{t(error)}</p><button className="text-button" disabled={busy} onClick={() => { setError(''); setRetry(previous => previous + 1); }}>{t("Reintentar notificaciones")}</button></>}
  </div>;
}

export default function AdminDashboard({ auth }) {
  const { t, locale } = useI18n();
  const { accounts, loading, busy, error, refresh, decide } = useAdminDashboard(auth);
  const [filter, setFilter] = useState('pending');
  if (!auth.session || !auth.access?.isAdmin || auth.access.status !== 'approved') return null;
  const filtered = accounts.filter(account => account.status === filter);
  return <section className="settings-section admin-dashboard" aria-labelledby="admin-heading">
    <div className="admin-heading"><div><h2 id="admin-heading">{t("Administración")}</h2><p>{t("Aprueba las cuentas que pueden sincronizar grupos con Google.")}</p></div><button className="icon-button" aria-label={t("Actualizar solicitudes")} onClick={() => { void refresh(); }} disabled={loading || !!busy}><RefreshCw size={18} /></button></div>
    <div className="admin-filters" role="group" aria-label={t("Estado de las cuentas")}>{FILTERS.map(([status, label]) => <button key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}>{t(label)}<span>{accounts.filter(row => row.status === status).length}</span></button>)}</div>
    {error && <p className="form-error" role="alert">{t(error)}</p>}
    {loading && <p className="settings-note" role="status">{t("Actualizando solicitudes…")}</p>}
    {filtered.length ? <ul className="admin-accounts">{filtered.map(account => <li key={account.id}>
      <div className="admin-account-main"><strong>{account.name || account.email}</strong><span>{account.email}</span><small>{t('Solicitud del {date}', { date: dateLabel(account.requestedAt, locale) })}</small></div>
      <div className="admin-account-actions">
        {account.status !== 'approved' && <button className="button primary" disabled={!!busy} onClick={() => { void decide(account, 'approved'); }} aria-label={t('Aprobar a {email}', { email: account.email })}><Check size={16} />{busy === account.id ? t("Guardando…") : t("Aprobar")}</button>}
        {account.status !== 'rejected' && <button className="button secondary" disabled={!!busy} onClick={() => { void decide(account, 'rejected'); }} aria-label={t(account.status === 'approved' ? 'Revocar acceso a {email}' : 'Rechazar a {email}', { email: account.email })}><X size={16} />{account.status === 'approved' ? t("Revocar acceso") : t("Rechazar")}</button>}
      </div>
    </li>)}</ul> : !loading && <p className="admin-empty">{filter === 'pending' ? t("No hay solicitudes pendientes.") : filter === 'approved' ? t("Todavía no has aprobado ninguna cuenta.") : t("No hay cuentas rechazadas.")}</p>}
    <PushSettings auth={auth} />
  </section>;
}
