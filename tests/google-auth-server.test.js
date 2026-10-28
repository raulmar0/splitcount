import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateGoogleRequest, verifyGoogleToken } from '../sync-server/src/google-auth.js';
import { handleRequest } from '../sync-server/src/service.js';
import { GOOGLE_CLIENT_ID } from '../src/google-config.js';

const now = new Date('2026-10-28T18:00:00Z');
const seconds = now.getTime() / 1000;
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, false, ['sign', 'verify']);
const claims = { iss: 'https://accounts.google.com', aud: GOOGLE_CLIENT_ID, sub: 'google-user-123', iat: seconds, exp: seconds + 3600, email: 'ana@gmail.com', email_verified: true, name: 'Ana', privateClaim: 'not returned' };
const options = { keys: pair.publicKey, now };
const base64 = value => Buffer.from(value).toString('base64url');

async function sign(payload = claims, header = { alg: 'RS256', kid: 'test-key' }) {
  const data = `${base64(JSON.stringify(header))}.${base64(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(data));
  return `${data}.${base64(signature)}`;
}

test('verifies a signed Google token and returns only its stable identity and expiry', async () => {
  const result = await verifyGoogleToken(await sign(), GOOGLE_CLIENT_ID, options);
  assert.deepEqual(result, { user: { id: 'google-user-123', email: 'ana@gmail.com', name: 'Ana' }, expiresAt: (seconds + 3600) * 1000 });
  assert.equal(JSON.stringify(result).includes('not returned'), false);
  const request = new Request('https://api.example/auth/me', { headers: { Authorization: `Bearer ${await sign({ ...claims, iss: 'accounts.google.com' })}` } });
  assert.deepEqual(await authenticateGoogleRequest(request, GOOGLE_CLIENT_ID, options), result);
});

test('rejects incorrect audience, issuer, expiry, issue time and unverified email', async () => {
  for (const changes of [
    { aud: 'another-client' }, { iss: 'https://attacker.example' }, { exp: seconds },
    { iat: seconds + 60 }, { iat: seconds - 7201 }, { email_verified: false },
    { email_verified: 'true' }, { sub: '' }, { sub: 123 }, { email: '' },
    { azp: 'another-client' }, { aud: [GOOGLE_CLIENT_ID, 'another-client'] },
  ]) {
    await assert.rejects(verifyGoogleToken(await sign({ ...claims, ...changes }), GOOGLE_CLIENT_ID, options), { status: 401, code: 'invalid_google_token' });
  }
});

test('rejects missing required claims, altered signatures and unexpected algorithms', async () => {
  for (const field of ['sub', 'iat', 'exp', 'email', 'email_verified']) {
    const payload = { ...claims };
    delete payload[field];
    await assert.rejects(verifyGoogleToken(await sign(payload), GOOGLE_CLIENT_ID, options), { status: 401 });
  }
  const token = await sign();
  const parts = token.split('.');
  parts[1] = base64(JSON.stringify({ ...claims, sub: 'attacker' }));
  for (const invalid of [parts.join('.'), 'not-a-token', `${base64('{"alg":"none"}')}.${base64(JSON.stringify(claims))}.`, await sign(claims, { alg: 'HS256' }), 'a'.repeat(8193)]) {
    await assert.rejects(verifyGoogleToken(invalid, GOOGLE_CLIENT_ID, options), { status: 401 });
  }
});

test('fails closed when unconfigured and distinguishes Google key-fetch failures', async () => {
  await assert.rejects(verifyGoogleToken(await sign(), undefined, options), { status: 503, code: 'auth_unavailable' });
  await assert.rejects(verifyGoogleToken(await sign(), GOOGLE_CLIENT_ID, { ...options, keys: async () => { throw new TypeError('private network details'); } }), error => {
    assert.equal(error.status, 503);
    assert.equal(error.message.includes('private network details'), false);
    return true;
  });
});

test('auth route rejects missing/malformed credentials, forbids foreign origins, and never caches profiles', async () => {
  const env = { GOOGLE_CLIENT_ID, GROUPS: { get() { throw new Error('Auth must not allocate group storage'); } } };
  for (const authorization of [undefined, 'Basic abc', 'Bearer not-a-token', `Bearer ${'x'.repeat(8193)}`]) {
    const headers = { Origin: 'https://raulmar0.github.io', ...(authorization ? { Authorization: authorization } : {}) };
    const response = await handleRequest(new Request('https://api.example/auth/me', { headers }), env);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), headers.Origin);
    assert.equal((await response.json()).error, 'invalid_google_token');
  }
  const hostile = await handleRequest(new Request('https://api.example/auth/me', { headers: { Origin: 'https://evil.example' } }), env);
  assert.equal(hostile.status, 403);
  assert.equal(hostile.headers.get('Access-Control-Allow-Origin'), null);
  const preflight = await handleRequest(new Request('https://api.example/auth/me', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Headers': 'Authorization' } }), env);
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Authorization/);
});

test('the complete profile route fetches public Google keys and verifies the signed token', async () => {
  const originalFetch = globalThis.fetch;
  const publicKey = await crypto.subtle.exportKey('jwk', pair.publicKey);
  globalThis.fetch = async url => {
    assert.equal(String(url), 'https://www.googleapis.com/oauth2/v3/certs');
    return Response.json({ keys: [{ ...publicKey, kid: 'test-key', alg: 'RS256', use: 'sig' }] });
  };
  try {
    const current = Math.floor(Date.now() / 1000);
    const token = await sign({ ...claims, iat: current, exp: current + 3600 });
    const request = new Request('https://api.example/auth/me', { headers: { Authorization: `Bearer ${token}`, Origin: 'https://raulmar0.github.io' } });
    const response = await handleRequest(request, { GOOGLE_CLIENT_ID });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal((await response.json()).user.id, claims.sub);
    const missingConfig = await handleRequest(request, {});
    assert.equal(missingConfig.status, 503);
  } finally { globalThis.fetch = originalFetch; }
});
