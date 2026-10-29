import { useI18n } from './i18n.jsx';
import { useState } from 'react';
import { CloudUpload } from 'lucide-react';
import Modal from './Modal.jsx';
import { ACCOUNT_SHARED_GROUP_LIMIT } from './group-limits.js';

export default function AccountImportDialog({ groups, onImport, onClose, sharedCount = 0 }) {
  const { t } = useI18n();
  const available = Math.max(0, ACCOUNT_SHARED_GROUP_LIMIT - sharedCount);
  const [selected, setSelected] = useState(() => new Set(groups.filter(group => !group.isDemo).slice(0, available).map(group => group.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try { await onImport(groups.filter(group => selected.has(group.id))); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <Modal title={t("Añadir grupos a tu cuenta")} subtitle={t("Elige qué datos de este dispositivo quieres guardar en línea.")} onClose={onClose} closeDisabled={busy}>
    <form className="form-stack" onSubmit={submit}>
      <p>{t("Se conservarán las copias originales del modo invitado. Los grupos que elijas estarán disponibles al entrar con esta cuenta en otro dispositivo.")}</p>
      <p className="settings-note">{t('{used} de {limit} grupos compartidos en tu cuenta. Cada grupo local que incorpores se guardará en línea y ocupará un lugar. Puedes conservar grupos locales ilimitados sin incorporarlos.', { used: sharedCount, limit: ACCOUNT_SHARED_GROUP_LIMIT })}</p>
      {groups.length ? <div className="account-import-list">{[false, true].map(demo => {
        const items = groups.filter(group => !!group.isDemo === demo);
        return items.length ? <section key={String(demo)}><h3>{demo ? t("Ejemplos de este dispositivo") : t("Tus grupos de este dispositivo")}</h3>{items.map(group => <label className="account-import-choice" key={group.id}><input type="checkbox" checked={selected.has(group.id)} disabled={busy} onChange={event => setSelected(previous => {
          const next = new Set(previous);
          if (event.target.checked) next.add(group.id); else next.delete(group.id);
          return next;
        })} /><span><strong>{group.name}</strong><small>{t('{people} personas · {currency} · {expenses} gastos', { people: group.members.length, currency: group.currency, expenses: group.expenses.length })}</small></span></label>)}</section> : null;
      })}</div> : <p>{t("No hay grupos del modo invitado para añadir. Puedes crear uno desde Grupos.")}</p>}
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      <p className="settings-note">{t("No se invita a nadie automáticamente. Si después compartes el enlace, quien lo tenga podrá ver y editar el grupo. Si falla una incorporación, las que ya terminaron se conservan; reintentar no las duplica.")}</p>
      <div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>{t("Cancelar")}</button><button type="submit" className="button primary" disabled={busy || !selected.size}><CloudUpload size={17} />{busy ? t("Añadiendo grupos…") : t(selected.size === 1 ? 'Añadir {count} grupo' : 'Añadir {count} grupos', { count: selected.size })}</button></div>
    </form>
  </Modal>;
}
