import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../sync-server/src/service.js';

const CLIENT_ID = 'access-tests.apps.googleusercontent.com';
const ORIGIN = 'https://raulmar0.github.io';
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, false, ['sign', 'verify']);
const publicKey = await crypto.subtle.exportKey('jwk', pair.publicKey);
const originalFetch = globalThis.fetch;
let pushes = [];
let pushStatus = 201;
let pushResponder;
globalThis.fetch = async (url, init) => {
  if (String(url) === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [{ ...publicKey, kid: 'access-test', alg: 'RS256', use: 'sig' }] });
  pushes.push({ url: String(url), init });
  if (pushResponder) return pushResponder(url, init);
  return new Response(null, { status: pushStatus });
};
test.after(() => { globalThis.fetch = originalFetch; });

async function sign(id = 'applicant', changes = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: id, iat: now, exp: now + 3600, email: `${id}@example.test`, name: `Name ${id}`, email_verified: true, ...changes };
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'RS256', kid: 'access-test' })}.${encode(claims)}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(input));
  return `${input}.${Buffer.from(signature).toString('base64url')}`;
}
const ownerToken = await sign('owner', { email: 'RAULHDZ40@gmail.com' });
const applicantToken = await sign();
const pushPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const pushPublicKey = Buffer.from(await crypto.subtle.exportKey('raw', pushPair.publicKey)).toString('base64url');
const subscription = endpoint => ({ endpoint: endpoint ?? 'https://fcm.googleapis.com/fcm/send/test-device', expirationTime: null, keys: { p256dh: pushPublicKey, auth: Buffer.alloc(16, 4).toString('base64url') } });

