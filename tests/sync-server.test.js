import test from 'node:test';
import assert from 'node:assert/strict';
import { GroupStore, handleRequest } from '../sync-server/src/service.js';
import { diffGroups } from '../src/sync-protocol.js';

const ORIGIN = 'https://raulmar0.github.io';
const URL_BASE = 'https://sync.example';
function group() {
  return { id: 'local-group', name: 'Oaxaca', emoji: '🌵', currency: 'MXN', description: '', members: [{ id: 'ana', name: 'Ana' }, { id: 'bea', name: 'Bea' }], expenses: [], settlements: [] };
}
function expense(id) {
  return { id, title: 'Cena', amount: 3000, paidBy: 'ana', participants: ['ana', 'bea'], shares: { ana: 1500, bea: 1500 }, splitMode: 'equal', category: 'food', date: '2026-10-27', note: '' };
}

// Only Cloudflare storage/namespace are substituted; routing, auth, merging,
// request streaming and response handling exercise the real service code.
function service() {
  const objects = new Map();
  const env = { GROUPS: {
    idFromName: name => name,
    get(id) {
      if (!objects.has(id)) {
        const data = new Map();
        const storage = {
          async get(key) { await new Promise(resolve => setTimeout(resolve, 1)); return structuredClone(data.get(key)); },
          async put(key, value) { await new Promise(resolve => setTimeout(resolve, 1)); data.set(key, structuredClone(value)); },
        };
        objects.set(id, { data, storage, instance: new GroupStore(storage) });
      }
      return { fetch: request => objects.get(id).instance.fetch(request) };
    },
  } };
  return {
    objects,
    async request(path, { method = 'GET', body, token, origin = ORIGIN, headers = {} } = {}) {
      const requestHeaders = new Headers(headers);
      if (origin !== null) requestHeaders.set('Origin', origin);
      if (token) requestHeaders.set('Authorization', `Bearer ${token}`);
      if (body !== undefined && !requestHeaders.has('Content-Type')) requestHeaders.set('Content-Type', 'application/json');
      const response = await handleRequest(new Request(`${URL_BASE}${path}`, { method, headers: requestHeaders, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }), env);
      return { response, data: response.status === 204 ? null : await response.json() };
    },
    async create(input = group()) { return this.request('/groups', { method: 'POST', body: { group: input } }); },
  };
}

