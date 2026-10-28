import test from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '../src/domain.js';

function fixture() {
  return {
    version: 1,
    activeGroupId: 'trip',
    groups: [{
      id: 'trip', name: 'Oaxaca', emoji: '🌵', currency: 'MXN', description: 'Un viaje entre amigos',
      members: [{ id: 'ana', name: 'Ana' }, { id: 'bea', name: 'Bea' }, { id: 'car', name: 'Carlos' }],
      expenses: [
        { id: 'hotel', title: 'Hospedaje', amount: 12000, paidBy: 'ana', participants: ['ana', 'bea', 'car'], shares: { ana: 4000, bea: 4000, car: 4000 }, splitMode: 'equal', category: 'stay', date: '2026-10-27', note: '' },
        { id: 'food', title: 'Cena', amount: 3000, paidBy: 'bea', participants: ['bea', 'car'], shares: { bea: 1500, car: 1500 }, splitMode: 'exact', category: 'food', date: '2026-10-26', note: 'Cena compartida' },
      ],
      settlements: [],
    }],
  };
}

function memoryStorage(value = null) {
  const records = new Map(value === null ? [] : [['entre-state-v1', value]]);
  return {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, nextValue) => records.set(key, String(nextValue)),
  };
}

test('equal split preserves every cent and allocates remainder in participant order', () => {
  assert.deepEqual(domain.splitAmount(100, ['b', 'a', 'c']), { b: 34, a: 33, c: 33 });
});

test('equal split permits zero shares and returns an independent record', () => {
  const members = ['ana', 'bea', 'car'];
  assert.deepEqual(domain.splitAmount(2, members), { ana: 1, bea: 1, car: 0 });
  assert.deepEqual(domain.splitAmount(0, members), { ana: 0, bea: 0, car: 0 });
  assert.deepEqual(members, ['ana', 'bea', 'car']);
});

test('equal split remains exact at the maximum supported amount', () => {
  assert.deepEqual(domain.splitAmount(10_000_000_000, ['a', 'b', 'c']), { a: 3_333_333_334, b: 3_333_333_333, c: 3_333_333_333 });
});

test('equal split rejects malformed amounts and participant lists', () => {
  for (const value of [-1, 0.5, NaN, Infinity, '100', 10_000_000_001]) {
    assert.throws(() => domain.splitAmount(value, ['a']), { name: 'RangeError' });
  }
  for (const ids of [[], ['a', 'a'], [''], [' '], [null], null, 'a']) {
    assert.throws(() => domain.splitAmount(100, ids), { name: 'TypeError' });
  }
});

test('balances credit the payer and debit only participating shares', () => {
  assert.deepEqual(domain.calculateBalances(fixture().groups[0]), { ana: 8000, bea: -2500, car: -5500 });
});

test('recorded repayments reduce creditor and debtor balances without changing expenses', () => {
  const group = fixture().groups[0];
  group.settlements.push({ id: 'repay', from: 'car', to: 'ana', amount: 2000, date: '2026-10-27' });
  const before = structuredClone(group);
  assert.deepEqual(domain.calculateBalances(group), { ana: 6000, bea: -2500, car: -3500 });
  assert.deepEqual(group, before);
});

test('empty groups give every member a zero balance', () => {
  const group = fixture().groups[0];
  group.expenses = [];
  assert.deepEqual(domain.calculateBalances(group), { ana: 0, bea: 0, car: 0 });
});

test('settlement suggestions prioritize largest debts and account for repayments', () => {
  const group = fixture().groups[0];
  group.settlements.push({ id: 'repay', from: 'car', to: 'ana', amount: 2000, date: '2026-10-27' });
  assert.deepEqual(domain.suggestSettlements(group), [
    { from: 'car', to: 'ana', amount: 3500 },
    { from: 'bea', to: 'ana', amount: 2500 },
  ]);
});

