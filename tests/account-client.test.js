import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer from 'react-test-renderer';
import { GroupStore, handleRequest } from '../sync-server/src/service.js';
import { AccountStore } from '../sync-server/src/account-store.js';
import { accountRequest, validateDirectory } from '../src/account-sync.js';
import { accountStorageKey, clearAccountCache, emptyState, loadWorkspace, saveWorkspace } from '../src/workspace-storage.js';
import { STORAGE_KEY } from '../src/domain.js';
import { fetchSharedGroup, commitSharedGroup } from '../src/sync.js';
import useAccountSync from '../src/useAccountSync.js';
import useGroupSync from '../src/useGroupSync.js';

const { act } = Renderer;
const keys = ['fetch', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT', 'addEventListener', 'removeEventListener', 'setInterval', 'clearInterval', 'location', 'history'];
const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const originalError = console.error;
const roots = [];
const local = () => ({ id: crypto.randomUUID(), name: 'Viaje con amigos', emoji: 'grupo', currency: 'MXN', description: '', members: [{ id: 'you', name: 'Raúl' }, { id: 'ana', name: 'Ana' }], expenses: [], settlements: [] });
const expense = id => ({ id, title: 'Cena', amount: 1000, paidBy: 'you', participants: ['you', 'ana'], shares: { you: 500, ana: 500 }, splitMode: 'equal', category: 'food', date: '2026-10-28', note: '' });
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const settle = () => new Promise(done => setImmediate(done));

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  console.error = (...args) => { if (!String(args[0]).includes('react-test-renderer is deprecated')) originalError(...args); };
  const events = new EventTarget();
  globalThis.addEventListener = events.addEventListener.bind(events);
  globalThis.removeEventListener = events.removeEventListener.bind(events);
  globalThis.setInterval = () => 1;
  globalThis.clearInterval = () => {};
  globalThis.location = { hash: '', pathname: '/splitcount/', search: '' };
  globalThis.history = { state: {}, replaceState() { globalThis.location.hash = ''; } };
});

test('blocked browser storage never prevents guest use or account sign-out', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  assert.ok(loadWorkspace(null).groups.length);
  assert.deepEqual(loadWorkspace('A'), emptyState());
  assert.equal(saveWorkspace(emptyState(), 'A'), false);
  assert.doesNotThrow(() => clearAccountCache('A'));
});

test('a stale paused identity dialog gets terminal removal and leaving an already-removed row completes', async () => {
  const service = cloud(), a = await mount(service.auth());
  await act(async () => a.current.account.createGroup(local()));
  const b = await mount(service.auth());
  await act(async () => b.current.setPaused(true));
  await act(async () => a.current.account.chooseIdentity(a.current.state.groups[0], 'ana'));
  await act(async () => a.current.account.leaveGroup(a.current.state.groups[0]));
  await act(async () => assert.rejects(b.current.account.chooseIdentity(b.current.state.groups[0], 'you'), { code: 'group_removed' }));
  assert.equal(b.current.state.groups.length, 1, 'open form retains its group until closed');
  await act(async () => b.current.account.leaveGroup(b.current.state.groups[0]));
  assert.deepEqual(b.current.state.groups, []);
});

afterEach(async () => {
  await act(async () => { for (const root of roots.splice(0)) root.unmount(); });
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
  console.error = originalError;
});

function cloud() {
  const ledgers = new Map(), directories = new Map();
  const store = (map, id, make) => {
    if (!map.has(id)) {
      const data = new Map();
      const storage = { async get(key) { return structuredClone(data.get(key)); }, async put(key, value) { data.set(key, structuredClone(value)); } };
      map.set(id, make(storage));
    }
    return map.get(id);
  };
  const env = { GROUPS: { idFromName: id => id, get: id => store(ledgers, id, storage => new GroupStore(storage)) } };
  globalThis.fetch = (url, options) => handleRequest(new Request(url, options), env);
  return {
    ledgers, directories,
    auth(id = 'A') {
      const controller = new AbortController();
      const user = { id, name: `Cuenta ${id}`, email: `${id}@example.test` };
      return {
        account: user, session: { user, expiresAt: Date.now() + 3600000 }, signal: controller.signal,
        request: (path, options = {}) => accountRequest(`fixture-${id}`, path, {
          ...options, signal: controller.signal,
          fetcher: (url, init) => store(directories, id, storage => new AccountStore(storage, env)).fetch(new Request(url, init)),
        }),
        expire() { controller.abort(); this.session = null; this.signal = undefined; },
      };
    },
  };
}

