import { useState } from 'react';
import { ArrowRight, Plus, X, UserPlus } from 'lucide-react';
import Modal from './Modal.jsx';
import CustomSelect from './CustomSelect.jsx';
import { normalizeMembers } from './groups.js';
import { sharedGroupLimit, sharedCreationId } from './group-limits.js';
import { newInvitees } from './invitations.js';
import './invitations.css';

const uid = () => globalThis.crypto.randomUUID();
const currencyLabel = currency => ({ MXN: 'Pesos mexicanos', USD: 'Dólares estadounidenses', EUR: 'Euros' }[currency]);

export default function GroupForm({ group, onSave, onClose, selfName, signedIn = false, sharedCount = 0, accountGroups = [], canShare = true, pendingApproval = false }) {
  const [name, setName] = useState(group?.name || '');
  const [currency, setCurrency] = useState(group?.currency || 'MXN');
  const [description, setDescription] = useState(group?.description || '');
  const [members, setMembers] = useState(group?.members || [{ id: 'you', name: selfName?.trim().slice(0, 40) || 'Tú' }, { id: uid(), name: '' }]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draftId] = useState(uid);
  const [storage, setStorage] = useState(signedIn && canShare ? 'shared' : 'local');
  const hasHistory = group && (group.expenses.length > 0 || group.settlements.length > 0);
  const inviteMemberIds = newInvitees(members, group?.members, group?._selfId || 'you');
  const atLimit = sharedCount >= sharedGroupLimit(true) && sharedCreationId(accountGroups, draftId) === draftId;
  const storageBlocked = !group && storage === 'shared' && (!canShare || atLimit);

  async function submit(event) {
    event.preventDefault();
    const cleaned = normalizeMembers(members);
    if (!name.trim()) return setError('Dale un nombre al grupo.');
    if (!cleaned) return setError('Añade al menos dos personas con nombres diferentes. Completa los nombres o quita las filas vacías.');
    if (storageBlocked) return setError('Tu cuenta tiene 6 grupos sincronizados. Sal de uno o elige guardar solo en este dispositivo.');
    const invite = event.nativeEvent?.submitter?.value === 'invite';
    setError(''); setBusy(true);
    try {
      await onSave({ ...(group || { id: draftId, expenses: [], settlements: [] }), name: name.trim(), emoji: group?.emoji || 'grupo', currency, description: description.trim(), members: cleaned }, storage, { inviteMemberIds: invite ? newInvitees(cleaned, group?.members, group?._selfId || 'you') : [] });
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }

  return <Modal title={group ? 'Editar grupo' : 'Crear grupo'} subtitle={group ? 'Edita los detalles o suma a alguien más.' : 'Ponle nombre al plan y añade a quienes lo comparten.'} onClose={onClose} closeDisabled={busy}>
    <form onSubmit={submit} className="form-stack">
      {!group && <>
        {signedIn && <label>Guardar en<CustomSelect value={storage} onChange={setStorage} aria-label="Guardar en" aria-describedby="group-storage-hint" options={[
          { value: 'shared', label: 'Mi cuenta · sincronizado', disabled: !canShare },
          { value: 'local', label: 'Este dispositivo' },
        ]} /></label>}
        {signedIn && !canShare && <p className="settings-note">Inicia sesión con una cuenta aprobada para sincronizar tus grupos.</p>}
        <p id="group-storage-hint" className="settings-note">{storage === 'shared' ? 'Disponible en todos tus dispositivos al entrar con tu cuenta.' : 'Se guarda en este navegador. Puedes invitar a otras personas después.'} {sharedCount} de {sharedGroupLimit(signedIn)} {signedIn ? 'grupos sincronizados en tu cuenta' : pendingApproval ? 'grupo compartido mientras esperas aprobación' : 'grupo compartido sin cuenta'}.</p>
        {storageBlocked && <p className="form-error" role="alert">Tu cuenta tiene 6 grupos sincronizados. Sal de uno o elige guardar solo en este dispositivo.</p>}
      </>}
      <label>Nombre del grupo<input autoFocus required maxLength={60} placeholder="¿Cuál es el próximo plan?" value={name} onChange={event => setName(event.target.value)} /></label>
      <label>Descripción <span className="optional">opcional</span><input maxLength={200} placeholder="Unas palabras sobre este grupo" value={description} onChange={event => setDescription(event.target.value)} /></label>
      <label>Moneda<CustomSelect value={currency} disabled={hasHistory} onChange={setCurrency} aria-label="Moneda" options={['MXN', 'USD', 'EUR'].map(value => ({ value, label: `${value} · ${currencyLabel(value)}` }))} /></label>
      {hasHistory && <p className="field-hint">La moneda se conserva cuando ya hay movimientos.</p>}
      <div className="label-row"><span>¿Quiénes se apuntan?</span><span className="muted">{members.length} personas</span></div>
      <div className="member-inputs">{members.map((member, index) => <div className="member-input" key={member.id}>
        <span className={`avatar avatar-${index % 5} small`} aria-hidden="true">{(member.name || '?').slice(0, 1).toUpperCase()}</span>
        <input aria-label={`Nombre de integrante ${index + 1}`} required={index < 2 || !!group?.members.find(existing => existing.id === member.id)} maxLength={40} value={member.name} placeholder={`Nombre de la persona ${index + 1}`} onChange={event => setMembers(members.map(item => item.id === member.id ? { ...item, name: event.target.value } : item))} />
        {!group?.members.find(existing => existing.id === member.id) && member.id !== 'you' && <button className="icon-button" type="button" aria-label={`Quitar integrante ${index + 1}`} onClick={() => setMembers(members.filter(item => item.id !== member.id))}><X size={16} /></button>}
      </div>)}</div>
      {members.length < 30 && <button type="button" className="text-button" onClick={() => setMembers([...members, { id: uid(), name: '' }])}><Plus size={16} />Añadir persona</button>}
      {inviteMemberIds.length > 0 && <p className="invite-after-save"><UserPlus size={18} /><span>Después de guardar, puedes invitar por WhatsApp, SMS o correo. Cada persona elegirá su nombre al entrar.</span></p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className={`modal-actions ${inviteMemberIds.length ? 'invite-form-actions' : ''}`}>
        {inviteMemberIds.length ? <button type="submit" value="save" className="button secondary" disabled={busy || storageBlocked}>Guardar sin invitar</button> : <button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancelar</button>}
        <button type="submit" value={inviteMemberIds.length ? 'invite' : 'save'} className="button primary" disabled={busy || storageBlocked}>{busy ? 'Guardando…' : inviteMemberIds.length ? group ? 'Guardar e invitar' : 'Crear e invitar' : group ? 'Guardar grupo' : 'Crear grupo'}<ArrowRight size={17} /></button>
      </div>
    </form>
  </Modal>;
}
