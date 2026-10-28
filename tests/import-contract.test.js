import test from 'node:test';
import assert from 'node:assert/strict';
import { validateState } from '../src/domain.js';
import { createInitialState } from '../src/seed.js';

test('demo data satisfies the app persistence contract', () => {
  assert.equal(validateState(createInitialState()), true);
});

for (const count of [0, 1]) {
  test(`import rejects groups with ${count} members before forms can crash`, () => {
    const state = createInitialState();
    state.groups[0].members = state.groups[0].members.slice(0, count);
    state.groups[0].expenses = [];
    assert.equal(validateState(state), false);
  });
}

test('import rejects unknown categories instead of omitting amounts from the summary', () => {
  const state = createInitialState();
  state.groups[0].expenses[0].category = 'custom';
  assert.equal(validateState(state), false);
});
