/* Loaded by the generated service worker; all links remain inside this app. */
const adminPanelUrl = () => new URL('?admin=1', self.registration.scope).href;

self.addEventListener('push', event => {
  event.waitUntil(self.registration.showNotification('Splitcount · Solicitudes de acceso', {
    body: 'Abre el panel para revisar las solicitudes de cuentas.',
    icon: new URL('brand/icon-192.png', self.registration.scope).href,
    badge: new URL('brand/icon-192.png', self.registration.scope).href,
    tag: 'splitcount-account-requests',
    data: { url: adminPanelUrl() },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const scope = new URL(self.registration.scope);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => {
      const url = new URL(client.url);
      return url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
    });
    if (existing) {
      await existing.focus();
      existing.postMessage({ type: 'OPEN_ADMIN_DASHBOARD' });
    } else await self.clients.openWindow(adminPanelUrl());
  })());
});
