import test from 'node:test';
import assert from 'node:assert/strict';
import { enableAdminPush, disableAdminPush, inspectAdminPush } from '../src/admin-push.js';

const key = Buffer.alloc(65, 4).toString('base64url');
function device(permission = 'default') {
  const calls = [];
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/example', toJSON: () => ({ endpoint: subscription.endpoint, keys: { auth: 'a', p256dh: 'b' } }), async unsubscribe() { calls.push('unsubscribe'); return true; } };
  const registration = { active: {}, pushManager: { async getSubscription() { return null; }, async subscribe(options) { calls.push('subscribe'); assert.equal(options.userVisibleOnly, true); assert.equal(options.applicationServerKey.byteLength, 65); return subscription; } } };
  const environment = { isSecureContext: true, PushManager: {}, Notification: { permission, async requestPermission() { calls.push('permission'); return permission === 'denied' ? 'denied' : 'granted'; } }, navigator: { serviceWorker: { async getRegistration() { return registration; } } } };
  const request = async (path, options) => { calls.push([path, options]); return {}; };
  return { calls, subscription, registration, environment, request };
}

test('push setup requires an active worker and explicit permission before saving a subscription', async () => {
  const d = device();
  const state = await inspectAdminPush(d.environment);
  assert.equal(state.supported, true);
  await enableAdminPush({ ...d, publicKey: key });
  assert.deepEqual(d.calls.slice(0, 2), ['permission', 'subscribe']);
  assert.deepEqual(d.calls[2], ['/admin/push', { method: 'POST', body: { subscription: d.subscription.toJSON() } }]);
});

test('denied permission and unsupported browsers never save push endpoints', async () => {
  const d = device('denied');
  await assert.rejects(enableAdminPush({ ...d, publicKey: key }), /bloqueadas/);
  assert.deepEqual(d.calls, []);
  assert.equal((await inspectAdminPush({})).supported, false);
  await assert.rejects(enableAdminPush({ ...d, registration: null, publicKey: key }), /publicada/);
});

test('failed server registration rolls back a new browser subscription', async () => {
  const d = device('granted');
  d.request = async () => { throw new Error('offline'); };
  await assert.rejects(enableAdminPush({ ...d, publicKey: key }), /offline/);
  assert.deepEqual(d.calls, ['subscribe', 'unsubscribe']);
});

test('disabling push removes its server endpoint before unsubscribing the device', async () => {
  const d = device('granted');
  await disableAdminPush(d);
  assert.deepEqual(d.calls, [['/admin/push', { method: 'DELETE', body: { endpoint: d.subscription.endpoint } }], 'unsubscribe']);
});
