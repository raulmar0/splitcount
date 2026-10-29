import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, loadWorkspace, saveWorkspace } from '../src/workspace-storage.js';
import { STORAGE_KEY } from '../src/domain.js';

const memory = initial => {
  const values = new Map(initial);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('a first-time guest starts with no mock groups or transactions', () => {
  assert.deepEqual(loadWorkspace(null, memory()), emptyState());
});

test('invalid or inaccessible guest storage starts empty', () => {
  assert.deepEqual(loadWorkspace(null, memory([[STORAGE_KEY, 'invalid json']])), emptyState());
  assert.deepEqual(loadWorkspace(null, { getItem() { throw new Error('blocked'); } }), emptyState());
});

test('existing guest groups and an intentionally empty workspace survive reload', () => {
  const storage = memory();
  const group = { id: 'real-trip', name: 'Nuestro viaje', emoji: 'grupo', currency: 'MXN', description: '', members: [{ id: 'you', name: 'Raúl' }, { id: 'ana', name: 'Ana' }], expenses: [], settlements: [] };
  const saved = { ...emptyState(), activeGroupId: group.id, groups: [group] };
  assert.equal(saveWorkspace(saved, null, storage), true);
  assert.deepEqual(loadWorkspace(null, storage), saved);
  assert.equal(saveWorkspace(emptyState(), null, storage), true);
  assert.deepEqual(loadWorkspace(null, storage), emptyState());
});
