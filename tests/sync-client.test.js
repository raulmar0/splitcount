import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInviteLink, parseInvite, isSharedMetadata, attachRemoteGroup, createSharedGroup, fetchSharedGroup, commitSharedGroup, SyncError } from '../src/sync.js';
import { createInitialState } from '../src/seed.js';

const id = '11111111-1111-4111-8111-111111111111';
const token = 'a'.repeat(43);
const capability = { id, token, revision: 1 };
const group = () => ({ ...createInitialState().groups[0], id });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('invite keeps the access key in the URL fragment and round trips', () => {
  const link = buildInviteLink(capability, 'https://raulmar0.github.io/entre-app/?source=old');
  const url = new URL(link);
  assert.equal(url.search, '');
  assert.equal(url.pathname, '/entre-app/');
  assert.deepEqual(parseInvite(url.hash), { id, token });
});

test('malformed invite keys, IDs and metadata are rejected', () => {
  assert.equal(parseInvite('#grupo=bad.short'), null);
  assert.equal(parseInvite('#grupo=%invalid'), null);
  assert.equal(parseInvite('#anything'), null);
  assert.equal(isSharedMetadata({ ...capability, revision: -1 }), false);
  assert.equal(isSharedMetadata(capability), true);
});

test('remote updates preserve only a valid local viewer identity', () => {
  const g = group();
  const result = attachRemoteGroup({ ...g, _selfId: 'ana' }, { group: g, revision: 4 }, capability);
  assert.equal(result._selfId, 'ana');
  assert.equal(result._shared.revision, 4);
  assert.equal(result._shared.token, token);
  assert.equal(attachRemoteGroup({ ...g, _selfId: 'gone' }, { group: g, revision: 2 }, capability)._selfId, undefined);
});

test('creating a shared group validates the response before returning a capability', async () => {
  const result = await createSharedGroup(group(), { fetcher: async () => response({ group: group(), revision: 1, token }) });
  assert.deepEqual(result._shared, capability);
  await assert.rejects(() => createSharedGroup(group(), { fetcher: async () => response({ group: {}, revision: 1, token }) }), SyncError);
});

test('reads send the key only in Authorization and never in the endpoint URL', async () => {
  let request;
  const result = await fetchSharedGroup(capability, { fetcher: async (url, options) => { request = { url, options }; return response({ group: group(), revision: 2 }); } });
  assert.equal(result.revision, 2);
  assert.equal(request.options.headers.Authorization, `Bearer ${token}`);
  assert.equal(request.url.includes(token), false);
  assert.ok(request.url.endsWith(`/groups/${id}`));
});

test('mutations send entity differences instead of replacing the whole remote group', async () => {
  const before = { ...group(), _shared: capability, _selfId: 'ana' };
  const after = { ...before, expenses: before.expenses.slice(1) };
  let request;
  await commitSharedGroup(before, after, { fetcher: async (url, options) => { request = { url, options }; return response({ group: after, revision: 2 }); } });
  const body = JSON.parse(request.options.body);
  assert.equal(request.options.method, 'PATCH');
  assert.equal(body.changes.length, 1);
  assert.equal(body.changes[0].collection, 'expenses');
  assert.equal(body.changes[0].after, null);
  assert.equal(JSON.stringify(body).includes(token), false);
});

test('conflicts surface the latest version and offline requests do not claim success', async () => {
  await assert.rejects(() => fetchSharedGroup(capability, { fetcher: async () => { throw new TypeError('offline'); } }), error => error instanceof SyncError && error.code === 'network');
  const before = { ...group(), _shared: capability };
  const after = { ...before, name: 'Otro nombre' };
  await assert.rejects(() => commitSharedGroup(before, after, { fetcher: async () => response({ error: 'conflict', group: group(), revision: 8 }, 409) }), error => error instanceof SyncError && error.code === 'conflict' && error.latest.revision === 8);
});

test('an untrusted remote payload cannot replace a valid cached group', () => {
  assert.throws(() => attachRemoteGroup(group(), { group: { ...group(), members: [] }, revision: 2 }, capability), SyncError);
  assert.throws(() => attachRemoteGroup(group(), { group: { ...group(), id: 'different' }, revision: 2 }, capability), SyncError);
});