test('settlement ties use member IDs and ignore original member ordering', () => {
  const group = {
    members: [{ id: 'd' }, { id: 'b' }, { id: 'a' }, { id: 'c' }], settlements: [],
    expenses: [
      { paidBy: 'a', amount: 10000, shares: { c: 5000, d: 5000 } },
      { paidBy: 'b', amount: 10000, shares: { a: 5000, b: 5000 } },
    ],
  };
  assert.deepEqual(domain.suggestSettlements(group), [{ from: 'c', to: 'a', amount: 5000 }, { from: 'd', to: 'b', amount: 5000 }]);
});

test('applying all suggested payments settles every cent', () => {
  const group = fixture().groups[0];
  const suggestions = domain.suggestSettlements(group);
  assert.ok(Array.isArray(suggestions), 'suggestions are a list');
  group.settlements.push(...suggestions.map((payment, index) => ({ ...payment, id: `payment-${index}`, date: '2026-10-27' })));
  assert.deepEqual(domain.calculateBalances(group), { ana: 0, bea: 0, car: 0 });
  assert.deepEqual(domain.suggestSettlements(group), []);
});

test('balance records safely preserve IDs that resemble object properties', () => {
  const group = { members: [{ id: '__proto__' }, { id: 'constructor' }], expenses: [{ paidBy: '__proto__', amount: 101, shares: { constructor: 101 } }], settlements: [] };
  assert.deepEqual(Object.entries(domain.calculateBalances(group) ?? {}), [['__proto__', 101], ['constructor', -101]]);
});

test('valid state includes both equal and exact splits', () => {
  assert.equal(domain.validateState(fixture()), true);
});

test('empty state and groups without expenses can be persisted', () => {
  assert.equal(domain.validateState({ version: 1, activeGroupId: null, groups: [] }), true);
  const state = fixture();
  state.groups[0].expenses = [];
  assert.equal(domain.validateState(state), true);
});

test('valid state permits real leap days, future dates, and supported currencies', () => {
  for (const currency of ['MXN', 'USD', 'EUR']) {
    const state = fixture();
    state.groups[0].currency = currency;
    state.groups[0].expenses[0].date = '2028-02-29';
    assert.equal(domain.validateState(state), true);
  }
});

test('valid equal splits can contain zero shares when the amount is tiny', () => {
  const state = fixture();
  Object.assign(state.groups[0].expenses[0], { amount: 2, shares: { ana: 1, bea: 1, car: 0 } });
  assert.equal(domain.validateState(state), true);
});

