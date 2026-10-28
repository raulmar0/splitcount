import test from 'node:test';
import assert from 'node:assert/strict';
import { GroupStore, handleRequest } from '../sync-server/src/service.js';
import { AccountStore, MAX_ACCOUNT_BYTES, MAX_ACCOUNT_GROUPS, MAX_ACCOUNT_OPERATIONS, MAX_ACCOUNT_REQUEST_BYTES } from '../sync-server/src/account-store.js';
import { diffGroups } from '../src/sync-protocol.js';

const ORIGIN = 'https://raulmar0.github.io';
const CLIENT_ID = 'account-tests.apps.googleusercontent.com';
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, false, ['sign', 'verify']);
const publicKey = await crypto.subtle.exportKey('jwk', pair.publicKey);
const originalFetch = globalThis.fetch;
globalThis.fetch = async url => {
  assert.equal(String(url), 'https://www.googleapis.com/oauth2/v3/certs');
  return Response.json({ keys: [{ ...publicKey, kid: 'account-test', alg: 'RS256', use: 'sig' }] });
};
test.after(() => { globalThis.fetch = originalFetch; });

async function sign(sub = 'A', changes = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: 'https://accounts.google.com', aud: CLIENT_ID, sub, iat: now, exp: now + 3600, email: `${sub}@example.test`, email_verified: true, ...changes };
  const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encoded({ alg: 'RS256', kid: 'account-test' })}.${encoded(claims)}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(input));
  return `${input}.${Buffer.from(signature).toString('base64url')}`;
}
const tokens = { A: await sign('A'), B: await sign('B') };
const group = () => ({ id: 'local-group', name: 'Oaxaca', emoji: '🌵', currency: 'MXN', description: '', members: [{ id: 'ana', name: 'Ana' }, { id: 'bea', name: 'Bea' }], expenses: [], settlements: [] });
const createBody = (sourceId = 'create-1') => ({ sourceId, group: group(), selfId: 'ana' });
const linkBody = (entry, sourceId = 'link-1', selfId = 'bea') => ({ sourceId, id: entry.id, token: entry.token, selfId });

function service() {
  const groups = new Map();
  const accounts = new Map();
  const forwarded = [];
  let interrupt = false;
  let assertBeforeInitialize;
  const namespace = (objects, factory, account = false) => ({
    idFromName: value => value,
    get(id) {
      if (!objects.has(id)) {
        const data = new Map();
        const storage = {
          async get(key) { await new Promise(resolve => setTimeout(resolve, 0)); return structuredClone(data.get(key)); },
          async put(key, value) { await new Promise(resolve => setTimeout(resolve, 0)); data.set(key, structuredClone(value)); },
        };
        objects.set(id, { data, storage, instance: factory(storage) });
      }
      return { async fetch(request) {
        if (account) {
          assert.equal(request.headers.get('Authorization'), null);
          forwarded.push(id);
        }
        const initialize = new URL(request.url).pathname === '/initialize';
        if (initialize && assertBeforeInitialize) assertBeforeInitialize(id);
        const response = await objects.get(id).instance.fetch(request);
        if (initialize && interrupt) { interrupt = false; throw new Error('private simulated interruption'); }
        return response;
      } };
    },
  });
  const env = { GOOGLE_CLIENT_ID: CLIENT_ID };
  env.GROUPS = namespace(groups, storage => new GroupStore(storage));
  env.ACCOUNTS = namespace(accounts, storage => new AccountStore(storage, env), true);
  return {
    groups, accounts, forwarded, env,
    interruptNextInitialize(check) { interrupt = true; assertBeforeInitialize = check; },
    recreate(account = 'A') {
      const object = accounts.get(account);
      object.instance = new AccountStore(object.storage, env);
    },
    async request(path = '/account/groups', { method = 'GET', body, account = 'A', token = tokens[account], headers = {}, origin = ORIGIN } = {}) {
      const requestHeaders = new Headers(headers);
      if (origin !== null) requestHeaders.set('Origin', origin);
      if (token) requestHeaders.set('Authorization', `Bearer ${token}`);
      if (body !== undefined && !requestHeaders.has('Content-Type')) requestHeaders.set('Content-Type', 'application/json');
      const response = await handleRequest(new Request(`https://sync.example${path}`, {
        method, headers: requestHeaders,
        ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
      }), env);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      return { response, data: response.status === 204 ? null : await response.json() };
    },
    async create(body = createBody(), options = {}) { return this.request('/account/groups', { method: 'POST', body, ...options }); },
  };
}

