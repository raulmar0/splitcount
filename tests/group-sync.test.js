import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer from 'react-test-renderer';
import useGroupSync from '../src/useGroupSync.js';
import { createInitialState } from '../src/seed.js';

const { act } = Renderer;
const roots = new Set();
const browserGlobals = [
  'IS_REACT_ACT_ENVIRONMENT', 'addEventListener', 'removeEventListener',
  'setInterval', 'clearInterval', 'navigator', 'location', 'history',
  'lastHistoryPath', 'fetch',
];
const originalGlobals = new Map(browserGlobals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const originalConsoleError = console.error;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // This renderer is deliberately used to exercise real StrictMode hook lifecycles.
  // Hide only its known deprecation notice; preserve every other React warning.
  console.error = (...args) => {
    if (args[0] === 'react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer') return;
    originalConsoleError(...args);
  };
});

afterEach(async () => {
  try {
    await act(async () => { for (const root of roots) root.unmount(); });
  } finally {
    roots.clear();
    for (const [key, descriptor] of originalGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    console.error = originalConsoleError;
  }
});

const id = '11111111-1111-4111-8111-111111111111';
const token = 'a'.repeat(43);
const capability = { id, token, revision: 1 };
const local = () => createInitialState().groups[0];
const shared = () => ({ ...local(), id, _shared: capability, _selfId: 'ana' });
const envelope = (group, revision = 1) => ({ group, revision });
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
let latest;

async function mount(groups = [local()], hash = '', options = {}) {
  latest = null;
  const events = new EventTarget();
  const intervals = new Map();
  let timer = 0;
  globalThis.addEventListener = events.addEventListener.bind(events);
  globalThis.removeEventListener = events.removeEventListener.bind(events);
  globalThis.setInterval = fn => { intervals.set(++timer, fn); return timer; };
  globalThis.clearInterval = key => intervals.delete(key);
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  globalThis.location = { hash, pathname: '/entre-app/', search: '?view=all' };
  globalThis.history = { state: {}, replaceState: (_state, _title, path) => { globalThis.location.hash = ''; globalThis.lastHistoryPath = path; } };
  const joined = [];
  function App() {
    const [state, setState] = React.useState({ version: 1, activeGroupId: groups[0]?.id ?? null, groups });
    const sync = useGroupSync({ state, setState, ...options, onJoined: group => joined.push(group) });
    latest = { state, setState, ...sync };
    return null;
  }
  let renderer;
  await act(async () => {
    renderer = Renderer.create(React.createElement(React.StrictMode, null, React.createElement(App)));
    roots.add(renderer);
  });
  return { events, intervals, joined, close: async () => {
    await act(async () => renderer.unmount());
    roots.delete(renderer);
  } };
}

test('local saves update one cached group and retain other groups', async () => {
  const app = await mount([local(), { ...local(), id: 'other' }]);
  assert.equal(latest.status, 'local');
  await act(async () => { await latest.saveGroup({ ...local(), name: 'Changed' }, local()); });
  assert.equal(latest.state.groups[0].name, 'Changed');
  assert.equal(latest.state.groups[1].id, 'other');
  await app.close();
});

test('pending approval blocks shared requests with the approval reason while local edits still work', async () => {
  globalThis.fetch = () => assert.fail('pending approval cannot access the API');
  const app = await mount([local(), shared()], '', { enabled: false, disabledReason: { code: 'account_pending', message: 'Tu cuenta espera aprobación.' } });
  const before = local();
  await act(async () => latest.saveGroup({ ...before, name: 'Local edit while pending' }, before));
  assert.equal(latest.state.groups[0].name, 'Local edit while pending');
  await act(async () => assert.rejects(latest.shareGroup(before, 'Ana', 'ana'), { code: 'account_pending' }));
  await act(async () => assert.rejects(latest.saveGroup({ ...shared(), name: 'Blocked cloud edit' }, shared()), { code: 'account_pending' }));
  assert.match(latest.error, /aprobación/);
  await app.close();
});

test('a guest cannot share a second group or join another invitation at capacity', async () => {
  globalThis.fetch = async () => response(envelope(shared()));
  const app = await mount([local(), shared()]);
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('quota should stop before fetching'); };
  await act(async () => assert.rejects(latest.shareGroup(local(), 'Ana', 'ana'), { code: 'shared_group_limit' }));
  await act(async () => latest.joinGroup({ ...capability, id: '22222222-2222-4222-8222-222222222222' }));
  assert.match(latest.joinState.error, /Google/);
  assert.equal(requests, 0);
  assert.equal(latest.state.groups.length, 2);
  await app.close();
});

