import { isDate, parseMoney, splitAmount } from './domain.js';

export const moneyInput = (cents) => (cents / 100).toFixed(2);

export function todayInMonterrey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Monterrey', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function validateExpenseDetails(draft, members) {
  const amount = parseMoney(draft.amount);
  if (amount === null || amount <= 0) {
    return { field: 'amount', message: 'Escribe un importe mayor a cero, de hasta 100 millones.' };
  }
  if (!draft.title.trim()) {
    return { field: 'title', message: 'Escribe en qué gastaron.' };
  }
  if (!members.some(member => member.id === draft.paidBy)) {
    return { field: 'paidBy', message: 'Elige quién pagó el gasto.' };
  }
  if (!isDate(draft.date)) {
    return { field: 'date', message: 'Elige una fecha válida en Más detalles.' };
  }
  return null;
}

/** Build the persisted expense only after both steps are valid. All math stays in cents. */
export function prepareExpense(draft, members) {
  const detailsError = validateExpenseDetails(draft, members);
  if (detailsError) return { error: detailsError };

  const { participants } = draft;
  if (!participants.length) {
    return { error: { field: 'participants', message: 'Elige al menos una persona para repartir el gasto.' } };
  }
  if (new Set(participants).size !== participants.length
    || participants.some(id => !members.some(member => member.id === id))) {
    return { error: { field: 'participants', message: 'Revisa las personas incluidas en el reparto.' } };
  }

  const amount = parseMoney(draft.amount);
  let shares;
  if (draft.splitMode === 'equal') {
    shares = splitAmount(amount, participants);
  } else if (draft.splitMode === 'exact') {
    shares = {};
    for (const id of participants) {
      const share = parseMoney(draft.exact[id]);
      if (share === null) {
        const member = members.find(person => person.id === id);
        return { error: { field: 'exact', memberId: id, message: `Escribe un importe válido para ${member.name}.` } };
      }
      shares[id] = share;
    }
    if (Object.values(shares).reduce((sum, share) => sum + share, 0) !== amount) {
      return { error: { field: 'shares', message: 'Los importes de cada persona deben sumar el total del gasto.' } };
    }
  } else {
    return { error: { field: 'participants', message: 'Elige cómo repartir el gasto.' } };
  }

  return { expense: {
    id: draft.id,
    title: draft.title.trim(),
    amount,
    paidBy: draft.paidBy,
    participants: [...participants],
    splitMode: draft.splitMode,
    shares,
    category: draft.category,
    date: draft.date,
    note: draft.note.trim(),
  } };
}
