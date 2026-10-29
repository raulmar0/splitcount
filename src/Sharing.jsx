import { useState } from 'react';
import { Check, Copy, Link2, Share2, Users, ArrowRight, RefreshCw, MessageCircle, Smartphone, Mail } from 'lucide-react';
import Modal from './Modal.jsx';
import { buildInviteLink } from './sync.js';
import { sharedGroupLimit, sharedGroupLimitMessage } from './group-limits.js';
import CustomSelect from './CustomSelect.jsx';
import { invitationHref } from './invitations.js';
import './invitations.css';
import { useI18n } from './i18n.jsx';

function InviteComposer({ group, selfId, link, inviteMemberIds = [] }) {
  const { t } = useI18n();
  const recipients = group.members.filter(member => member.id !== selfId && (!inviteMemberIds.length || inviteMemberIds.includes(member.id)));
  const [memberId, setMemberId] = useState(recipients[0]?.id || '');
  const [channel, setChannel] = useState('whatsapp');
  const [contacts, setContacts] = useState({});
  const [error, setError] = useState('');
  const [prepared, setPrepared] = useState('');
  const member = recipients.find(item => item.id === memberId) || recipients[0];
  const contactKey = `${member?.id}:${channel === 'email' ? 'email' : 'phone'}`;
  const contact = contacts[contactKey] || '';
  const channels = [
    { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
    { value: 'sms', label: 'SMS', icon: Smartphone },
    { value: 'email', label: 'Correo', icon: Mail },
  ];
  const chosenChannel = channels.find(item => item.value === channel);
  if (!recipients.length) return null;
  function prepare(event) {
    event.preventDefault();
    const href = invitationHref(channel, contact, { groupName: group.name, memberName: member.name, link, message: t('Hola, {name}. Te invito a “{group}” en Splitcount para compartir gastos y llevar las cuentas juntos. Entra y elige tu nombre: {link}', { name: member.name, group: group.name, link }), subject: t('Te invito a {group} en Splitcount', { group: group.name }) });
    if (!href) return setError(channel === 'email' ? 'Escribe un correo válido, como persona@ejemplo.com.' : 'Escribe un número con código de país, como +52 81 1234 5678.');
    setError('');
    if (channel === 'whatsapp') window.open(href, '_blank', 'noopener,noreferrer');
    else window.location.assign(href);
    setPrepared(t('Invitación preparada para {name}. Confirma el envío en {app}.', { name: member.name, app: channel === 'email' ? t('tu aplicación de correo') : channel === 'sms' ? t('tu aplicación de mensajes') : 'WhatsApp' }));
  }
  function changeChannel(value) { setChannel(value); setError(''); setPrepared(''); }
  return <form className="form-stack invite-composer" onSubmit={prepare} noValidate>
    <div className="invite-step-heading"><span className="invite-step-number" aria-hidden="true">1</span><h3>{t('Elige a quién invitar')}</h3></div>
    <label>{t('Persona')}<CustomSelect aria-label={t('Persona a invitar')} value={member?.id || ''} onChange={value => { setMemberId(value); setError(''); setPrepared(''); }} options={recipients.map(item => ({ value: item.id, label: item.name }))} /></label>
    <div className="invite-step-heading"><span className="invite-step-number" aria-hidden="true">2</span><h3>{t('Elige cómo enviarle el enlace')}</h3></div>
    <div className="invite-channels" role="group" aria-label={t('Medio de invitación')}>{channels.map(({ value, label, icon: Icon }) => <button type="button" key={value} className={`invite-channel ${channel === value ? 'selected' : ''}`} aria-pressed={channel === value} onClick={() => changeChannel(value)}><Icon size={23} /><span>{t(label)}</span>{channel === value && <Check className="invite-channel-check" size={13} />}</button>)}</div>
    <label>{t(channel === 'email' ? 'Correo electrónico' : 'Número de teléfono')}<input key={contactKey} type={channel === 'email' ? 'email' : 'tel'} inputMode={channel === 'email' ? 'email' : 'tel'} autoComplete="off" maxLength={channel === 'email' ? 254 : 30} placeholder={channel === 'email' ? 'persona@ejemplo.com' : '+52 81 1234 5678'} value={contact} aria-invalid={!!error} aria-describedby="invite-contact-hint" onChange={event => { setContacts(current => ({ ...current, [contactKey]: event.target.value })); setError(''); setPrepared(''); }} /></label>
    <p id="invite-contact-hint" className="field-hint">{t(channel === 'email' ? 'Se abrirá un correo con el enlace listo para enviar.' : 'Incluye + y el código de país. El número solo se usa para abrir la invitación.')}</p>
    {error && <p className="form-error" role="alert">{t(error)}</p>}
    <button className="button primary full-width" type="submit"><chosenChannel.icon size={18} />{t(channel === 'email' ? 'Abrir correo' : channel === 'sms' ? 'Abrir mensajes' : 'Abrir WhatsApp')}<ArrowRight size={17} /></button>
    <p className="field-hint">{t('Tú confirmas el envío en la aplicación que se abra. Puedes volver e invitar a otra persona.')}</p>
    {prepared && <p className="invite-prepared" role="status"><Check size={17} />{prepared}</p>}
  </form>;
}

export function ShareDialog({ group, onShare, onClose, sharedCount = 0, signedIn = false, onSignIn, alreadyRegistered = false, blockedReason = '', pendingApproval = false, inviteMemberIds = [] }) {
  const { t } = useI18n();
  const selfId = group._selfId || group.members.find(member => member.id === 'you')?.id || group.members[0].id;
  const self = group.members.find(member => member.id === selfId);
  const [name, setName] = useState(self.name === 'Tú' ? '' : self.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const link = group._shared ? buildInviteLink(group._shared) : '';
  const atLimit = !group._shared && !alreadyRegistered && sharedCount >= sharedGroupLimit(signedIn);
  async function share(event) {
    event.preventDefault();
    if (blockedReason || atLimit) return setError(blockedReason || sharedGroupLimitMessage(signedIn));
    if (!name.trim()) return setError('Escribe tu nombre para que tus amigos te reconozcan.');
    if (group.members.some(member => member.id !== selfId && member.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())) return setError('Ese nombre ya lo usa otra persona del grupo.');
    setBusy(true); setError('');
    try { await onShare(name.trim(), selfId); } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setError('Selecciona y copia el enlace del campo de abajo.'); }
  }
  return <Modal title={t(inviteMemberIds.length ? 'Invita a tu grupo' : group._shared ? 'Comparte el grupo' : 'Compartir grupo')} subtitle={group.name} onClose={onClose} closeDisabled={busy}>
    {group._shared ? <div className="form-stack share-form">
      <p className="share-intro">{t('Cada persona abre la invitación y elige su nombre. Los gastos y balances se actualizan para todo el grupo.')}</p>
      <InviteComposer key={group.id} group={group} selfId={selfId} link={link} inviteMemberIds={inviteMemberIds} />
      <div className="invite-link-section"><span className="invite-or">{t('O comparte el enlace')}</span><label>{t('Enlace de invitación')}<div className="share-link-field"><input aria-label={t('Enlace de invitación')} readOnly value={link} onFocus={event => event.target.select()} /><button className="button secondary" onClick={copy}>{copied ? <Check size={17} /> : <Copy size={17} />}{t(copied ? 'Copiado' : 'Copiar')}</button></div></label></div>
      <p className="share-permission"><Users size={18} />{t('Cualquier persona con este enlace puede ver y editar el grupo. Compártelo solo con quienes participan.')}</p>
      <div className="share-settings"><span className="shared-badge"><span />{t('Sincronización activada')}</span><span>{t('{count} integrantes', { count: group.members.length })}</span></div>
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      <div className="modal-actions"><button className="button secondary" onClick={onClose}>{t('Listo')}</button></div>
    </div> : blockedReason || atLimit ? <div className="form-stack share-form">
      <p className="share-intro" role="status">{t('El grupo está guardado.')} {t(blockedReason || sharedGroupLimitMessage(signedIn))}</p>
      <div className="modal-actions"><button className="button secondary" onClick={onClose}>{t('Invitar después')}</button>{onSignIn && (!signedIn || blockedReason) && <button className="button primary" onClick={onSignIn}>{t(pendingApproval ? 'Ver aprobación' : signedIn ? 'Ver mi cuenta' : 'Iniciar sesión con Google')}</button>}</div>
    </div> : <form onSubmit={share} autoComplete="off" className="form-stack share-form">
      <p className="invite-saved"><Check size={18} />{t('Tu grupo ya está guardado.')}</p>
      <p className="share-intro">{t('Crea un enlace para invitar por WhatsApp, SMS o correo. Todos podrán añadir gastos y consultar las mismas cuentas.')}</p>
      <label>{t('Tu nombre')}<input autoFocus required autoComplete="off" autoCorrect="off" autoCapitalize="words" spellCheck={false} maxLength={40} placeholder={t('Como te conocen tus amigos')} value={name} onChange={event => setName(event.target.value)} /></label>
      <p className="share-permission"><Link2 size={18} />{t('Este grupo se guardará en línea. Quienes tengan el enlace podrán ver y editar sus movimientos.')}</p>
      <p className="settings-note">{t(signedIn ? '{count} de {limit} grupos sincronizados en tu cuenta.' : '{count} de {limit} grupo compartido sin cuenta.', { count: sharedCount, limit: sharedGroupLimit(signedIn) })}</p>
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      <div className="modal-actions"><button className="button secondary" type="button" onClick={onClose} disabled={busy}>{t('Invitar después')}</button><button className="button primary" type="submit" disabled={busy}><Share2 size={16} />{t(busy ? 'Preparando enlace…' : 'Continuar con invitaciones')}</button></div>
    </form>}
  </Modal>;
}

export function IdentityDialog({ group, onChoose, onAdd, onClose }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  async function choose(id) {
    setBusy(true); setError('');
    try { await onChoose(id); } catch (error) { setError(error.message); setUnavailable(error.code === 'group_removed'); } finally { setBusy(false); }
  }
  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    if (group.members.some(m => m.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())) return setError('Este nombre ya está en la lista. Selecciónalo arriba.');
    setBusy(true); setError('');
    try { await onAdd(name.trim()); } catch (error) { setError(error.message); setUnavailable(error.code === 'group_removed'); } finally { setBusy(false); }
  }
  return <Modal title={t('¿Quién eres en este grupo?')} onClose={onClose} closeDisabled={busy}>
    <div className="share-identity">{group.members.map(m => <button key={m.id} className="identity-choice" onClick={() => choose(m.id)} disabled={busy || unavailable}><span className="avatar">{m.name.slice(0, 1)}</span><strong>{m.name}</strong>{group._selfId === m.id ? <Check size={18} /> : <ArrowRight size={17} />}</button>)}</div>
    <form className="form-stack identity-add" onSubmit={add} autoComplete="off"><label>{t('¿Todavía no estás? Añade tu nombre')}<input autoComplete="off" autoCorrect="off" autoCapitalize="words" spellCheck={false} maxLength={40} placeholder={t('Tu nombre')} value={name} onChange={e => setName(e.target.value)} /></label>{error && <p className="form-error" role="alert">{t(error)}</p>}<button className="button secondary" type="submit" disabled={busy || unavailable || !name.trim()}>{t(busy ? 'Añadiendo…' : 'Añadirme al grupo')}</button></form>
  </Modal>;
}

export function JoinDialog({ error, onRetry, onClose }) {
  const { t } = useI18n();
  return <Modal title={t(error ? 'No pudimos abrir el grupo' : 'Abriendo el grupo')} onClose={onClose}><div className="join-group-card">{error ? <><p className="form-error" role="alert">{t(error)}</p><button className="button primary" onClick={onRetry}><RefreshCw size={17} />{t('Reintentar')}</button></> : <><span className="join-skeleton" /><span className="join-skeleton short" /><p>{t('Estamos buscando la versión más reciente.')}</p></>}</div></Modal>;
}
