const CACHE = 'mindsprint-v2';

self.addEventListener('install', (event) => {
  // Don't precache HTML — hashed assets change every deploy and stale shells white-screen the app
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = request.url;
  // Never intercept API / cross-port API calls
  if (url.includes('/api') || url.includes(':8080')) return;

  // Always network-first for navigations and the app shell
  const isNav = request.mode === 'navigate' || url.endsWith('/') || url.includes('index.html');
  if (isNav) {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Network-first for JS/CSS so deploys aren't stuck on stale bundles
  if (url.includes('/assets/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/dashboard');
    })
  );
});
