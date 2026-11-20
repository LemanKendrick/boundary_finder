// Boundary Point Finder — service worker
// Cache-invalidation pattern: bump CACHE_NAME on every deploy that changes
// any of the files below. Old caches are purged in 'activate'.
const CACHE_NAME = 'boundary-finder-v33';

const SHELL_FILES = [
  './',
  'index.html',
  'help.html',
  'manifest.json',
  'icon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/layers.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/layers-2x.png'
];
// Map tiles get their own cache that survives version bumps, so any area
// you've viewed with a connection is still visible offline in the field.
const TILE_CACHE = 'boundary-finder-tiles';
const TILE_CACHE_MAX = 3000;
function isTile(url){
  return url.includes('server.arcgisonline.com') || url.includes('tile.openstreetmap.org');
}
async function trimTiles(){
  const c = await caches.open(TILE_CACHE);
  const keys = await c.keys();
  for(let i = 0; i < keys.length - TILE_CACHE_MAX; i++) await c.delete(keys[i]);
}

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
        names.filter(n => n !== CACHE_NAME && n !== TILE_CACHE).map(n => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

// Cache-first for the app shell so it loads instantly and works fully
// offline; falls back to network for anything not precached (e.g. the
// "Open in Maps" link, which needs a live connection anyway).
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  if (isTile(event.request.url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(c => c.match(event.request).then(hit => {
        if (hit) return hit;
        return fetch(event.request).then(resp => {
          if (resp.ok || resp.type === 'opaque') {
            c.put(event.request, resp.clone()).then(trimTiles);
          }
          return resp;
        }).catch(() => new Response('', { status: 504 }));
      }))
    );
    return;
  }

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
