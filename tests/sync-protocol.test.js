import test from 'node:test';
import assert from 'node:assert/strict';
import { applyChanges, canonicalizeGroup, diffGroups, validateSharedGroup } from '../src/sync-protocol.js';

function group() {
  return {
    id: 'trip', name: 'Oaxaca', emoji: '🌵', currency: 'MXN', description: 'Un viaje',
    members: [{ id: 'ana', name: 'Ana' }, { id: 'bea', name: 'Bea' }],
    expenses: [], settlements: [],
  };
}
function expense(id = 'food') {
  return { id, title: 'Cena', amount: 3000, paidBy: 'ana', participants: ['ana', 'bea'], shares: { ana: 1500, bea: 1500 }, splitMode: 'equal', category: 'food', date: '2026-10-27', note: '' };
}
function settlement(id) {
  return { id, from: 'bea', to: 'ana', amount: 1, date: '2026-10-27' };
}

test('diff ignores group identity and local credentials while canonical data strips them', () => {
  const before = { ...group(), sync: { token: 'private' }, localOnly: true };
  const after = { ...group(), id: 'remote-id', sync: { token: 'changed' } };
  assert.deepEqual(diffGroups(before, after), []);
  assert.deepEqual(canonicalizeGroup(before), group());
});

test('diff emits inserts, entity edits, deletes and a single details update', () => {
  const before = group();
  before.expenses = [expense('deleted'), expense('edited')];
  const after = structuredClone(before);
  after.name = 'Otro viaje';
  after.expenses = [{ ...expense('edited'), title: 'Almuerzo' }, expense('new')];
  const changes = diffGroups(before, after);
  assert.equal(changes.length, 4);
  assert.deepEqual(changes.find(change => change.id === 'deleted'), { collection: 'expenses', id: 'deleted', before: expense('deleted'), after: null });
  assert.deepEqual(changes.find(change => change.id === 'new'), { collection: 'expenses', id: 'new', before: null, after: expense('new') });
  assert.deepEqual(applyChanges(before, changes), after);
});

test('concurrent different expense inserts both survive without mutating either input', () => {
  const base = group();
  const first = { ...base, expenses: [expense('first')] };
  const second = { ...base, expenses: [expense('second')] };
  const firstChanges = diffGroups(base, first);
  const merged = applyChanges(applyChanges(base, firstChanges), diffGroups(base, second));
  assert.deepEqual(merged.expenses.map(item => item.id).sort(), ['first', 'second']);
  assert.deepEqual(base.expenses, []);
  assert.deepEqual(firstChanges[0].before, null);
});

test('retrying an applied insert, edit or delete is idempotent', () => {
  let current = group();
  for (const next of [{ ...group(), expenses: [expense()] }, { ...group(), expenses: [{ ...expense(), title: 'Comida' }] }, group()]) {
    const changes = diffGroups(current, next);
    const applied = applyChanges(current, changes);
    assert.deepEqual(applyChanges(applied, changes), applied);
    current = applied;
  }
});

test('same expense competing edits and same-id concurrent inserts conflict atomically', () => {
  const base = { ...group(), expenses: [expense()] };
  const current = { ...base, expenses: [{ ...expense(), title: 'Primera edición' }] };
  const wanted = { ...base, name: 'Cambio que no debe aplicarse', expenses: [{ ...expense(), title: 'Segunda edición' }] };
  const unchanged = structuredClone(current);
  assert.throws(() => applyChanges(current, diffGroups(base, wanted)), { code: 'conflict' });
  assert.deepEqual(current, unchanged);
  assert.throws(() => applyChanges(current, [{ collection: 'expenses', id: 'food', before: null, after: expense() }]), { code: 'conflict' });
});

test('object key order does not produce conflicts, while participant ordering is significant', () => {
  const base = { ...group(), expenses: [expense()] };
  const reordered = structuredClone(base);
  reordered.expenses[0].shares = { bea: 1500, ana: 1500 };
  assert.deepEqual(diffGroups(base, reordered), []);
  const next = { ...base, expenses: [{ ...expense(), title: 'Nueva cena' }] };
  assert.equal(applyChanges(reordered, diffGroups(base, next)).expenses[0].title, 'Nueva cena');
  reordered.expenses[0].participants.reverse();
  assert.throws(() => applyChanges(reordered, diffGroups(base, next)), { code: 'conflict' });
});