test('two devices restore the same ledger and chosen identity; another Google sub stays private', async () => {
  const api = service();
  assert.deepEqual((await api.request()).data, { revision: 0, groups: [] });
  const { response, data } = await api.create();
  assert.equal(response.status, 201);
  const { entry, envelope } = data;
  assert.deepEqual(Object.keys(entry).sort(), ['id', 'selfId', 'sourceId', 'token', 'version']);
  assert.match(entry.id, /^[0-9a-f-]{36}$/);
  assert.match(entry.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(entry.selfId, 'ana');
  assert.equal(entry.version, 1);
  assert.equal(envelope.group.id, entry.id);
  assert.equal(envelope.revision, 1);
  api.recreate();
  const deviceTwo = await api.request('/account/groups', { token: await sign('A', { email: 'changed@example.test' }) });
  assert.deepEqual(deviceTwo.data, { revision: 1, groups: [entry] });
  const ledger = await api.request(`/groups/${entry.id}`, { token: entry.token });
  assert.deepEqual(ledger.data, envelope);
  assert.deepEqual((await api.request('/account/groups', { account: 'B' })).data, { revision: 0, groups: [] });
  const stored = JSON.stringify(api.accounts.get('A').data.get('directory'));
  assert.equal(stored.includes(tokens.A), false);
  assert.equal(stored.includes('"expenses"'), false);
  assert.deepEqual([...new Set(api.forwarded)], ['A', 'B']);
});

test('every account method rejects missing, bad, wrong audience, expired and forged JWTs before allocating a directory', async () => {
  const api = service();
  const forged = tokens.A.split('.');
  forged[1] = Buffer.from(JSON.stringify({ sub: 'victim' })).toString('base64url');
  const invalid = [null, 'not-a-token', await sign('A', { aud: 'wrong-client' }), await sign('A', { exp: 1 }), forged.join('.')];
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    for (const token of invalid) {
      const path = ['PATCH', 'DELETE'].includes(method) ? `/account/groups/${crypto.randomUUID()}` : '/account/groups';
      const result = await api.request(path, { method, token, ...(method === 'GET' ? {} : { body: createBody() }) });
      assert.equal(result.response.status, 401);
      assert.equal(result.data.error, 'invalid_google_token');
    }
  }
  assert.equal(api.accounts.size, 0);
  assert.equal(api.groups.size, 0);
});

test('existing association checks the capability, existence and member identity; cannot supply an account ID', async () => {
  const api = service();
  const { data: created } = await api.create();
  const body = linkBody(created.entry);
  for (const [changes, expected] of [
    [{ token: 'x'.repeat(43) }, 401],
    [{ id: crypto.randomUUID() }, 404],
    [{ selfId: 'outsider' }, 400],
    [{ accountId: 'A' }, 400],
  ]) {
    const result = await api.create({ ...body, ...changes }, { account: 'B' });
    assert.equal(result.response.status, expected);
    assert.equal(result.data.entry, undefined);
  }
  assert.deepEqual((await api.request('/account/groups', { account: 'B' })).data.groups, []);
  const linked = await api.create(body, { account: 'B' });
  assert.equal(linked.response.status, 201);
  assert.equal(linked.data.entry.id, created.entry.id);
  assert.equal(linked.data.entry.selfId, 'bea');
  const alias = await api.create(linkBody(created.entry, 'alias', 'ana'), { account: 'B' });
  assert.equal(alias.response.status, 200);
  assert.deepEqual(alias.data.entry, linked.data.entry);
  assert.equal(alias.data.revision, linked.data.revision);
});

