// DrivePro service worker: receives Web Push notifications. No offline caching yet.
self.addEventListener('push', (event) => {
  let data = { title: 'DrivePro', body: '', url: '/app' };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, { body: data.body, icon: '/favicon.svg', badge: '/favicon.svg', data: { url: data.url }, tag: 'drivepro-reminder' }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/app';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.navigate(url).then((w) => w?.focus());
      return self.clients.openWindow(url);
    }),
  );
});