function service({ background = false } = {}) {
  const backgroundTasks = [];
  const data = new Map();
  let store;
  let directoryCalls = 0;
  const storage = {
    async get(key) { await new Promise(resolve => setTimeout(resolve, 0)); return structuredClone(data.get(key)); },
    async put(key, value) { await new Promise(resolve => setTimeout(resolve, 0)); data.set(key, structuredClone(value)); },
  };
  const env = { GOOGLE_CLIENT_ID: CLIENT_ID,
    ACCESS: { idFromName: value => value, get(id) {
      assert.equal(id, 'access-registry');
      return { async fetch(request) {
        store ??= new (await import('../sync-server/src/access-store.js')).AccessStore(storage, background ? { waitUntil: task => backgroundTasks.push(task) } : undefined);
        return store.fetch(request);
      } };
    } },
    ACCOUNTS: { idFromName: value => value, get() { directoryCalls += 1; return { fetch: async request => {
      assert.equal(request.headers.get('Authorization'), null);
      return Response.json({ revision: 0, groups: [] });
    } }; } },
  };
  return { env, data, storage, backgroundTasks, get directoryCalls() { return directoryCalls; }, recreate() { store = undefined; },
    async request(path = '/auth/me', { method = 'GET', body, token = applicantToken, origin = ORIGIN } = {}) {
      const headers = new Headers({ Origin: origin });
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (body !== undefined) headers.set('Content-Type', 'application/json');
      const response = await handleRequest(new Request(`https://sync.example${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      return { response, data: response.status === 204 ? null : await response.json() };
    },
    admin(path = '/admin/accounts', options = {}) { return this.request(path, { token: ownerToken, ...options }); },
  };
}

test('verified new accounts enter a durable pending queue once and owners bypass approval', async () => {
  const api = service();
  const first = await api.request();
  assert.equal(first.response.status, 200);
  assert.deepEqual(first.data.access, { status: 'pending', isAdmin: false });
  assert.equal(first.data.user.id, 'applicant');
  assert.equal(typeof first.data.expiresAt, 'number');
  const queue = await api.admin();
  assert.equal(queue.response.status, 200);
  assert.equal(queue.data.revision, 1);
  assert.deepEqual(Object.keys(queue.data.accounts[0]).sort(), ['email', 'id', 'name', 'requestedAt', 'status', 'updatedAt', 'version']);
  assert.equal(queue.data.accounts[0].status, 'pending');
  assert.equal(queue.data.accounts[0].version, 1);
  assert.ok(Number.isSafeInteger(queue.data.accounts[0].requestedAt));
  assert.ok(Number.isSafeInteger(queue.data.accounts[0].updatedAt));
  api.recreate();
  await api.request();
  assert.deepEqual((await api.admin()).data, queue.data);
  assert.deepEqual((await api.request('/auth/me', { token: ownerToken })).data.access, { status: 'approved', isAdmin: true });
  assert.equal((await api.admin()).data.accounts.length, 1);
});

test('pending and rejected users cannot reach any account group method; approval restores access', async () => {
  const api = service();
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    const path = ['PATCH', 'DELETE'].includes(method) ? `/account/groups/${crypto.randomUUID()}` : '/account/groups';
    const result = await api.request(path, { method, ...(method === 'GET' ? {} : { body: {} }) });
    assert.equal(result.response.status, 403);
    assert.equal(result.data.error, 'account_pending');
  }
  assert.equal(api.directoryCalls, 0);
  const approved = await api.admin('/admin/accounts/applicant', { method: 'PATCH', body: { status: 'approved', version: 1 } });
  assert.equal(approved.response.status, 200);
  assert.equal(approved.data.account.version, 2);
  assert.equal(approved.data.revision, 2);
  assert.deepEqual((await api.request()).data.access, { status: 'approved', isAdmin: false });
  assert.equal((await api.request('/account/groups')).response.status, 200);
  api.recreate();
  assert.equal((await api.admin('/admin/accounts/applicant', { method: 'PATCH', body: { status: 'rejected', version: 2 } })).response.status, 200);
  assert.deepEqual((await api.request()).data.access, { status: 'rejected', isAdmin: false });
  assert.equal((await api.request('/account/groups')).data.error, 'account_rejected');
  assert.equal((await api.admin()).data.accounts[0].status, 'rejected');
});

test('concurrent decisions use compare-and-swap and verified profile changes preserve the decision', async () => {
  const api = service();
  await Promise.all([api.request(), api.request()]);
  const decisions = await Promise.all(['approved', 'rejected'].map(status => api.admin('/admin/accounts/applicant', { method: 'PATCH', body: { status, version: 1 } })));
  assert.deepEqual(decisions.map(value => value.response.status).sort(), [200, 409]);
  const conflict = decisions.find(value => value.response.status === 409);
  assert.equal(conflict.data.error, 'access_conflict');
  assert.equal(conflict.data.account.version, 2);
  const changedToken = await sign('applicant', { email: 'changed@example.test', name: 'New name' });
  assert.equal((await api.request('/auth/me', { token: changedToken })).data.access.status, decisions.find(value => value.response.status === 200).data.account.status);
  const row = (await api.admin()).data.accounts[0];
  assert.equal(row.email, 'changed@example.test');
  assert.equal(row.name, 'New name');
  assert.equal(row.version, 3);
  assert.equal((await api.admin('/admin/accounts/applicant', { method: 'PATCH', body: { status: 'approved', version: 2 } })).response.status, 409);
});

test('admin routes require a fresh verified owner token and reject client roles or malformed decisions', async () => {
  const api = service();
  for (const token of [null, 'not-a-token', await sign('owner', { email: 'raulhdz40@gmail.com', aud: 'wrong' }), await sign('owner', { email: 'raulhdz40@gmail.com', exp: 1 })]) {
    for (const path of ['/admin/accounts', '/admin/push', '/admin/push/test']) assert.equal((await api.request(path, { token })).response.status, 401);
  }
  for (const [token, expectedStatus] of [[applicantToken, 403], [await sign('attacker', { email: 'attacker@example.test', isAdmin: true, role: 'admin' }), 403], [await sign('fake-owner', { email: 'raulhdz40@gmail.com', email_verified: false }), 401]]) {
    const result = await api.request('/admin/accounts', { token });
    assert.equal(result.response.status, expectedStatus);
  }
  await api.request();
  for (const body of [{ status: 'pending', version: 1 }, { status: 'approved', version: 0 }, { status: 'approved', version: '1' }, { status: 'approved', version: 1, isAdmin: true }]) {
    assert.equal((await api.admin('/admin/accounts/applicant', { method: 'PATCH', body })).response.status, 400);
  }
  assert.equal((await api.admin('/admin/accounts/unknown', { method: 'PATCH', body: { status: 'approved', version: 1 } })).response.status, 404);
  assert.equal((await api.admin('/admin/accounts/owner', { method: 'PATCH', body: { status: 'rejected', version: 1 } })).response.status, 403);
  assert.equal(api.directoryCalls, 0);
});

test('access configuration and storage failures fail closed without exposing internal details', async () => {
  const api = service();
  delete api.env.ACCESS;
  for (const path of ['/auth/me', '/account/groups', '/admin/accounts']) {
    const result = await api.request(path, { token: path.startsWith('/admin') ? ownerToken : applicantToken });
    assert.equal(result.response.status, 503);
    assert.equal(result.data.error, 'access_unavailable');
  }
  assert.equal(api.directoryCalls, 0);
  const broken = service();
  broken.storage.get = async () => { throw new Error('private storage secret'); };
  const result = await broken.request();
  assert.equal(result.response.status, 503);
  assert.equal(JSON.stringify(result.data).includes('private storage secret'), false);
});

test('admin push subscription management is private, durable, bounded and validates endpoints', async () => {
  const api = service();
  const config = await api.admin('/admin/push');
  assert.equal(config.response.status, 200);
  assert.match(config.data.publicKey, /^[A-Za-z0-9_-]{87}$/);
  assert.equal(config.data.subscriptions, 0);
  assert.deepEqual(config.data.endpoints, []);
  assert.equal(JSON.stringify(config.data).includes('private'), false);
  const device = subscription();
  const saved = await api.admin('/admin/push', { method: 'POST', body: { subscription: device } });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.data.subscriptions, 1);
  assert.deepEqual(saved.data.endpoints, [device.endpoint]);
  assert.equal(JSON.stringify(saved.data).includes('p256dh'), false);
  assert.equal((await api.admin('/admin/push', { method: 'POST', body: { subscription: device } })).data.subscriptions, 1);
  api.recreate();
  assert.deepEqual((await api.admin('/admin/push')).data, { publicKey: config.data.publicKey, subscriptions: 1, endpoints: [device.endpoint] });
  for (const endpoint of ['http://fcm.googleapis.com/fcm/send/x', 'https://attacker.example/x', 'https://fcm.googleapis.com.attacker.example/x', 'https://user:secret@fcm.googleapis.com/x']) {
    assert.equal((await api.admin('/admin/push', { method: 'POST', body: { subscription: subscription(endpoint) } })).response.status, 400);
  }
  for (let index = 1; index < 10; index += 1) assert.equal((await api.admin('/admin/push', { method: 'POST', body: { subscription: subscription(`https://fcm.googleapis.com/fcm/send/${index}`) } })).response.status, 200);
  assert.equal((await api.admin('/admin/push', { method: 'POST', body: { subscription: subscription('https://fcm.googleapis.com/fcm/send/overflow') } })).response.status, 409);
  assert.equal((await api.admin('/admin/push', { method: 'DELETE', body: { endpoint: device.endpoint } })).data.subscriptions, 9);
  assert.equal((await api.request('/admin/push', { method: 'DELETE', body: { endpoint: device.endpoint } })).response.status, 403);
});

test('new requests send one generic payloadless push after persistence and remove expired devices', async () => {
  const api = service();
  pushes = []; pushStatus = 201;
  await api.admin('/admin/push', { method: 'POST', body: { subscription: subscription() } });
  const first = await Promise.all([api.request(), api.request(), api.request()]);
  assert.ok(first.every(item => item.data.access.status === 'pending'));
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].init.body, undefined);
  assert.equal(JSON.stringify(pushes).includes('applicant'), false);
  api.recreate();
  await api.request();
  assert.equal(pushes.length, 1);
  pushStatus = 410;
  assert.equal((await api.request('/auth/me', { token: await sign('second') })).response.status, 200);
  assert.equal((await api.admin('/admin/push')).data.subscriptions, 0);
  assert.equal((await api.admin()).data.accounts.length, 2);
});

test('push failures do not lose pending requests or trigger retries on the next sign-in', async () => {
  const api = service();
  pushes = []; pushStatus = 500;
  await api.admin('/admin/push', { method: 'POST', body: { subscription: subscription() } });
  assert.equal((await api.request()).response.status, 200);
  assert.equal((await api.admin()).data.accounts.length, 1);
  await api.request();
  assert.equal(pushes.length, 1);
  pushStatus = 201;
  const tested = await api.admin('/admin/push/test', { method: 'POST' });
  assert.equal(tested.response.status, 200);
  assert.equal(pushes.length, 2);
});

test('manual push tests with no devices report empty diagnostics without generating keys or sending', async () => {
  const api = service();
  pushes = [];
  const result = await api.admin('/admin/push/test', { method: 'POST' });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data, { sent: 0, expired: 0, failed: 0, errors: [] });
  assert.equal(pushes.length, 0);
  assert.equal(api.data.size, 0);
});

