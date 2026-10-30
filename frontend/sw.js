// Service Worker para Lex PWA
const CACHE_NAME = 'lex-cache-v2';
const ASSETS = [
  '/',
  '/static/index.html',
  '/static/styles.css',
  '/static/app.js',
  '/static/manifest.json',
  '/static/icons/icon.svg',
  '/static/icons/lex-mark.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => console.log('SW cache err:', err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Apenas intercepta requisições GET para arquivos estáticos
  if (event.request.method === 'GET' && !event.request.url.includes('/api/')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});
