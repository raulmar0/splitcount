import { useState } from 'react';
import { Check, Copy, Link2, Share2, Users, ArrowRight, RefreshCw } from 'lucide-react';
import Modal from './Modal.jsx';
import { buildInviteLink } from './sync.js';
import { sharedGroupLimit, sharedGroupLimitMessage } from './group-limits.js';

export function ShareDialog({ group, onShare, onClose, sharedCount = 0, signedIn = false, onSignIn, alreadyRegistered = false, blockedReason = '', pendingApproval = false }) {
  const selfId = group._selfId || group.members.find(m => m.id === 'you')?.id || group.members[0].id;
  const self = group.members.find(m => m.id === selfId);
  const [name, setName] = useState(self.name === 'Tú' ? '' : self.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const link = group._shared ? buildInviteLink(group._shared) : '';
  const atLimit = !group._shared && !alreadyRegistered && sharedCount >= sharedGroupLimit(signedIn);
  async function share(e) {
    e.preventDefault();
    if (blockedReason || atLimit) return setError(blockedReason || sharedGroupLimitMessage(signedIn));
    if (!name.trim()) return setError('Escribe tu nombre para que tus amigos te reconozcan.');
    if (group.members.some(m => m.id !== selfId && m.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())) return setError('Ese nombre ya lo usa otra persona del grupo.');
    setBusy(true); setError('');
    try { await onShare(name.trim(), selfId); } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setError('Selecciona y copia el enlace del campo de arriba.'); }
  }
  return <Modal title={group._shared ? 'Comparte el grupo' : 'Compartir grupo'} subtitle={group.name} onClose={onClose} closeDisabled={busy}>
    {group._shared ? <div className="form-stack share-form">
      <p className="share-intro">Los gastos, pagos y balances se actualizan para todas las personas del grupo.</p>
      <label>Enlace de invitación<div className="share-link-field"><input aria-label="Enlace de invitación" readOnly value={link} onFocus={e => e.target.select()} /><button className="button primary" onClick={copy}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? 'Copiado' : 'Copiar'}</button></div></label>
      <p className="share-permission"><Users size={18} />Cualquier persona con este enlace puede ver y editar el grupo. Compártelo solo con quienes participan.</p>
      <div className="share-settings"><span className="shared-badge"><span />Sincronización activada</span><span>{group.members.length} integrantes</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button className="button secondary" onClick={onClose}>Listo</button></div>
    </div> : blockedReason || atLimit ? <div className="form-stack share-form">
      <p className="share-intro" role="status">{blockedReason || sharedGroupLimitMessage(signedIn)}</p>
      <div className="modal-actions"><button className="button secondary" onClick={onClose}>Cerrar</button>{onSignIn && (!signedIn || blockedReason) && <button className="button primary" onClick={onSignIn}>{pendingApproval ? 'Ver aprobación' : signedIn ? 'Ver mi cuenta' : 'Iniciar sesión con Google'}</button>}</div>
    </div> : <form onSubmit={share} className="form-stack share-form">
      <p className="settings-note">{sharedCount} de {sharedGroupLimit(signedIn)} {signedIn ? 'grupos compartidos' : 'grupo compartido'}. Grupos locales ilimitados y sin límite de movimientos.</p>
      <p className="share-intro">Activa un enlace para que tus amigos puedan añadir gastos y consultar las mismas cuentas, desde su propio teléfono.</p>
      <label>Tu nombre<input autoFocus required maxLength={40} placeholder="Como te conocen tus amigos" value={name} onChange={e => setName(e.target.value)} /></label>
      <p className="share-permission"><Link2 size={18} />Se compartirá este grupo y sus movimientos. Quienes tengan el enlace podrán verlos y editarlos.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button className="button secondary" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="button primary" type="submit" disabled={busy}><Share2 size={16} />{busy ? 'Preparando enlace…' : 'Crear enlace'}</button></div>
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