test('simultaneous and lost-response POST retries are idempotent; changed initial data conflicts', async () => {
  const api = service();
  const results = await Promise.all([api.create(), api.create()]);
  assert.deepEqual(results.map(item => item.response.status).sort(), [200, 201]);
  assert.deepEqual(results[0].data, results[1].data);
  assert.equal(api.groups.size, 1);
  api.recreate();
  assert.deepEqual((await api.create()).data, results[0].data);
  for (const body of [
    { ...createBody(), group: { ...group(), name: 'Changed local edit' } },
    { ...createBody(), selfId: null },
    linkBody(results[0].data.entry, 'create-1', 'ana'),
  ]) {
    const rejected = await api.create(body);
    assert.equal(rejected.response.status, 409);
    assert.equal(rejected.data.error, 'operation_conflict');
  }
  assert.equal(api.groups.size, 1);
});

test('interrupted initialize persists credentials and fingerprint first and recovers without replacing concurrent ledger edits', async () => {
  const api = service();
  api.interruptNextInitialize(id => {
    const state = api.accounts.get('A').data.get('directory');
    assert.equal(state.operations[0].id, id);
    assert.match(state.operations[0].fingerprint, /^[0-9a-f]{64}$/);
    assert.match(state.operations[0].pending.token, /^[A-Za-z0-9_-]{43}$/);
  });
  const failed = await api.create();
  assert.equal(failed.response.status, 500);
  assert.equal(JSON.stringify(failed.data).includes('private'), false);
  const pending = api.accounts.get('A').data.get('directory').operations[0];
  const object = api.groups.get(pending.id);
  const before = object.data.get('record').group;
  const edit = await api.request(`/groups/${pending.id}`, { method: 'PATCH', token: pending.pending.token, body: { changes: diffGroups(before, { ...before, name: 'Remote edit' }) } });
  assert.equal(edit.response.status, 200);
  api.recreate();
  const changed = await api.create({ ...createBody(), group: { ...group(), name: 'Changed payload' } });
  assert.equal(changed.response.status, 409);
  const recovered = await api.create();
  assert.equal(recovered.response.status, 201);
  assert.equal(recovered.data.entry.id, pending.id);
  assert.equal(recovered.data.entry.token, pending.pending.token);
  assert.equal(recovered.data.envelope.group.name, 'Remote edit');
  assert.equal(recovered.data.envelope.revision, 2);
  assert.equal(api.groups.size, 1);
  assert.equal(api.accounts.get('A').data.get('directory').operations[0].pending, undefined);
});

test('failure before ledger initialization retains the same reserved group on retry', async () => {
  const api = service();
  const original = api.env.GROUPS.get;
  let failed = false;
  api.env.GROUPS.get = id => {
    if (!failed) { failed = true; throw new Error('private network'); }
    return original(id);
  };
  assert.equal((await api.create()).response.status, 500);
  const pending = api.accounts.get('A').data.get('directory').operations[0];
  assert.equal(api.groups.size, 0);
  api.recreate();
  const retry = await api.create();
  assert.equal(retry.response.status, 201);
  assert.equal(retry.data.entry.id, pending.id);
});

test('failure persisting the finalized directory keeps pending credentials for recovery', async () => {
  const api = service();
  await api.request();
  const object = api.accounts.get('A');
  const originalPut = object.storage.put;
  let writes = 0;
  object.storage.put = async (...args) => {
    writes += 1;
    if (writes === 2) throw new Error('private final persistence error');
    return originalPut(...args);
  };
  const result = await api.create();
  assert.equal(result.response.status, 500);
  assert.equal(api.groups.size, 1);
  const pending = object.data.get('directory').operations[0];
  assert.ok(pending.pending);
  assert.equal(object.data.get('directory').rows.length, 0);
  api.recreate();
  const recovered = await api.create();
  assert.equal(recovered.response.status, 201);
  assert.equal(recovered.data.entry.id, pending.id);
  assert.equal(recovered.data.entry.token, pending.pending.token);
  assert.equal(recovered.data.envelope.revision, 1);
  assert.equal(api.groups.size, 1);
});

