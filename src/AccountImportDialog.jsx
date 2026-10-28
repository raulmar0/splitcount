import { useState } from 'react';
import { CloudUpload } from 'lucide-react';
import Modal from './Modal.jsx';
import { ACCOUNT_SHARED_GROUP_LIMIT } from './group-limits.js';

export default function AccountImportDialog({ groups, onImport, onClose, sharedCount = 0 }) {
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
  return <Modal title="Añadir grupos a tu cuenta" subtitle="Elige qué datos de este dispositivo quieres guardar en línea." onClose={onClose} closeDisabled={busy}>
    <form className="form-stack" onSubmit={submit}>
      <p>Se conservarán las copias originales del modo invitado. Los grupos que elijas estarán disponibles al entrar con esta cuenta en otro dispositivo.</p>
      <p className="settings-note">{sharedCount} de {ACCOUNT_SHARED_GROUP_LIMIT} grupos compartidos en tu cuenta. Cada grupo local que incorpores se guardará en línea y ocupará un lugar. Puedes conservar grupos locales ilimitados sin incorporarlos.</p>
      {groups.length ? <div className="account-import-list">{[false, true].map(demo => {
        const items = groups.filter(group => !!group.isDemo === demo);
        return items.length ? <section key={String(demo)}><h3>{demo ? 'Ejemplos de este dispositivo' : 'Tus grupos de este dispositivo'}</h3>{items.map(group => <label className="account-import-choice" key={group.id}><input type="checkbox" checked={selected.has(group.id)} disabled={busy} onChange={event => setSelected(previous => {
          const next = new Set(previous);
          if (event.target.checked) next.add(group.id); else next.delete(group.id);
          return next;
        })} /><span><strong>{group.name}</strong><small>{group.members.length} personas · {group.currency} · {group.expenses.length} gastos</small></span></label>)}</section> : null;
      })}</div> : <p>No hay grupos del modo invitado para añadir. Puedes crear uno desde Grupos.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="settings-note">No se invita a nadie automáticamente. Si después compartes el enlace, quien lo tenga podrá ver y editar el grupo. Si falla una incorporación, las que ya terminaron se conservan; reintentar no las duplica.</p>
      <div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className="button primary" disabled={busy || !selected.size}><CloudUpload size={17} />{busy ? 'Añadiendo grupos…' : `Añadir ${selected.size} ${selected.size === 1 ? 'grupo' : 'grupos'}`}</button></div>
    </form>
  </Modal>;
}
