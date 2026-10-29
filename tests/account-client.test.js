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
import { workspaceAccess } from '../src/workspace-access.js';

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
  assert.deepEqual(loadWorkspace(null), emptyState());
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
        account: user, access: { status: 'approved', isAdmin: false }, session: { user, expiresAt: Date.now() + 3600000, access: { status: 'approved', isAdmin: false } }, signal: controller.signal,
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
    const mode = workspaceAccess(session);
    const ledger = useGroupSync({ state, setState, enabled: mode.groupSyncEnabled, signal: mode.groupSyncSignal, registerShared: mode.accountId ? (group, options) => register.current(group, options) : undefined });
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
  assert.deepEqual(loadWorkspace('A', storage), guest);
});

test('account caches keep unlimited local groups through sign-out without retaining remote capabilities', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const locals = Array.from({ length: 12 }, local);
  const shared = { ...local(), _shared: { token: 'a'.repeat(43), revision: 1 }, _account: { sourceId: 'create:test', version: 1 } };
  shared._shared.id = shared.id;
  const account = { version: 1, activeGroupId: shared.id, groups: [locals[0], shared, ...locals.slice(1)], accountRevision: 9 };
  const other = { version: 1, activeGroupId: locals[0].id, groups: [locals[0]] };
  assert.equal(saveWorkspace(account, 'A', storage), true);
  assert.equal(saveWorkspace(other, 'B', storage), true);
  assert.deepEqual(loadWorkspace('A', storage), account);
  clearAccountCache('A', storage);
  assert.deepEqual(loadWorkspace('A', storage), { version: 1, activeGroupId: locals[0].id, groups: locals });
  assert.deepEqual(loadWorkspace('B', storage), other);
  assert.equal(loadWorkspace('A', storage).groups.some(group => group._shared || group._account), false);
  assert.equal(loadWorkspace('A', storage).accountRevision, undefined);
});

test('account caches reject incomplete cloud metadata and invalid local groups', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const group = local();
  for (const invalid of [
    { ...group, members: [] },
    { ...group, _account: { sourceId: 'create:test', version: 1 } },
    { ...group, _shared: { id: group.id, token: 'a'.repeat(43), revision: 1 } },
    { ...group, _shared: null },
  ]) {
    const state = { version: 1, activeGroupId: group.id, groups: [invalid] };
    assert.equal(saveWorkspace(state, 'A', storage), false);
    values.set(accountStorageKey('A'), JSON.stringify(state));
    assert.deepEqual(loadWorkspace('A', storage), emptyState());
  }
});

test('directory recovery preserves local edits and removes only missing account groups', async () => {
  const service = cloud(), a = await mount(service.auth());
  let removed, kept;
  await act(async () => {
    removed = await a.current.account.createGroup(local());
    kept = await a.current.account.createGroup(local());
  });
  const source = local();
  const auth = service.auth();
  const b = await mount(auth, { ...a.current.state, activeGroupId: source.id, groups: [source, ...a.current.state.groups] });
  assert.deepEqual(b.current.state.groups.map(group => group.id), [source.id, removed.id, kept.id]);
  const gate = defer(), started = defer(), fetcher = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const response = await fetcher(url, options);
    if (String(url).endsWith(kept.id)) { started.resolve(); await gate.promise; }
    return response;
  };
  await act(async () => a.current.account.leaveGroup(removed));
  let recovery;
  await act(async () => { recovery = b.current.account.refresh(); await started.promise; });
  const added = local();
  await act(async () => b.current.setState(previous => ({
    ...previous, activeGroupId: added.id,
    groups: [...previous.groups.map(group => group.id === source.id ? { ...group, name: 'Edición local durante recuperación' } : group), added],
  })));
  await act(async () => { gate.resolve(); await recovery; });
  assert.deepEqual(b.current.state.groups.map(group => group.id), [source.id, kept.id, added.id]);
  assert.equal(b.current.state.groups[0].name, 'Edición local durante recuperación');
  assert.equal(b.current.state.activeGroupId, added.id);
  assert.equal(service.ledgers.size, 2, 'local groups never create cloud ledgers during recovery');
});

