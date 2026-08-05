const CACHE = 'remesas-v4';
const FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Estrategia: "stale-while-revalidate" — sirve la copia guardada al instante
// (así funciona sin conexión de forma inmediata y confiable, sin depender de
// que una petición de red falle primero), y en segundo plano busca la versión
// más nueva para dejarla lista la próxima vez que se abra la app.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request);
      const networkUpdate = fetch(e.request).then(res => {
        if (res && res.ok) cache.put(e.request, res.clone());
        return res;
      }).catch(() => null);
      // Si ya hay copia guardada, se entrega de inmediato (offline garantizado).
      // Si no hay copia (primera visita a ese archivo), se espera la red.
      return cached || (await networkUpdate) || Response.error();
    })
  );
});
