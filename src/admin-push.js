export async function inspectAdminPush(environment = globalThis) {
  const supported = !!(environment.isSecureContext && environment.Notification && environment.PushManager && environment.navigator?.serviceWorker);
  if (!supported) return { supported: false, registration: null, subscription: null };
  const registration = await environment.navigator.serviceWorker.getRegistration();
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  return { supported, registration, subscription };
}

function applicationKey(publicKey) {
  if (typeof publicKey !== 'string' || !/^[A-Za-z0-9_-]{87}$/.test(publicKey)) throw new Error('No pudimos preparar las notificaciones. Actualiza el panel e inténtalo de nuevo.');
  return Uint8Array.from(atob(publicKey.replaceAll('-', '+').replaceAll('_', '/') + '='), character => character.charCodeAt(0));
}

export async function enableAdminPush({ registration, publicKey, request, environment = globalThis }) {
  if (!registration?.active) throw new Error('Abre la versión publicada e instalada de Splitcount para activar las notificaciones.');
  const key = applicationKey(publicKey);
  if (environment.Notification.permission === 'denied') throw new Error('Las notificaciones están bloqueadas. Permítelas en los ajustes de este navegador.');
  // Permission is requested directly from the button action, before network awaits.
  const permission = environment.Notification.permission === 'granted' ? 'granted' : await environment.Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Activa el permiso de notificaciones para recibir las solicitudes.');
  let subscription = await registration.pushManager.getSubscription();
  const previousKey = subscription?.options?.applicationServerKey;
  if (previousKey && (previousKey.byteLength !== key.length || new Uint8Array(previousKey).some((byte, index) => byte !== key[index]))) {
    await subscription.unsubscribe();
    subscription = null;
  }
  const created = !subscription;
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  try {
    await request('/admin/push', { method: 'POST', body: { subscription: subscription.toJSON() } });
  } catch (error) {
    if (created) await subscription.unsubscribe().catch(() => {});
    throw error;
  }
  return subscription;
}

export async function disableAdminPush({ subscription, request }) {
  if (!subscription) return;
  await request('/admin/push', { method: 'DELETE', body: { endpoint: subscription.endpoint } });
  await subscription.unsubscribe();
}
