import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown } from 'lucide-react';
import { formatMoney, parseMoney, splitAmount } from './domain.js';
import { moneyInput, prepareExpense, todayInMonterrey, validateExpenseDetails } from './expense-draft.js';
import Modal from './Modal.jsx';

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
  // The open form owns its baseline, even if a shared group refreshes while typing.
  const [baseline] = useState(() => ({ group, expense }));
  const members = baseline.group.members;
  const currency = baseline.group.currency;
  const [draftId] = useState(() => baseline.expense?.id || globalThis.crypto.randomUUID());
  const [step, setStep] = useState(1);
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
  const payer = members.find(member => member.id === paidBy);
  const details = { amount, title, paidBy, date };

  useEffect(() => {
    fields.current[focusRequest.field]?.focus();
  }, [focusRequest]);

  function clearError() { setError(null); }

  function showError(nextError) {
    setError(nextError);
    if (['amount', 'title', 'paidBy', 'date'].includes(nextError.field)) setStep(1);
    if (nextError.field === 'date') setDetailsOpen(true);
    const field = nextError.field === 'exact' ? `exact-${nextError.memberId}`
      : nextError.field === 'shares' ? `exact-${participants[0]}` : nextError.field;
    setFocusRequest({ field });
  }

  function continueToSplit() {
    const nextError = validateExpenseDetails(details, members);
    if (nextError) return showError(nextError);
    setError(null);
    setStep(2);
    setFocusRequest({ field: 'splitHeading' });
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
    if (step === 1) return continueToSplit();
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
    title={baseline.expense ? 'Editar gasto' : 'Añadir gasto'}
    subtitle={baseline.group.name}
    onClose={() => { if (!saving.current) onClose(); }}
    className="expense-dialog"
    closeDisabled={busy}
  >
    <form className="expense-flow" onSubmit={submit} noValidate aria-busy={busy}>
      <ol className="flow-progress" aria-label="Progreso del gasto">
        <li className={step === 1 ? 'current' : 'complete'} aria-current={step === 1 ? 'step' : undefined}><span aria-hidden="true">1</span>El gasto</li>
        <li className={step === 2 ? 'current' : ''} aria-current={step === 2 ? 'step' : undefined}><span aria-hidden="true">2</span>El reparto</li>
      </ol>

      {step === 1 ? <section className="flow-step" aria-labelledby="expense-details-title">
        <h3 className="flow-step-title" id="expense-details-title">¿Cuánto fue?</h3>
        <label className="flow-amount" htmlFor="expense-amount">
          <span>Importe total</span>
          <span className="flow-amount-input"><span>{currency}</span><input
            ref={element => { fields.current.amount = element; }} id="expense-amount"
            aria-label={`Importe total en ${currency}`} aria-invalid={invalid('amount')} aria-describedby={describedBy('amount')}
            inputMode="decimal" autoComplete="off" autoFocus placeholder="0.00" value={amount}
            onChange={event => { setAmount(event.target.value); clearError(); }}
          /></span>
        </label>
        <label htmlFor="expense-title">¿En qué gastaron?<input
          ref={element => { fields.current.title = element; }} id="expense-title"
          maxLength={100} placeholder="Por ejemplo, la cena del viernes" value={title}
          aria-invalid={invalid('title')} aria-describedby={describedBy('title')}
          onChange={event => { setTitle(event.target.value); clearError(); }}
        /></label>
        <label htmlFor="expense-payer">¿Quién pagó?<select
          ref={element => { fields.current.paidBy = element; }} id="expense-payer" value={paidBy}
          aria-invalid={invalid('paidBy')} aria-describedby={describedBy('paidBy')}
          onChange={event => { setPaidBy(event.target.value); clearError(); }}
        >{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
        <details className="flow-details" open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)}>
          <summary><span>Más detalles</span><span className="optional">Fecha, categoría y nota</span><ChevronDown size={18} aria-hidden="true" /></summary>
          <div className="form-stack">
            <label htmlFor="expense-date">Fecha<input
              ref={element => { fields.current.date = element; }} id="expense-date" type="date" value={date}
              aria-invalid={invalid('date')} aria-describedby={describedBy('date')}
              onChange={event => { setDate(event.target.value); clearError(); }}
            /></label>
            <label htmlFor="expense-category">Categoría<select id="expense-category" value={category} onChange={event => { setCategory(event.target.value); clearError(); }}>
              {Object.entries(CATEGORIES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
            </select></label>
            <label htmlFor="expense-note">Nota <span className="optional">opcional</span><textarea id="expense-note" maxLength={300} rows={2} placeholder="Algo que quieras recordar" value={note} onChange={event => { setNote(event.target.value); clearError(); }} /></label>
          </div>
        </details>
      </section> : <section className="flow-step" aria-labelledby="expense-split-title">
        <h3 className="flow-step-title" id="expense-split-title" tabIndex={-1} ref={element => { fields.current.splitHeading = element; }}>¿Cómo lo reparten?</h3>
        <div className="flow-summary"><div><strong>{title.trim()}</strong><span>Pagó {payer?.name}</span></div><strong>{formatMoney(cents, currency)}</strong></div>
        <div className="split-label">
          <span>Repartir entre <span className="muted">{participants.length} de {members.length}</span></span>
          <div className="segmented" role="group" aria-label="Cómo repartir el gasto">
            <button type="button" disabled={busy} className={mode === 'equal' ? 'selected' : ''} aria-pressed={mode === 'equal'} onClick={() => chooseMode('equal')}>Por igual</button>
            <button type="button" disabled={busy} className={mode === 'exact' ? 'selected' : ''} aria-pressed={mode === 'exact'} onClick={() => chooseMode('exact')}>Importes exactos</button>
          </div>
        </div>
        <div className="split-members" role="group" aria-label="Personas del reparto" aria-describedby={describedBy('participants')}>
          {members.map((member, index) => {
            const included = participants.includes(member.id);
            const exactError = error?.field === 'exact' && error.memberId === member.id;
            return <div className={`split-member ${included ? '' : 'excluded'}`} key={member.id}>
              <label className="check-label"><input
                type="checkbox" disabled={busy} checked={included} aria-label={`Incluir a ${member.name} en el reparto`}
                ref={element => { if (index === 0) fields.current.participants = element; }}
                onChange={event => { setParticipants(current => event.target.checked ? [...current, member.id] : current.filter(id => id !== member.id)); clearError(); }}
              /><Avatar member={member} index={index} /><span>{member.name}</span></label>
              {included ? mode === 'exact' ? <div className="exact-field"><span aria-hidden="true">{currency === 'EUR' ? '€' : '$'}</span><input
                ref={element => { fields.current[`exact-${member.id}`] = element; }}
                aria-label={`Parte de ${member.name} en ${currency}`} inputMode="decimal" autoComplete="off" disabled={busy}
                aria-invalid={exactError || undefined} aria-describedby={exactError || error?.field === 'shares' ? 'expense-form-error' : undefined}
                placeholder="0.00" value={exact[member.id]} onChange={event => { setExact(current => ({ ...current, [member.id]: event.target.value })); clearError(); }}
              /></div> : <span>{formatMoney(shares[member.id], currency)}</span> : <span className="muted">No participa</span>}
            </div>;
          })}
        </div>
        {mode === 'exact' && <p className={`split-remainder ${remaining === 0 && participants.length ? 'positive' : ''}`} role="status">
          {remaining === 0 && participants.length ? 'El reparto suma el total.' : remaining < 0 ? `Te pasaste por ${formatMoney(-remaining, currency)}.` : `Faltan por repartir ${formatMoney(remaining, currency)}.`}
        </p>}
      </section>}

      {error && <p className="form-error" id="expense-form-error" role="alert" tabIndex={-1} ref={element => { fields.current.error = element; }}>{error.message}</p>}
      <footer className="flow-actions">
        {step === 1 ? <button type="button" className="button secondary" onClick={onClose}>Cancelar</button> : <button type="button" className="button secondary" disabled={busy} onClick={() => { setStep(1); clearError(); setFocusRequest({ field: 'amount' }); }}><ArrowLeft size={17} aria-hidden="true" />Atrás</button>}
        <button type="submit" className="button primary" disabled={busy}>
          {step === 1 ? <>Continuar<ArrowRight size={17} aria-hidden="true" /></> : <><Check size={17} aria-hidden="true" />{busy ? 'Guardando…' : baseline.expense ? 'Guardar cambios' : 'Guardar gasto'}</>}
        </button>
      </footer>
    </form>
  </Modal>;
}
