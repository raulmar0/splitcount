const MAX_AMOUNT = 10_000_000_000;

const isId = (value) => typeof value === 'string' && value.trim().length > 0;
const isCents = (value) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_AMOUNT;

/** Divide integer cents; earlier participants receive any remainder. */
export function splitAmount(amountCents, participantIds) {
  if (!isCents(amountCents)) throw new RangeError('El importe debe ser centavos enteros válidos.');
  if (!Array.isArray(participantIds) || !participantIds.length
    || !Array.from(participantIds).every(isId) || new Set(participantIds).size !== participantIds.length) {
    throw new TypeError('El reparto necesita participantes únicos.');
  }
  const base = Math.floor(amountCents / participantIds.length);
  const remainder = amountCents % participantIds.length;
  return Object.fromEntries(participantIds.map((id, index) => [id, base + (index < remainder ? 1 : 0)]));
}

/** Positive balances receive money; negative balances owe money. */
export function calculateBalances(group) {
  const balances = Object.fromEntries(group.members.map(({ id }) => [id, 0]));
  for (const expense of group.expenses) {
    balances[expense.paidBy] += expense.amount;
    for (const [id, share] of Object.entries(expense.shares)) balances[id] -= share;
  }
  for (const payment of group.settlements) {
    balances[payment.from] += payment.amount;
    balances[payment.to] -= payment.amount;
  }
  return balances;
}

/** Reduce net balances to deterministic debtor-to-creditor transfers. */
export function suggestSettlements(group) {
  const balances = Object.entries(calculateBalances(group));
  const compare = (a, b) => b.amount - a.amount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const debtors = balances.filter(([, amount]) => amount < 0).map(([id, amount]) => ({ id, amount: -amount })).sort(compare);
  const creditors = balances.filter(([, amount]) => amount > 0).map(([id, amount]) => ({ id, amount })).sort(compare);
  const payments = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount, MAX_AMOUNT);
    payments.push({ from: debtor.id, to: creditor.id, amount });
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) debtorIndex += 1;
    if (creditor.amount === 0) creditorIndex += 1;
  }
  return payments;
}

const isRecord = (value) => value !== null && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const isText = (value) => typeof value === 'string';
const hasUniqueIds = (items) => Array.isArray(items)
  && Array.from(items).every((item) => isRecord(item) && isId(item.id))
  && new Set(items.map(({ id }) => id)).size === items.length;
const currencies = new Set(['MXN', 'USD', 'EUR']);
const categories = new Set(['food', 'stay', 'transport', 'shopping', 'fun', 'other']);

export function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isExpense(expense, memberIds) {
  if (!isId(expense.title) || !isCents(expense.amount) || expense.amount === 0
    || !memberIds.has(expense.paidBy) || !Array.isArray(expense.participants)
    || !expense.participants.length || !Array.from(expense.participants).every((id) => memberIds.has(id))
    || new Set(expense.participants).size !== expense.participants.length
    || !isRecord(expense.shares) || !['equal', 'exact'].includes(expense.splitMode)
    || !categories.has(expense.category) || !isDate(expense.date) || !isText(expense.note)) return false;

  const shareIds = Object.keys(expense.shares);
  if (shareIds.length !== expense.participants.length
    || !expense.participants.every((id) => Object.hasOwn(expense.shares, id))) return false;
  const shares = Object.values(expense.shares);
  if (!shares.every(isCents) || shares.reduce((total, share) => total + share, 0) !== expense.amount) return false;
  if (expense.splitMode === 'equal') {
    const expected = splitAmount(expense.amount, expense.participants);
    if (!expense.participants.every((id) => expense.shares[id] === expected[id])) return false;
  }
  return true;
}

function isGroup(group) {
  if (!isId(group.name) || !isId(group.emoji) || !currencies.has(group.currency)
    || !isText(group.description) || !hasUniqueIds(group.members) || group.members.length < 2
    || !group.members.every((member) => isId(member.name))
    || !hasUniqueIds(group.expenses) || !hasUniqueIds(group.settlements)) return false;
  const memberIds = new Set(group.members.map(({ id }) => id));
  if (group._selfId !== undefined && !memberIds.has(group._selfId)) return false;
  if (group._shared !== undefined && (!isRecord(group._shared)
    || group._shared.id !== group.id || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(group.id)
    || typeof group._shared.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(group._shared.token)
    || !Number.isSafeInteger(group._shared.revision) || group._shared.revision < 1)) return false;
  if (!group.expenses.every((expense) => isExpense(expense, memberIds))) return false;
  if (!group.settlements.every((payment) => memberIds.has(payment.from) && memberIds.has(payment.to)
    && payment.from !== payment.to && isCents(payment.amount) && payment.amount > 0 && isDate(payment.date))) return false;
  // Keep all arithmetic exact even for very large imported histories.
  const total = [...group.expenses, ...group.settlements].reduce((sum, entry) => sum + entry.amount, 0);
  return Number.isSafeInteger(total);
}

/** Validate imported or persisted data before it can replace the current state. */
export function validateState(data) {
  try {
    if (!isRecord(data) || data.version !== 1 || !hasUniqueIds(data.groups)) return false;
    if (data.groups.length === 0) return data.activeGroupId === null;
    return isId(data.activeGroupId) && data.groups.some(({ id }) => id === data.activeGroupId)
      && data.groups.every(isGroup);
  } catch {
    return false;
  }
}

export const STORAGE_KEY = 'entre-state-v1';

export function loadState(storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    const value = target.getItem(STORAGE_KEY);
    if (value === null) return null;
    const data = JSON.parse(value);
    return validateState(data) ? data : null;
  } catch {
    return null;
  }
}

export function saveState(state, storage) {
  try {
    if (!validateState(state)) return false;
    const target = storage === undefined ? globalThis.localStorage : storage;
    target.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** Parse an ungrouped decimal amount without floating-point multiplication. */
export function parseMoney(input) {
  if (typeof input !== 'string') return null;
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return isCents(cents) ? cents : null;
}

export function formatMoney(cents, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(cents / 100);
}