test('validation rejects missing member references and does not partially mutate a batch', () => {
  const current = { ...group(), expenses: [expense()] };
  const changes = [
    { collection: 'members', id: 'ana', before: current.members[0], after: { id: 'ana', name: 'Ana María' } },
    { collection: 'members', id: 'bea', before: current.members[1], after: null },
  ];
  assert.throws(() => applyChanges(current, changes), { code: 'invalid_group' });
  assert.equal(current.members[0].name, 'Ana');
  assert.equal(current.members.length, 2);
});

test('currency cannot change alongside deleting existing expense or settlement history', () => {
  for (const history of [{ expenses: [expense()] }, { settlements: [{ id: 'payment', from: 'bea', to: 'ana', amount: 1000, date: '2026-10-27' }] }]) {
    const before = { ...group(), ...history };
    const next = { ...group(), currency: 'USD' };
    assert.throws(() => applyChanges(before, diffGroups(before, next)), { code: 'invalid_group' });
  }
  assert.equal(applyChanges(group(), diffGroups(group(), { ...group(), currency: 'USD' })).currency, 'USD');
});

test('malformed changes cannot rename identities or target the same entity twice', () => {
  for (const changes of [
    [{ collection: 'expenses', id: 'food', before: null, after: expense('other') }],
    [{ collection: 'groups', id: 'trip', before: null, after: group() }],
    [{ collection: 'details', before: null, after: { name: 'No' } }],
    [1],
    [{ collection: 'expenses', id: 'food', before: null, after: expense() }, { collection: 'expenses', id: 'food', before: null, after: expense() }],
  ]) assert.throws(() => applyChanges(group(), changes), { code: 'invalid_changes' });
});

test('bounded shared groups reuse domain validation and drop nested local metadata', () => {
  assert.equal(validateSharedGroup(group()), true);
  assert.equal(validateSharedGroup({ ...group(), name: 'x'.repeat(161) }), false);
  assert.equal(validateSharedGroup({ ...group(), members: Array.from({ length: 101 }, (_, index) => ({ id: String(index), name: `Member ${index}` })) }), false);
  assert.equal(validateSharedGroup({ ...group(), expenses: [{ ...expense(), amount: 0 }] }), false);
  const withLocal = { ...group(), members: [{ id: 'ana', name: 'Ana', token: 'private' }, group().members[1]], expenses: [{ ...expense(), localDraft: true }] };
  assert.deepEqual(canonicalizeGroup(withLocal).members[0], { id: 'ana', name: 'Ana' });
  assert.deepEqual(canonicalizeGroup(withLocal).expenses[0], expense());
});

test('shared groups accept more than two thousand movements within the storage byte limit', () => {
  const input = { ...group(), settlements: Array.from({ length: 2001 }, (_, index) => settlement(`payment-${index}`)) };
  assert.equal(canonicalizeGroup(input).settlements.length, 2001);
  const after = { ...input, settlements: [...input.settlements, settlement('next-payment')] };
  assert.equal(applyChanges(input, diffGroups(input, after)).settlements.length, 2002);
});

test('a valid history replacement has no fixed change-count ceiling', () => {
  const history = prefix => ({
    ...group(),
    expenses: Array.from({ length: 200 }, (_, index) => expense(`${prefix}-expense-${index}`)),
    settlements: Array.from({ length: 1900 }, (_, index) => settlement(`${prefix}-payment-${index}`)),
  });
  const before = history('old');
  const after = history('new');
  const changes = diffGroups(before, after);
  assert.equal(changes.length, 4200);
  assert.deepEqual(applyChanges(before, changes), after);
});

test('large histories still respect the canonical group byte limit', () => {
  const input = { ...group(), settlements: Array.from({ length: 4000 }, (_, index) => settlement(`payment-${index}`)) };
  assert.throws(() => canonicalizeGroup(input), { code: 'invalid_group' });
});
