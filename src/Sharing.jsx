import { useState } from 'react';
import { Check, Copy, Link2, Share2, Users, ArrowRight, RefreshCw, MessageCircle, Smartphone, Mail } from 'lucide-react';
import Modal from './Modal.jsx';
import { buildInviteLink } from './sync.js';
import { sharedGroupLimit, sharedGroupLimitMessage } from './group-limits.js';
import CustomSelect from './CustomSelect.jsx';
import { invitationHref } from './invitations.js';
import './invitations.css';

function InviteComposer({ group, selfId, link, inviteMemberIds = [] }) {
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
    const href = invitationHref(channel, contact, { groupName: group.name, memberName: member.name, link });
    if (!href) return setError(channel === 'email' ? 'Escribe un correo válido, como persona@ejemplo.com.' : 'Escribe un número con código de país, como +52 81 1234 5678.');
    setError('');
    if (channel === 'whatsapp') window.open(href, '_blank', 'noopener,noreferrer');
    else window.location.assign(href);
    setPrepared(`Invitación preparada para ${member.name}. Confirma el envío en ${chosenChannel.label === 'Correo' ? 'tu aplicación de correo' : chosenChannel.label === 'SMS' ? 'tu aplicación de mensajes' : 'WhatsApp'}.`);
  }
  function changeChannel(value) { setChannel(value); setError(''); setPrepared(''); }
  return <form className="form-stack invite-composer" onSubmit={prepare} noValidate>
    <div className="invite-step-heading"><span className="invite-step-number" aria-hidden="true">1</span><h3>Elige a quién invitar</h3></div>
    <label>Persona<CustomSelect aria-label="Persona a invitar" value={member?.id || ''} onChange={value => { setMemberId(value); setError(''); setPrepared(''); }} options={recipients.map(item => ({ value: item.id, label: item.name }))} /></label>
    <div className="invite-step-heading"><span className="invite-step-number" aria-hidden="true">2</span><h3>Elige cómo enviarle el enlace</h3></div>
    <div className="invite-channels" role="group" aria-label="Medio de invitación">{channels.map(({ value, label, icon: Icon }) => <button type="button" key={value} className={`invite-channel ${channel === value ? 'selected' : ''}`} aria-pressed={channel === value} onClick={() => changeChannel(value)}><Icon size={23} /><span>{label}</span>{channel === value && <Check className="invite-channel-check" size={13} />}</button>)}</div>
    <label>{channel === 'email' ? 'Correo electrónico' : 'Número de teléfono'}<input key={contactKey} type={channel === 'email' ? 'email' : 'tel'} inputMode={channel === 'email' ? 'email' : 'tel'} autoComplete="off" maxLength={channel === 'email' ? 254 : 30} placeholder={channel === 'email' ? 'persona@ejemplo.com' : '+52 81 1234 5678'} value={contact} aria-invalid={!!error} aria-describedby="invite-contact-hint" onChange={event => { setContacts(current => ({ ...current, [contactKey]: event.target.value })); setError(''); setPrepared(''); }} /></label>
    <p id="invite-contact-hint" className="field-hint">{channel === 'email' ? 'Se abrirá un correo con el enlace listo para enviar.' : 'Incluye + y el código de país. El número solo se usa para abrir la invitación.'}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button primary full-width" type="submit"><chosenChannel.icon size={18} />{channel === 'email' ? 'Abrir correo' : channel === 'sms' ? 'Abrir mensajes' : 'Abrir WhatsApp'}<ArrowRight size={17} /></button>
    <p className="field-hint">Tú confirmas el envío en la aplicación que se abra. Puedes volver e invitar a otra persona.</p>
    {prepared && <p className="invite-prepared" role="status"><Check size={17} />{prepared}</p>}
  </form>;
}

