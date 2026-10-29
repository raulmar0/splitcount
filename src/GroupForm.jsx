import { useI18n } from './i18n.jsx';
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
  const { t } = useI18n();
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

  return <Modal title={group ? t("Editar grupo") : t("Crear grupo")} subtitle={group ? t("Edita los detalles o suma a alguien más.") : t("Ponle nombre al plan y añade a quienes lo comparten.")} onClose={onClose} closeDisabled={busy}>
    <form onSubmit={submit} className="form-stack" autoComplete="off">
      {!group && <>
        {signedIn && <label>{t("Guardar en")}<CustomSelect value={storage} onChange={setStorage} aria-label={t("Guardar en")} aria-describedby="group-storage-hint" options={[
          { value: 'shared', label: t("Mi cuenta · sincronizado"), disabled: !canShare },
          { value: 'local', label: t("Este dispositivo") },
        ]} /></label>}
        {signedIn && !canShare && <p className="settings-note">{t("Inicia sesión con una cuenta aprobada para sincronizar tus grupos.")}</p>}
        <p id="group-storage-hint" className="settings-note">{storage === 'shared' ? t("Disponible en todos tus dispositivos al entrar con tu cuenta.") : t("Se guarda en este navegador. Puedes invitar a otras personas después.")} {t(signedIn ? '{used} de {limit} grupos sincronizados en tu cuenta.' : pendingApproval ? '{used} de {limit} grupo compartido mientras esperas aprobación.' : '{used} de {limit} grupo compartido sin cuenta.', { used: sharedCount, limit: sharedGroupLimit(signedIn) })}</p>
        {storageBlocked && <p className="form-error" role="alert">{t("Tu cuenta tiene 6 grupos sincronizados. Sal de uno o elige guardar solo en este dispositivo.")}</p>}
      </>}
      <label>{t("Nombre del grupo")}<input autoFocus required maxLength={60} placeholder={t("¿Cuál es el próximo plan?")} value={name} onChange={event => setName(event.target.value)} /></label>
      <label>{t("Descripción")} <span className="optional">{t("opcional")}</span><input maxLength={200} placeholder={t("Unas palabras sobre este grupo")} value={description} onChange={event => setDescription(event.target.value)} /></label>
      <label>{t("Moneda")}<CustomSelect value={currency} disabled={hasHistory} onChange={setCurrency} aria-label={t("Moneda")} options={['MXN', 'USD', 'EUR'].map(value => ({ value, label: `${value} · ${t(currencyLabel(value))}` }))} /></label>
      {hasHistory && <p className="field-hint">{t("La moneda se conserva cuando ya hay movimientos.")}</p>}
      <div className="label-row"><span>{t("¿Quiénes se apuntan?")}</span><span className="muted">{t('{count} personas', { count: members.length })}</span></div>
      <div className="member-inputs">{members.map((member, index) => <div className="member-input" key={member.id}>
        <span className={`avatar avatar-${index % 5} small`} aria-hidden="true">{(member.name || '?').slice(0, 1).toUpperCase()}</span>
        <input aria-label={t('Nombre de integrante {number}', { number: index + 1 })} required={index < 2 || !!group?.members.find(existing => existing.id === member.id)} maxLength={40} value={member.name} placeholder={t('Nombre de la persona {number}', { number: index + 1 })} onChange={event => setMembers(members.map(item => item.id === member.id ? { ...item, name: event.target.value } : item))} />
        {!group?.members.find(existing => existing.id === member.id) && member.id !== 'you' && <button className="icon-button" type="button" aria-label={t('Quitar integrante {number}', { number: index + 1 })} onClick={() => setMembers(members.filter(item => item.id !== member.id))}><X size={16} /></button>}
      </div>)}</div>
      {members.length < 30 && <button type="button" className="text-button" onClick={() => setMembers([...members, { id: uid(), name: '' }])}><Plus size={16} />{t("Añadir persona")}</button>}
      {inviteMemberIds.length > 0 && <p className="invite-after-save"><UserPlus size={18} /><span>{t("Después de guardar, puedes invitar por WhatsApp, SMS o correo. Cada persona elegirá su nombre al entrar.")}</span></p>}
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      <div className={`modal-actions ${inviteMemberIds.length ? 'invite-form-actions' : ''}`}>
        {inviteMemberIds.length ? <button type="submit" value="save" className="button secondary" disabled={busy || storageBlocked}>{t("Guardar sin invitar")}</button> : <button type="button" className="button secondary" onClick={onClose} disabled={busy}>{t("Cancelar")}</button>}
        <button type="submit" value={inviteMemberIds.length ? 'invite' : 'save'} className="button primary" disabled={busy || storageBlocked}>{busy ? t("Guardando…") : inviteMemberIds.length ? group ? t("Guardar e invitar") : t("Crear e invitar") : group ? t("Guardar grupo") : t("Crear grupo")}<ArrowRight size={17} /></button>
      </div>
    </form>
  </Modal>;
}