test('manual push tests report safe provider failures and prune only expired devices', async () => {
  const api = service();
  const devices = [
    subscription('https://fcm.googleapis.com/fcm/send/private-success'),
    subscription('https://web.push.apple.com/private-expired'),
    subscription('https://jmt17.google.com/fcm/send/private-failure?secret=capability'),
    subscription('https://updates.push.services.mozilla.com/wpush/v2/private-network'),
  ];
  for (const device of devices) await api.admin('/admin/push', { method: 'POST', body: { subscription: device } });
  const before = structuredClone(api.data.get('access-registry'));
  pushResponder = url => {
    const provider = new URL(url).hostname;
    if (provider === 'web.push.apple.com') return new Response(null, { status: 410 });
    if (provider === 'jmt17.google.com') return new Response('private provider response body', { status: 403 });
    if (provider === 'updates.push.services.mozilla.com') throw new Error(`${url}: private network details`);
    return new Response(null, { status: 201 });
  };
  try {
    const result = await api.admin('/admin/push/test', { method: 'POST' });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.data, { sent: 1, expired: 1, failed: 2, errors: [
      { provider: 'jmt17.google.com', status: 403 },
      { provider: 'updates.push.services.mozilla.com', status: null },
    ] });
    assert.doesNotMatch(JSON.stringify(result.data), /private|secret|capability|p256dh|auth/);
    assert.deepEqual(api.data.get('access-registry'), { ...before, subscriptions: [devices[0], devices[2], devices[3]] });
  } finally { pushResponder = undefined; }
});