async function mount(auth, initial = emptyState(), hash = '') {
  let latest;
  globalThis.location.hash = hash;
  function Harness() {
    const [state, setState] = React.useState(initial);
    const [session, setAuth] = React.useState(auth);
    const [paused, setPaused] = React.useState(false);
    const register = React.useRef(null);
    const ledger = useGroupSync({ state, setState, enabled: !!session.session, signal: session.signal, registerShared: (group, options) => register.current(group, options) });
    const account = useAccountSync({ auth: session, state, setState, paused: paused || !!ledger.joinState });
    register.current = account.registerShared;
    latest = { state, setState, setAuth, setPaused, ledger, account };
    return null;
  }
  await act(async () => { roots.push(Renderer.create(React.createElement(React.StrictMode, null, React.createElement(Harness)))); await settle(); });
  for (let attempt = 0; attempt < 50 && latest.account.status === 'pending'; attempt++) {
    await act(async () => { await new Promise(done => setTimeout(done, 2)); });
  }
  return { get current() { return latest; } };
}

test('workspace caches isolate accounts, preserve guest data, and clear only the signed-out account', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const guest = { version: 1, groups: [local()], activeGroupId: null };
  guest.activeGroupId = guest.groups[0].id;
  assert.equal(saveWorkspace(guest, null, storage), true);
  const shared = { ...local(), _shared: { token: 'a'.repeat(43), revision: 1 }, _account: { sourceId: 'create:test', version: 1 } };
  shared._shared.id = shared.id;
  const account = { version: 1, activeGroupId: shared.id, groups: [shared], accountRevision: 1 };
  assert.equal(saveWorkspace(account, 'A', storage), true);
  assert.deepEqual(loadWorkspace('B', storage), emptyState());
  assert.equal(saveWorkspace(emptyState(), 'B', storage), true);
  clearAccountCache('A', storage);
  assert.equal(values.has(accountStorageKey('A')), false);
  assert.equal(values.has(accountStorageKey('B')), true);
  assert.deepEqual(loadWorkspace(null, storage), guest);
  assert.ok(values.has(STORAGE_KEY));
  values.set(accountStorageKey('A'), JSON.stringify(guest));
  assert.deepEqual(loadWorkspace('A', storage), emptyState());
});

test('requests distinguish invalid Google tokens from invalid invitation keys and reject untrusted paths', async () => {
  for (const [error, expected] of [['unauthorized', 'unauthorized'], ['invalid_google_token', 'auth_required']]) {
    await assert.rejects(accountRequest('fixture', '/account/groups', { fetcher: async (_url, options) => {
      assert.equal(options.credentials, 'omit');
      assert.equal(options.headers.Authorization, 'Bearer fixture');
      return Response.json({ error }, { status: 401 });
    } }), { code: expected });
  }
  await assert.rejects(accountRequest('fixture', 'https://evil.example', { fetcher: () => assert.fail('credential leakage') }), { code: 'invalid_request' });
  assert.throws(() => validateDirectory({ revision: 1, groups: [{}] }));
});