const invalidStateChanges = [
  ['unsupported version', (state) => { state.version = 2; }],
  ['missing groups', (state) => { delete state.groups; }],
  ['invalid active group', (state) => { state.activeGroupId = 'missing'; }],
  ['null active group for a populated state', (state) => { state.activeGroupId = null; }],
  ['duplicate group IDs', (state) => { state.groups.push(structuredClone(state.groups[0])); }],
  ['blank group name', (state) => { state.groups[0].name = ' '; }],
  ['unsupported currency', (state) => { state.groups[0].currency = 'GBP'; }],
  ['missing description', (state) => { delete state.groups[0].description; }],
  ['duplicate members', (state) => { state.groups[0].members.push({ id: 'ana', name: 'Otra Ana' }); }],
  ['blank member name', (state) => { state.groups[0].members[0].name = ''; }],
  ['duplicate expense IDs', (state) => { state.groups[0].expenses.push(structuredClone(state.groups[0].expenses[0])); }],
  ['unknown payer', (state) => { state.groups[0].expenses[0].paidBy = 'missing'; }],
  ['unknown participant', (state) => { state.groups[0].expenses[0].participants[0] = 'missing'; }],
  ['duplicate participants', (state) => { state.groups[0].expenses[0].participants.push('ana'); }],
  ['no participants', (state) => { state.groups[0].expenses[0].participants = []; }],
  ['blank expense title', (state) => { state.groups[0].expenses[0].title = ' '; }],
  ['zero expense', (state) => { state.groups[0].expenses[0].amount = 0; }],
  ['negative expense', (state) => { state.groups[0].expenses[0].amount = -1; }],
  ['fractional cents', (state) => { state.groups[0].expenses[0].amount = 12000.5; }],
  ['too large an expense', (state) => { state.groups[0].expenses[0].amount = 10_000_000_001; }],
  ['infinite expense', (state) => { state.groups[0].expenses[0].amount = Infinity; }],
  ['missing share', (state) => { delete state.groups[0].expenses[0].shares.ana; }],
  ['extra share', (state) => { state.groups[0].expenses[0].shares.missing = 0; }],
  ['negative share', (state) => { state.groups[0].expenses[0].shares.ana = -1; }],
  ['fractional share', (state) => { state.groups[0].expenses[0].shares.ana = 4000.5; }],
  ['shares not conserving amount', (state) => { state.groups[0].expenses[0].shares.ana = 4001; }],
  ['unequal equal-mode shares', (state) => { state.groups[0].expenses[0].shares = { ana: 5000, bea: 4000, car: 3000 }; }],
  ['unknown split mode', (state) => { state.groups[0].expenses[0].splitMode = 'percent'; }],
  ['impossible date', (state) => { state.groups[0].expenses[0].date = '2026-02-30'; }],
  ['non-leap-year date', (state) => { state.groups[0].expenses[0].date = '2025-02-29'; }],
  ['non-ISO date', (state) => { state.groups[0].expenses[0].date = '27/10/2026'; }],
  ['datetime instead of date', (state) => { state.groups[0].expenses[0].date = '2026-10-27T00:00:00Z'; }],
  ['missing note', (state) => { delete state.groups[0].expenses[0].note; }],
  ['malformed settlements', (state) => { state.groups[0].settlements = {}; }],
  ['unknown settlement member', (state) => { state.groups[0].settlements = [{ id: 'p', from: 'missing', to: 'ana', amount: 1, date: '2026-10-27' }]; }],
  ['self settlement', (state) => { state.groups[0].settlements = [{ id: 'p', from: 'ana', to: 'ana', amount: 1, date: '2026-10-27' }]; }],
  ['zero settlement', (state) => { state.groups[0].settlements = [{ id: 'p', from: 'bea', to: 'ana', amount: 0, date: '2026-10-27' }]; }],
  ['negative settlement', (state) => { state.groups[0].settlements = [{ id: 'p', from: 'bea', to: 'ana', amount: -1, date: '2026-10-27' }]; }],
  ['too large a settlement', (state) => { state.groups[0].settlements = [{ id: 'p', from: 'bea', to: 'ana', amount: 10_000_000_001, date: '2026-10-27' }]; }],
  ['invalid settlement date', (state) => { state.groups[0].settlements = [{ id: 'p', from: 'bea', to: 'ana', amount: 1, date: '2026-13-01' }]; }],
  ['duplicate settlement IDs', (state) => { const payment = { id: 'p', from: 'bea', to: 'ana', amount: 1, date: '2026-10-27' }; state.groups[0].settlements = [payment, { ...payment }]; }],
];

for (const [reason, mutate] of invalidStateChanges) {
  test(`import validation rejects ${reason}`, () => {
    const state = fixture();
    mutate(state);
    assert.equal(domain.validateState(state), false);
  });
}

test('import validation safely rejects non-object and malformed nested input', () => {
  for (const value of [null, undefined, true, [], 'hello', { version: 1, groups: [null], activeGroupId: null }]) {
    assert.equal(domain.validateState(value), false);
  }
});

test('saved state round-trips under the versioned key', () => {
  const storage = memoryStorage();
  const state = fixture();
  assert.equal(domain.saveState(state, storage), true);
  assert.deepEqual(JSON.parse(storage.getItem('entre-state-v1')), state);
  assert.deepEqual(domain.loadState(storage), state);
});

