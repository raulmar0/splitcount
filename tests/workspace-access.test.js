import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceAccess } from '../src/workspace-access.js';
import { loadWorkspace, saveWorkspace } from '../src/workspace-storage.js';
import { createInitialState } from '../src/seed.js';

const auth = (status, session = { expiresAt: Date.now() + 60000 }) => ({ account: { id: 'person' }, access: { status, isAdmin: false }, session, signal: new AbortController().signal });

test('pending sign-in, expiry and sign-out keep the guest workspace and anonymous sync', () => {
  const guest = workspaceAccess({});
  const pending = workspaceAccess(auth('pending'));
  const expired = workspaceAccess(auth('pending', null));
  for (const mode of [guest, pending, expired]) {
    assert.equal(mode.key, 'guest');
    assert.equal(mode.accountId, undefined);
    assert.equal(mode.groupSyncEnabled, true);
    assert.equal(mode.groupSyncSignal, undefined);
  }
  assert.equal(pending.pendingApproval, true);
  assert.equal(workspaceAccess({ account: { id: 'person' }, session: { access: { status: 'pending' } } }).key, 'guest');
});

test('approved and rejected accounts retain their account workspace and account API policy', () => {
  const approved = auth('approved'), rejected = auth('rejected');
  assert.equal(workspaceAccess(approved).accountId, 'person');
  assert.equal(workspaceAccess(approved).groupSyncSignal, approved.signal);
  assert.equal(workspaceAccess(rejected).groupSyncEnabled, false);
  assert.equal(workspaceAccess(auth('approved', null)).groupSyncEnabled, false);
  assert.equal(workspaceAccess(auth('approved', null)).key, 'person');
});

test('pending data remains in guest storage after approval and sign-out', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const guest = createInitialState();
  guest.groups[0].name = 'Plan mientras espero aprobación';
  const mode = workspaceAccess(auth('pending'));
  assert.equal(saveWorkspace(guest, mode.accountId, storage), true);
  assert.deepEqual(loadWorkspace(workspaceAccess(auth('pending', null)).accountId, storage), guest);
  assert.deepEqual(loadWorkspace(workspaceAccess(auth('approved')).accountId, storage).groups, []);
  assert.deepEqual(loadWorkspace(workspaceAccess({}).accountId, storage), guest);
});
