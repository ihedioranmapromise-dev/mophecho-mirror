/* ============================================================
   Moph Echo Mirror — Service Worker
   v6 — network-first for code, cache-first for assets.
   ============================================================ */

const CACHE = 'moph-echo-v6';
const PRECACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/engine.js',
  '/manifest.json',
  '/icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const req = e.request;

  if (url.pathname.startsWith('/api/')) return;
  if (url.hostname.includes('supabase')) return;
  if (req.method !== 'GET') return;

  const isCode = (
    req.destination === 'script' ||
    req.destination === 'document' ||
    req.destination === 'worker' ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/' ||
    url.pathname.endsWith('.json') ||
    url.pathname.endsWith('.css')
  );

  if (isCode) {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then(c => c || caches.match('/index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
