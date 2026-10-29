import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

async function worker(scope = 'https://example.test/splitcount/') {
  const listeners = new Map(), notifications = [], actions = [];
  const self = { registration: { scope, async showNotification(title, options) { notifications.push({ title, ...options }); } }, addEventListener: (name, fn) => listeners.set(name, fn), clients: { async matchAll() { return []; }, async openWindow(url) { actions.push(url); } } };
  runInNewContext(await readFile(new URL('../public/push-worker.js', import.meta.url), 'utf8'), { self, URL });
  const dispatch = async (type, extra = {}) => { let completed; listeners.get(type)({ ...extra, waitUntil(promise) { completed = promise; } }); await completed; };
  return { self, notifications, actions, dispatch };
}

test('payloadless push shows a private generic notification scoped to the app', async () => {
  const w = await worker();
  await w.dispatch('push');
  assert.equal(w.notifications.length, 1);
  assert.match(w.notifications[0].title, /Splitcount/);
  assert.equal(w.notifications[0].data.url, 'https://example.test/splitcount/?admin=1');
});

test('notification clicks ignore injected destinations and open the admin panel within scope', async () => {
  const w = await worker();
  let closed = false;
  await w.dispatch('notificationclick', { notification: { data: { url: 'https://evil.test' }, close() { closed = true; } } });
  assert.equal(closed, true);
  assert.deepEqual(w.actions, ['https://example.test/splitcount/?admin=1']);
});

test('notification clicks focus existing app windows without navigating away from drafts', async () => {
  const w = await worker();
  const client = { url: 'https://example.test/splitcount/', async focus() { w.actions.push('focus'); return this; }, postMessage(message) { w.actions.push(message.type); } };
  w.self.clients.matchAll = async () => [client];
  await w.dispatch('notificationclick', { notification: { close() {} } });
  assert.deepEqual(w.actions, ['focus', 'OPEN_ADMIN_DASHBOARD']);
});

test('custom-domain root scope keeps notifications and icons on Splitcount', async () => {
  const w = await worker('https://splitcount.raulmar.com/');
  await w.dispatch('push');
  assert.equal(w.notifications[0].data.url, 'https://splitcount.raulmar.com/?admin=1');
  assert.equal(w.notifications[0].icon, 'https://splitcount.raulmar.com/brand/icon-192.png');
  await w.dispatch('notificationclick', { notification: { close() {} } });
  assert.deepEqual(w.actions, ['https://splitcount.raulmar.com/?admin=1']);
});
