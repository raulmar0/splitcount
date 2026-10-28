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

test('shared backup accepts a valid capability and a viewer from this group', () => {
  const state = createInitialState();
  const group = state.groups[0];
  group.id = '11111111-1111-4111-8111-111111111111';
  state.activeGroupId = group.id;
  group._shared = { id: group.id, token: 'a'.repeat(43), revision: 1 };
  group._selfId = 'ana';
  assert.equal(validateState(state), true);
});

test('import rejects malformed capabilities before they enter synchronization', () => {
  const state = createInitialState();
  state.groups[0]._shared = { id: 'bad', token: 'bad', revision: -1 };
  assert.equal(validateState(state), false);
});

test('a local viewer identity must belong to its group', () => {
  const state = createInitialState();
  state.groups[0]._selfId = 'not-a-member';
  assert.equal(validateState(state), false);
});
