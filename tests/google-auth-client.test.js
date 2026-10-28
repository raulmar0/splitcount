import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer from 'react-test-renderer';
import { loadGoogleIdentity, verifyGoogleCredential } from '../src/google-auth.js';
import useGoogleAuth from '../src/useGoogleAuth.js';
import { GOOGLE_CLIENT_ID } from '../src/google-config.js';

const { act } = Renderer;
const globals = ['fetch', 'google', 'document', 'addEventListener', 'removeEventListener', 'IS_REACT_ACT_ENVIRONMENT', 'localStorage', 'sessionStorage'];
const originals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const originalConsoleError = console.error;
const originalNow = Date.now;
const roots = [];
const profile = () => ({ user: { id: 'google-user', name: 'Ana', email: 'ana@gmail.com' }, expiresAt: Date.now() + 3600000 });

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  console.error = (...args) => { if (!String(args[0]).includes('react-test-renderer is deprecated')) originalConsoleError(...args); };
  const events = new EventTarget();
  globalThis.addEventListener = events.addEventListener.bind(events);
  globalThis.removeEventListener = events.removeEventListener.bind(events);
});

afterEach(async () => {
  await act(async () => { for (const root of roots.splice(0)) root.unmount(); });
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  console.error = originalConsoleError;
  Date.now = originalNow;
});

test('sends credentials only in Authorization and trusts only the server profile', async () => {
  const expected = profile();
  const received = await verifyGoogleCredential('test-credential', {
    base: 'https://api.example/',
    fetcher: async (url, options) => {
      assert.equal(url, 'https://api.example/auth/me');
      assert.equal(url.includes('test-credential'), false);
      assert.equal(options.headers.Authorization, 'Bearer test-credential');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.referrerPolicy, 'no-referrer');
      return Response.json({ ...expected, unwanted: 'not returned' });
    },
  });
  assert.deepEqual(received, expected);
});

test('handles invalid credentials, rejected tokens, unavailable backend and network errors', async () => {
  for (const credential of [null, '', 'a'.repeat(8193)]) {
    await assert.rejects(verifyGoogleCredential(credential, { fetcher: () => assert.fail('must not send invalid input') }), /credencial válida/);
  }
  for (const [status, message] of [[401, /venció/], [403, /servidor/], [503, /servidor/]]) {
    await assert.rejects(verifyGoogleCredential('test', { fetcher: async () => new Response('', { status }) }), message);
  }
  await assert.rejects(verifyGoogleCredential('test', { fetcher: async () => { throw new Error('network'); } }), /conexión/);
  await assert.rejects(verifyGoogleCredential('test', { fetcher: async () => new Response('{') }), /respuesta inválida/);
  for (const data of [{}, { ...profile(), expiresAt: Date.now() - 1 }, { ...profile(), expiresAt: Date.now() + 86400000 }, { ...profile(), user: { name: 'Ana' } }]) {
    await assert.rejects(verifyGoogleCredential('test', { fetcher: async () => Response.json(data) }), /cuenta inválida/);
  }
});

async function mount() {
  let auth, callback, initialized = 0, disabled = 0;
  const sdk = {
    initialize(options) { assert.equal(options.client_id, GOOGLE_CLIENT_ID); assert.equal(options.auto_select, false); initialized++; callback = options.callback; },
    disableAutoSelect() { disabled++; },
  };
  globalThis.google = { accounts: { id: sdk } };
  function Harness() { auth = useGoogleAuth(); return null; }
  await act(async () => { roots.push(Renderer.create(React.createElement(React.StrictMode, null, React.createElement(Harness)))); });
  auth.initialize(sdk);
  auth.initialize(sdk);
  assert.equal(initialized, 1);
  return { get auth() { return auth; }, signIn: () => callback({ credential: 'test-credential' }), get disabled() { return disabled; } };
}

test('stores the verified profile only in memory and signs out without touching groups', async () => {
  const expected = profile();
  globalThis.localStorage = globalThis.sessionStorage = { setItem() { assert.fail('auth must not persist credentials or profiles'); } };
  globalThis.fetch = async () => Response.json(expected);
  const app = await mount();
  await act(async () => { app.signIn(); });
  assert.deepEqual(app.auth.session, expected);
  assert.equal(app.auth.busy, false);
  await act(async () => app.auth.signOut());
  assert.equal(app.auth.session, null);
  assert.equal(app.disabled, 1);
});

test('sign-out aborts verification and ignores a late successful response', async () => {
  let resolve, signal;
  globalThis.fetch = (_, options) => { signal = options.signal; return new Promise(done => { resolve = done; }); };
  const app = await mount();
  await act(async () => { app.signIn(); });
  assert.equal(app.auth.busy, true);
  await act(async () => app.auth.signOut());
  assert.equal(signal.aborted, true);
  await act(async () => resolve(Response.json(profile())));
  assert.equal(app.auth.session, null);
  assert.equal(app.auth.busy, false);
  assert.equal(app.auth.error, '');
});

test('failed validation never shows a signed-in user', async () => {
  globalThis.fetch = async () => new Response('', { status: 401 });
  const app = await mount();
  await act(async () => { app.signIn(); });
  assert.equal(app.auth.session, null);
  assert.match(app.auth.error, /venció/);
  assert.equal(app.auth.busy, false);
});

test('focus after expiry clears the account and asks for another sign-in', async () => {
  const events = new EventTarget();
  globalThis.addEventListener = events.addEventListener.bind(events);
  globalThis.removeEventListener = events.removeEventListener.bind(events);
  const expected = profile();
  globalThis.fetch = async () => Response.json(expected);
  const app = await mount();
  await act(async () => { app.signIn(); });
  Date.now = () => expected.expiresAt + 1;
  await act(async () => events.dispatchEvent(new Event('focus')));
  assert.equal(app.auth.session, null);
  assert.match(app.auth.error, /sesión venció/);
});

test('SDK loading is shared, handles errors/timeouts, and can retry without duplicate scripts', async t => {
  delete globalThis.google;
  const scripts = [];
  globalThis.document = {
    createElement(tag) { assert.equal(tag, 'script'); return { remove() { this.removed = true; } }; },
    head: { appendChild(script) { scripts.push(script); } },
  };
  const first = loadGoogleIdentity();
  assert.equal(loadGoogleIdentity(), first);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://accounts.google.com/gsi/client');
  scripts[0].onerror();
  await assert.rejects(first, /conectar con Google/);
  assert.equal(scripts[0].removed, true);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const timedOut = loadGoogleIdentity();
  t.mock.timers.tick(12001);
  await assert.rejects(timedOut, /tardando en responder/);
  assert.equal(scripts[1].removed, true);
  t.mock.timers.reset();
  const retry = loadGoogleIdentity();
  assert.equal(scripts.length, 3);
  const sdk = {};
  globalThis.google = { accounts: { id: sdk } };
  scripts[2].onload();
  assert.equal(await retry, sdk);
  assert.equal(await loadGoogleIdentity(), sdk);
});