test('publishing a local workspace group replaces it in place and retries without duplicates', async () => {
  const service = cloud(), first = local(), source = local(), last = local();
  const a = await mount(service.auth(), { version: 1, activeGroupId: source.id, groups: [first, source, last] });
  let published;
  await act(async () => { published = await a.current.account.createGroup(source); });
  assert.notEqual(published.id, source.id);
  assert.deepEqual(a.current.state.groups.map(group => group.id), [first.id, published.id, last.id]);
  assert.equal(a.current.state.activeGroupId, published.id);
  assert.ok(a.current.state.groups[1]._shared);
  assert.ok(a.current.state.groups[1]._account);
  await act(async () => a.current.account.createGroup(source));
  assert.deepEqual(a.current.state.groups.map(group => group.id), [first.id, published.id, last.id]);
  assert.equal(service.ledgers.size, 1);
});

test('retrying a lost publication response replaces its local source after cloud recovery', async () => {
  const service = cloud(), auth = service.auth(), source = local(), other = local();
  const a = await mount(auth, { version: 1, activeGroupId: source.id, groups: [source, other] });
  const request = auth.request;
  let lose = true;
  auth.request = async (path, options) => {
    const result = await request(path, options);
    if (options?.method === 'POST' && lose) { lose = false; throw new Error('response lost'); }
    return result;
  };
  await act(async () => assert.rejects(a.current.account.createGroup(source), /lost/));
  assert.deepEqual(a.current.state.groups, [source, other]);
  await act(async () => a.current.account.refresh());
  assert.equal(a.current.state.groups.length, 3);
  const published = a.current.state.groups.find(group => group._account);
  await act(async () => a.current.account.createGroup(source));
  assert.deepEqual(a.current.state.groups.map(group => group.id), [published.id, other.id]);
  assert.equal(a.current.state.activeGroupId, published.id);
  assert.equal(service.ledgers.size, 1);
});

test('incorporating a stale guest original cannot overwrite newer account-local expenses or allocate a ledger', async () => {
  const service = cloud(), a = await mount(service.auth()), guest = local();
  await act(async () => a.current.account.restoreBackup([guest]));
  const edited = { ...guest, expenses: [expense('account-local-expense')] };
  await act(async () => a.current.ledger.saveGroup(edited, a.current.state.groups[0]));
  const before = structuredClone(a.current.state);
  await act(async () => assert.rejects(a.current.account.incorporate([guest]), { code: 'local_conflict' }));
  assert.deepEqual(a.current.state, before);
  assert.equal(service.ledgers.size, 0);
  await act(async () => a.current.account.incorporate([edited]));
  assert.equal(a.current.state.groups.length, 1);
  assert.ok(a.current.state.groups[0]._account);
  assert.deepEqual(a.current.state.groups[0].expenses, edited.expenses);
  assert.equal(service.ledgers.size, 1);
});

test('publishing the current local group accepts the selected member name and identity change', async () => {
  const service = cloud(), source = local();
  const a = await mount(service.auth(), { version: 1, activeGroupId: source.id, groups: [source] });
  const submitted = { ...source, _selfId: 'ana', members: source.members.map(member => member.id === 'ana' ? { ...member, name: 'Anita' } : member) };
  await act(async () => a.current.account.createGroup(submitted));
  assert.equal(a.current.state.groups.length, 1);
  assert.ok(a.current.state.groups[0]._account);
  assert.equal(a.current.state.groups[0]._selfId, 'ana');
  assert.equal(a.current.state.groups[0].members[1].name, 'Anita');
});

test('a publication response preserves edits made during its request and keeps its remote registration', async () => {
  const service = cloud(), auth = service.auth(), source = local();
  const a = await mount(auth, { version: 1, activeGroupId: source.id, groups: [source] });
  const gate = defer(), started = defer(), request = auth.request;
  auth.request = async (path, options) => {
    const result = await request(path, options);
    if (options?.method === 'POST') { started.resolve(); await gate.promise; }
    return result;
  };
  let publishing;
  await act(async () => { publishing = a.current.account.createGroup(source); await started.promise; });
  const edited = { ...source, expenses: [expense('edited-during-publication')] };
  await act(async () => a.current.ledger.saveGroup(edited, source));
  await act(async () => { gate.resolve(); await assert.rejects(publishing, { code: 'local_conflict' }); });
  assert.deepEqual(a.current.state.groups[0], edited);
  assert.equal(a.current.state.activeGroupId, source.id);
  assert.equal(a.current.state.groups.length, 2);
  const published = a.current.state.groups[1];
  assert.ok(published._account);
  assert.deepEqual((await fetchSharedGroup(published._shared)).group.expenses, []);
  await act(async () => assert.rejects(a.current.account.createGroup(source), { code: 'local_conflict' }));
  assert.deepEqual(a.current.state.groups[0], edited);
  assert.equal(a.current.state.groups.length, 2);
  assert.equal(service.ledgers.size, 1);
});