test('manual push tests fail with safe upstream details when no notification is delivered', async () => {
  for (const status of [403, 503, null]) {
    const api = service();
    const device = subscription('https://jmt17.google.com/fcm/send/private-failure?secret=capability');
    await api.admin('/admin/push', { method: 'POST', body: { subscription: device } });
    await api.admin('/admin/push', { method: 'POST', body: { subscription: subscription('https://web.push.apple.com/private-expired') } });
    pushResponder = url => {
      if (new URL(url).hostname === 'web.push.apple.com') return new Response(null, { status: 410 });
      if (status === null) throw new Error(`${url}: private network details`);
      return new Response('private provider response body', { status });
    };
    try {
      const result = await api.admin('/admin/push/test', { method: 'POST' });
      assert.equal(result.response.status, 502);
      const { message, ...diagnostics } = result.data;
      assert.deepEqual(diagnostics, { error: 'push_delivery_failed', sent: 0, expired: 1, failed: 1, errors: [{ provider: 'jmt17.google.com', status }] });
      assert.match(message, /jmt17\.google\.com/);
      assert.match(message, status === null ? /conexión|tiempo de espera/ : new RegExp(`HTTP ${status}`));
      assert.doesNotMatch(JSON.stringify(result.data), /private|secret|capability|p256dh|auth/);
      assert.deepEqual((await api.admin('/admin/push')).data.endpoints, [device.endpoint]);
    } finally { pushResponder = undefined; }
  }
});

test('manual push tests with only expired devices remain successful and remove those devices', async () => {
  const api = service();
  await api.admin('/admin/push', { method: 'POST', body: { subscription: subscription() } });
  pushResponder = () => new Response(null, { status: 410 });
  try {
    const result = await api.admin('/admin/push/test', { method: 'POST' });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.data, { sent: 0, expired: 1, failed: 0, errors: [] });
    assert.equal((await api.admin('/admin/push')).data.subscriptions, 0);
  } finally { pushResponder = undefined; }
});

