import test from 'node:test';
import assert from 'node:assert/strict';

const loadPush = () => import('../sync-server/src/push.js');
const encode = value => Buffer.from(value).toString('base64url');
// The P-256 generator is a valid uncompressed point, independent of production key generation.
const p256dh = encode(Buffer.from('046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5', 'hex'));
const auth = 'AAECAwQFBgcICQoLDA0ODw';
const subscription = (endpoint = 'https://fcm.googleapis.com/fcm/send/private-device-token') => ({ endpoint, expirationTime: null, keys: { p256dh, auth } });

function storageFor(data = new Map()) {
  return {
    async get(key) { return structuredClone(data.get(key)); },
    async put(key, value) { data.set(key, structuredClone(value)); },
  };
}

test('persists one VAPID key pair and reuses it after storage recreation', async () => {
  const { getPushConfig } = await loadPush();
  const data = new Map();
  const storage = storageFor(data);
  const [first, concurrent] = await Promise.all([getPushConfig(storage), getPushConfig(storage)]);
  assert.deepEqual(concurrent, first);
  assert.equal(data.size, 1);
  assert.deepEqual(await getPushConfig(storageFor(data)), first);
  assert.equal(first.privateJwk.kty, 'EC');
  assert.equal(first.privateJwk.crv, 'P-256');
  assert.equal(Buffer.from(first.privateJwk.d, 'base64url').byteLength, 32);
  const rawPublic = Buffer.from(first.publicKey, 'base64url');
  assert.equal(rawPublic.byteLength, 65);
  assert.equal(rawPublic[0], 4);
  const imported = await crypto.subtle.importKey('raw', rawPublic, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
  const publicJwk = await crypto.subtle.exportKey('jwk', imported);
  assert.equal(publicJwk.x, first.privateJwk.x);
  assert.equal(publicJwk.y, first.privateJwk.y);
});

test('does not expose a newly generated public key before its private key is durable', async () => {
  const { getPushConfig } = await loadPush();
  const data = new Map();
  const storage = storageFor(data);
  const put = storage.put;
  let writes = 0;
  storage.put = async (...args) => {
    if (++writes === 1) throw new Error('storage unavailable');
    return put(...args);
  };
  await assert.rejects(getPushConfig(storage), /storage unavailable/);
  assert.equal(data.size, 0);
  const recovered = await getPushConfig(storage);
  assert.deepEqual(await getPushConfig(storageFor(data)), recovered);
});

test('accepts browser push services and retains opaque endpoint paths and queries', async () => {
  const { validatePushSubscription } = await loadPush();
  for (const endpoint of [
    'https://fcm.googleapis.com/fcm/send/ABC_123',
    'https://jmt17.google.com/fcm/send/ABC_123',
    'https://updates.push.services.mozilla.com/wpush/v2/token',
    'https://updates-autopush.stage.mozaws.net.push.services.mozilla.com/wpush/v2/token',
    'https://web.push.apple.com/QToken',
    'https://region.web.push.apple.com/QToken',
    'https://wns2-bl2p.notify.windows.com/w/?token=opaque%2Btoken&other=a%2Fb',
  ]) {
    const input = { ...subscription(endpoint), extra: 'never stored', keys: { p256dh, auth, privateKey: 'never stored' } };
    assert.deepEqual(validatePushSubscription(input), subscription(endpoint));
    assert.deepEqual(Object.keys(input.keys), ['p256dh', 'auth', 'privateKey']);
  }
  assert.deepEqual(validatePushSubscription({ endpoint: subscription().endpoint, keys: { p256dh, auth } }), subscription());
  assert.equal(validatePushSubscription({ ...subscription(), expirationTime: 1793230000000 }).expirationTime, 1793230000000);
});

test('rejects endpoints that could send credentials to an untrusted host or port', async () => {
  const { validatePushSubscription, PushValidationError } = await loadPush();
  for (const endpoint of [
    'http://fcm.googleapis.com/token', 'https://fcm.googleapis.com:8443/token',
    'https://user:secret@fcm.googleapis.com/token', 'https://fcm.googleapis.com/token#fragment',
    'https://fcm.googleapis.com.evil.example/token', 'https://evil-fcm.googleapis.com/token',
    'https://jmt17.google.com.evil.example/token', 'https://eviljmt17.google.com/token', 'https://jmt18.google.com/token',
    'https://evilpush.services.mozilla.com/token', 'https://push.services.mozilla.com.evil.example/token',
    'https://evilweb.push.apple.com/token', 'https://web.push.apple.com.evil.example/token',
    'https://evilnotify.windows.com/token', 'https://notify.windows.com/token',
    'https://127.0.0.1/token', 'https://[::1]/token', 'https://169.254.169.254/token',
    'https://localhost/token', 'https://fcm.googleapis.com./token',
    ' https://fcm.googleapis.com/token', 'https://fcm.googleapis.com/token\n',
    'https://fcm.googleapis.com\\@evil.example/token',
    `https://fcm.googleapis.com/${'x'.repeat(4096)}`, '', null,
  ]) {
    assert.throws(() => validatePushSubscription(subscription(endpoint)), error => {
      assert.ok(error instanceof PushValidationError);
      assert.equal(error.status, 400);
      assert.equal(error.code, 'invalid_push_subscription');
      assert.equal(error.message.includes('secret'), false);
      assert.equal(error.message.includes('token'), false);
      return true;
    }, String(endpoint));
  }
});

test('rejects malformed subscription keys and invalid expiration values', async () => {
  const { validatePushSubscription } = await loadPush();
  const invalidPoints = [
    encode(new Uint8Array(65)),
    encode(Uint8Array.from({ length: 65 }, (_, index) => index === 0 ? 4 : 0)),
    encode(Uint8Array.from({ length: 65 }, (_, index) => index === 0 ? 4 : 255)),
  ];
  for (const input of [
    null, [], {}, { ...subscription(), keys: null },
    ...['', p256dh.slice(1), `${p256dh}=`, `${p256dh.slice(0, -1)}!`, 'x'.repeat(8192), ...invalidPoints].map(value => ({ ...subscription(), keys: { p256dh: value, auth } })),
    ...['', auth.slice(1), `${auth}=`, `${auth.slice(0, -1)}!`, 'x'.repeat(8192)].map(value => ({ ...subscription(), keys: { p256dh, auth: value } })),
    ...[-1, Infinity, NaN, '1793230000000', 1.5, Number.MAX_SAFE_INTEGER + 1].map(expirationTime => ({ ...subscription(), expirationTime })),
  ]) {
    assert.throws(() => validatePushSubscription(input), { status: 400, code: 'invalid_push_subscription' });
  }
});

test('subscription diagnostics identify incompatible fields without exposing device keys or endpoint paths', async () => {
  const { validatePushSubscription } = await loadPush();
  assert.throws(() => validatePushSubscription(subscription('https://unsupported.example/private-capability')), error => {
    assert.match(error.message, /proveedor.*unsupported\.example/i);
    assert.doesNotMatch(error.message, /private-capability/);
    return true;
  });
  assert.throws(() => validatePushSubscription({ ...subscription(), expirationTime: 'invalid' }), /vencimiento/);
  assert.throws(() => validatePushSubscription({ ...subscription(), keys: { p256dh, auth: 'private-key' } }), error => {
    assert.match(error.message, /claves/);
    assert.doesNotMatch(error.message, /private-key/);
    return true;
  });
});

test('sends an empty push request with a verifiable VAPID token and never follows redirects', async () => {
  const { getPushConfig, sendAdminPush } = await loadPush();
  const config = await getPushConfig(storageFor());
  const endpoint = 'https://wns2-bl2p.notify.windows.com/w/?token=private%2Btoken';
  let request;
  let deliverySignal;
  const before = Math.floor(Date.now() / 1000);
  const result = await sendAdminPush({ ...subscription(endpoint), applicant: { name: 'Private applicant', email: 'private@example.test' }, authorization: 'Bearer private-google-token' }, config, {
    fetcher: async (url, options) => {
      deliverySignal = options.signal;
      request = new Request(url, options);
      return new Response(null, { status: 201 });
    },
  });
  assert.ok(deliverySignal instanceof AbortSignal);
  assert.equal(deliverySignal.aborted, false);
  assert.deepEqual(result, { expired: false });
  assert.equal(request.url, endpoint);
  assert.equal(request.method, 'POST');
  assert.equal(request.redirect, 'manual');
  assert.equal(await request.text(), '');
  assert.equal(request.body, null);
  assert.equal(request.headers.get('Content-Encoding'), null);
  assert.match(request.headers.get('TTL'), /^\d+$/);
  assert.ok(Number(request.headers.get('TTL')) > 0 && Number(request.headers.get('TTL')) <= 3600);
  const match = /^vapid t=([A-Za-z0-9_.-]+), k=([A-Za-z0-9_-]+)$/.exec(request.headers.get('Authorization'));
  assert.ok(match);
  assert.equal(match[2], config.publicKey);
  const [header, payload, signature] = match[1].split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.deepEqual(Object.keys(claims).sort(), ['aud', 'exp', 'sub']);
  assert.equal(claims.aud, 'https://wns2-bl2p.notify.windows.com');
  assert.equal(claims.sub, 'mailto:raulhdz40@gmail.com');
  assert.ok(claims.exp > before && claims.exp < before + 86400);
  const publicKey = await crypto.subtle.importKey('raw', Buffer.from(config.publicKey, 'base64url'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, Buffer.from(signature, 'base64url'), new TextEncoder().encode(`${header}.${payload}`)), true);
  assert.equal(JSON.stringify([...request.headers]).includes('private'), false);
});

test('reports expired subscriptions separately from successful and failed deliveries', async () => {
  const { getPushConfig, sendAdminPush, PushDeliveryError } = await loadPush();
  const config = await getPushConfig(storageFor());
  for (const status of [200, 201, 202, 204, 299, 404, 410]) {
    assert.deepEqual(await sendAdminPush(subscription(), config, { fetcher: async () => new Response(null, { status }) }), { expired: status === 404 || status === 410 });
  }
  for (const status of [301, 307, 400, 401, 403, 429, 500]) {
    const response = new Response('private provider response body', { status });
    await assert.rejects(sendAdminPush(subscription(), config, { fetcher: async () => response }), error => {
      assert.equal(error.name, 'PushDeliveryError');
      assert.ok(error instanceof PushDeliveryError);
      assert.equal(error.status, status);
      assert.doesNotMatch(JSON.stringify(error), /private|fcm\.googleapis\.com|p256dh|auth/);
      assert.doesNotMatch(error.message, /private|fcm\.googleapis\.com/);
      return true;
    });
    assert.equal(response.bodyUsed, false);
  }
  await assert.rejects(sendAdminPush(subscription(), config, { fetcher: async () => { throw new Error('private-device-token in network exception'); } }), error => {
    assert.ok(error instanceof PushDeliveryError);
    assert.equal(error.status, null);
    assert.equal(error.message.includes('private-device-token'), false);
    assert.equal(error.cause, undefined);
    return true;
  });
});

test('uses the Workers-compatible manual redirect mode and rejects redirected push delivery', async () => {
  const { getPushConfig, sendAdminPush } = await loadPush();
  const config = await getPushConfig(storageFor());
  let requests = 0;
  await assert.rejects(sendAdminPush(subscription(), config, { fetcher: async (_endpoint, options) => {
    requests++;
    assert.equal(options.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://untrusted.example/' } });
  } }), { status: 302 });
  assert.equal(requests, 1);
});

test('revalidates persisted subscriptions before invoking the push service', async () => {
  const { getPushConfig, sendAdminPush } = await loadPush();
  const config = await getPushConfig(storageFor());
  let called = false;
  await assert.rejects(sendAdminPush(subscription('https://127.0.0.1/private'), config, { fetcher: async () => { called = true; return new Response(null, { status: 201 }); } }), { status: 400, code: 'invalid_push_subscription' });
  assert.equal(called, false);
});

test('sanitizes a delivery timeout without exposing the subscription capability', async () => {
  const { getPushConfig, sendAdminPush, PushDeliveryError } = await loadPush();
  const config = await getPushConfig(storageFor());
  let deliverySignal;
  await assert.rejects(sendAdminPush(subscription(), config, {
    fetcher: async (url, options) => {
      deliverySignal = options.signal;
      throw new DOMException(`${url}: private timeout details`, 'TimeoutError');
    },
  }), error => {
    assert.equal(error.name, 'PushDeliveryError');
    assert.ok(error instanceof PushDeliveryError);
    assert.equal(error.status, null);
    assert.equal(error.message.includes('fcm.googleapis.com'), false);
    assert.equal(error.message.includes('private'), false);
    return true;
  });
  assert.ok(deliverySignal instanceof AbortSignal);
});
