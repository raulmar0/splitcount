import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { formatMoney, parseMoney, splitAmount } from './domain.js';
import { moneyInput, prepareExpense, todayInMonterrey } from './expense-draft.js';
import Modal from './Modal.jsx';
import CustomSelect from './CustomSelect.jsx';
import { useI18n } from './i18n.jsx';

const CATEGORIES = {
  food: 'Comida y bebida',
  stay: 'Hospedaje',
  transport: 'Transporte',
  shopping: 'Compras',
  fun: 'Experiencias',
  other: 'Otros',
};

function Avatar({ member, index }) {
  return <span className={`avatar avatar-${index % 5} small`} aria-hidden="true">{member.name.slice(0, 1).toUpperCase()}</span>;
}

export default function ExpenseForm({ group, expense, onSave, onClose }) {
  const { t } = useI18n();
  // The open form owns its baseline, even if a shared group refreshes while typing.
  const [baseline] = useState(() => ({ group, expense }));
  const members = baseline.group.members;
  const currency = baseline.group.currency;
  const [draftId] = useState(() => baseline.expense?.id || globalThis.crypto.randomUUID());
  const [title, setTitle] = useState(baseline.expense?.title || '');
  const [amount, setAmount] = useState(baseline.expense ? moneyInput(baseline.expense.amount) : '');
  const [paidBy, setPaidBy] = useState(baseline.expense?.paidBy || baseline.group._selfId || members[0]?.id || '');
  const [participants, setParticipants] = useState(() => [...(baseline.expense?.participants || members.map(member => member.id))]);
  const [mode, setMode] = useState(baseline.expense?.splitMode || 'equal');
  const [exact, setExact] = useState(() => Object.fromEntries(members.map(member => [
    member.id, baseline.expense?.shares[member.id] !== undefined ? moneyInput(baseline.expense.shares[member.id]) : '',
  ])));
  const [category, setCategory] = useState(baseline.expense?.category || 'food');
  const [date, setDate] = useState(() => baseline.expense?.date || todayInMonterrey());
  const [note, setNote] = useState(baseline.expense?.note || '');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [focusRequest, setFocusRequest] = useState({ field: 'amount' });
  const fields = useRef({});
  const saving = useRef(false);
  const exactStarted = useRef(Boolean(baseline.expense));

  const cents = parseMoney(amount);
  const shares = cents > 0 && participants.length ? splitAmount(cents, participants) : {};
  const exactTotal = participants.reduce((sum, id) => sum + (parseMoney(exact[id]) ?? 0), 0);
  const remaining = (cents || 0) - exactTotal;
  const details = { amount, title, paidBy, date };

  useEffect(() => {
    fields.current[focusRequest.field]?.focus();
  }, [focusRequest]);

  function clearError() { setError(null); }

  function showError(nextError) {
    setError(nextError);
    if (nextError.field === 'date') setDetailsOpen(true);
    const field = nextError.field === 'exact' ? `exact-${nextError.memberId}`
      : nextError.field === 'shares' ? `exact-${participants[0]}` : nextError.field;
    setFocusRequest({ field });
  }

  function chooseMode(nextMode) {
    if (nextMode === 'exact' && !exactStarted.current) {
      setExact(Object.fromEntries(members.map(member => [member.id,
        shares[member.id] !== undefined ? moneyInput(shares[member.id]) : '',
      ])));
      exactStarted.current = true;
    }
    setMode(nextMode);
    clearError();
  }

  async function submit(event) {
    event.preventDefault();
    if (saving.current) return;
    const prepared = prepareExpense({
      id: draftId, ...details, participants, splitMode: mode, exact, category, note,
    }, members);
    if (prepared.error) return showError(prepared.error);

    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSave(prepared.expense);
    } catch (saveError) {
      setError({ field: 'save', message: saveError?.message || 'No se pudo guardar el gasto. Inténtalo de nuevo.' });
      setFocusRequest({ field: 'error' });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const invalid = field => error?.field === field || undefined;
  const describedBy = field => error?.field === field ? 'expense-form-error' : undefined;

  return <Modal
    title={t(baseline.expense ? 'Editar gasto' : 'Añadir gasto')}
    subtitle={baseline.group.name}
    onClose={() => { if (!saving.current) onClose(); }}
    className="expense-dialog"
    closeDisabled={busy}
  >
    <form className="expense-flow" onSubmit={submit} noValidate aria-busy={busy} autoComplete="off">
      <section className="flow-step">
        <label className="flow-amount" htmlFor="expense-amount">
          <span>{t('Importe total')}</span>
          <span className="flow-amount-input"><span>{currency}</span><input
            ref={element => { fields.current.amount = element; }} id="expense-amount"
            aria-label={t('Importe total en {currency}', { currency })} aria-invalid={invalid('amount')} aria-describedby={describedBy('amount')}
            inputMode="decimal" autoComplete="off" autoFocus placeholder="0.00" value={amount}
            onChange={event => { setAmount(event.target.value); clearError(); }}
          /></span>
        </label>
        <label htmlFor="expense-title">{t('¿En qué gastaron?')}<input
          ref={element => { fields.current.title = element; }} id="expense-title"
          maxLength={100} placeholder={t('Por ejemplo, la cena del viernes')} value={title}
          aria-invalid={invalid('title')} aria-describedby={describedBy('title')}
          onChange={event => { setTitle(event.target.value); clearError(); }}
        /></label>
        <label htmlFor="expense-payer">{t('¿Quién pagó?')}<CustomSelect
          ref={element => { fields.current.paidBy = element; }} id="expense-payer" value={paidBy}
          aria-label={t('¿Quién pagó?')} aria-invalid={invalid('paidBy')} aria-describedby={describedBy('paidBy')}
          onChange={value => { setPaidBy(value); clearError(); }}
          options={members.map(member => ({ value: member.id, label: member.name }))}
        /></label>
        <details className="flow-details" open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)}>
          <summary><span>{t('Más detalles')}</span><span className="optional">{t('Fecha, categoría y nota')}</span><ChevronDown size={18} aria-hidden="true" /></summary>
          <div className="form-stack">
            <label htmlFor="expense-date">{t('Fecha')}<input
              ref={element => { fields.current.date = element; }} id="expense-date" type="date" value={date}
              aria-invalid={invalid('date')} aria-describedby={describedBy('date')}
              onChange={event => { setDate(event.target.value); clearError(); }}
            /></label>
            <label htmlFor="expense-category">{t('Categoría')}<CustomSelect id="expense-category" aria-label={t('Categoría')} value={category} onChange={value => { setCategory(value); clearError(); }}
              options={Object.entries(CATEGORIES).map(([value, label]) => ({ value, label: t(label) }))}
            /></label>
            <label htmlFor="expense-note">{t('Nota')} <span className="optional">{t('opcional')}</span><textarea id="expense-note" maxLength={300} rows={2} placeholder={t('Algo que quieras recordar')} value={note} onChange={event => { setNote(event.target.value); clearError(); }} /></label>
          </div>
        </details>
      </section>
      <section className="flow-step flow-split" aria-labelledby="expense-split-title">
        <h3 className="flow-step-title" id="expense-split-title">{t('¿Para quién?')}</h3>
        <div className="split-label">
          <span>{t('Repartir entre')} <span className="muted">{t('{count} de {total}', { count: participants.length, total: members.length })}</span></span>
          <div className="segmented" role="group" aria-label={t('Cómo repartir el gasto')}>
            <button type="button" disabled={busy} className={mode === 'equal' ? 'selected' : ''} aria-pressed={mode === 'equal'} onClick={() => chooseMode('equal')}>{t('Por igual')}</button>
            <button type="button" disabled={busy} className={mode === 'exact' ? 'selected' : ''} aria-pressed={mode === 'exact'} onClick={() => chooseMode('exact')}>{t('Importes exactos')}</button>
          </div>
        </div>
        <div className="split-members" role="group" aria-label={t('Personas del reparto')} aria-describedby={describedBy('participants')}>
          {members.map((member, index) => {
            const included = participants.includes(member.id);
            const exactError = error?.field === 'exact' && error.memberId === member.id;
            return <div className={`split-member ${included ? '' : 'excluded'}`} key={member.id}>
              <label className="check-label"><input
                type="checkbox" disabled={busy} checked={included} aria-label={t('Incluir a {name} en el reparto', { name: member.name })}
                ref={element => { if (index === 0) fields.current.participants = element; }}
                onChange={event => { setParticipants(current => event.target.checked ? [...current, member.id] : current.filter(id => id !== member.id)); clearError(); }}
              /><Avatar member={member} index={index} /><span>{member.name}</span></label>
              {included ? mode === 'exact' ? <div className="exact-field"><span aria-hidden="true">{currency === 'EUR' ? '€' : '$'}</span><input
                ref={element => { fields.current[`exact-${member.id}`] = element; }}
                aria-label={t('Parte de {name} en {currency}', { name: member.name, currency })} inputMode="decimal" autoComplete="off" disabled={busy}
                aria-invalid={exactError || undefined} aria-describedby={exactError || error?.field === 'shares' ? 'expense-form-error' : undefined}
                placeholder="0.00" value={exact[member.id]} onChange={event => { setExact(current => ({ ...current, [member.id]: event.target.value })); clearError(); }}
              /></div> : <span>{formatMoney(shares[member.id] ?? 0, currency)}</span> : <span className="muted">{t('No participa')}</span>}
            </div>;
          })}
        </div>
        {mode === 'exact' && cents > 0 && <p className={`split-remainder ${remaining === 0 && participants.length ? 'positive' : ''}`} role="status">
          {remaining === 0 && participants.length ? t('El reparto suma el total.') : remaining < 0 ? t('Te pasaste por {amount}.', { amount: formatMoney(-remaining, currency) }) : t('Faltan por repartir {amount}.', { amount: formatMoney(remaining, currency) })}
        </p>}
      </section>

      {error && <p className="form-error" id="expense-form-error" role="alert" tabIndex={-1} ref={element => { fields.current.error = element; }}>{error.field === 'exact' ? t('Escribe un importe válido para {name}.', { name: members.find(member => member.id === error.memberId)?.name || '' }) : t(error.message)}</p>}
      <footer className="flow-actions">
        <button type="button" className="button secondary" onClick={onClose} disabled={busy}>{t('Cancelar')}</button>
        <button type="submit" className="button primary" disabled={busy}>
          <Check size={17} aria-hidden="true" />{t(busy ? 'Guardando…' : baseline.expense ? 'Guardar cambios' : 'Guardar gasto')}
        </button>
      </footer>
    </form>
  </Modal>;
}