test('same account recovers groups and identity on two devices; concurrent expenses survive and leaving propagates', async () => {
  const service = cloud();
  const a = await mount(service.auth());
  let created;
  await act(async () => { created = await a.current.account.createGroup(local()); });
  const b = await mount(service.auth());
  assert.equal(b.current.state.groups[0].id, created.id);
  assert.equal(b.current.state.groups[0]._selfId, 'you');
  await act(async () => b.current.account.chooseIdentity(b.current.state.groups[0], 'ana'));
  await act(async () => a.current.account.refresh());
  assert.equal(a.current.state.groups[0]._selfId, 'ana');
  const before = a.current.state.groups[0];
  await act(async () => {
    await Promise.all([
      a.current.ledger.saveGroup({ ...before, expenses: [expense('one')] }, before),
      b.current.ledger.saveGroup({ ...before, expenses: [expense('two')] }, before),
    ]);
  });
  await act(async () => { await a.current.account.refresh(); await b.current.account.refresh(); });
  assert.deepEqual(a.current.state.groups[0].expenses.map(item => item.id).sort(), ['one', 'two']);
  assert.equal(b.current.state.groups[0].expenses.length, 2);
  const other = await mount(service.auth('B'));
  assert.deepEqual(other.current.state.groups, []);
  await act(async () => a.current.account.leaveGroup(a.current.state.groups[0]));
  await act(async () => b.current.account.refresh());
  assert.deepEqual(b.current.state.groups, []);
  assert.equal((await fetchSharedGroup(created._shared)).group.expenses.length, 2);
});

test('recovery is all-or-nothing on ledger failure and can retry without losing a newer cache', async () => {
  const service = cloud();
  const a = await mount(service.auth());
  await act(async () => { await a.current.account.createGroup(local()); await a.current.account.createGroup(local()); });
  const before = structuredClone(a.current.state);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith(before.groups[1].id)) throw new Error('offline');
    return originalFetch(url, options);
  };
  await act(async () => a.current.account.refresh());
  assert.deepEqual(a.current.state, before);
  assert.equal(a.current.account.status, 'error');
  globalThis.fetch = originalFetch;
  const changed = await commitSharedGroup(before.groups[0], { ...before.groups[0], name: 'Cambio remoto' });
  await act(async () => a.current.account.refresh());
  assert.equal(a.current.state.groups[0].name, changed.name);
});

test('lost create responses retry with one ledger and changed bootstrap data is never silently applied', async () => {
  const service = cloud(), auth = service.auth();
  const request = auth.request;
  let lose = true;
  auth.request = async (path, options) => {
    const result = await request(path, options);
    if (options?.method === 'POST' && lose) { lose = false; throw new Error('response lost'); }
    return result;
  };
  const a = await mount(auth), source = local();
  await act(async () => assert.rejects(a.current.account.createGroup(source), /lost/));
  assert.equal(a.current.state.groups.length, 0);
  await act(async () => a.current.account.createGroup(source));
  assert.equal(service.ledgers.size, 1);
  await act(async () => assert.rejects(a.current.account.createGroup({ ...source, name: 'Changed draft' }), { code: 'operation_conflict' }));
  assert.equal(a.current.state.groups[0].name, source.name);
  assert.equal(source.name, 'Viaje con amigos');
});

test('explicit incorporation preserves guest originals, reuses existing ledgers, and keeps completed groups on partial failure', async () => {
  const service = cloud(), other = await mount(service.auth('other'));
  let shared;
  await act(async () => { shared = await other.current.account.createGroup(local()); });
  const a = await mount(service.auth()), source = local();
  const original = JSON.stringify(source);
  assert.equal(a.current.state.groups.length, 0, 'nothing uploads before explicit incorporation');
  await act(async () => a.current.account.incorporate([source, shared]));
  assert.equal(a.current.state.groups.length, 2);
  assert.equal(JSON.stringify(source), original);
  assert.equal(service.ledgers.size, 2);
  await act(async () => a.current.account.incorporate([source, shared]));
  assert.equal(service.ledgers.size, 2);
  await act(async () => assert.rejects(a.current.account.incorporate([source, { ...local(), members: [] }])));
  assert.equal(a.current.state.groups.length, 2);
});

