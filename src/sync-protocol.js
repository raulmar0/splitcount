import { validateState } from './domain.js';

export const MAX_GROUP_BYTES = 256 * 1024;
export const MAX_MEMBERS = 100;

const DETAILS = ['name', 'emoji', 'currency', 'description'];
const FIELDS = {
  members: ['id', 'name'],
  expenses: ['id', 'title', 'amount', 'paidBy', 'participants', 'shares', 'splitMode', 'category', 'date', 'note'],
  settlements: ['id', 'from', 'to', 'amount', 'date'],
  details: DETAILS,
};
const COLLECTIONS = ['members', 'expenses', 'settlements'];
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const isText = (value, max) => typeof value === 'string' && value.length <= max;
const isId = value => isText(value, 128) && value.trim().length > 0;
const pick = (value, fields) => Object.fromEntries(fields.map(field => [field, value[field]]));

export class SyncValidationError extends Error {
  constructor(message = 'El grupo compartido no es válido.', code = 'invalid_group') {
    super(message);
    this.name = 'SyncValidationError';
    this.code = code;
  }
}

export class SyncConflictError extends Error {
  constructor() {
    super('Este dato cambió en otro dispositivo. Revisa la versión más reciente.');
    this.name = 'SyncConflictError';
    this.code = 'conflict';
  }
}

function entity(value, collection) {
  if (!isRecord(value)) throw new SyncValidationError();
  return structuredClone(pick(value, FIELDS[collection]));
}

/** Keep credentials, sync bookkeeping and draft fields out of shared storage. */
export function canonicalizeGroup(input) {
  if (!isRecord(input) || !COLLECTIONS.every(key => Array.isArray(input[key]))) throw new SyncValidationError();
  if (input.members.length > MAX_MEMBERS) throw new SyncValidationError('Este grupo tiene demasiadas personas.');
  const group = {
    id: input.id,
    ...pick(input, DETAILS),
    ...Object.fromEntries(COLLECTIONS.map(key => [key, input[key].map(item => entity(item, key))])),
    ...(typeof input.isDemo === 'boolean' ? { isDemo: input.isDemo } : {}),
  };
  const detailsValid = isId(group.id) && isText(group.name, 160) && isText(group.emoji, 32) && isText(group.description, 4000);
  const entitiesValid = COLLECTIONS.every(key => group[key].every(item => isId(item.id)))
    && group.members.every(item => isText(item.name, 160))
    && group.expenses.every(item => isText(item.title, 240) && isText(item.note, 4000));
  if (!detailsValid || !entitiesValid
    || !validateState({ version: 1, activeGroupId: group.id, groups: [group] })
    || new TextEncoder().encode(JSON.stringify(group)).byteLength > MAX_GROUP_BYTES) throw new SyncValidationError();
  return group;
}

export function validateSharedGroup(group) {
  try { canonicalizeGroup(group); return true; } catch { return false; }
}

function equal(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((item, index) => equal(item, right[index]));
  if (!isRecord(left) || !isRecord(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && equal(left[key], right[key]));
}

/** Entity-level optimistic changes allow unrelated edits to merge. */
export function diffGroups(beforeGroup, afterGroup) {
  const before = canonicalizeGroup(beforeGroup);
  const after = canonicalizeGroup(afterGroup);
  const changes = [];
  const oldDetails = pick(before, DETAILS);
  const newDetails = pick(after, DETAILS);
  if (!equal(oldDetails, newDetails)) changes.push({ collection: 'details', before: oldDetails, after: newDetails });
  for (const collection of COLLECTIONS) {
    const oldItems = new Map(before[collection].map(item => [item.id, item]));
    const newItems = new Map(after[collection].map(item => [item.id, item]));
    for (const id of new Set([...oldItems.keys(), ...newItems.keys()])) {
      const oldItem = oldItems.get(id) ?? null;
      const newItem = newItems.get(id) ?? null;
      if (!equal(oldItem, newItem)) changes.push({ collection, id, before: oldItem, after: newItem });
    }
  }
  return changes;
}

function normalizeChanges(changes) {
  const invalid = () => { throw new SyncValidationError('Los cambios enviados no son válidos.', 'invalid_changes'); };
  if (!Array.isArray(changes)) invalid();
  const targets = new Set();
  return changes.map(change => {
    if (!isRecord(change) || !Object.hasOwn(FIELDS, change.collection)
      || !Object.hasOwn(change, 'before') || !Object.hasOwn(change, 'after')) invalid();
    const { collection, id, before, after } = change;
    if (collection === 'details') {
      if (!isRecord(before) || !isRecord(after)) invalid();
    } else if (!isId(id) || before === null && after === null
      || before !== null && (!isRecord(before) || before.id !== id)
      || after !== null && (!isRecord(after) || after.id !== id)) invalid();
    const target = `${collection}:${collection === 'details' ? '' : id}`;
    if (targets.has(target)) invalid();
    targets.add(target);
    return { collection, id, before: before === null ? null : entity(before, collection), after: after === null ? null : entity(after, collection) };
  });
}

/** Apply the whole batch to a copy; callers persist only after this succeeds. */
export function applyChanges(currentGroup, changes) {
  const current = canonicalizeGroup(currentGroup);
  const candidate = structuredClone(current);
  for (const { collection, id, before, after } of normalizeChanges(changes)) {
    const index = collection === 'details' ? -1 : candidate[collection].findIndex(item => item.id === id);
    const existing = collection === 'details' ? pick(candidate, DETAILS) : candidate[collection][index] ?? null;
    if (equal(existing, after)) continue; // A lost response can safely be retried.
    if (!equal(existing, before)) throw new SyncConflictError();
    if (collection === 'details') Object.assign(candidate, after);
    else if (after === null) candidate[collection].splice(index, 1);
    else if (index === -1) candidate[collection].push(after);
    else candidate[collection][index] = after;
  }
  if (current.currency !== candidate.currency && (current.expenses.length || current.settlements.length)) {
    throw new SyncValidationError('No se puede cambiar la moneda de un grupo con movimientos.');
  }
  return canonicalizeGroup(candidate);
}
