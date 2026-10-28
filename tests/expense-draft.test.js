import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareExpense, todayInMonterrey, validateExpenseDetails } from '../src/expense-draft.js';

const members = [{ id: 'ana', name: 'Ana' }, { id: 'beto', name: 'Beto' }, { id: 'cami', name: 'Cami' }];
const draft = (changes = {}) => ({
  id: 'stable-draft-id', title: '  Cena  ', amount: '1.00', paidBy: 'ana',
  participants: ['ana', 'beto', 'cami'], splitMode: 'equal', exact: {},
  category: 'food', date: '2026-10-27', note: '  Con amigos  ', ...changes,
});

test('the expense date follows Monterrey across the UTC midnight boundary', () => {
  assert.equal(todayInMonterrey(new Date('2026-10-28T05:59:59Z')), '2026-10-27');
  assert.equal(todayInMonterrey(new Date('2026-10-28T06:00:00Z')), '2026-10-28');
});

test('details accept the maximum, comma decimals, and a valid leap date', () => {
  assert.equal(validateExpenseDetails(draft({ amount: '100000000.00' }), members), null);
  assert.equal(validateExpenseDetails(draft({ amount: '12,50', date: '2028-02-29' }), members), null);
  for (const amount of ['', '0', '-1', '0.001', '100000000.01']) {
    assert.equal(validateExpenseDetails(draft({ amount }), members).field, 'amount');
  }
});

test('details identify the field to reveal and focus before the split step', () => {
  assert.equal(validateExpenseDetails(draft({ title: '  ' }), members).field, 'title');
  assert.equal(validateExpenseDetails(draft({ paidBy: 'outsider' }), members).field, 'paidBy');
  assert.equal(validateExpenseDetails(draft({ date: '2026-02-29' }), members).field, 'date');
});

test('equal shares retain participant order and allocate every cent without altering the draft', () => {
  const input = draft({ participants: ['cami', 'ana', 'beto'] });
  const before = structuredClone(input);
  const { expense } = prepareExpense(input, members);
  assert.deepEqual(expense, {
    id: 'stable-draft-id', title: 'Cena', amount: 100, paidBy: 'ana',
    participants: ['cami', 'ana', 'beto'], splitMode: 'equal',
    shares: { cami: 34, ana: 33, beto: 33 }, category: 'food', date: '2026-10-27', note: 'Con amigos',
  });
  assert.deepEqual(input, before);
  assert.notEqual(expense.participants, input.participants);
});

test('an exact split accepts zero shares and ignores amounts for excluded people', () => {
  const { expense } = prepareExpense(draft({
    amount: '0.03', participants: ['ana', 'cami'], splitMode: 'exact',
    exact: { ana: '0', beto: 'not a selected amount', cami: '0,03' },
  }), members);
  assert.deepEqual(expense.shares, { ana: 0, cami: 3 });
  assert.equal(expense.splitMode, 'exact');
});

test('exact splits reject missing, underpaid, and overpaid shares before building an expense', () => {
  const input = draft({ participants: ['ana', 'beto'], splitMode: 'exact' });
  assert.deepEqual(prepareExpense({ ...input, exact: { ana: '1', beto: '' } }, members).error,
    { field: 'exact', memberId: 'beto', message: 'Escribe un importe válido para Beto.' });
  for (const exact of [{ ana: '0.49', beto: '0.50' }, { ana: '0.51', beto: '0.50' }]) {
    assert.equal(prepareExpense({ ...input, exact }, members).error.field, 'shares');
  }
});

test('a save rejects empty, unknown, or duplicate participants', () => {
  for (const participants of [[], ['ana', 'unknown'], ['ana', 'ana']]) {
    assert.equal(prepareExpense(draft({ participants }), members).error.field, 'participants');
  }
});
