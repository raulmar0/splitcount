import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMembers } from '../src/groups.js';

test('editing a member to whitespace rejects the draft instead of dropping referenced IDs', () => {
  const members = [{ id: 'you', name: 'Tú' }, { id: 'ana', name: '   ' }, { id: 'diego', name: 'Diego' }];
  assert.equal(normalizeMembers(members), null);
  assert.equal(members.length, 3);
});

test('member names trim while retaining every identity and order', () => {
  assert.deepEqual(normalizeMembers([{ id: 'you', name: ' Tú ' }, { id: 'ana', name: ' Ana ' }]), [{ id: 'you', name: 'Tú' }, { id: 'ana', name: 'Ana' }]);
});

test('member drafts require at least two distinct nonblank names', () => {
  assert.equal(normalizeMembers([{ id: 'you', name: 'Tú' }]), null);
  assert.equal(normalizeMembers([{ id: 'you', name: 'Ana' }, { id: 'a', name: ' ana ' }]), null);
});
