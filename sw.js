// OVRG E-Store Service Worker
const CACHE_NAME = 'ovrg-v1';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install: cache shell assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API calls, cache-first for shell
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always network-first for Supabase / external APIs
  if (url.hostname.includes('supabase') || url.hostname.includes('formsubmit') ||
      url.hostname.includes('paypal') || url.hostname.includes('wave') ||
      url.hostname.includes('googleapis') || url.hostname.includes('jsdelivr')) {
    event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Cache-first for same-origin assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const toCache = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        }
        return response;
      });
    }).catch(() => caches.match('/index.html'))
  );
});
