import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSharedGroupCapacity, countSharedGroups, sharedGroupLimit, sharedCreationId } from '../src/group-limits.js';

const local = id => ({ id });
const shared = id => ({ id, _shared: { id } });

test('local groups never consume the guest or account shared allowance', () => {
  const groups = Array.from({ length: 150 }, (_, i) => local(`local-${i}`));
  assert.equal(countSharedGroups(groups), 0);
  assert.doesNotThrow(() => assertSharedGroupCapacity(groups, ['first']));
  assert.doesNotThrow(() => assertSharedGroupCapacity(groups, ['a', 'b', 'c', 'd', 'e', 'f'], true));
  assert.equal(sharedGroupLimit(false), 1);
  assert.equal(sharedGroupLimit(true), 6);
});

test('guests can retain or reopen one shared group and must sign in to add another', () => {
  const groups = [local('local'), shared('one')];
  assert.doesNotThrow(() => assertSharedGroupCapacity(groups, ['one']));
  assert.throws(() => assertSharedGroupCapacity(groups, ['two']), error => error.code === 'shared_group_limit' && /Google/.test(error.message));
});

test('accounts can have six distinct shared groups including pending additions', () => {
  const groups = ['a', 'b', 'c', 'd', 'e'].map(shared);
  assert.doesNotThrow(() => assertSharedGroupCapacity(groups, ['f', 'f'], true));
  assert.throws(() => assertSharedGroupCapacity(groups, ['f', 'g'], true), { code: 'shared_group_limit' });
});

test('existing over-quota workspaces remain usable but cannot grow', () => {
  const groups = ['a', 'b'].map(shared);
  assert.doesNotThrow(() => assertSharedGroupCapacity(groups, ['a']));
  assert.doesNotThrow(() => assertSharedGroupCapacity(groups));
  assert.throws(() => assertSharedGroupCapacity(groups, ['c']), { code: 'shared_group_limit' });
  assert.doesNotThrow(() => assertSharedGroupCapacity([], ['c']));
});

test('an accepted publication retry uses its existing shared slot at capacity', () => {
  const groups = ['a', 'b', 'c', 'd', 'e', 'f'].map(shared);
  groups[5]._account = { sourceId: 'create:local-draft' };
  assert.equal(sharedCreationId(groups, 'local-draft'), 'f');
  assert.doesNotThrow(() => assertSharedGroupCapacity(groups, [sharedCreationId(groups, 'local-draft')], true));
  assert.equal(sharedCreationId(groups, 'new-draft'), 'new-draft');
  assert.throws(() => assertSharedGroupCapacity(groups, [sharedCreationId(groups, 'new-draft')], true), { code: 'shared_group_limit' });
});