test('reopening the same guest shared group at capacity succeeds', async () => {
  globalThis.fetch = async () => response(envelope(shared()));
  const app = await mount([local(), shared()]);
  await act(async () => latest.joinGroup(capability));
  assert.equal(latest.joinState, null);
  assert.equal(latest.state.groups.length, 2);
  await app.close();
});

test('a pending guest publication reserves the only shared slot', async () => {
  const writing = defer();
  const second = { ...local(), id: 'another-local' };
  let creates = 0;
  globalThis.fetch = async (_url, options) => {
    if (options.method !== 'POST') return response(envelope(shared()));
    if (++creates === 1) return writing.promise;
    throw new Error('a second publication must be rejected before fetching');
  };
  const app = await mount([local(), second]);
  let sharing;
  await act(async () => { sharing = latest.shareGroup(local(), 'Ana', 'ana'); });
  await act(async () => assert.rejects(latest.shareGroup(second, 'Ana', 'ana'), { code: 'shared_group_limit' }));
  await act(async () => {
    writing.resolve(response({ ...envelope(shared()), token }));
    await sharing;
  });
  assert.equal(latest.state.groups.filter(group => group._shared).length, 1);
  await app.close();
});

test('invalid local payment references reject without changing the cache', async () => {
  const app = await mount([local()]);
  const before = latest.state.groups[0];
  const invalid = { ...before, settlements: [{ id: 'wrong-group', from: 'you', to: 'not-a-member', amount: 1000, date: '2026-10-27' }] };
  await act(async () => assert.rejects(latest.saveGroup(invalid, before), /válid|integrante|grupo/));
  assert.deepEqual(latest.state.groups[0], before);
  await app.close();
});

test('shared saves wait for server acceptance and preserve current viewer identity', async () => {
  globalThis.fetch = async () => response(envelope(shared()));
  const app = await mount([shared()]);
  const gate = defer();
  globalThis.fetch = async (_url, options) => options.method === 'PATCH' ? gate.promise : response(envelope(shared()));
  let saving;
  const before = latest.state.groups[0];
  await act(async () => { saving = latest.saveGroup({ ...before, name: 'Accepted' }, before); });
  assert.equal(latest.status, 'pending');
  assert.notEqual(latest.state.groups[0].name, 'Accepted');
  await act(async () => latest.setState(s => ({ ...s, groups: s.groups.map(g => ({ ...g, _selfId: 'diego' })) })));
  await act(async () => { gate.resolve(response(envelope({ ...shared(), name: 'Accepted' }, 2))); await saving; });
  assert.equal(latest.state.groups[0].name, 'Accepted');
  assert.equal(latest.state.groups[0]._selfId, 'diego');
  assert.equal(latest.status, 'synced');
  await app.close();
});

test('failed saves retain cached data and surface a retryable error', async () => {
  globalThis.fetch = async () => response(envelope(shared()));
  const app = await mount([shared()]);
  globalThis.fetch = async () => { throw new Error('offline'); };
  const before = latest.state.groups[0];
  await act(async () => assert.rejects(latest.saveGroup({ ...before, name: 'Draft' }, before), /conexión/));
  assert.equal(latest.state.groups[0].name, before.name);
  assert.equal(latest.status, 'offline');
  await app.close();
});

test('conflict refreshes latest cache and rejects the form save', async () => {
  globalThis.fetch = async () => response(envelope(shared()));
  const app = await mount([shared()]);
  globalThis.fetch = async () => response({ ...envelope({ ...shared(), name: 'Their change' }, 5), error: 'conflict' }, 409);
  const before = latest.state.groups[0];
  await act(async () => assert.rejects(latest.saveGroup({ ...before, name: 'My draft' }, before), /Otra persona/));
  assert.equal(latest.state.groups[0].name, 'Their change');
  assert.equal(latest.state.groups[0]._shared.revision, 5);
  await app.close();
});

