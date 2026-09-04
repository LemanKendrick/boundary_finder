// Boundary Point Finder — service worker
// Cache-invalidation pattern: bump CACHE_NAME on every deploy that changes
// any of the files below. Old caches are purged in 'activate'.
const CACHE_NAME = 'boundary-finder-v5';

const SHELL_FILES = [
  './',
  'index.html',
  'manifest.json',
  'icon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        SHELL_FILES.map(url =>
          cache.add(url).catch(err => console.warn('Precache failed for', url, err))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

// Cache-first for the app shell so it loads instantly and works fully
// offline; falls back to network for anything not precached (e.g. the
// "Open in Maps" link, which needs a live connection anyway).
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        // Opportunistically cache same-origin GETs for next time offline.
        if (resp.ok && event.request.url.startsWith(self.location.origin)) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return resp;
      }).catch(() => {
        // Navigation fallback: if offline and page not cached, serve the shell.
        if (event.request.mode === 'navigate') {
          return caches.match('index.html');
        }
      });
    })
  );
});
