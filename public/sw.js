// Passage service worker: the app opens with no signal.
// Pages: network first, cached copy when offline. Static assets and fonts: cache first.
// Never cached: /api/* (scans, rates) and Supabase calls — those go to the network or fail.

const VERSION = 'passage-v4';
const SHELL = ['/', '/start', '/t/demo', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/') || url.hostname.endsWith('supabase.co') || url.hostname === 'photon.komoot.io') return;

  const cacheFirst = url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') ||
    url.hostname === 'tile.openstreetmap.org';

  if (cacheFirst) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      })),
    );
    return;
  }

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
        return res;
      }).catch(async () => (await caches.match(req)) || (await caches.match('/t/demo')) || Response.error()),
    );
  }
});