test('StrictMode invitation joins once and preserves unrelated cached groups', async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; return response(envelope(shared(), 3)); };
  const app = await mount([local()], `#grupo=${id}.${token}`);
  assert.equal(requests, 2); // Join, then the required immediate poll of the new active group.
  assert.equal(app.joined.length, 1);
  assert.equal(latest.state.groups.length, 2);
  assert.equal(latest.state.activeGroupId, id);
  assert.equal(globalThis.lastHistoryPath, '/entre-app/?view=all');
  await act(async () => latest.dismissJoin());
  assert.equal(latest.joinState, null);
  await app.close();
});

test('invalid imported sharing metadata never triggers a request', async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('must not run'); };
  const app = await mount([{ ...shared(), _shared: { id: '../attacker', token, revision: 1 } }]);
  assert.equal(latest.status, 'error');
  assert.equal(requests, 0);
  await app.close();
});

test('sharing replaces the original group in place and records selected identity', async () => {
  globalThis.fetch = async (_url, options) => { const { group } = JSON.parse(options.body); return response({ ...envelope({ ...group, id }), token }); };
  const app = await mount([local(), { ...local(), id: 'other' }]);
  await act(async () => latest.shareGroup(local(), 'Andrea', 'ana'));
  assert.deepEqual(latest.state.groups.map(g => g.id), [id, 'other']);
  assert.equal(latest.state.activeGroupId, id);
  assert.equal(latest.state.groups[0]._selfId, 'ana');
  assert.equal(latest.state.groups[0].members.find(m => m.id === 'ana').name, 'Andrea');
  await app.close();
});

test('poll responses cannot overwrite a cache with a newer revision', async () => {
  const gate = defer();
  let requests = 0;
  globalThis.fetch = async () => { requests++; return gate.promise; };
  const app = await mount([shared()]);
  assert.equal(requests, 1);
  await act(async () => latest.setState(s => ({ ...s, groups: [{ ...shared(), name: 'Newer', _shared: { ...capability, revision: 9 } }] })));
  await act(async () => { gate.resolve(response(envelope({ ...shared(), name: 'Older' }, 2))); await Promise.resolve(); });
  assert.equal(latest.state.groups[0].name, 'Newer');
  assert.equal(latest.state.groups[0]._shared.revision, 9);
  await app.close();
  assert.equal(app.intervals.size, 0);
});

test('a pending shared save suppresses polls and discards earlier poll responses', async () => {
  const reading = defer();
  const writing = defer();
  let requests = 0;
  globalThis.fetch = async (_url, options) => { requests++; return options.method === 'PATCH' ? writing.promise : reading.promise; };
  const app = await mount([shared()]);
  const before = latest.state.groups[0];
  let saving;
  await act(async () => { saving = latest.saveGroup({ ...before, name: 'Saved' }, before); });
  await act(async () => { app.events.dispatchEvent(new Event('focus')); app.intervals.values().next().value(); });
  assert.equal(requests, 2);
  await act(async () => { reading.resolve(response(envelope({ ...shared(), name: 'Premature poll' }, 4))); await Promise.resolve(); });
  assert.equal(latest.state.groups[0].name, before.name);
  assert.equal(latest.status, 'pending');
  await act(async () => { writing.resolve(response(envelope({ ...shared(), name: 'Saved' }, 5))); await saving; });
  assert.equal(latest.state.groups[0].name, 'Saved');
  await app.close();
});

test('focus and interval share one in-flight read; cleanup removes event handlers', async () => {
  const reading = defer();
  let requests = 0;
  globalThis.fetch = async () => { requests++; return reading.promise; };
  const app = await mount([shared()]);
  await act(async () => { app.events.dispatchEvent(new Event('focus')); app.intervals.values().next().value(); });
  assert.equal(requests, 1);
  await act(async () => { reading.resolve(response(envelope(shared()))); await Promise.resolve(); });
  await app.close();
  app.events.dispatchEvent(new Event('focus'));
  app.events.dispatchEvent(new Event('online'));
  assert.equal(requests, 1);
});