test('signed-in local creation works with six cloud groups and an expired session without requests', async () => {
  const service = cloud(), auth = service.auth(), a = await mount(auth);
  await act(async () => { for (let index = 0; index < 6; index++) await a.current.account.createGroup(local()); });
  const request = auth.request;
  auth.request = () => assert.fail('local creation must not request the account');
  globalThis.fetch = () => assert.fail('local creation must not request a ledger');
  const first = local();
  await act(async () => assert.equal(a.current.account.addLocalGroup(first), first));
  await act(async () => { auth.expire(); a.current.setAuth({ ...auth }); });
  const second = local();
  await act(async () => a.current.account.addLocalGroup(second));
  assert.equal(a.current.account.status, 'expired');
  assert.equal(a.current.state.groups.length, 8);
  assert.deepEqual(a.current.state.groups.slice(-2), [first, second]);
  assert.equal(service.ledgers.size, 6);
  assert.equal(service.directories.size, 1);
  auth.request = request;
});

test('local creation rejects malformed groups, cloud metadata, and duplicate ids', async () => {
  const service = cloud(), a = await mount(service.auth()), source = local();
  const before = structuredClone(a.current.state);
  for (const group of [
    { ...source, members: [] },
    { ...source, _shared: { id: source.id, token: 'a'.repeat(43), revision: 1 } },
    { ...source, _account: { sourceId: 'create:test', version: 1 } },
  ]) assert.throws(() => a.current.account.addLocalGroup(group), { code: 'invalid_group' });
  assert.deepEqual(a.current.state, before);
  await act(async () => a.current.account.addLocalGroup(source));
  assert.throws(() => a.current.account.addLocalGroup(source), { code: 'invalid_group' });
  assert.deepEqual(a.current.state.groups, [source]);
});

test('backup restore keeps local rows local, registers shared rows, and safely repeats identical rows', async () => {
  const service = cloud(), owner = await mount(service.auth('owner'));
  let shared;
  await act(async () => { shared = await owner.current.account.createGroup(local()); });
  const a = await mount(service.auth()), first = local(), last = local();
  const legacy = { ...first, _account: { version: 2, sourceId: 'legacy:local' } };
  const backup = [legacy, shared, last], original = JSON.stringify(backup);
  await act(async () => a.current.account.restoreBackup(backup));
  assert.deepEqual(a.current.state.groups.map(group => group.id), [first.id, shared.id, last.id]);
  assert.deepEqual(a.current.state.groups[0], first);
  assert.deepEqual(a.current.state.groups[2], last);
  assert.ok(a.current.state.groups[1]._shared);
  assert.ok(a.current.state.groups[1]._account);
  const reorderedLegacy = Object.fromEntries(Object.entries(legacy).reverse());
  await act(async () => a.current.account.restoreBackup([reorderedLegacy, shared, last]));
  assert.deepEqual(a.current.state.groups.map(group => group.id), [first.id, shared.id, last.id]);
  assert.equal(service.ledgers.size, 1, 'local backup rows never allocate ledgers');
  assert.equal(JSON.stringify(backup), original, 'restore never strips metadata from its input');
});

test('a shared backup failure retains completed local and shared rows for a later retry', async () => {
  const service = cloud(), owner = await mount(service.auth('owner'));
  let firstShared, secondShared;
  await act(async () => {
    firstShared = await owner.current.account.createGroup(local());
    secondShared = await owner.current.account.createGroup(local());
  });
  const auth = service.auth(), a = await mount(auth), first = local(), last = local();
  const request = auth.request;
  let lose = true;
  auth.request = (path, options) => {
    if (options?.body?.id === secondShared.id && lose) { lose = false; throw new Error('shared restore offline'); }
    return request(path, options);
  };
  const backup = [first, firstShared, secondShared, last];
  await act(async () => assert.rejects(a.current.account.restoreBackup(backup), /offline/));
  assert.deepEqual(a.current.state.groups.map(group => group.id), [first.id, firstShared.id]);
  await act(async () => a.current.account.restoreBackup(backup));
  assert.deepEqual(a.current.state.groups.map(group => group.id), [first.id, firstShared.id, secondShared.id, last.id]);
  assert.equal(service.ledgers.size, 2);
});