test('identity compare-and-swap is serialized across awaits, validates current membership and supports identical retries', async () => {
  const api = service();
  const { data: { entry } } = await api.create();
  const path = `/account/groups/${entry.id}`;
  const requests = [{ selfId: 'bea', version: 1 }, { selfId: null, version: 1 }];
  const results = await Promise.all(requests.map(body => api.request(path, { method: 'PATCH', body })));
  assert.deepEqual(results.map(result => result.response.status).sort(), [200, 409]);
  const acceptedIndex = results.findIndex(result => result.response.status === 200);
  const accepted = results[acceptedIndex];
  const conflict = results[1 - acceptedIndex];
  assert.equal(accepted.data.entry.version, 2);
  assert.equal(accepted.data.revision, 2);
  assert.equal(conflict.data.error, 'account_conflict');
  assert.deepEqual(conflict.data.entry, accepted.data.entry);
  const retry = await api.request(path, { method: 'PATCH', body: requests[acceptedIndex] });
  assert.deepEqual(retry.data, accepted.data);
  const identity = await api.request(path, { method: 'PATCH', body: { selfId: 'bea', version: 2 } });
  const version = identity.data.entry.version;
  const invalid = await api.request(path, { method: 'PATCH', body: { selfId: 'nobody', version } });
  assert.equal(invalid.response.status, 400);
  const outsider = await api.request(path, { method: 'PATCH', body: { selfId: 'bea', version }, account: 'B' });
  assert.equal(outsider.response.status, 404);
  assert.equal(outsider.data.entry, undefined);
  const ledger = await api.request(`/groups/${entry.id}`, { token: entry.token });
  const updated = { ...ledger.data.group, members: [ledger.data.group.members[0], { id: 'carla', name: 'Carla' }] };
  assert.equal((await api.request(`/groups/${entry.id}`, { method: 'PATCH', token: entry.token, body: { changes: diffGroups(ledger.data.group, updated) } })).response.status, 200);
  assert.equal((await api.request(path, { method: 'PATCH', body: { selfId: 'bea', version } })).response.status, 400);
  assert.equal((await api.request(path, { method: 'PATCH', body: { selfId: null, version } })).response.status, 200);
});

test('delete propagates only in this account; all stale source IDs stay removed, explicit rejoin gets a new version', async () => {
  const api = service();
  const { data: { entry } } = await api.create();
  await api.create(linkBody(entry), { account: 'B' });
  await api.create(linkBody(entry, 'alias', 'bea'));
  const path = `/account/groups/${entry.id}`;
  const staleDelete = await api.request(path, { method: 'DELETE', body: { version: 99 } });
  assert.equal(staleDelete.response.status, 409);
  const deleted = await api.request(path, { method: 'DELETE', body: { version: 1 } });
  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.data.revision, 2);
  api.recreate();
  assert.deepEqual((await api.request()).data, { revision: 2, groups: [] });
  assert.deepEqual((await api.request(path, { method: 'DELETE', body: { version: 1 } })).data, deleted.data);
  assert.equal((await api.request(`/groups/${entry.id}`, { token: entry.token })).response.status, 200);
  assert.equal((await api.request('/account/groups', { account: 'B' })).data.groups[0].id, entry.id);
  for (const body of [createBody(), linkBody(entry, 'alias', 'bea')]) {
    const stale = await api.create(body);
    assert.equal(stale.response.status, 410);
    assert.equal(stale.data.error, 'group_removed');
  }
  const rejoin = await api.create(linkBody(entry, 'explicit-rejoin', 'bea'));
  assert.equal(rejoin.response.status, 201);
  assert.equal(rejoin.data.entry.selfId, 'bea');
  assert.equal(rejoin.data.entry.version, 3);
  assert.equal((await api.request(path, { method: 'DELETE', body: { version: 1 } })).response.status, 409);
  assert.equal((await api.create()).response.status, 410);
});

