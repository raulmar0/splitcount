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
const profile = (access = { status: 'approved', isAdmin: false }) => ({ user: { id: 'google-user', name: 'Ana', email: 'ana@gmail.com' }, expiresAt: Date.now() + 3600000, access });

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

test('verification fails closed when the server omits or malforms account approval', async () => {
  for (const access of [undefined, null, {}, { status: 'approved' }, { status: 'pending', isAdmin: 'false' }, { status: 'other', isAdmin: false }]) {
    await assert.rejects(verifyGoogleCredential('test', { fetcher: async () => Response.json({ ...profile(), access }) }), /cuenta inválida/);
  }
  for (const status of ['pending', 'rejected']) {
    const expected = profile({ status, isAdmin: false });
    assert.deepEqual(await verifyGoogleCredential('test', { fetcher: async () => Response.json(expected) }), expected);
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
  assert.equal(app.auth.account, null);
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

test('focus after expiry retains account scope for drafts and asks for another sign-in', async () => {
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
  assert.equal(app.auth.account.id, expected.user.id);
  assert.deepEqual(app.auth.access, expected.access);
  assert.match(app.auth.error, /sesión venció/);
});

test('pending and rejected sessions stay signed in but block account requests before any credential is sent', async () => {
  for (const status of ['pending', 'rejected']) {
    const expected = profile({ status, isAdmin: false });
    globalThis.fetch = async () => Response.json(expected);
    const app = await mount();
    await act(async () => { app.signIn(); });
    assert.deepEqual(app.auth.session, expected);
    assert.deepEqual(app.auth.access, expected.access);
    globalThis.fetch = () => assert.fail('unapproved accounts must not send requests');
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      await assert.rejects(app.auth.request('/account/groups', { method }), { code: `account_${status}` });
    }
    await assert.rejects(app.auth.request('/admin/accounts'), { code: 'forbidden' });
    await act(async () => app.auth.signOut());
    assert.equal(app.auth.access, null);
  }
});

test('refreshing approval updates the same account and session signal without clearing local storage', async () => {
  let expected = profile({ status: 'pending', isAdmin: false });
  globalThis.localStorage = { removeItem() { assert.fail('approval refresh must keep the workspace'); }, setItem() { assert.fail('auth must not persist tokens'); } };
  globalThis.fetch = async url => {
    assert.ok(String(url).endsWith('/auth/me'));
    return Response.json(expected);
  };
  const app = await mount();
  await act(async () => { app.signIn(); });
  const signal = app.auth.signal;
  expected = profile();
  await act(async () => { assert.deepEqual(await app.auth.refreshAccess(), expected); });
  assert.equal(app.auth.account.id, 'google-user');
  assert.equal(app.auth.signal, signal);
  assert.equal(signal.aborted, false);
  assert.deepEqual(app.auth.access, { status: 'approved', isAdmin: false });
  globalThis.fetch = async () => Response.json({ revision: 0, groups: [] });
  assert.deepEqual(await app.auth.request('/account/groups'), { revision: 0, groups: [] });
});

test('a server approval rejection disables later requests while retaining the signed-in local workspace', async () => {
  globalThis.fetch = async () => Response.json(profile());
  const app = await mount();
  await act(async () => { app.signIn(); });
  const signal = app.auth.signal;
  let resolve;
  globalThis.fetch = async () => new Promise(done => { resolve = done; });
  const earlier = app.auth.request('/account/groups');
  const discarded = assert.rejects(earlier, { code: 'account_rejected' });
  globalThis.fetch = async () => Response.json({ error: 'account_rejected', message: 'Acceso rechazado.' }, { status: 403 });
  await act(async () => assert.rejects(app.auth.request('/account/groups'), { code: 'account_rejected' }));
  assert.equal(app.auth.account.id, 'google-user');
  assert.ok(app.auth.session);
  assert.equal(app.auth.signal, signal);
  assert.equal(app.auth.access.status, 'rejected');
  assert.equal(app.auth.session.access.status, 'rejected');
  await act(async () => { resolve(Response.json({ revision: 0, groups: [] })); await discarded; });
  globalThis.fetch = () => assert.fail('rejected account must stop cloud requests');
  await assert.rejects(app.auth.request('/account/groups'), { code: 'account_rejected' });
});

test('authenticated requests cannot override the API destination or credential transport', async () => {
  globalThis.fetch = async () => Response.json(profile({ status: 'approved', isAdmin: true }));
  const app = await mount();
  await act(async () => { app.signIn(); });
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).endsWith('/admin/push'));
    assert.equal(String(url).includes('evil.example'), false);
    assert.equal(options.headers.Authorization, 'Bearer test-credential');
    return Response.json({ ok: true });
  };
  assert.deepEqual(await app.auth.request('/admin/push', {
    base: 'https://evil.example', fetcher: () => assert.fail('untrusted transport'),
  }), { ok: true });
});