test('manual push diagnostics require an authenticated owner before attempting delivery', async () => {
  const api = service();
  await api.admin('/admin/push', { method: 'POST', body: { subscription: subscription() } });
  pushes = [];
  for (const [token, status] of [[null, 401], [applicantToken, 403], [await sign('owner', { email: 'raulhdz40@gmail.com', exp: 1 }), 401]]) {
    const result = await api.request('/admin/push/test', { method: 'POST', token });
    assert.equal(result.response.status, status);
    assert.equal(result.data.errors, undefined);
  }
  assert.equal(pushes.length, 0);
});

test('manual push configuration failures report each undelivered device without exposing storage errors', async () => {
  const api = service();
  const device = subscription('https://jmt17.google.com/fcm/send/private-device');
  await api.admin('/admin/push', { method: 'POST', body: { subscription: device } });
  const before = structuredClone(api.data.get('access-registry'));
  const get = api.storage.get;
  api.storage.get = async key => {
    if (key === 'push-config') throw new Error('private config storage details');
    return get(key);
  };
  pushes = [];
  const result = await api.admin('/admin/push/test', { method: 'POST' });
  assert.equal(result.response.status, 502);
  const { message, ...diagnostics } = result.data;
  assert.deepEqual(diagnostics, { error: 'push_delivery_failed', sent: 0, expired: 0, failed: 1, errors: [{ provider: 'jmt17.google.com', status: null }] });
  assert.match(message, /jmt17\.google\.com/);
  assert.doesNotMatch(message, /private|storage|config/);
  assert.equal(pushes.length, 0);
  assert.deepEqual(api.data.get('access-registry'), before);
});

test('background delivery rejection leaves sign-in responsive and preserves newer decisions', async () => {
  const api = service({ background: true });
  await api.admin('/admin/push', { method: 'POST', body: { subscription: subscription() } });
  let rejectPush;
  let pushStarted;
  const started = new Promise(resolve => { pushStarted = resolve; });
  pushResponder = () => new Promise((resolve, reject) => { rejectPush = reject; pushStarted(); });
  const signIn = api.request();
  try {
    const responsive = await Promise.race([signIn.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 100))]);
    assert.equal(responsive, true);
    await started;
    assert.equal((await api.admin('/admin/accounts/applicant', { method: 'PATCH', body: { status: 'approved', version: 1 } })).response.status, 200);
    rejectPush(new Error('private network exception'));
    await Promise.all(api.backgroundTasks);
    assert.equal((await api.admin()).data.accounts[0].status, 'approved');
    assert.equal((await api.admin('/admin/push')).data.subscriptions, 1);
    assert.equal((await signIn).data.errors, undefined);
  } finally {
    if (rejectPush) rejectPush(new Error('private network exception'));
    pushResponder = undefined;
    await signIn;
  }
});

test('background push delivery never holds sign-in or decisions and expiry cleanup preserves newer approvals', async () => {
  const api = service({ background: true });
  pushes = []; pushStatus = 201;
  await api.admin('/admin/push', { method: 'POST', body: { subscription: subscription() } });
  let finishPush;
  let pushStarted;
  const started = new Promise(resolve => { pushStarted = resolve; });
  pushResponder = () => new Promise(resolve => { finishPush = resolve; pushStarted(); });
  const signIn = api.request();
  try {
    const responsive = await Promise.race([signIn.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 100))]);
    assert.equal(responsive, true);
    await started;
    assert.equal((await api.admin()).data.accounts.length, 1);
    assert.equal((await api.admin('/admin/accounts/applicant', { method: 'PATCH', body: { status: 'approved', version: 1 } })).response.status, 200);
    finishPush(new Response(null, { status: 410 }));
    await Promise.all(api.backgroundTasks);
    assert.equal((await api.admin()).data.accounts[0].status, 'approved');
    assert.equal((await api.admin('/admin/push')).data.subscriptions, 0);
  } finally {
    if (finishPush) finishPush(new Response(null, { status: 410 }));
    pushResponder = undefined;
    await signIn;
  }
});