test('identity and removal conflicts update account metadata even while a form pauses polling', async () => {
  const service = cloud(), a = await mount(service.auth());
  await act(async () => a.current.account.createGroup(local()));
  const b = await mount(service.auth());
  await act(async () => b.current.setPaused(true));
  await act(async () => a.current.account.chooseIdentity(a.current.state.groups[0], 'ana'));
  await act(async () => assert.rejects(b.current.account.chooseIdentity(b.current.state.groups[0], 'you'), { code: 'account_conflict' }));
  assert.equal(b.current.state.groups[0]._account.version, 2);
  await act(async () => b.current.account.chooseIdentity(b.current.state.groups[0], 'you'));
  assert.equal(b.current.state.groups[0]._selfId, 'you');
  await act(async () => assert.rejects(a.current.account.leaveGroup(a.current.state.groups[0]), { code: 'account_conflict' }));
  assert.equal(a.current.state.groups[0]._account.version, 3);
  await act(async () => a.current.account.leaveGroup(a.current.state.groups[0]));
  assert.equal(a.current.state.groups.length, 0);
});

test('explicit rejoin after another device leaves gets a fresh operation and preserves updated identity', async () => {
  const service = cloud(), a = await mount(service.auth());
  let created;
  await act(async () => { created = await a.current.account.createGroup(local()); });
  const b = await mount(service.auth());
  const capability = created._shared;
  await act(async () => a.current.ledger.joinGroup(capability));
  await act(async () => b.current.account.leaveGroup(b.current.state.groups[0]));
  await act(async () => a.current.account.refresh());
  assert.equal(a.current.state.groups.length, 0);
  await act(async () => a.current.ledger.joinGroup(capability));
  assert.equal(a.current.state.groups[0].id, capability.id);
  await act(async () => a.current.account.chooseIdentity(a.current.state.groups[0], 'ana'));
  await act(async () => a.current.ledger.joinGroup(capability));
  assert.equal(a.current.ledger.joinState, null);
  assert.equal(a.current.state.groups[0]._selfId, 'ana');
});

test('invitation registration never rewinds a ledger newer than its first GET', async () => {
  const service = cloud(), owner = await mount(service.auth('owner'));
  let group;
  await act(async () => { group = await owner.current.account.createGroup(local()); });
  const auth = service.auth('joiner'), request = auth.request;
  auth.request = async (path, options) => {
    if (options?.method === 'POST') await commitSharedGroup(group, { ...group, name: 'Latest during join' });
    return request(path, options);
  };
  const device = await mount(auth);
  await act(async () => device.current.ledger.joinGroup(group._shared));
  assert.equal(device.current.state.groups[0].name, 'Latest during join');
  assert.equal(device.current.state.groups[0]._shared.revision, 2);
});

test('an expired session blocks account mutations and retains the workspace until reauthentication', async () => {
  const service = cloud(), auth = service.auth(), a = await mount(auth);
  await act(async () => a.current.account.createGroup(local()));
  const before = structuredClone(a.current.state);
  await act(async () => { auth.expire(); a.current.setAuth({ ...auth }); });
  await act(async () => assert.rejects(a.current.account.createGroup(local()), { code: 'auth_required' }));
  await act(async () => assert.rejects(a.current.ledger.saveGroup({ ...before.groups[0], name: 'Draft' }, before.groups[0]), { code: 'auth_required' }));
  assert.deepEqual(a.current.state, before);
  await act(async () => a.current.setAuth(service.auth()));
  await act(async () => a.current.account.refresh());
  assert.equal(a.current.state.groups[0].id, before.groups[0].id);
});

test('a recovery response started before deletion cannot resurrect the removed group', async () => {
  const service = cloud(), auth = service.auth(), a = await mount(auth);
  await act(async () => a.current.account.createGroup(local()));
  const gate = defer(), request = auth.request;
  let once = true, recovering;
  auth.request = async (path, options) => {
    const response = await request(path, options);
    if (!options?.method && once) { once = false; await gate.promise; }
    return response;
  };
  await act(async () => { recovering = a.current.account.refresh(); await settle(); });
  await act(async () => a.current.account.leaveGroup(a.current.state.groups[0]));
  await act(async () => { gate.resolve(); await recovering; await settle(); });
  assert.deepEqual(a.current.state.groups, []);
});