test('admin access comes only from approved server roles and expires before all account or admin requests', async () => {
  for (const access of [{ status: 'approved', isAdmin: false }, { status: 'approved', isAdmin: true }]) {
    const expected = { ...profile(access), user: { ...profile().user, email: 'raulhdz40@gmail.com' } };
    globalThis.fetch = async () => Response.json(expected);
    const app = await mount();
    await act(async () => { app.signIn(); });
    if (!access.isAdmin) {
      globalThis.fetch = () => assert.fail('an email address cannot authorize admin requests');
      await assert.rejects(app.auth.request('/admin/accounts'), { code: 'forbidden' });
    } else {
      globalThis.fetch = async () => Response.json({ accounts: [] });
      assert.deepEqual(await app.auth.request('/admin/accounts'), { accounts: [] });
    }
    Date.now = () => expected.expiresAt + 1;
    await act(async () => assert.rejects(app.auth.request('/account/groups'), { code: 'auth_required' }));
    await act(async () => assert.rejects(app.auth.request('/admin/accounts'), { code: 'auth_required' }));
    await act(async () => assert.rejects(app.auth.refreshAccess(), { code: 'auth_required' }));
    Date.now = originalNow;
    await act(async () => app.auth.signOut());
  }
});

test('authenticated requests are cancelled on logout and delayed data cannot cross sessions', async () => {
  globalThis.fetch = async () => Response.json(profile());
  const app = await mount();
  await act(async () => { app.signIn(); });
  let resolve, signal;
  globalThis.fetch = (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-credential');
    assert.equal(options.credentials, 'omit');
    signal = options.signal;
    return new Promise(done => { resolve = done; });
  };
  let request;
  await act(async () => { request = app.auth.request('/account/groups'); });
  const rejected = assert.rejects(request, { code: 'auth_required' });
  await act(async () => app.auth.signOut());
  assert.equal(signal.aborted, true);
  await act(async () => { resolve(Response.json({ revision: 0, groups: [] })); await rejected; });
  assert.equal(app.auth.account, null);
  assert.equal(app.auth.session, null);
});

test('reauthentication with another Google account cannot replace an open workspace', async () => {
  const expected = profile();
  globalThis.fetch = async () => Response.json(expected);
  const app = await mount();
  await act(async () => { app.signIn(); });
  globalThis.fetch = async () => Response.json({ ...expected, user: { ...expected.user, id: 'another-account' } });
  await act(async () => { app.signIn(); });
  assert.equal(app.auth.account.id, expected.user.id);
  assert.equal(app.auth.session, null);
  assert.match(app.auth.error, /misma cuenta/);
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
  assert.equal(scripts[0].src, 'https://accounts.google.com/gsi/client?hl=es');
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

test('SDK loading requests the selected language and reuses only a matching loaded locale', async () => {
  const { loadGoogleIdentity: load } = await import('../src/google-auth.js?locale-cache-test');
  delete globalThis.google;
  const scripts = [];
  globalThis.document = {
    createElement() { return { remove() { this.removed = true; } }; },
    head: { appendChild(script) { scripts.push(script); } },
  };
  const first = load('en');
  assert.equal(load('en'), first);
  assert.equal(scripts[0].src, 'https://accounts.google.com/gsi/client?hl=en');
  const englishSdk = { language: 'en' };
  globalThis.google = { accounts: { id: englishSdk } };
  scripts[0].onload();
  assert.equal(await first, englishSdk);
  assert.equal(await load('en'), englishSdk);
  assert.equal(scripts.length, 1);
  const french = load('fr');
  assert.equal(scripts.length, 2);
  assert.equal(scripts[0].removed, true);
  assert.equal(scripts[1].src, 'https://accounts.google.com/gsi/client?hl=fr');
  const frenchSdk = { language: 'fr' };
  globalThis.google.accounts.id = frenchSdk;
  scripts[1].onload();
  assert.equal(await french, frenchSdk);
});

test('rapid locale changes serialize SDK execution and a stale failure cannot discard the latest request', async () => {
  const { loadGoogleIdentity: load } = await import('../src/google-auth.js?locale-race-test');
  delete globalThis.google;
  const scripts = [];
  globalThis.document = {
    createElement() { return { remove() { this.removed = true; } }; },
    head: { appendChild(script) { scripts.push(script); } },
  };
  const french = load('fr');
  const italian = load('it');
  assert.equal(load('it'), italian);
  assert.equal(scripts.length, 1);
  scripts[0].onerror();
  await assert.rejects(french, /conectar con Google/);
  await Promise.resolve();
  assert.equal(scripts.length, 2);
  assert.equal(scripts[1].src, 'https://accounts.google.com/gsi/client?hl=it');
  assert.equal(load('it'), italian);
  const sdk = { language: 'it' };
  globalThis.google = { accounts: { id: sdk } };
  scripts[1].onload();
  assert.equal(await italian, sdk);
  assert.equal(await load('it'), sdk);
  assert.equal(scripts.filter(script => !script.removed).length, 1);
});
