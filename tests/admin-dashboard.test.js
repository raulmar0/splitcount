import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer from 'react-test-renderer';
import useAdminDashboard from '../src/useAdminDashboard.js';

const { act } = Renderer;
const roots = [];
const originalError = console.error;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
console.error = (...args) => { if (!String(args[0]).includes('react-test-renderer is deprecated')) originalError(...args); };
afterEach(async () => { await act(async () => { for (const root of roots.splice(0)) root.unmount(); }); });
const entry = () => ({ id: 'person', email: 'ana@example.test', name: 'Ana', status: 'pending', version: 1, requestedAt: 1700000000000, updatedAt: 1700000000000 });
const owner = request => ({ account: { id: 'owner' }, session: { expiresAt: Date.now() + 60000 }, access: { isAdmin: true, status: 'approved' }, request });
async function mount(auth) {
  let current;
  function Harness() { const [session, setAuth] = React.useState(auth); current = { ...useAdminDashboard(session), setAuth }; return null; }
  await act(async () => roots.push(Renderer.create(React.createElement(Harness))));
  return { get current() { return current; } };
}

test('dashboard loads the verified owner queue and applies versioned approval results', async () => {
  let row = entry();
  const calls = [];
  const app = await mount(owner(async (path, options) => {
    calls.push([path, options]);
    if (options?.method === 'PATCH') { row = { ...row, status: options.body.status, version: 2 }; return { account: row, revision: 2 }; }
    return { accounts: [row], revision: 1 };
  }));
  assert.equal(app.current.accounts[0].status, 'pending');
  await act(async () => app.current.decide(entry(), 'approved'));
  assert.equal(app.current.accounts[0].status, 'approved');
  assert.deepEqual(calls[1], ['/admin/accounts/person', { method: 'PATCH', body: { status: 'approved', version: 1 } }]);
});

test('non-admin and expired sessions never fetch the private queue', async () => {
  const auth = owner(() => assert.fail('private request'));
  auth.access.isAdmin = false;
  const app = await mount(auth);
  assert.deepEqual(app.current.accounts, []);
  await act(async () => app.current.setAuth({ ...auth, session: null, access: { isAdmin: true, status: 'approved' } }));
  assert.deepEqual(app.current.accounts, []);
});

test('a queue response cannot expose data after admin session changes', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const app = await mount(owner(async () => pending));
  await act(async () => app.current.setAuth({ account: null, session: null, access: null }));
  await act(async () => resolve({ accounts: [entry()], revision: 1 }));
  assert.deepEqual(app.current.accounts, []);
});