test('backup restore reports conflicting local ids without replacing current local data', async () => {
  const service = cloud(), source = { ...local(), _selfId: 'ana' };
  const a = await mount(service.auth(), { version: 1, activeGroupId: source.id, groups: [source] });
  const before = structuredClone(a.current.state);
  await act(async () => assert.rejects(a.current.account.restoreBackup([{ ...source, name: 'Different backup data' }]), {
    code: 'local_conflict', message: /grupo local.*distint/i,
  }));
  assert.deepEqual(a.current.state, before);
  await act(async () => assert.rejects(a.current.account.restoreBackup([{ ...source, _selfId: 'you' }]), { code: 'local_conflict' }));
  assert.deepEqual(a.current.state, before);
});

test('local-only backup restore works expired and retries before a render without requests or duplicates', async () => {
  const service = cloud(), auth = service.auth(), a = await mount(auth);
  await act(async () => { auth.expire(); a.current.setAuth({ ...auth }); });
  auth.request = () => assert.fail('local-only restore must not request the account');
  globalThis.fetch = () => assert.fail('local-only restore must not request a ledger');
  const first = local(), second = local();
  const backup = [{ ...first, _account: { version: 1, sourceId: 'legacy:local' } }, second];
  await act(async () => {
    await a.current.account.restoreBackup(backup);
    await a.current.account.restoreBackup(backup);
  });
  assert.deepEqual(a.current.state.groups, [first, second]);
  assert.equal(a.current.account.status, 'expired');
  assert.equal(service.ledgers.size, 0);
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

test('admin paths keep credentials on approved API routes and reject path traversal before fetch', async () => {
  const paths = ['/admin/accounts', '/admin/accounts/subject%40example.test', '/admin/push', '/admin/push/test'];
  for (const path of paths) {
    const result = await accountRequest('fixture', path, { base: 'https://api.example/', fetcher: async (url, options) => {
      assert.equal(url, `https://api.example${path}`);
      assert.equal(options.headers.Authorization, 'Bearer fixture');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.referrerPolicy, 'no-referrer');
      return Response.json({ ok: true });
    } });
    assert.deepEqual(result, { ok: true });
  }
  for (const path of [
    'https://evil.example/admin/accounts', '//evil.example/admin/accounts', '/admin/accounts/../push',
    '/admin/accounts/%2e%2e', '/admin/accounts/%2Fother', '/admin/accounts/%252e%252e',
    '/admin/accounts/subject?token=secret', '/admin/accounts/subject#other', '/admin/accounts/a/b',
    '/admin/accounts/subject%5Cother', '/admin/push/../accounts', '/admin/push/test?next=https://evil.example',
  ]) {
    await assert.rejects(accountRequest('fixture', path, { fetcher: () => assert.fail('credential leakage') }), { code: 'invalid_request' });
  }
});

test('pending and rejected accounts skip cloud reads, polling and every account mutation while keeping local work', async () => {
  for (const status of ['pending', 'rejected']) {
    const service = cloud(), auth = service.auth(), source = local();
    auth.access = auth.session.access = { status, isAdmin: false };
    auth.request = () => assert.fail('unapproved account request');
    let polls = 0;
    globalThis.setInterval = () => { polls++; return 1; };
    const before = { version: 1, activeGroupId: source.id, groups: [source] };
    const app = await mount(auth, before);
    assert.equal(app.current.account.status, status === 'pending' ? 'pending_approval' : 'rejected');
    assert.equal(polls, 0);
    await act(async () => app.current.account.refresh());
    const remote = { ...local(), _account: { version: 1, sourceId: 'source' }, _shared: { revision: 1, token: 'a'.repeat(43) } };
    remote._shared.id = remote.id;
    for (const operation of [
      () => app.current.account.createGroup(source),
      () => app.current.account.incorporate([source]),
      () => app.current.account.registerShared(remote),
      () => app.current.account.chooseIdentity(remote, 'you'),
      () => app.current.account.leaveGroup(remote),
    ]) await act(async () => assert.rejects(Promise.resolve().then(operation), { code: `account_${status}` }));
    assert.deepEqual(app.current.state, before);
    assert.equal(service.ledgers.size, 0);
    const added = local(), restored = local();
    await act(async () => { app.current.account.addLocalGroup(added); await app.current.account.restoreBackup([restored]); });
    await act(async () => app.current.ledger.saveGroup({ ...source, name: 'Edición pendiente' }, source));
    assert.deepEqual(app.current.state.groups.map(group => group.id), [source.id, added.id, restored.id]);
    assert.equal(app.current.state.groups[0].name, 'Edición pendiente');
    assert.equal(app.current.account.status, status === 'pending' ? 'pending_approval' : 'rejected');
    assert.equal(service.ledgers.size, 0);
  }
});

test('pending approval permits one guest shared group and its edits without an account request', async () => {
  const service = cloud(), auth = service.auth(), source = local(), second = local();
  auth.access = auth.session.access = { status: 'pending', isAdmin: false };
  auth.request = () => assert.fail('pending users must use anonymous sharing, not account routes');
  const app = await mount(auth, { version: 1, activeGroupId: source.id, groups: [source, second] });
  let shared;
  await act(async () => { shared = await app.current.ledger.shareGroup(source, 'Raúl', 'you'); });
  assert.equal(shared._account, undefined);
  assert.equal(service.ledgers.size, 1);
  assert.equal(service.directories.size, 0);
  await act(async () => app.current.ledger.saveGroup({ ...shared, expenses: [expense('pending-expense')] }, shared));
  await act(async () => app.current.ledger.joinGroup(shared._shared));
  assert.equal(app.current.state.groups.filter(group => group._shared).length, 1);
  assert.equal(app.current.state.groups[0].expenses.length, 1);
  await act(async () => assert.rejects(app.current.ledger.shareGroup(second, 'Raúl', 'you'), { code: 'shared_group_limit' }));
  await act(async () => app.current.ledger.joinGroup({ ...shared._shared, id: crypto.randomUUID() }));
  assert.match(app.current.ledger.joinState.error, /1 grupo compartido/);
  assert.equal(service.ledgers.size, 1);
  await act(async () => { auth.expire(); app.current.setAuth({ ...auth }); });
  const before = app.current.state.groups.find(group => group.id === shared.id);
  await act(async () => app.current.ledger.saveGroup({ ...before, name: 'Sigue compartido al vencer Google' }, before));
  assert.equal(app.current.state.groups[0].name, 'Sigue compartido al vencer Google');
});

test('a guest publication survives pending sign-in expiry and sign-out without losing its group', async () => {
  cloud();
  const auth = { account: null, session: null, access: null, request: () => assert.fail('anonymous operation used account API') };
  const source = local(), app = await mount(auth, { version: 1, activeGroupId: source.id, groups: [source] });
  const gate = defer(), originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (options?.method === 'POST') await gate.promise;
    return originalFetch(url, options);
  };
  let publishing;
  await act(async () => { publishing = app.current.ledger.shareGroup(source, 'Raúl', 'you'); });
  const controller = new AbortController();
  const pending = { account: { id: 'pending' }, session: { expiresAt: Date.now() + 60000 }, access: { status: 'pending', isAdmin: false }, signal: controller.signal, request: auth.request };
  await act(async () => app.current.setAuth(pending));
  await act(async () => { controller.abort(); app.current.setAuth({ ...pending, session: null, signal: undefined }); });
  await act(async () => app.current.setAuth(auth));
  await act(async () => { gate.resolve(); await publishing; });
  assert.equal(app.current.state.groups.length, 1);
  assert.ok(app.current.state.groups[0]._shared);
  assert.equal(app.current.state.groups[0]._selfId, 'you');
  assert.equal(app.current.state.groups[0]._account, undefined);
});

test('a same-session approval upgrade starts recovery immediately and preserves local groups and the active workspace', async () => {
  const service = cloud(), auth = service.auth(), source = local();
  auth.access = auth.session.access = { status: 'pending', isAdmin: false };
  const app = await mount(auth, { version: 1, activeGroupId: source.id, groups: [source] });
  const expiresAt = auth.session.expiresAt, signal = auth.signal;
  assert.equal(app.current.account.status, 'pending_approval');
  await act(async () => app.current.setAuth({ ...auth, access: { status: 'approved', isAdmin: false }, session: { ...auth.session, access: { status: 'approved', isAdmin: false } } }));
  assert.equal(app.current.account.status, 'synced');
  assert.deepEqual(app.current.state.groups, [source]);
  assert.equal(app.current.state.activeGroupId, source.id);
  assert.equal(auth.session.expiresAt, expiresAt);
  assert.equal(auth.signal, signal);
  await act(async () => app.current.account.createGroup(source));
  assert.equal(service.ledgers.size, 1);
  assert.ok(app.current.state.groups[0]._account);
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
