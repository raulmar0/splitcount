import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createInitialState } from '../src/seed.js';
import { validateState } from '../src/domain.js';

function recovery(storage) {
  const html = fs.readFileSync(new URL('../legacy-recovery/index.html', import.meta.url), 'utf8');
  const core = /<script id="recovery-core">([\s\S]*?)<\/script>/.exec(html)?.[1];
  assert.ok(core, 'self-contained recovery core exists');
  const context = vm.createContext({});
  vm.runInContext(core, context);
  return JSON.parse(JSON.stringify(context.SplitcountRecovery.collectWorkspaces(storage)));
}
const memory = entries => ({
  get length() { return Object.keys(entries).length; },
  key(index) { return Object.keys(entries)[index] ?? null; },
  getItem(key) { return entries[key] ?? null; },
  setItem() { throw new Error('recovery must not write storage'); },
  removeItem() { throw new Error('recovery must not erase storage'); },
});

test('legacy recovery exports the guest workspace with private shared keys intact', () => {
  const state = createInitialState();
  const group = state.groups[0];
  group.id = '11111111-1111-4111-8111-111111111111'; state.activeGroupId = group.id;
  group._shared = { id: group.id, token: 'a'.repeat(43), revision: 1 };
  const result = recovery(memory({ 'entre-state-v1': JSON.stringify(state) }));
  assert.equal(result.workspaces.length, 1);
  assert.equal(validateState(result.workspaces[0].backup), true);
  assert.equal(result.workspaces[0].backup.groups[0]._shared.token, 'a'.repeat(43));
});

test('account recovery excludes cloud credentials and repairs active group without merging accounts', () => {
  const source = createInitialState();
  source.groups[0]._shared = { anything: 'stale' }; source.groups[0]._account = { sourceId: 'secret' };
  const other = structuredClone(source); other.groups = [other.groups[2]];
  const result = recovery(memory({
    'splitcount-account-v1:secret-account-a': JSON.stringify(source),
    'splitcount-account-v1:secret-account-b': JSON.stringify(other),
    'unrelated-key': 'must not be read',
  }));
  assert.equal(result.workspaces.length, 2);
  assert.deepEqual(result.workspaces.map(item => item.backup.groups.length), [2, 1]);
  for (const item of result.workspaces) {
    assert.equal(validateState(item.backup), true);
    assert.equal(item.backup.groups.some(group => group._shared || group._account), false);
  }
  assert.doesNotMatch(JSON.stringify(result), /secret-account|sourceId/);
});

test('recovery does not create mock data for empty, malformed or unavailable storage', () => {
  assert.deepEqual(recovery(memory({})).workspaces, []);
  assert.deepEqual(recovery(memory({ 'entre-state-v1': '{broken' })).workspaces, []);
  const unavailable = recovery({ get length() { throw new Error('blocked'); }, getItem() { throw new Error('blocked'); } });
  assert.equal(unavailable.unavailable, true);
  assert.deepEqual(unavailable.workspaces, []);
});

test('stored markup stays data and invalid ledgers are never offered for import', () => {
  const state = createInitialState(); state.groups[0].name = '<img src=x onerror=alert(1)>';
  const result = recovery(memory({ 'entre-state-v1': JSON.stringify(state) }));
  assert.equal(result.workspaces[0].backup.groups[0].name, state.groups[0].name);
  state.groups[0].expenses[0].amount = 123;
  assert.equal(recovery(memory({ 'entre-state-v1': JSON.stringify(state) })).workspaces.length, 0);
});
