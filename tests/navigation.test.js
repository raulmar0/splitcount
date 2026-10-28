import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute, nextHistoryState } from '../src/navigation.js';

const groups = [{ id: 'trip' }, { id: 'home' }];
test('first launch starts at groups instead of a desktop group dashboard', () => {
  assert.deepEqual(resolveRoute(null, groups), { screen: 'groups', groupId: null, depth: 0 });
});
test('history restores an existing group and keeps valid navigation depth', () => {
  assert.deepEqual(resolveRoute({ buenpar: { screen: 'group', groupId: 'home', depth: 2 } }, groups), { screen: 'group', groupId: 'home', depth: 2 });
});
test('a removed group or unknown screen returns safely to the groups list', () => {
  assert.equal(resolveRoute({ buenpar: { screen: 'group', groupId: 'gone' } }, groups).screen, 'groups');
  assert.equal(resolveRoute({ buenpar: { screen: 'unknown' } }, groups).screen, 'groups');
});
test('navigation preserves unrelated history state and tracks in-app back depth', () => {
  const current = { other: 'keep', buenpar: { screen: 'groups', depth: 0 } };
  assert.deepEqual(nextHistoryState(current, 'group', 'trip'), { other: 'keep', buenpar: { screen: 'group', groupId: 'trip', depth: 1 } });
  assert.equal(nextHistoryState(current, 'settings', null, true).buenpar.depth, 0);
  assert.equal(current.buenpar.screen, 'groups');
});
