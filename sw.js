/* Service worker de Forma.
   Sirve la app desde la caché (funciona sin señal en el gimnasio).
   IMPORTANTE: al publicar cambios, subí VERSION para que los teléfonos reciban la versión nueva. */
const VERSION = 'forma-2.1.2';
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];
const LEGACY = ['kinetic-volt-v1', 'kinetic-volt-v2', 'kinetic-volt-v3'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })));
    // Si viene de la versión anterior (sin aviso de actualización), activarse enseguida.
    const keys = await caches.keys();
    if (keys.some(k => LEGACY.includes(k))) self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scopePath = new URL(self.registration.scope).pathname;
  const isAppPage = url.pathname === scopePath || url.pathname === scopePath + 'index.html';
  if (req.mode === 'navigate' && isAppPage) {
    e.respondWith((async () => {
      const cached = await caches.match('./index.html', { cacheName: VERSION });
      if (cached) return cached;
      try { return await fetch(req); } catch (_) { return new Response('Sin conexión', { status: 503 }); }
    })());
    return;
  }
  e.respondWith((async () => {
    const cached = await caches.match(req, { cacheName: VERSION, ignoreSearch: true });
    if (cached) return cached;
    return fetch(req);
  })());
});