export function ShareDialog({ group, onShare, onClose, sharedCount = 0, signedIn = false, onSignIn, alreadyRegistered = false, blockedReason = '', pendingApproval = false, inviteMemberIds = [] }) {
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
  return <Modal title={inviteMemberIds.length ? 'Invita a tu grupo' : group._shared ? 'Comparte el grupo' : 'Compartir grupo'} subtitle={group.name} onClose={onClose} closeDisabled={busy}>
    {group._shared ? <div className="form-stack share-form">
      <p className="share-intro">Cada persona abre la invitación y elige su nombre. Los gastos y balances se actualizan para todo el grupo.</p>
      <InviteComposer key={group.id} group={group} selfId={selfId} link={link} inviteMemberIds={inviteMemberIds} />
      <div className="invite-link-section"><span className="invite-or">O comparte el enlace</span><label>Enlace de invitación<div className="share-link-field"><input aria-label="Enlace de invitación" readOnly value={link} onFocus={event => event.target.select()} /><button className="button secondary" onClick={copy}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? 'Copiado' : 'Copiar'}</button></div></label></div>
      <p className="share-permission"><Users size={18} />Cualquier persona con este enlace puede ver y editar el grupo. Compártelo solo con quienes participan.</p>
      <div className="share-settings"><span className="shared-badge"><span />Sincronización activada</span><span>{group.members.length} integrantes</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button className="button secondary" onClick={onClose}>Listo</button></div>
    </div> : blockedReason || atLimit ? <div className="form-stack share-form">
      <p className="share-intro" role="status">El grupo está guardado. {blockedReason || sharedGroupLimitMessage(signedIn)}</p>
      <div className="modal-actions"><button className="button secondary" onClick={onClose}>Invitar después</button>{onSignIn && (!signedIn || blockedReason) && <button className="button primary" onClick={onSignIn}>{pendingApproval ? 'Ver aprobación' : signedIn ? 'Ver mi cuenta' : 'Iniciar sesión con Google'}</button>}</div>
    </div> : <form onSubmit={share} className="form-stack share-form">
      <p className="invite-saved"><Check size={18} />Tu grupo ya está guardado.</p>
      <p className="share-intro">Crea un enlace para invitar por WhatsApp, SMS o correo. Todos podrán añadir gastos y consultar las mismas cuentas.</p>
      <label>Tu nombre<input autoFocus required maxLength={40} placeholder="Como te conocen tus amigos" value={name} onChange={event => setName(event.target.value)} /></label>
      <p className="share-permission"><Link2 size={18} />Este grupo se guardará en línea. Quienes tengan el enlace podrán ver y editar sus movimientos.</p>
      <p className="settings-note">{sharedCount} de {sharedGroupLimit(signedIn)} {signedIn ? 'grupos sincronizados en tu cuenta' : 'grupo compartido sin cuenta'}.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button className="button secondary" type="button" onClick={onClose} disabled={busy}>Invitar después</button><button className="button primary" type="submit" disabled={busy}><Share2 size={16} />{busy ? 'Preparando enlace…' : 'Continuar con invitaciones'}</button></div>
    </form>}
  </Modal>;
}

export function IdentityDialog({ group, onChoose, onAdd, onClose }) {
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
  return <Modal title="¿Quién eres en este grupo?" subtitle={`Elige tu nombre para ver tu saldo en ${group.name}.`} onClose={onClose} closeDisabled={busy}>
    <div className="share-identity">{group.members.map(m => <button key={m.id} className="identity-choice" onClick={() => choose(m.id)} disabled={busy || unavailable}><span className="avatar">{m.name.slice(0, 1)}</span><strong>{m.name}</strong>{group._selfId === m.id ? <Check size={18} /> : <ArrowRight size={17} />}</button>)}</div>
    <form className="form-stack identity-add" onSubmit={add}><label>¿Todavía no estás? Añade tu nombre<input maxLength={40} placeholder="Tu nombre" value={name} onChange={e => setName(e.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button secondary" type="submit" disabled={busy || unavailable || !name.trim()}>{busy ? 'Añadiendo…' : 'Añadirme al grupo'}</button></form>
    <p className="field-hint identity-hint">{group._account ? 'Tu selección se guarda en tu cuenta y se recupera en tus otros dispositivos.' : 'Tu selección se guarda en este dispositivo.'} Puedes cambiarla cuando quieras.</p>
  </Modal>;
}

export function JoinDialog({ error, onRetry, onClose }) {
  return <Modal title={error ? 'No pudimos abrir el grupo' : 'Abriendo el grupo'} onClose={onClose}><div className="join-group-card">{error ? <><p className="form-error" role="alert">{error}</p><button className="button primary" onClick={onRetry}><RefreshCw size={17} />Reintentar</button></> : <><span className="join-skeleton" /><span className="join-skeleton short" /><p>Estamos buscando la versión más reciente.</p></>}</div></Modal>;
}
