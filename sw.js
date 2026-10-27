/* Offline: primero la red (para recibir actualizaciones), si no hay conexión usa la copia guardada. */
const CACHE = 'antebrazos24-v4';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'content/plan.md', 'content/videos.json', 'manifest.webmanifest', 'icons/icon.svg', 'icons/apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