test('loading returns null for missing, corrupt, or invalid saved data', () => {
  for (const value of [null, '{broken', 'null', JSON.stringify({ version: 99, groups: [] })]) {
    assert.equal(domain.loadState(memoryStorage(value)), null);
  }
});

test('invalid writes preserve the last valid save', () => {
  const state = fixture();
  const initial = JSON.stringify(state);
  const storage = memoryStorage(initial);
  state.groups[0].expenses[0].amount = -1;
  assert.equal(domain.saveState(state, storage), false);
  assert.equal(storage.getItem('entre-state-v1'), initial);
});

test('persistence safely handles blocked storage and quota exhaustion', () => {
  const denied = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Quota exceeded'); } };
  assert.equal(domain.loadState(denied), null);
  assert.equal(domain.saveState(fixture(), denied), false);
  assert.equal(domain.loadState(null), null);
  assert.equal(domain.saveState(fixture(), null), false);
});

test('money parsing accepts dot or comma decimals without floating-point cent loss', () => {
  for (const [input, expected] of [['1234.56', 123456], ['1234,56', 123456], ['0.29', 29], [' 12.3 ', 1230], ['12', 1200], ['0', 0], ['0,00', 0], ['100000000.00', 10_000_000_000]]) {
    assert.equal(domain.parseMoney(input), expected, input);
  }
});

test('money parsing rejects negative, exponential, grouped, overprecision, and oversized input', () => {
  for (const input of ['', ' ', '-0', '-1', '+1', '1e2', '1E2', '1.001', '1,001', '1,234.56', '1.234,56', '.50', '12.', '1 000', 'NaN', 'Infinity', '$10', '100000000.01', null, undefined, 12]) {
    assert.equal(domain.parseMoney(input), null, String(input));
  }
});

test('money formatting uses Spanish Mexico currency conventions', () => {
  assert.equal(domain.formatMoney(123456), '$1,234.56');
  assert.equal(domain.formatMoney(-2500, 'MXN'), '-$25.00');
  assert.equal(domain.formatMoney(0, 'EUR'), 'EUR' + '\u00a0' + '0.00');
  assert.equal(domain.formatMoney(123456, 'USD'), 'USD' + '\u00a0' + '1,234.56');
});

test('import validation rejects sparse collections before they reach calculations', () => {
  const mutations = [
    (state) => { state.groups.length = 2; },
    (state) => { state.groups[0].members.length = 4; },
    (state) => { state.groups[0].expenses.length = 3; },
    (state) => { state.groups[0].settlements.length = 1; },
    (state) => { Object.assign(state.groups[0].expenses[1], { participants: Array(1), shares: { bea: 3000 } }); },
  ];
  for (const mutate of mutations) {
    const state = fixture();
    mutate(state);
    assert.equal(domain.validateState(state), false);
  }
});

test('large net debts produce transfers that can each be recorded within the amount limit', () => {
  const state = fixture();
  const group = state.groups[0];
  group.expenses = ['one', 'two'].map((id) => ({
    id, title: 'Gasto grande', amount: 10_000_000_000, paidBy: 'ana', participants: ['bea'],
    shares: { bea: 10_000_000_000 }, splitMode: 'equal', category: 'other', date: '2026-10-27', note: '',
  }));
  assert.equal(domain.validateState(state), true);
  const suggestions = domain.suggestSettlements(group);
  assert.deepEqual(suggestions, [
    { from: 'bea', to: 'ana', amount: 10_000_000_000 },
    { from: 'bea', to: 'ana', amount: 10_000_000_000 },
  ]);
  group.settlements = suggestions.map((payment, index) => ({ ...payment, id: `large-payment-${index}`, date: '2026-10-27' }));
  assert.equal(domain.validateState(state), true);
  assert.deepEqual(domain.calculateBalances(group), { ana: 0, bea: 0, car: 0 });
});