test('malformed invitation opens a recoverable error and keeps all local groups', async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('no network'); };
  const app = await mount([local()], '#grupo=invalid');
  assert.equal(latest.joinState.loading, false);
  assert.match(latest.joinState.error, /no es válido/);
  assert.equal(latest.state.groups[0].id, 'oaxaca');
  assert.equal(requests, 0);
  await app.close();
});

test('retrying an invitation uses the original capability after a network failure', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  const app = await mount([local()], `#grupo=${id}.${token}`);
  assert.equal(latest.joinState.loading, false);
  globalThis.fetch = async () => response(envelope(shared(), 2));
  await act(async () => latest.joinGroup());
  assert.equal(latest.state.activeGroupId, id);
  assert.equal(latest.joinState, null);
  assert.equal(app.joined.length, 1);
  await app.close();
});

test('same-document invite navigation joins and removes its hash listener on cleanup', async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; return response(envelope(shared(), 2)); };
  const app = await mount([local()]);
  globalThis.location.hash = `#grupo=${id}.${token}`;
  await act(async () => app.events.dispatchEvent(new Event('hashchange')));
  assert.equal(latest.state.activeGroupId, id);
  assert.equal(app.joined.length, 1);
  await app.close();
  const before = requests;
  app.events.dispatchEvent(new Event('hashchange'));
  await Promise.resolve();
  assert.equal(requests, before);
});

test('local edits are rejected while sharing is pending and never disappear on completion', async () => {
  const writing = defer();
  globalThis.fetch = async (_url, options) => options.method === 'POST' ? writing.promise : response(envelope(shared()));
  const app = await mount([local()]);
  const before = latest.state.groups[0];
  let sharing;
  await act(async () => { sharing = latest.shareGroup(before, 'Ana', 'ana'); });
  await act(async () => assert.rejects(latest.saveGroup({ ...before, name: 'Retained form draft' }, before), /Espera/));
  assert.equal(latest.state.groups[0].name, before.name);
  await act(async () => { writing.resolve(response({ ...envelope(shared()), token })); await sharing; });
  assert.equal(latest.state.groups[0].id, id);
  await app.close();
});

test('an import made during sharing wins over the delayed share response and surfaces an error', async () => {
  const writing = defer();
  globalThis.fetch = async (_url, options) => options.method === 'POST' ? writing.promise : response(envelope(shared()));
  const app = await mount([local()]);
  const before = latest.state.groups[0];
  let sharing;
  await act(async () => { sharing = latest.shareGroup(before, 'Ana', 'ana'); });
  await act(async () => latest.setState(s => ({ ...s, groups: [{ ...before, name: 'Imported newer copy' }] })));
  await act(async () => {
    writing.resolve(response({ ...envelope(shared()), token }));
    await assert.rejects(sharing, /cambió/);
  });
  assert.equal(latest.state.groups[0].id, 'oaxaca');
  assert.equal(latest.state.groups[0].name, 'Imported newer copy');
  assert.equal(latest.state.groups[0]._shared, undefined);
  await app.close();
});

test('dismissing an in-flight invitation invalidates its response and retains its retry capability', async () => {
  const reading = defer();
  globalThis.fetch = async () => reading.promise;
  const app = await mount([local()], `#grupo=${id}.${token}`);
  await act(async () => latest.dismissJoin());
  await act(async () => { reading.resolve(response(envelope(shared(), 2))); await Promise.resolve(); });
  assert.equal(latest.state.activeGroupId, 'oaxaca');
  assert.equal(latest.state.groups.length, 1);
  assert.equal(latest.joinState, null);
  assert.equal(app.joined.length, 0);
  globalThis.fetch = async () => response(envelope(shared(), 2));
  await act(async () => latest.joinGroup());
  assert.equal(latest.state.activeGroupId, id);
  assert.equal(app.joined.length, 1);
  await app.close();
});