test('the public router never accepts internal identities, foreign origins or forwarded Google tokens', async () => {
  const api = service();
  assert.equal((await api.request('/session', { method: 'POST', token: null, body: { user: { id: 'fake', email: 'raulhdz40@gmail.com', name: 'Fake' } } })).response.status, 404);
  assert.equal((await api.admin('/admin/accounts', { origin: 'https://attacker.example' })).response.status, 403);
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    const result = await api.request(method === 'PATCH' ? '/admin/accounts/applicant' : '/admin/push', { method, body: { role: 'admin' } });
    assert.equal(result.response.status, 403);
  }
  assert.equal(api.data.size, 0);
  await api.request();
  const state = JSON.stringify(api.data.get('access-registry'));
  assert.equal(state.includes(applicantToken), false);
  assert.equal(state.includes('expiresAt'), false);
});

test('a full registry keeps decisions and existing account access instead of evicting rows', async () => {
  const api = service();
  await api.request();
  const first = api.data.get('access-registry').accounts[0];
  api.data.set('access-registry', { revision: 2000, subscriptions: [], accounts: Array.from({ length: 2000 }, (_, index) => ({ ...first, id: index === 0 ? 'applicant' : `account-${index}`, status: 'approved' })) });
  const extra = await api.request('/auth/me', { token: await sign('overflow') });
  assert.equal(extra.response.status, 503);
  assert.equal(extra.data.error, 'access_unavailable');
  assert.equal(api.data.get('access-registry').accounts.length, 2000);
  assert.equal((await api.request('/account/groups')).response.status, 200);
  assert.equal((await api.admin()).data.accounts[0].id, 'applicant');
});

test('failed request persistence sends nothing and a later successful retry requests once', async () => {
  const api = service();
  pushes = []; pushStatus = 201;
  await api.admin('/admin/push', { method: 'POST', body: { subscription: subscription() } });
  const write = api.storage.put;
  let fail = true;
  api.storage.put = async (...args) => {
    if (fail) { fail = false; throw new Error('private failure'); }
    return write(...args);
  };
  assert.equal((await api.request()).response.status, 503);
  assert.equal(pushes.length, 0);
  assert.equal((await api.admin()).data.accounts.length, 0);
  assert.equal((await api.request()).response.status, 200);
  assert.equal(pushes.length, 1);
  await api.admin('/admin/accounts/applicant', { method: 'PATCH', body: { status: 'rejected', version: 1 } });
  await api.request();
  assert.equal(pushes.length, 1);
});

test('the owner subject cannot be downgraded through a stale pre-owner queue record', async () => {
  const api = service();
  const oldIdentity = await sign('owner');
  assert.equal((await api.request('/auth/me', { token: oldIdentity })).data.access.status, 'pending');
  assert.equal((await api.admin('/admin/accounts/owner', { method: 'PATCH', body: { status: 'rejected', version: 1 } })).response.status, 403);
  assert.deepEqual((await api.request('/auth/me', { token: ownerToken })).data.access, { status: 'approved', isAdmin: true });
  assert.deepEqual((await api.admin()).data.accounts, []);
});

test('internal verified identities allow the full supported Unicode metadata and encoded subject IDs', async () => {
  const api = service();
  const id = '☀'.repeat(255);
  const token = await sign(id, { email: `${'☀'.repeat(300)}@example.test`, name: '☀'.repeat(160) });
  const result = await api.request('/auth/me', { token });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.access.status, 'pending');
  assert.equal((await api.admin(`/admin/accounts/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status: 'approved', version: 1 } })).response.status, 200);
});

test('every accepted opaque push endpoint can also be removed', async () => {
  const api = service();
  const endpoint = `https://fcm.googleapis.com/fcm/send/${'a'.repeat(3000)}`;
  assert.equal((await api.admin('/admin/push', { method: 'POST', body: { subscription: subscription(endpoint) } })).response.status, 200);
  assert.equal((await api.admin('/admin/push', { method: 'DELETE', body: { endpoint } })).response.status, 200);
  assert.equal((await api.admin('/admin/push')).data.subscriptions, 0);
});
