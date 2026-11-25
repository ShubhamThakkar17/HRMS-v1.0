// Service worker: installable app, offline page, and fast repeat loads.
// - Face models and Next's hashed build assets are cached on first use (they never change for a URL).
// - HR data and pages are never cached: navigations always go to the network.
const STATIC = 'st-hrms-static-v2';
const OFFLINE = '/offline.html';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll([OFFLINE, '/icon.svg'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== STATIC).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

function cacheFirst(req) {
  return caches.open(STATIC).then((c) =>
    c.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) c.put(req, res.clone());
          return res;
        }),
    ),
  );
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/models/') || url.pathname.startsWith('/_next/static/')) {
    e.respondWith(cacheFirst(req));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
  }
});

// Lets a page warm the face models in the background (see components/face/face-client.ts).
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'warm' && Array.isArray(e.data.urls)) {
    e.waitUntil(Promise.all(e.data.urls.map((u) => cacheFirst(new Request(u)).catch(() => null))));
  }
});