test('creation assigns an unguessable group identity, stores only a token hash and strips local fields', async () => {
  const api = service();
  const { response, data } = await api.create({ ...group(), sync: { token: 'local-secret' }, localOnly: true });
  assert.equal(response.status, 201);
  assert.match(data.group.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(data.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(data.revision, 1);
  assert.equal(data.group.sync, undefined);
  assert.equal(data.group.localOnly, undefined);
  const stored = api.objects.get(data.group.id).data.get('record');
  assert.match(stored.tokenHash, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(stored).includes(data.token), false);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('every read and patch requires the correct token, and unknown groups reveal no data', async () => {
  const api = service();
  const { data: created } = await api.create();
  const path = `/groups/${created.group.id}`;
  for (const method of ['GET', 'PATCH']) {
    for (const token of [undefined, 'bad', 'a'.repeat(43)]) {
      const { response, data } = await api.request(path, { method, token, ...(method === 'PATCH' ? { body: { changes: [] } } : {}) });
      assert.equal(response.status, 401);
      assert.equal(data.group, undefined);
      assert.equal(data.tokenHash, undefined);
    }
  }
  const read = await api.request(path, { token: created.token, origin: null });
  assert.equal(read.response.status, 200);
  assert.deepEqual(read.data, { group: created.group, revision: 1 });
  const missing = await api.request('/groups/48c650b9-6594-4394-8214-cd8ec9010a11', { token: created.token });
  assert.equal(missing.response.status, 404);
  assert.equal(missing.data.group, undefined);
});

test('simultaneous patches from one base preserve both new expenses and survive object recreation', async () => {
  const api = service();
  const { data: created } = await api.create();
  const path = `/groups/${created.group.id}`;
  const patches = ['first', 'second'].map(id => diffGroups(created.group, { ...created.group, expenses: [expense(id)] }));
  const results = await Promise.all(patches.map(changes => api.request(path, { method: 'PATCH', token: created.token, body: { changes } })));
  assert.deepEqual(results.map(result => result.response.status), [200, 200]);
  const object = api.objects.get(created.group.id);
  object.instance = new GroupStore(object.storage);
  const { data } = await api.request(path, { token: created.token });
  assert.equal(data.revision, 3);
  assert.deepEqual(data.group.expenses.map(item => item.id).sort(), ['first', 'second']);
});

test('overlapping edits return a safe conflict snapshot and a later valid request still succeeds', async () => {
  const api = service();
  const { data: created } = await api.create({ ...group(), expenses: [expense('food')] });
  const path = `/groups/${created.group.id}`;
  const edit = title => diffGroups(created.group, { ...created.group, expenses: [{ ...expense('food'), title }] });
  assert.equal((await api.request(path, { method: 'PATCH', token: created.token, body: { changes: edit('Primero') } })).response.status, 200);
  const conflict = await api.request(path, { method: 'PATCH', token: created.token, body: { changes: edit('Segundo') } });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.data.error, 'conflict');
  assert.equal(conflict.data.group.expenses[0].title, 'Primero');
  assert.equal(conflict.data.revision, 2);
  assert.equal(conflict.data.tokenHash, undefined);
  assert.equal(conflict.data.token, undefined);
  const independent = diffGroups(created.group, { ...created.group, expenses: [...created.group.expenses, expense('another')] });
  const accepted = await api.request(path, { method: 'PATCH', token: created.token, body: { changes: independent } });
  assert.equal(accepted.response.status, 200);
  assert.equal(accepted.data.group.expenses.length, 2);
});

test('retried patches do not duplicate an expense', async () => {
  const api = service();
  const { data: created } = await api.create();
  const path = `/groups/${created.group.id}`;
  const body = { changes: diffGroups(created.group, { ...created.group, expenses: [expense('new')] }) };
  await api.request(path, { method: 'PATCH', token: created.token, body });
  const retry = await api.request(path, { method: 'PATCH', token: created.token, body });
  assert.equal(retry.response.status, 200);
  assert.equal(retry.data.group.expenses.length, 1);
});

test('creation and synchronization accept histories above the old movement-count limit', async () => {
  const api = service();
  const settlement = id => ({ id, from: 'bea', to: 'ana', amount: 1, date: '2026-10-27' });
  const input = { ...group(), settlements: Array.from({ length: 2001 }, (_, index) => settlement(`payment-${index}`)) };
  const created = await api.create(input);
  assert.equal(created.response.status, 201);
  const after = { ...created.data.group, settlements: [...created.data.group.settlements, settlement('next-payment')] };
  const updated = await api.request(`/groups/${created.data.group.id}`, { method: 'PATCH', token: created.data.token, body: { changes: diffGroups(created.data.group, after) } });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.group.settlements.length, 2002);
  const read = await api.request(`/groups/${created.data.group.id}`, { token: created.data.token });
  assert.equal(read.data.group.settlements.length, 2002);
  assert.equal(read.data.revision, 2);
});

test('invalid batches preserve both stored data and revision', async () => {
  const api = service();
  const { data: created } = await api.create({ ...group(), expenses: [expense('food')] });
  const path = `/groups/${created.group.id}`;
  const changes = [
    { collection: 'members', id: 'ana', before: created.group.members[0], after: { id: 'ana', name: 'Changed' } },
    { collection: 'members', id: 'bea', before: created.group.members[1], after: null },
  ];
  const rejected = await api.request(path, { method: 'PATCH', token: created.token, body: { changes } });
  assert.equal(rejected.response.status, 400);
  const read = await api.request(path, { token: created.token });
  assert.deepEqual(read.data, { group: created.group, revision: 1 });
});

test('allowed origins get CORS headers and preflight permits content type and authorization', async () => {
  const api = service();
  for (const origin of [ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:4173']) {
    const { response } = await api.request('/groups', { method: 'OPTIONS', origin, headers: { 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'Content-Type,Authorization' } });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
    assert.match(response.headers.get('Vary'), /Origin/);
    assert.match(response.headers.get('Access-Control-Allow-Headers'), /authorization/i);
    assert.match(response.headers.get('Access-Control-Allow-Headers'), /content-type/i);
    assert.match(response.headers.get('Access-Control-Allow-Methods'), /PATCH/);
  }
});

test('hostile browser origins cannot create or access groups', async () => {
  const api = service();
  for (const origin of ['https://raulmar0.github.io.evil.example', 'https://other.github.io', 'http://raulmar0.github.io', 'null', 'http://localhost.evil.example', 'https://raulmar0.github.io:8443']) {
    const { response } = await api.request('/groups', { method: 'POST', origin, body: { group: group() } });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
  assert.equal(api.objects.size, 0);
});

test('body cap checks actual UTF-8 bytes even when content length understates them', async () => {
  const api = service();
  const body = JSON.stringify({ group: { ...group(), description: '🌵'.repeat(70_000) } });
  const result = await api.request('/groups', { method: 'POST', body, headers: { 'Content-Length': '1' } });
  assert.equal(result.response.status, 413);
  assert.equal(api.objects.size, 0);
});

test('a valid request near the body cap is not rejected by internal credential metadata', async () => {
  const api = service();
  const input = { ...group(), expenses: Array.from({ length: 62 }, (_, index) => ({ ...expense(`expense-${index}`), note: 'x'.repeat(4000) })) };
  const targetGroupBytes = 256 * 1024 - 50;
  const initialBytes = new TextEncoder().encode(JSON.stringify(input)).byteLength;
  input.description = 'x'.repeat(targetGroupBytes - initialBytes);
  assert.ok(input.description.length <= 4000);
  assert.ok(new TextEncoder().encode(JSON.stringify({ group: input })).byteLength < 256 * 1024);
  const result = await api.create(input);
  assert.equal(result.response.status, 201);
  assert.equal(result.data.group.expenses.length, 62);
});

test('patch body size is limited and unauthorized attempts cannot mutate a group', async () => {
  const api = service();
  const { data: created } = await api.create();
  const path = `/groups/${created.group.id}`;
  const result = await api.request(path, { method: 'PATCH', token: created.token, body: ' '.repeat(262_145), headers: { 'Content-Length': '1' } });
  assert.equal(result.response.status, 413);
  assert.equal((await api.request(path, { token: created.token })).data.revision, 1);
});

test('invalid JSON, invalid content types, and invalid groups produce JSON errors', async () => {
  const api = service();
  for (const [body, headers, status] of [
    ['{', {}, 400],
    [{ group: group() }, { 'Content-Type': 'text/plain' }, 415],
    [{ group: { ...group(), members: [] } }, {}, 400],
  ]) {
    const { response, data } = await api.request('/groups', { method: 'POST', body, headers });
    assert.equal(response.status, status);
    assert.equal(typeof data.error, 'string');
    assert.equal(typeof data.message, 'string');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  }
});

test('health is anonymous and there is no directory or public initialization endpoint', async () => {
  const api = service();
  const health = await api.request('/health', { origin: null });
  assert.equal(health.response.status, 200);
  assert.equal(health.data.service, 'entre-sync');
  assert.equal(typeof health.data.version, 'string');
  for (const path of ['/groups', '/initialize', '/groups/not-a-uuid']) {
    const result = await api.request(path);
    assert.equal(result.response.status, 404);
    assert.equal(result.data.group, undefined);
  }
});

test('unexpected storage failures are sanitized and do not poison the request queue', async () => {
  const api = service();
  const { data: created } = await api.create();
  const object = api.objects.get(created.group.id);
  const originalGet = object.storage.get;
  let fail = true;
  object.storage.get = async key => {
    if (fail) { fail = false; throw new Error('private storage details'); }
    return originalGet(key);
  };
  const path = `/groups/${created.group.id}`;
  const failed = await api.request(path, { token: created.token });
  assert.equal(failed.response.status, 500);
  assert.equal(JSON.stringify(failed.data).includes('private storage details'), false);
  assert.equal((await api.request(path, { token: created.token })).response.status, 200);
});