test('validation, streamed byte limits, allowed origins, DELETE CORS and safe errors remain strict', async () => {
  const api = service();
  for (const body of [
    { ...createBody(), sourceId: '' }, { ...createBody(), sourceId: 'x'.repeat(161) },
    { ...createBody(), selfId: undefined }, { ...createBody(), selfId: 1 },
    { ...createBody(), group: { ...group(), id: 'x'.repeat(129) } },
    { ...createBody(), account: 'other' }, { ...createBody(), groups: [] },
  ]) assert.equal((await api.create(body)).response.status, 400);
  assert.equal((await api.create('{')).response.status, 400);
  assert.equal((await api.create(createBody(), { headers: { 'Content-Type': 'text/plain' } })).response.status, 415);
  const oversized = await api.create('🌵'.repeat(MAX_ACCOUNT_REQUEST_BYTES / 4 + 1), { headers: { 'Content-Length': '1' } });
  assert.equal(oversized.response.status, 413);
  assert.equal(api.groups.size, 0);
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(' '.repeat(MAX_ACCOUNT_REQUEST_BYTES + 1))); controller.close(); },
  });
  const streamed = await handleRequest(new Request('https://sync.example/account/groups', { method: 'POST', headers: { Authorization: `Bearer ${tokens.A}`, 'Content-Type': 'application/json', 'Content-Length': '1' }, body: stream, duplex: 'half' }), api.env);
  assert.equal(streamed.status, 413);
  const preflight = await api.request('/account/groups', { method: 'OPTIONS', token: null });
  assert.equal(preflight.response.status, 204);
  assert.match(preflight.response.headers.get('Access-Control-Allow-Methods'), /DELETE/);
  assert.equal(preflight.response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal((await api.create(createBody(), { origin: 'https://evil.example' })).response.status, 403);
  const { data: { entry } } = await api.create();
  for (const body of [{ version: 0 }, { version: 1.5 }, { version: '1' }, { version: 1, groups: [] }]) {
    assert.equal((await api.request(`/account/groups/${entry.id}`, { method: 'DELETE', body })).response.status, 400);
  }
  assert.equal((await api.request(`/account/groups/${entry.id}`, { method: 'PATCH', body: ' '.repeat(1025) })).response.status, 413);
});

test('active group, alias/tombstone and total JSON bounds fail safely without evicting old operations', async () => {
  const api = service();
  const { data: { entry } } = await api.create();
  const object = api.accounts.get('A');
  const initial = structuredClone(object.data.get('directory'));
  const full = structuredClone(initial);
  full.rows = Array.from({ length: MAX_ACCOUNT_GROUPS }, (_, index) => ({ ...initial.rows[0], id: index ? crypto.randomUUID() : entry.id }));
  object.data.set('directory', full);
  assert.equal((await api.create(createBody('full'))).data.error, 'account_limit');
  assert.equal(api.groups.size, 1);
  const linked = await api.create(linkBody(entry, 'existing'));
  assert.equal(linked.response.status, 200);
  const aliases = structuredClone(initial);
  aliases.operations = Array.from({ length: MAX_ACCOUNT_OPERATIONS }, (_, index) => ({ ...initial.operations[0], sourceId: `source-${index}` }));
  object.data.set('directory', aliases);
  assert.equal((await api.create(linkBody(entry, 'one-too-many'))).data.error, 'account_limit');
  assert.equal(object.data.get('directory').operations.length, MAX_ACCOUNT_OPERATIONS);
  const huge = structuredClone(initial);
  huge.operations = [{ ...initial.operations[0], sourceId: 'large', pending: { group: { description: 'x'.repeat(MAX_ACCOUNT_BYTES) } } }];
  object.data.set('directory', huge);
  const limited = await api.create(linkBody(entry, 'bytes'));
  assert.equal(limited.data.error, 'account_limit');
  assert.equal(object.data.get('directory').operations.length, 1);
  object.data.set('directory', initial);
  const originalPut = object.storage.put;
  let fail = true;
  object.storage.put = async (...args) => {
    if (fail) { fail = false; throw new Error('private storage failure'); }
    return originalPut(...args);
  };
  assert.equal((await api.create(linkBody(entry, 'failed-alias'))).response.status, 500);
  assert.equal((await api.create(linkBody(entry, 'failed-alias'))).response.status, 200);
});
