// OVRG Service Worker — Network-First for HTML, Stale-While-Revalidate for Assets
const CACHE_NAME = 'ovrg-v2';
const PRECACHE = ['/', '/index.html', '/showcase.html'];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // Skip cross-origin requests (Supabase, CDNs, etc.)
  if (!url.startsWith(self.location.origin)) return;

  // Bypass service worker caching on localhost during development
  if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
    return;
  }

  // Network-first for Navigation / HTML
  if (event.request.mode === 'navigate' || (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(event.request).then(response => {
        const resClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        return response;
      }).catch(() => {
        return caches.match(event.request).then(cached => {
          return cached || caches.match('/index.html') || new Response('Offline', { status: 503 });
        });
      })
    );
  } else {
    // Stale-while-revalidate for same-origin assets
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const resClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
          }
          return networkResponse;
        }).catch(function() {
          return new Response('', { status: 503 });
        });

        return cached || fetchPromise;
      })
    );
  }
});
